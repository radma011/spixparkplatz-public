import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  getFirestore,
  doc,
  getDocFromCache,
  getDocFromServer,
  setDoc,
  deleteDoc,
  Timestamp,
} from '@react-native-firebase/firestore';
import {devWarn} from '../utils/devLog';
import {getAuth} from '@react-native-firebase/auth';
import {createEmptyLayout, FacilityLayout, LayoutElement, isSpot, isSymbol, GRID_COLS, GRID_ROWS} from './types';
import {normalizeSymbolLabel} from './symbolLabel';
import FirestoreService from '../services/FirestoreService';
import {normalizeSpot} from './gridMath';

const db = getFirestore();

/** Viewer: zuerst Server, danach lokaler Fallback. */
const VIEWER_ONLINE_TIMEOUT_MS = 5000;

type Stored = {layout: FacilityLayout; pendingSync: boolean};

function storageKey(code: string): string {
  return `facility_layout_v2_${code.trim().toUpperCase()}`;
}

function docRef(code: string) {
  return doc(db, 'facility_layouts', code.trim().toUpperCase());
}

function normalizeElement(el: LayoutElement): LayoutElement {
  if (isSpot(el)) return normalizeSpot(el);
  if (isSymbol(el)) return normalizeSymbolLabel(el);
  return el;
}

function toFirestore(layout: FacilityLayout): Record<string, unknown> {
  return {
    facilityCode: layout.facilityCode,
    gridCols: layout.gridCols,
    gridRows: layout.gridRows,
    elements: layout.elements.map((el) => {
      const base: Record<string, unknown> = {
        id: el.id,
        type: el.type,
        x: el.x,
        y: el.y,
      };
      if (el.rotation != null) base.rotation = el.rotation;
      if (isSpot(el)) {
        const s = normalizeSpot(el);
        base.width = s.width;
        base.height = s.height;
        if (s.number) base.number = s.number;
        if (s.note) base.note = s.note;
        if (s.floorFrom != null) {
          base.floorFrom = s.floorFrom;
          base.floorTo = s.floorTo ?? s.floorFrom;
        }
      } else if (isSymbol(el)) {
        const s = normalizeSymbolLabel(el);
        if (s.label) base.label = s.label;
      }
      return base;
    }),
    updatedAt: Timestamp.fromDate(new Date(layout.updatedAt)),
    updatedBy: layout.updatedBy,
  };
}

function fromFirestore(code: string, data: Record<string, unknown>): FacilityLayout {
  const updatedAt =
    data.updatedAt && typeof (data.updatedAt as Timestamp).toDate === 'function'
      ? (data.updatedAt as Timestamp).toDate().toISOString()
      : new Date().toISOString();

  const raw = Array.isArray(data.elements) ? data.elements : [];
  const elements = raw
    .filter((e) => e && typeof e === 'object')
    .map((e) => normalizeElement(e as LayoutElement));

  return {
    facilityCode: code.trim().toUpperCase(),
    gridCols: typeof data.gridCols === 'number' ? data.gridCols : GRID_COLS,
    gridRows: typeof data.gridRows === 'number' ? data.gridRows : GRID_ROWS,
    elements,
    updatedAt,
    updatedBy: typeof data.updatedBy === 'string' ? data.updatedBy : '',
  };
}

class FacilityLayoutService {
  private chains = new Map<string, Promise<unknown>>();

  private exclusive<T>(code: string, fn: () => Promise<T>): Promise<T> {
    const key = code.trim().toUpperCase();
    const prev = this.chains.get(key) ?? Promise.resolve();
    const result = prev.then(fn, fn);
    const tail = result.then(
      () => undefined,
      () => undefined,
    );
    this.chains.set(key, tail);
    void tail.finally(() => {
      if (this.chains.get(key) === tail) this.chains.delete(key);
    });
    return result;
  }

  async loadLocal(code: string): Promise<Stored | null> {
    try {
      const raw = await AsyncStorage.getItem(storageKey(code));
      if (!raw) return null;
      const parsed = JSON.parse(raw) as Stored;
      if (!parsed?.layout) return null;
      return {
        layout: {
          ...parsed.layout,
          elements: parsed.layout.elements.map(normalizeElement),
        },
        pendingSync: !!parsed.pendingSync,
      };
    } catch {
      return null;
    }
  }

  async saveLocal(layout: FacilityLayout, pending: boolean): Promise<void> {
    const normalized = {
      ...layout,
      elements: layout.elements.map(normalizeElement),
    };
    await AsyncStorage.setItem(
      storageKey(layout.facilityCode),
      JSON.stringify({layout: normalized, pendingSync: pending}),
    );
  }

