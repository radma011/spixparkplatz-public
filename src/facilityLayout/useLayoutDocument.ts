import {useCallback, useEffect, useRef, useState} from 'react';
import FacilityLayoutService from './FacilityLayoutService';
import type {FacilityLayout, LayoutSyncStatus} from './types';

const DEBOUNCE_MS = 500;
const MAX_UNDO = 40;

function cloneLayout(layout: FacilityLayout): FacilityLayout {
  return JSON.parse(JSON.stringify(layout)) as FacilityLayout;
}

export function useLayoutDocument(facilityCode: string, userId: string) {
  const [layout, setLayout] = useState<FacilityLayout | null>(null);
  const [loading, setLoading] = useState(true);
  const [savingLocal, setSavingLocal] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [syncStatus, setSyncStatus] = useState<LayoutSyncStatus>('local_only');
  const [canUndo, setCanUndo] = useState(false);
  const layoutRef = useRef(layout);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const undoStackRef = useRef<FacilityLayout[]>([]);
  layoutRef.current = layout;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const {layout: doc, syncStatus: status} = await FacilityLayoutService.load(
        facilityCode,
        userId,
      );
      setLayout(doc);
      setSyncStatus(status);
      undoStackRef.current = [];
      setCanUndo(false);
    } finally {
      setLoading(false);
    }
  }, [facilityCode, userId]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(
    () => () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      const snap = layoutRef.current;
      if (snap) void FacilityLayoutService.saveLocalOnly(snap);
    },
    [],
  );

  const persistLocal = useCallback(async (next: FacilityLayout) => {
    setSavingLocal(true);
    try {
      const saved = await FacilityLayoutService.saveLocalOnly(next);
      setLayout(saved);
      layoutRef.current = saved;
      setSyncStatus('pending');
    } finally {
      setSavingLocal(false);
    }
  }, []);

  const flushLocal = useCallback(
    async (next?: FacilityLayout): Promise<FacilityLayout | null> => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
      const snap = next ?? layoutRef.current;
      if (!snap) return null;
      await persistLocal(snap);
      return layoutRef.current;
    },
    [persistLocal],
  );

  const uploadToCloud = useCallback(async () => {
    const snap = layoutRef.current;
    if (!snap) return {synced: false as const};
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    await persistLocal(snap);
    setUploading(true);
    try {
      const current = layoutRef.current ?? snap;
      const {synced} = await FacilityLayoutService.uploadToCloud(current);
      setSyncStatus(synced ? 'synced' : 'pending');
      return {synced};
    } finally {
      setUploading(false);
    }
  }, [persistLocal]);

  const patch = useCallback(
    (updater: (prev: FacilityLayout) => FacilityLayout) => {
      const cur = layoutRef.current;
      if (!cur) return;
      undoStackRef.current.push(cloneLayout(cur));
      if (undoStackRef.current.length > MAX_UNDO) {
        undoStackRef.current.shift();
      }
      setCanUndo(true);
      const next = updater(cur);
      layoutRef.current = next;
      setLayout(next);
      if (syncStatus === 'synced') {
        setSyncStatus('pending');
      }
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => {
        timerRef.current = null;
        void persistLocal(next);
      }, DEBOUNCE_MS);
    },
    [persistLocal, syncStatus],
  );

  const undo = useCallback(async () => {
    const prev = undoStackRef.current.pop();
    if (!prev) {
      setCanUndo(false);
      return;
    }
    setCanUndo(undoStackRef.current.length > 0);
    await flushLocal(prev);
  }, [flushLocal]);

  return {
    layout,
    loading,
    savingLocal,
    uploading,
    syncStatus,
    canUndo,
    patch,
    flushLocal,
    uploadToCloud,
    undo,
    reload: load,
  };
};
