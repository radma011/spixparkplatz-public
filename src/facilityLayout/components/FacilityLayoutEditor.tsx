import React, {useEffect, useMemo, useRef, useState} from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  useColorScheme,
  TextInput,
  Switch,
  Modal,
  ScrollView,
} from 'react-native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import MaterialCommunityIcons from 'react-native-vector-icons/MaterialCommunityIcons';
import {getColors} from '../../theme/colors';
import {confirmAlert, showAlert} from '../../utils/alertUtils';
import {useLayoutDocument} from '../useLayoutDocument';
import FacilityLayoutService from '../FacilityLayoutService';
import LayoutSurface, {type LayoutSurfaceHandle} from './LayoutSurface';
import PlacementPreview, {TOOL_PREVIEW_HEIGHT} from './PlacementPreview';
import {
  EditorTool,
  LayoutSpot,
  LayoutStreet,
  LayoutSymbol,
  MAX_SPOT_NUMBER_LEN,
  SYMBOL_CELLS,
  isSpot,
  isSymbolTool,
} from '../types';
import {
  appendStreetsAlongPath,
  applyNumbering,
  canPlace,
  GridPoint,
  hasStreetAt,
  moveBy,
  newId,
  nextSpotRotation,
  shouldFillStreetBetween,
  nextSymbolRotation,
  normalizeSpot,
  normalizeSpotRotation,
  normalizeSymbolRotation,
  rotateSelectedElements,
  spotSize,
  spotsForNumbering,
  MIN_LAYOUT_ZOOM,
  MAX_LAYOUT_ZOOM,
  numberingOrderHint,
  type NumberingDirection,
  type NumberingOrder,
  type NumberingScope,
} from '../gridMath';
import {formatFloorInput, formatSpotLabel, parseFloorInput} from '../spotLabel';

type Props = {
  facilityCode: string;
  userId: string;
  onClose: () => void;
};

const TOOLS: {id: EditorTool; icon: string; label: string}[] = [
  {id: 'select', icon: 'cursor-default', label: 'Auswahl'},
  {id: 'spot', icon: 'parking', label: 'Platz'},
  {id: 'entrance', icon: 'login', label: 'Ein'},
  {id: 'exit', icon: 'logout', label: 'Aus'},
  {id: 'door', icon: 'door', label: 'Tür'},
  {id: 'street', icon: 'texture-box', label: 'Straße'},
];