  private parseRemoteSnapshot(
    code: string,
    snap: {exists: () => boolean; data: () => Record<string, unknown> | undefined},
  ): FacilityLayout | null {
    if (!snap.exists()) return null;
    const data = snap.data();
    return data ? fromFirestore(code, data) : null;
  }

  /** Firestore-Persistenz-Cache — kein Netzwerk. */
  private async loadRemoteFromCache(code: string): Promise<FacilityLayout | null> {
    try {
      const snap = await getDocFromCache(docRef(code));
      return this.parseRemoteSnapshot(code, snap);
    } catch {
      return null;
    }
  }

  async loadRemote(code: string): Promise<FacilityLayout | null> {
    try {
      const snap = await getDocFromServer(docRef(code));
      return this.parseRemoteSnapshot(code, snap);
    } catch (e) {
      devWarn('[FacilityLayoutService] loadRemote', e);
      return null;
    }
  }

  /** Verhindert, dass Server-Laden am Netzwerk hängen bleibt. */
  private loadRemoteWithTimeout(
    code: string,
    timeoutMs = 8000,
    silent = false,
  ): Promise<FacilityLayout | null> {
    return Promise.race([
      this.loadRemote(code),
      new Promise<null>((resolve) => {
        setTimeout(() => {
          if (!silent) {
            devWarn('[FacilityLayoutService] loadRemote timeout');
          }
          resolve(null);
        }, timeoutMs);
      }),
    ]);
  }

  /** Aktualisiert AsyncStorage im Hintergrund, blockiert den Viewer/Editor nicht. */
  private refreshRemoteCache(code: string, local: Stored | null): void {
    void (async () => {
      if (local?.pendingSync) return;
      const remote = await this.loadRemoteWithTimeout(code, 8000, true);
      if (!remote) return;
      if (!local) {
        await this.saveLocal(remote, false);
        return;
      }
      const lt = new Date(local.layout.updatedAt).getTime();
      const rt = new Date(remote.updatedAt).getTime();
      if (rt > lt) {
        await this.saveLocal(remote, false);
      }
    })();
  }

  /**
   * Lokale Änderungen mit pendingSync haben Vorrang vor Remote — auch wenn Remote
   * einen neueren Zeitstempel hat (verhindert Datenverlust nach Offline-Bearbeitung).
   */
  private mergeOnLoad(
    local: Stored | null,
    remote: FacilityLayout | null,
    facilityCode: string,
    userId: string,
  ): {layout: FacilityLayout; syncStatus: 'synced' | 'pending' | 'local_only'} {
    const normalized = facilityCode.trim().toUpperCase();

    if (!local && !remote) {
      return {layout: createEmptyLayout(normalized, userId), syncStatus: 'local_only'};
    }
    if (!local && remote) {
      return {layout: remote, syncStatus: 'synced'};
    }
    if (local && !remote) {
      return {
        layout: local.layout,
        syncStatus: local.pendingSync ? 'pending' : 'local_only',
      };
    }

    const localLayout = local!.layout;
    if (local!.pendingSync) {
      return {layout: localLayout, syncStatus: 'pending'};
    }

    const lt = new Date(localLayout.updatedAt).getTime();
    const rt = new Date(remote!.updatedAt).getTime();
    if (lt >= rt) {
      return {layout: localLayout, syncStatus: 'synced'};
    }
    return {layout: remote!, syncStatus: 'synced'};
  }

  /** Nur AsyncStorage — kein Firestore. Markiert Änderungen als noch nicht hochgeladen. */
  async saveLocalOnly(layout: FacilityLayout): Promise<FacilityLayout> {
    const uid = getAuth().currentUser?.uid ?? layout.updatedBy;
    const next: FacilityLayout = {
      ...layout,
      facilityCode: layout.facilityCode.trim().toUpperCase(),
      elements: layout.elements.map(normalizeElement),
      updatedAt: new Date().toISOString(),
      updatedBy: uid,
    };
    await this.saveLocal(next, true);
    return next;
  }

  /** Manueller Cloud-Upload (Cloud-Button). */
  async uploadToCloud(layout: FacilityLayout): Promise<{synced: boolean}> {
    const normalized = layout.facilityCode.trim().toUpperCase();
    return this.exclusive(normalized, async () => {
      const uid = getAuth().currentUser?.uid ?? layout.updatedBy;
      const next: FacilityLayout = {
        ...layout,
        facilityCode: normalized,
        elements: layout.elements.map(normalizeElement),
        updatedAt: new Date().toISOString(),
        updatedBy: uid,
      };
      await this.saveLocal(next, true);
      const synced = await this.push(next);
      if (synced) {
        await this.saveLocal(next, false);
      }
      return {synced};
    });
  }