const FacilityLayoutEditor: React.FC<Props> = ({facilityCode, userId, onClose}) => {
  const insets = useSafeAreaInsets();
  const colors = getColors(useColorScheme());
  const {
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
  } = useLayoutDocument(facilityCode, userId);

  const [tool, setTool] = useState<EditorTool>('select');
  const [placeRotation, setPlaceRotation] = useState(0);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [zoom, setZoom] = useState(1);
  const [multiSelect, setMultiSelect] = useState(true);
  const surfaceRef = useRef<LayoutSurfaceHandle>(null);
  const lastStreetEndpointsRef = useRef<GridPoint[]>([]);
  /** An = beim Setzen automatisch Zwischenfelder verbinden; aus = nur Einzelkacheln. */
  const [streetAutoFill, setStreetAutoFill] = useState(false);

  useEffect(() => {
    if (tool !== 'select' && tool !== 'street') setPlaceRotation(0);
    if (tool !== 'street') lastStreetEndpointsRef.current = [];
  }, [tool]);

  const rememberStreetEndpoint = (point: GridPoint) => {
    const prev = lastStreetEndpointsRef.current[0] ?? null;
    lastStreetEndpointsRef.current = [point, ...(prev ? [prev] : [])].slice(0, 2);
  };

  const [spotModal, setSpotModal] = useState(false);
  const [bulkModal, setBulkModal] = useState(false);
  const [editNumber, setEditNumber] = useState('');
  const [editFloor, setEditFloor] = useState('');
  const [editNote, setEditNote] = useState('');
  const [bulkStart, setBulkStart] = useState('1001');
  const [bulkInc, setBulkInc] = useState('1');
  const [bulkDuplex, setBulkDuplex] = useState(false);
  const [bulkFloorFrom, setBulkFloorFrom] = useState('0');
  const [bulkFloorTo, setBulkFloorTo] = useState('3');
  const [bulkOrder, setBulkOrder] = useState<NumberingOrder>('row');
  const [bulkDirection, setBulkDirection] = useState<NumberingDirection>('asc');
  const [bulkScope, setBulkScope] = useState<NumberingScope>('selection');
  const [showTransferModal, setShowTransferModal] = useState(false);
  const [transferTargetCode, setTransferTargetCode] = useState('');
  const [transferMode, setTransferMode] = useState<'copy' | 'move'>('copy');
  const [transferBusy, setTransferBusy] = useState(false);

  const selected = useMemo(
    () => layout?.elements.filter((e) => selectedIds.has(e.id)) ?? [],
    [layout, selectedIds],
  );
  const singleSpot = useMemo(
    () => (selected.length === 1 && isSpot(selected[0]) ? selected[0] : null),
    [selected],
  );
  const allSpots = useMemo(
    () => (layout?.elements.filter(isSpot) as LayoutSpot[]) ?? [],
    [layout],
  );

  const syncLabel =
    syncStatus === 'synced'
      ? 'In Cloud'
      : syncStatus === 'pending'
        ? 'Nur lokal · nicht hochgeladen'
        : 'Nur lokal';

  const handleUpload = async () => {
    const {synced} = await uploadToCloud();
    if (synced) {
      showAlert('Hochgeladen', 'Lageplan wurde in die Cloud übertragen.');
    } else {
      showAlert(
        'Offline oder Fehler',
        'Hochladen fehlgeschlagen. Der Plan ist lokal gespeichert — bitte später erneut versuchen.',
      );
    }
  };

  const placeAt = (x: number, y: number) => {
    if (!layout || tool === 'select') return;
    if (tool === 'street') {
      const point = {x, y};
      const prev = lastStreetEndpointsRef.current[0] ?? null;

      if (hasStreetAt(layout.elements, x, y)) {
        rememberStreetEndpoint(point);
        return;
      }
      if (!canPlace(layout.elements, x, y, SYMBOL_CELLS, SYMBOL_CELLS)) {
        showAlert('Hinweis', 'Straßenfeld passt hier nicht.');
        return;
      }

      const autoConnect =
        streetAutoFill && shouldFillStreetBetween(prev, point, layout.elements);

      if (autoConnect) {
        const res = appendStreetsAlongPath(layout.elements, prev!, point);
        patch((p) => ({...p, elements: res.elements}));
        rememberStreetEndpoint(point);
      } else {
        const el: LayoutStreet = {id: newId(), type: 'street', x, y};
        patch((p) => ({...p, elements: [...p.elements, el]}));
        rememberStreetEndpoint(point);
      }
      return;
    }
    if (tool === 'spot') {
      const rot = normalizeSpotRotation(placeRotation);
      const {width, height} = spotSize(rot);
      if (!canPlace(layout.elements, x, y, width, height)) {
        showAlert('Hinweis', 'Hier ist kein Platz frei.');
        return;
      }
      const el: LayoutSpot = {
        id: newId(),
        type: 'spot',
        x,
        y,
        width,
        height,
        rotation: rot,
      };
      patch((p) => ({...p, elements: [...p.elements, el]}));
      return;
    }
    if (!isSymbolTool(tool)) return;
    if (!canPlace(layout.elements, x, y, SYMBOL_CELLS, SYMBOL_CELLS)) {
      showAlert('Hinweis', 'Symbol passt hier nicht.');
      return;
    }
    const sym: LayoutSymbol = {
      id: newId(),
      type: tool,
      x,
      y,
      rotation: normalizeSymbolRotation(placeRotation),
    };
    patch((p) => ({...p, elements: [...p.elements, sym]}));
  };

  const cyclePlaceRotation = () => {
    if (tool === 'spot') {
      setPlaceRotation((r) => nextSpotRotation(r));
    } else if (isSymbolTool(tool)) {
      setPlaceRotation((r) => nextSymbolRotation(r));
    }
  };

  const deleteSelected = () => {
    if (!layout || selectedIds.size === 0) return;
    confirmAlert(
      'Löschen',
      `${selectedIds.size} Element(e) entfernen?`,
      () => {
        patch((p) => ({
          ...p,
          elements: p.elements.filter((e) => !selectedIds.has(e.id)),
        }));
        setSelectedIds(new Set());
      },
      undefined,
      'Löschen',
      'Abbrechen',
    );
  };

  const rotateSelected = () => {
    if (!layout || selectedIds.size === 0) return;
    const next = rotateSelectedElements(layout.elements, selectedIds);
    if (!next) {
      showAlert('Hinweis', 'Drehen nicht möglich (Kollision oder Rand).');
      return;
    }
    patch((p) => ({...p, elements: next}));
  };

  const moveSelected = (ids: Set<string>, dx: number, dy: number) => {
    if (!layout) return;
    const next = moveBy(layout.elements, ids, dx, dy);
    if (!next) {
      showAlert('Hinweis', 'Verschieben nicht möglich.');
      return;
    }
    patch((p) => ({...p, elements: next}));
  };

  const openSpotEdit = () => {
    if (!singleSpot) return;
    setEditNumber(singleSpot.number ?? '');
    setEditFloor(formatFloorInput(singleSpot.floorFrom, singleSpot.floorTo));
    setEditNote(singleSpot.note ?? '');
    setSpotModal(true);
  };

  const saveSpotEdit = () => {
    if (!layout || !singleSpot) return;
    const {floorFrom, floorTo} = parseFloorInput(editFloor);
    patch((p) => ({
      ...p,
      elements: p.elements.map((e) => {
        if (e.id !== singleSpot.id || !isSpot(e)) return e;
        const next: LayoutSpot = {
          ...e,
          number: editNumber.trim().slice(0, MAX_SPOT_NUMBER_LEN) || undefined,
          note: editNote.trim() || undefined,
        };
        if (floorFrom == null) {
          delete next.floorFrom;
          delete next.floorTo;
        } else {
          next.floorFrom = floorFrom;
          next.floorTo = floorTo ?? floorFrom;
        }
        return normalizeSpot(next);
      }),
    }));
    setSpotModal(false);
  };

  const applyBulk = () => {
    if (!layout) return;
    const targets = spotsForNumbering(
      allSpots,
      selectedIds,
      bulkScope,
      singleSpot?.id ?? allSpots[0]?.id,
    );
    if (!targets.length) {
      showAlert('Hinweis', 'Keine Parkplätze in der Auswahl.');
      return;
    }
    const inc = bulkScope === 'single' ? 0 : parseInt(bulkInc, 10) || 1;
    const duplex =
      bulkDuplex
        ? {
            floorFrom: parseInt(bulkFloorFrom, 10) || 0,
            floorTo: Math.max(
              parseInt(bulkFloorFrom, 10) || 0,
              parseInt(bulkFloorTo, 10) || 0,
            ),
          }
        : undefined;
    const mapping = applyNumbering(targets, bulkStart, inc, bulkOrder, bulkDirection, duplex);
    patch((p) => ({
      ...p,
      elements: p.elements.map((e) => {
        if (!isSpot(e) || !mapping[e.id]) return e;
        const m = mapping[e.id];
        return normalizeSpot({
          ...e,
          number: m.number,
          floorFrom: m.floorFrom,
          floorTo: m.floorTo,
        });
      }),
    }));
    setBulkModal(false);
  };

  const transferErrorMessage = (code: string): string => {
    switch (code) {
      case 'FACILITY_CODE_EMPTY':
        return 'Bitte einen Ziel-Anlagen-Code eingeben.';
      case 'FACILITY_NOT_FOUND':
        return 'Die Ziel-Anlage existiert nicht.';
      case 'FACILITY_INACTIVE':
        return 'Die Ziel-Anlage ist nicht aktiv.';
      case 'SAME_FACILITY':
        return 'Quell- und Ziel-Anlage sind identisch.';
      default:
        return 'Übertragung fehlgeschlagen.';
    }
  };

  const runTransfer = async () => {
    if (!layout) return;
    const target = transferTargetCode.trim().toUpperCase();
    if (!target) {
      showAlert('Hinweis', transferErrorMessage('FACILITY_CODE_EMPTY'));
      return;
    }
    setTransferBusy(true);
    try {
      const snapshot = await flushLocal(layout);
      if (!snapshot?.elements) return;
      if (transferMode === 'copy') {
        const {synced, targetCode} = await FacilityLayoutService.copyLayoutToFacility(
          snapshot,
          target,
          userId,
        );
        setShowTransferModal(false);
        setTransferTargetCode('');
        showAlert(
          'Kopiert',
          synced
            ? `Lageplan wurde nach ${targetCode} kopiert und synchronisiert.`
            : `Lageplan wurde nach ${targetCode} lokal kopiert. Bitte dort ggf. manuell hochladen.`,
        );
      } else {
        const {synced, targetCode, sourceCode} = await FacilityLayoutService.moveLayoutToFacility(
          snapshot,
          target,
          userId,
        );
        setShowTransferModal(false);
        setTransferTargetCode('');
        showAlert(
          'Verschoben',
          synced
            ? `Lageplan von ${sourceCode} nach ${targetCode} verschoben.`
            : `Lageplan nach ${targetCode} lokal verschoben. Quelle ${sourceCode} gelöscht. Ziel ggf. manuell hochladen.`,
          () => onClose(),
        );
      }
    } catch (e) {
      const msg =
        e instanceof Error && e.message
          ? transferErrorMessage(e.message)
          : transferErrorMessage('');
      showAlert('Fehler', msg);
    } finally {
      setTransferBusy(false);
    }
  };

  const confirmTransfer = () => {
    if (transferMode === 'move') {
      confirmAlert(
        'Lageplan verschieben',
        `Der Lageplan wird nach ${transferTargetCode.trim().toUpperCase()} kopiert und in ${layout?.facilityCode} gelöscht. Fortfahren?`,
        () => void runTransfer(),
        undefined,
        'Verschieben',
        'Abbrechen',
      );
      return;
    }
    void runTransfer();
  };

  if (loading || !layout) {
    return (
      <View style={[styles.centered, {backgroundColor: colors.screenBg, paddingTop: insets.top}]}>
        <ActivityIndicator size="large" color={colors.brand} />
        <Text style={{color: colors.subtext, marginTop: 12}}>Lageplan wird geladen…</Text>
      </View>
    );
  }

  return (
    <View style={[styles.root, {backgroundColor: colors.screenBg, paddingTop: insets.top}]}>
      <View style={[styles.topBar, {borderBottomColor: colors.border}]}>
        <TouchableOpacity onPress={onClose} hitSlop={12}>
          <MaterialCommunityIcons name="close" size={26} color={colors.text} />
        </TouchableOpacity>
        <View style={styles.topCenter}>
          <Text style={[styles.title, {color: colors.text}]}>Lageplan</Text>
          <Text style={[styles.sub, {color: colors.subtext}]}>
            {layout.facilityCode} · {syncLabel}
            {savingLocal ? ' · Lokal speichern…' : ''}
            {uploading ? ' · Hochladen…' : ''}
          </Text>
        </View>
        <View style={styles.topActions}>
          <TouchableOpacity
            onPress={() => setShowTransferModal(true)}
            disabled={savingLocal || uploading || transferBusy}
            hitSlop={8}
            accessibilityLabel="Lageplan in andere Anlage übertragen">
            <MaterialCommunityIcons name="swap-horizontal" size={24} color={colors.text} />
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => void handleUpload()}
            disabled={savingLocal || uploading}
            hitSlop={8}
            accessibilityLabel="In die Cloud hochladen">
            <MaterialCommunityIcons
              name="cloud-upload-outline"
              size={24}
              color={uploading ? colors.subtext : colors.brand}
            />
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={[styles.toolStrip, {borderBottomColor: colors.border}]}
        contentContainerStyle={styles.toolStripInner}>
        {TOOLS.map((t) => {
          const active = tool === t.id;
          const isPlace = t.id !== 'select';
          const canRotate = isPlace && t.id !== 'street';
          const handlePress = () => {
            if (active && canRotate) {
              cyclePlaceRotation();
            } else {
              setTool(t.id);
            }
          };
          return (
            <TouchableOpacity
              key={t.id}
              style={[
                styles.toolBtn,
                {
                  height: TOOL_PREVIEW_HEIGHT,
                  backgroundColor: isPlace ? colors.surface2 : active ? colors.brand : colors.surface2,
                },
                isPlace && styles.toolBtnPlace,
                active && isPlace && {borderColor: colors.brand, borderWidth: 2},
              ]}
              onPress={handlePress}
              accessibilityLabel={
                canRotate && active
                  ? `${t.label}, erneut tippen zum Drehen`
                  : t.label
              }>
              {isPlace ? (
                <PlacementPreview
                  tool={t.id}
                  spotRotation={active ? placeRotation : 0}
                  symbolRotation={active ? placeRotation : 0}
                  opacity={active ? 1 : 0.55}
                />
              ) : (
                <View style={styles.selectBtnInner}>
                  <MaterialCommunityIcons
                    name={t.icon}
                    size={26}
                    color={active ? '#fff' : colors.text}
                  />
                  <Text style={[styles.toolLbl, {color: active ? '#fff' : colors.text}]}>
                    {t.label}
                  </Text>
                </View>
              )}
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      <View style={styles.canvas}>
        <LayoutSurface
          ref={surfaceRef}
          layout={layout}
          autoFitOnLayout={!loading && !!layout}
          tool={tool}
          placeRotation={placeRotation}
          selectedIds={selectedIds}
          multiSelect={multiSelect}
          zoom={zoom}
          onZoomChange={setZoom}
          onSelectionChange={setSelectedIds}
          onPlace={placeAt}
          onMove={moveSelected}
        />
      </View>

      <View style={[styles.bottomBar, {borderTopColor: colors.border, paddingBottom: insets.bottom + 8}]}>
        <TouchableOpacity onPress={() => surfaceRef.current?.fitToContent()} accessibilityLabel="Auf Inhalt fokussieren">
          <MaterialCommunityIcons name="fit-to-screen-outline" size={22} color={colors.text} />
        </TouchableOpacity>
        <TouchableOpacity onPress={() => setZoom((z) => Math.max(MIN_LAYOUT_ZOOM, z - 0.2))}>
          <MaterialCommunityIcons name="minus" size={22} color={colors.text} />
        </TouchableOpacity>
        <Text style={{color: colors.subtext, minWidth: 44, textAlign: 'center' }}>
          {Math.round(zoom * 100)}%
        </Text>
        <TouchableOpacity onPress={() => setZoom((z) => Math.min(MAX_LAYOUT_ZOOM, z + 0.2))}>
          <MaterialCommunityIcons name="plus" size={22} color={colors.text} />
        </TouchableOpacity>
        {tool === 'street' && (
          <TouchableOpacity
            onPress={() => setStreetAutoFill((v) => !v)}
            accessibilityLabel={
              streetAutoFill
                ? 'Automatisch verbinden: an — tippen zum Ausschalten'
                : 'Automatisch verbinden: aus — nur Einzelkacheln'
            }
            style={[
              styles.streetAutoToggle,
              {
                backgroundColor: streetAutoFill ? colors.brand : colors.surface2,
                borderColor: colors.border,
              },
            ]}>
            <MaterialCommunityIcons
              name="vector-line"
              size={20}
              color={streetAutoFill ? '#fff' : colors.text}
            />
            <Text
              style={[
                styles.streetAutoToggleText,
                {color: streetAutoFill ? '#fff' : colors.text},
              ]}>
              Auto
            </Text>
          </TouchableOpacity>
        )}
        <View style={styles.divider} />
        <TouchableOpacity onPress={() => void undo()} disabled={!canUndo}>
          <MaterialCommunityIcons
            name="undo"
            size={22}
            color={canUndo ? colors.text : colors.border}
          />
        </TouchableOpacity>
        <TouchableOpacity onPress={deleteSelected} disabled={selectedIds.size === 0}>
          <MaterialCommunityIcons
            name="delete-outline"
            size={22}
            color={selectedIds.size ? '#EF4444' : colors.border}
          />
        </TouchableOpacity>
        <TouchableOpacity onPress={rotateSelected} disabled={selectedIds.size === 0}>
          <MaterialCommunityIcons name="rotate-right" size={22} color={colors.text} />
        </TouchableOpacity>
        <TouchableOpacity onPress={() => setBulkModal(true)}>
          <MaterialCommunityIcons name="numeric" size={22} color={colors.text} />
        </TouchableOpacity>
        <TouchableOpacity onPress={openSpotEdit} disabled={!singleSpot}>
          <MaterialCommunityIcons
            name="pencil-outline"
            size={22}
            color={singleSpot ? colors.text : colors.border}
          />
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => setMultiSelect((m) => !m)}
          accessibilityLabel={multiSelect ? 'Mehrfachauswahl an' : 'Mehrfachauswahl aus'}
          style={[
            styles.multiToggle,
            {
              backgroundColor: multiSelect ? colors.brand : colors.surface2,
              borderColor: colors.border,
            },
          ]}>
          <Text style={[styles.multiToggleText, {color: multiSelect ? '#fff' : colors.text}]}>
            Multi
          </Text>
        </TouchableOpacity>
      </View>

      <Modal visible={spotModal} transparent animationType="fade">
        <View style={styles.overlay}>
          <View style={[styles.modal, {backgroundColor: colors.surface}]}>
            <Text style={[styles.modalTitle, {color: colors.text}]}>Parkplatz</Text>
            {singleSpot && (() => {
              const {floorFrom, floorTo} = parseFloorInput(editFloor);
              return (
                <Text style={{color: colors.subtext, marginBottom: 8}}>
                  Vorschau: {formatSpotLabel(editNumber, floorFrom, floorTo)}
                </Text>
              );
            })()}
            <Text style={[styles.lbl, {color: colors.subtext}]}>Nummer (4-stellig)</Text>
            <TextInput
              style={[styles.inp, {color: colors.text, borderColor: colors.border}]}
              value={editNumber}
              onChangeText={(t) => setEditNumber(t.replace(/\D/g, '').slice(0, MAX_SPOT_NUMBER_LEN))}
              keyboardType="number-pad"
              maxLength={MAX_SPOT_NUMBER_LEN}
            />
            <Text style={[styles.lbl, {color: colors.subtext}]}>Duplex-Etagen (z. B. 0-3)</Text>
            <TextInput
              style={[styles.inp, {color: colors.text, borderColor: colors.border}]}
              value={editFloor}
              onChangeText={(t) => setEditFloor(t.replace(/[^0-9-]/g, ''))}
              placeholder="leer = kein Duplex"
            />
            <Text style={[styles.lbl, {color: colors.subtext}]}>Notiz</Text>
            <TextInput
              style={[styles.inp, {color: colors.text, borderColor: colors.border}]}
              value={editNote}
              onChangeText={setEditNote}
            />
            <View style={styles.modalRow}>
              <TouchableOpacity onPress={() => setSpotModal(false)}>
                <Text style={{color: colors.subtext}}>Abbrechen</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={saveSpotEdit}>
                <Text style={{color: colors.brand, fontWeight: '700'}}>Speichern</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <Modal visible={showTransferModal} transparent animationType="fade">
        <View style={styles.overlay}>
          <View style={[styles.modal, {backgroundColor: colors.surface}]}>
            <Text style={[styles.modalTitle, {color: colors.text}]}>Lageplan übertragen</Text>
            <Text style={[styles.lbl, {color: colors.subtext}]}>
              Aktuelle Anlage: {layout.facilityCode}
            </Text>
            <Text style={[styles.lbl, {color: colors.subtext}]}>Ziel-Anlagen-Code</Text>
            <TextInput
              style={[styles.inp, {color: colors.text, borderColor: colors.border}]}
              value={transferTargetCode}
              onChangeText={(t) => setTransferTargetCode(t.toUpperCase())}
              placeholder="z. B. PARK02"
              autoCapitalize="characters"
              autoCorrect={false}
              editable={!transferBusy}
            />
            <Text style={[styles.lbl, {color: colors.subtext}]}>Aktion</Text>
            <View style={styles.chipRow}>
              <TouchableOpacity
                style={[styles.chip, transferMode === 'copy' && {backgroundColor: colors.brand}]}
                onPress={() => setTransferMode('copy')}
                disabled={transferBusy}>
                <Text style={{color: transferMode === 'copy' ? '#fff' : colors.text}}>Kopieren</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.chip, transferMode === 'move' && {backgroundColor: colors.brand}]}
                onPress={() => setTransferMode('move')}
                disabled={transferBusy}>
                <Text style={{color: transferMode === 'move' ? '#fff' : colors.text}}>Verschieben</Text>
              </TouchableOpacity>
            </View>
            <Text style={[styles.lbl, {color: colors.subtext, marginTop: 8}]}>
              {transferMode === 'copy'
                ? 'Der Plan bleibt hier erhalten und wird zusätzlich in der Ziel-Anlage gespeichert.'
                : 'Der Plan wird in die Ziel-Anlage kopiert und hier gelöscht.'}
            </Text>
            <View style={styles.modalRow}>
              <TouchableOpacity onPress={() => setShowTransferModal(false)} disabled={transferBusy}>
                <Text style={{color: colors.subtext}}>Abbrechen</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={confirmTransfer} disabled={transferBusy}>
                {transferBusy ? (
                  <ActivityIndicator color={colors.brand} />
                ) : (
                  <Text style={{color: colors.brand, fontWeight: '700'}}>Übertragen</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <Modal visible={bulkModal} transparent animationType="fade">
        <View style={styles.overlay}>
          <ScrollView contentContainerStyle={styles.overlayScroll}>
            <View style={[styles.modal, {backgroundColor: colors.surface}]}>
              <Text style={[styles.modalTitle, {color: colors.text}]}>Durchnummerieren</Text>
              <Text style={[styles.lbl, {color: colors.subtext}]}>Startnummer</Text>
              <TextInput
                style={[styles.inp, {color: colors.text, borderColor: colors.border}]}
                value={bulkStart}
                onChangeText={setBulkStart}
              />
              <View style={styles.chipRow}>
                {(
                  [
                    ['single', 'Einzel'],
                    ['selection', 'Auswahl'],
                    ['neighbors', 'Nachbarn'],
                  ] as const
                ).map(([id, label]) => (
                  <TouchableOpacity
                    key={id}
                    style={[styles.chip, bulkScope === id && {backgroundColor: colors.brand}]}
                    onPress={() => setBulkScope(id)}>
                    <Text style={{color: bulkScope === id ? '#fff' : colors.text}}>{label}</Text>
                  </TouchableOpacity>
                ))}
              </View>
              {bulkScope !== 'single' && (
                <>
                  <Text style={[styles.lbl, {color: colors.subtext}]}>Schrittweite</Text>
                  <TextInput
                    style={[styles.inp, {color: colors.text, borderColor: colors.border}]}
                    value={bulkInc}
                    onChangeText={setBulkInc}
                    keyboardType="number-pad"
                  />
                  <Text style={[styles.lbl, {color: colors.subtext}]}>Laufrichtung auf dem Plan</Text>
                  <View style={styles.chipRow}>
                    <TouchableOpacity
                      style={[styles.chip, bulkOrder === 'row' && {backgroundColor: colors.brand}]}
                      onPress={() => setBulkOrder('row')}>
                      <Text style={{color: bulkOrder === 'row' ? '#fff' : colors.text}}>Zeilen</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.chip, bulkOrder === 'column' && {backgroundColor: colors.brand}]}
                      onPress={() => setBulkOrder('column')}>
                      <Text style={{color: bulkOrder === 'column' ? '#fff' : colors.text}}>Spalten</Text>
                    </TouchableOpacity>
                  </View>
                  <Text style={[styles.orderHint, {color: colors.subtext}]}>
                    {numberingOrderHint(bulkOrder)}
                  </Text>
                  <Text style={[styles.lbl, {color: colors.subtext}]}>Nummern</Text>
                  <View style={styles.chipRow}>
                    <TouchableOpacity
                      style={[styles.chip, bulkDirection === 'asc' && {backgroundColor: colors.brand}]}
                      onPress={() => setBulkDirection('asc')}>
                      <Text style={{color: bulkDirection === 'asc' ? '#fff' : colors.text}}>
                        Aufsteigend
                      </Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.chip, bulkDirection === 'desc' && {backgroundColor: colors.brand}]}
                      onPress={() => setBulkDirection('desc')}>
                      <Text style={{color: bulkDirection === 'desc' ? '#fff' : colors.text}}>
                        Absteigend
                      </Text>
                    </TouchableOpacity>
                  </View>
                  <Text style={[styles.orderHint, {color: colors.subtext}]}>
                    {bulkDirection === 'asc'
                      ? 'Erster Platz in der Laufrichtung = Startnummer, dann + Schrittweite'
                      : 'Erster Platz in der Laufrichtung = Startnummer, dann − Schrittweite'}
                  </Text>
                </>
              )}
              <View style={styles.duplexRow}>
                <Text style={{color: colors.text}}>Duplex</Text>
                <Switch value={bulkDuplex} onValueChange={setBulkDuplex} />
              </View>
              {bulkDuplex && (
                <>
                  <TextInput
                    style={[styles.inp, {color: colors.text, borderColor: colors.border}]}
                    value={bulkFloorFrom}
                    onChangeText={(t) => setBulkFloorFrom(t.replace(/\D/g, ''))}
                    placeholder="Etage von"
                  />
                  <TextInput
                    style={[styles.inp, {color: colors.text, borderColor: colors.border}]}
                    value={bulkFloorTo}
                    onChangeText={(t) => setBulkFloorTo(t.replace(/\D/g, ''))}
                    placeholder="Etage bis"
                  />
                </>
              )}
              <View style={styles.modalRow}>
                <TouchableOpacity onPress={() => setBulkModal(false)}>
                  <Text style={{color: colors.subtext}}>Abbrechen</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={applyBulk}>
                  <Text style={{color: colors.brand, fontWeight: '700'}}>Anwenden</Text>
                </TouchableOpacity>
              </View>
            </View>
          </ScrollView>
        </View>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  root: {flex: 1},
  centered: {flex: 1, justifyContent: 'center', alignItems: 'center'},
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  topCenter: {flex: 1, marginHorizontal: 12},
  topActions: {flexDirection: 'row', alignItems: 'center', gap: 14},
  title: {fontSize: 18, fontWeight: '700'},
  sub: {fontSize: 12, marginTop: 2},
  toolStrip: {borderBottomWidth: 1, flexGrow: 0},
  toolStripInner: {
    paddingHorizontal: 10,
    paddingVertical: 10,
    gap: 10,
    alignItems: 'stretch',
  },
  toolBtn: {
    borderRadius: 12,
    overflow: 'hidden',
    justifyContent: 'center',
    alignItems: 'center',
  },
  toolBtnPlace: {
    width: 76,
    padding: 4,
  },
  selectBtnInner: {
    flex: 1,
    minWidth: 80,
    paddingHorizontal: 14,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  toolLbl: {fontSize: 13, fontWeight: '600'},
  canvas: {flex: 1},
  bottomBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    paddingTop: 10,
    paddingHorizontal: 12,
    borderTopWidth: 1,
  },
  divider: {width: 1, height: 24, backgroundColor: '#ccc'},
  multiToggle: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    minWidth: 48,
    alignItems: 'center',
  },
  multiToggleText: {fontSize: 12, fontWeight: '700'},
  streetAutoToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
  },
  streetAutoToggleText: {fontSize: 11, fontWeight: '800'},
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'center',
    padding: 24,
  },
  overlayScroll: {flexGrow: 1, justifyContent: 'center'},
  modal: {borderRadius: 14, padding: 20},
  modalTitle: {fontSize: 18, fontWeight: '700', marginBottom: 12},
  lbl: {fontSize: 13, marginTop: 8, marginBottom: 4},
  inp: {borderWidth: 1, borderRadius: 8, padding: 10, fontSize: 16},
  modalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 20,
  },
  chipRow: {flexDirection: 'row', gap: 8, marginTop: 8},
  chip: {paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8, backgroundColor: '#eee'},
  orderHint: {fontSize: 12, marginTop: 6, marginBottom: 4, lineHeight: 17},
  duplexRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 12,
  },
});

export default FacilityLayoutEditor;