  async load(code: string, userId: string): Promise<{
    layout: FacilityLayout;
    syncStatus: 'synced' | 'pending' | 'local_only';
  }> {
    const normalized = code.trim().toUpperCase();
    const local = await this.loadLocal(normalized);

    if (local?.pendingSync) {
      return {layout: local.layout, syncStatus: 'pending'};
    }

    if (local?.layout) {
      this.refreshRemoteCache(normalized, local);
      return {layout: local.layout, syncStatus: 'synced'};
    }

    let remote = await this.loadRemoteFromCache(normalized);
    if (!remote) {
      remote = await this.loadRemoteWithTimeout(normalized);
    }

    const {layout, syncStatus} = this.mergeOnLoad(local, remote, normalized, userId);
    if (remote) {
      await this.saveLocal(layout, false);
    }

    return {layout, syncStatus};
  }

  private async push(layout: FacilityLayout): Promise<boolean> {
    try {
      await setDoc(docRef(layout.facilityCode), toFirestore(layout));
      return true;
    } catch (e) {
      console.warn('[FacilityLayoutService] push failed', e);
      return false;
    }
  }

  private layoutForTarget(
    source: FacilityLayout,
    targetCode: string,
    userId: string,
  ): FacilityLayout {
    const code = targetCode.trim().toUpperCase();
    return {
      facilityCode: code,
      gridCols: source.gridCols,
      gridRows: source.gridRows,
      elements: source.elements.map(normalizeElement),
      updatedAt: new Date().toISOString(),
      updatedBy: userId,
    };
  }

  async validateTargetFacility(code: string): Promise<{code: string; name?: string}> {
    const normalized = code.trim().toUpperCase();
    if (!normalized) throw new Error('FACILITY_CODE_EMPTY');
    const info = await FirestoreService.getFacilityInfo(normalized);
    if (!info) throw new Error('FACILITY_NOT_FOUND');
    if (info.active === false) throw new Error('FACILITY_INACTIVE');
    return {code: info.code, name: info.name};
  }

  /** Kopiert den Lageplan in eine andere Anlage (Quelle bleibt unverändert). */
  async copyLayoutToFacility(
    source: FacilityLayout,
    targetFacilityCode: string,
    userId: string,
  ): Promise<{synced: boolean; targetCode: string}> {
    const target = await this.validateTargetFacility(targetFacilityCode);
    const next = this.layoutForTarget(source, target.code, userId);
    const {synced} = await this.uploadToCloud(next);
    return {synced, targetCode: target.code};
  }

  /** Verschiebt den Lageplan: Ziel erhält Kopie, Quelle wird gelöscht. */
  async moveLayoutToFacility(
    source: FacilityLayout,
    targetFacilityCode: string,
    userId: string,
  ): Promise<{synced: boolean; targetCode: string; sourceCode: string}> {
    const sourceCode = source.facilityCode.trim().toUpperCase();
    const target = await this.validateTargetFacility(targetFacilityCode);
    if (sourceCode === target.code) throw new Error('SAME_FACILITY');
    const next = this.layoutForTarget(source, target.code, userId);
    const {synced} = await this.uploadToCloud(next);
    await this.deleteLayout(sourceCode);
    return {synced, targetCode: target.code, sourceCode};
  }

  async deleteLayout(facilityCode: string): Promise<void> {
    const code = facilityCode.trim().toUpperCase();
    return this.exclusive(code, async () => {
      try {
        await AsyncStorage.removeItem(storageKey(code));
      } catch {
        // ignore
      }
      try {
        await deleteDoc(docRef(code));
      } catch (e) {
        console.warn('[FacilityLayoutService] deleteLayout remote failed', e);
        throw e;
      }
    });
  }

  /**
   * Viewer: zuerst aktuelle Version vom Server (Spinner bis zu 5 s),
   * nur bei Fehler/Timeout Fallback auf lokal gespeicherten Lageplan.
   */
  async loadForViewer(code: string): Promise<FacilityLayout | null> {
    const normalized = code.trim().toUpperCase();

    const remote = await this.loadRemoteWithTimeout(
      normalized,
      VIEWER_ONLINE_TIMEOUT_MS,
      true,
    );
    if (remote) {
      await this.saveLocal(remote, false);
      return remote;
    }

    const local = await this.loadLocal(normalized);
    if (local?.layout) {
      return local.layout;
    }

    devWarn('[FacilityLayoutService] loadForViewer: weder Server noch lokaler Cache');
    return null;
  }
}

export default new FacilityLayoutService();
