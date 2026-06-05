import React, {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  View,
  ScrollView,
  StyleSheet,
  PanResponder,
  type GestureResponderEvent,
} from 'react-native';
import LayoutElementView from './LayoutElementView';
import {
  CELL_PX,
  EditorTool,
  FacilityLayout,
  isSpot,
  isStreet,
} from '../types';
import {
  canvasPx,
  cellFromTouch,
  defaultViewBoundsPx,
  elementsBoundsPx,
  idsInRect,
  moveBy,
  zoomToFitBounds,
  MIN_LAYOUT_ZOOM,
  MAX_LAYOUT_ZOOM,
} from '../gridMath';

const FIT_PAD_CELLS = 1;

const MARQUEE_THRESHOLD = 10;

export type LayoutSurfaceHandle = {
  fitToContent: () => void;
};

type Props = {
  layout: FacilityLayout;
  readOnly?: boolean;
  tool?: EditorTool;
  placeRotation?: number;
  selectedIds?: Set<string>;
  highlightNumbers?: Set<string>;
  highlightColor?: string;
  /** Fade non-highlighted elements when specific spots are focused (card map link). */
  dimNonHighlighted?: boolean;
  /** Viewer: spot numbers with a registered owner in the facility (full color). */
  assignedSpotNumbers?: Set<string> | null;
  multiSelect?: boolean;
  zoom?: number;
  onZoomChange?: (zoom: number) => void;
  onSelectionChange?: (ids: Set<string>) => void;
  onPlace?: (x: number, y: number) => void;
  onMove?: (ids: Set<string>, dx: number, dy: number) => void;
  /** Run fit-to-content once when the canvas viewport gets a real size (e.g. on open). */
  autoFitOnLayout?: boolean;
};

function touchDistance(touches: ReadonlyArray<{pageX: number; pageY: number}>): number {
  if (touches.length < 2) return 0;
  const a = touches[0];
  const b = touches[1];
  return Math.hypot(b.pageX - a.pageX, b.pageY - a.pageY);
}

function touchMidpoint(touches: ReadonlyArray<{pageX: number; pageY: number}>): {
  pageX: number;
  pageY: number;
} {
  if (touches.length < 2) {
    return {pageX: touches[0]?.pageX ?? 0, pageY: touches[0]?.pageY ?? 0};
  }
  return {
    pageX: (touches[0].pageX + touches[1].pageX) / 2,
    pageY: (touches[0].pageY + touches[1].pageY) / 2,
  };
}

type ReadOnlyGesture = {
  mode: 'idle' | 'pan' | 'pinch';
  panBase: {x: number; y: number};
  pinchStartDist: number;
  pinchStartZoom: number;
  pinchStartPan: {x: number; y: number};
  pinchFocal: {x: number; y: number};
};

const LayoutSurface = forwardRef<LayoutSurfaceHandle, Props>(function LayoutSurface(
  {
    layout,
    readOnly = false,
    tool = 'select',
    placeRotation = 0,
    selectedIds = new Set(),
    highlightNumbers = new Set(),
    highlightColor,
    dimNonHighlighted = false,
    assignedSpotNumbers = null,
    multiSelect = true,
    zoom = 1,
    onZoomChange,
    onSelectionChange,
    onPlace,
    onMove,
    autoFitOnLayout = false,
  },
  ref,
) {
  const cellPx = CELL_PX * zoom;
  const drawOrder = useMemo(() => {
    const streets = layout.elements.filter(isStreet);
    const rest = layout.elements.filter((e) => !isStreet(e));
    return [...streets, ...rest];
  }, [layout.elements]);
  const {width, height} = useMemo(() => {
    const base = canvasPx();
    return {width: base.width * zoom, height: base.height * zoom};
  }, [zoom]);

  const scrollHRef = useRef<ScrollView>(null);
  const scrollVRef = useRef<ScrollView>(null);
  const viewportContainerRef = useRef<View>(null);
  const viewportRef = useRef({width: 0, height: 0});
  const viewportOriginRef = useRef({x: 0, y: 0});
  const [panOffset, setPanOffset] = useState({x: 0, y: 0});
  const panOffsetRef = useRef({x: 0, y: 0});
  const readOnlyGestureRef = useRef<ReadOnlyGesture>({
    mode: 'idle',
    panBase: {x: 0, y: 0},
    pinchStartDist: 0,
    pinchStartZoom: 1,
    pinchStartPan: {x: 0, y: 0},
    pinchFocal: {x: 0, y: 0},
  });
  const skipZoomPanSyncRef = useRef(false);
  const prevZoomForPanRef = useRef(zoom);
  const [scrollEnabled, setScrollEnabled] = useState(true);
  const [marquee, setMarquee] = useState<{x1: number; y1: number; x2: number; y2: number} | null>(
    null,
  );
  const touchStart = useRef<{x: number; y: number} | null>(null);
  const marqueeActive = useRef(false);
  const elementTouched = useRef(false);
  const [drag, setDrag] = useState<{ids: Set<string>; dx: number; dy: number} | null>(null);
  const dragStartPage = useRef({x: 0, y: 0});
  const zoomRef = useRef(zoom);
  const pinchRef = useRef({active: false, startDist: 0, startZoom: 1});
  zoomRef.current = zoom;

  const clampZoom = (z: number) => Math.max(MIN_LAYOUT_ZOOM, Math.min(MAX_LAYOUT_ZOOM, z));

  const clampPan = useCallback((panX: number, panY: number, z: number) => {
    const {width: vw, height: vh} = viewportRef.current;
    const base = canvasPx();
    const cw = base.width * z;
    const ch = base.height * z;
    let x = panX;
    let y = panY;
    if (cw <= vw) x = (vw - cw) / 2;
    else x = Math.max(vw - cw, Math.min(0, x));
    if (ch <= vh) y = (vh - ch) / 2;
    else y = Math.max(vh - ch, Math.min(0, y));
    return {x, y};
  }, []);

  const applyPan = useCallback((next: {x: number; y: number}) => {
    panOffsetRef.current = next;
    setPanOffset(next);
  }, []);

  const autoFitPendingRef = useRef(autoFitOnLayout);

  useEffect(() => {
    autoFitPendingRef.current = autoFitOnLayout;
  }, [autoFitOnLayout, layout.facilityCode, layout.elements.length]);

  const fitToContent = useCallback(() => {
    const {width: vw, height: vh} = viewportRef.current;
    if (vw <= 0 || vh <= 0) return;
    const bounds =
      elementsBoundsPx(layout.elements, FIT_PAD_CELLS) ?? defaultViewBoundsPx();
    const nextZoom = zoomToFitBounds(vw, vh, bounds);
    const scaledW = bounds.width * nextZoom;
    const scaledH = bounds.height * nextZoom;
    const panX = (vw - scaledW) / 2 - bounds.x * nextZoom;
    const panY = (vh - scaledH) / 2 - bounds.y * nextZoom;

    if (readOnly) {
      skipZoomPanSyncRef.current = true;
      onZoomChange?.(nextZoom);
      applyPan(clampPan(panX, panY, nextZoom));
      prevZoomForPanRef.current = nextZoom;
      return;
    }

    onZoomChange?.(nextZoom);
    const base = canvasPx();
    const canvasW = base.width * nextZoom;
    const canvasH = base.height * nextZoom;
    let scrollX = bounds.x * nextZoom + (scaledW - vw) / 2;
    let scrollY = bounds.y * nextZoom + (scaledH - vh) / 2;
    scrollX = Math.max(0, Math.min(Math.max(0, canvasW - vw), scrollX));
    scrollY = Math.max(0, Math.min(Math.max(0, canvasH - vh), scrollY));
    requestAnimationFrame(() => {
      scrollHRef.current?.scrollTo({x: scrollX, y: 0, animated: false});
      scrollVRef.current?.scrollTo({x: 0, y: scrollY, animated: false});
    });
  }, [applyPan, clampPan, layout.elements, layout.facilityCode, onZoomChange, readOnly]);

  useEffect(() => {
    if (!readOnly) {
      prevZoomForPanRef.current = zoom;
      return;
    }
    if (skipZoomPanSyncRef.current) {
      skipZoomPanSyncRef.current = false;
      prevZoomForPanRef.current = zoom;
      return;
    }
    const prevZ = prevZoomForPanRef.current;
    if (prevZ === zoom) return;
    const {width: vw, height: vh} = viewportRef.current;
    if (vw <= 0 || vh <= 0) {
      prevZoomForPanRef.current = zoom;
      return;
    }
    const focalX = vw / 2;
    const focalY = vh / 2;
    const p = panOffsetRef.current;
    const cx = (focalX - p.x) / prevZ;
    const cy = (focalY - p.y) / prevZ;
    applyPan(clampPan(focalX - cx * zoom, focalY - cy * zoom, zoom));
    prevZoomForPanRef.current = zoom;
  }, [applyPan, clampPan, readOnly, zoom]);

  useImperativeHandle(ref, () => ({fitToContent}), [fitToContent]);

  const endPinch = useCallback(() => {
    pinchRef.current.active = false;
    if (!drag) setScrollEnabled(true);
  }, [drag]);

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => false,
        onMoveShouldSetPanResponder: (evt) => evt.nativeEvent.touches.length >= 2,
        onPanResponderGrant: (evt) => {
          if (evt.nativeEvent.touches.length >= 2) {
            pinchRef.current = {
              active: true,
              startDist: touchDistance(evt.nativeEvent.touches),
              startZoom: zoomRef.current,
            };
            setScrollEnabled(false);
          }
        },
        onPanResponderMove: (evt) => {
          if (!pinchRef.current.active || evt.nativeEvent.touches.length < 2) return;
          const dist = touchDistance(evt.nativeEvent.touches);
          if (pinchRef.current.startDist <= 0) return;
          const ratio = dist / pinchRef.current.startDist;
          onZoomChange?.(clampZoom(pinchRef.current.startZoom * ratio));
        },
        onPanResponderRelease: endPinch,
        onPanResponderTerminate: endPinch,
      }),
    [endPinch, onZoomChange],
  );

  const beginReadOnlyPinch = useCallback(
    (touches: ReadonlyArray<{pageX: number; pageY: number}>) => {
      const g = readOnlyGestureRef.current;
      g.mode = 'pinch';
      g.pinchStartDist = touchDistance(touches);
      g.pinchStartZoom = zoomRef.current;
      g.pinchStartPan = {...panOffsetRef.current};
      const mid = touchMidpoint(touches);
      const origin = viewportOriginRef.current;
      g.pinchFocal = {x: mid.pageX - origin.x, y: mid.pageY - origin.y};
    },
    [],
  );

  const readOnlyPanResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => readOnly,
        onMoveShouldSetPanResponder: () => readOnly,
        onPanResponderTerminationRequest: () => false,
        onPanResponderGrant: (evt) => {
          if (!readOnly) return;
          const touches = evt.nativeEvent.touches;
          const g = readOnlyGestureRef.current;
          if (touches.length >= 2) {
            beginReadOnlyPinch(touches);
          } else {
            g.mode = 'pan';
            g.panBase = {...panOffsetRef.current};
          }
        },
        onPanResponderMove: (evt, gestureState) => {
          if (!readOnly) return;
          const touches = evt.nativeEvent.touches;
          const g = readOnlyGestureRef.current;
          if (touches.length >= 2) {
            if (g.mode !== 'pinch') beginReadOnlyPinch(touches);
            const dist = touchDistance(touches);
            if (g.pinchStartDist <= 0) return;
            const ratio = dist / g.pinchStartDist;
            const newZoom = clampZoom(g.pinchStartZoom * ratio);
            const cx = (g.pinchFocal.x - g.pinchStartPan.x) / g.pinchStartZoom;
            const cy = (g.pinchFocal.y - g.pinchStartPan.y) / g.pinchStartZoom;
            skipZoomPanSyncRef.current = true;
            applyPan(
              clampPan(
                g.pinchFocal.x - cx * newZoom,
                g.pinchFocal.y - cy * newZoom,
                newZoom,
              ),
            );
            prevZoomForPanRef.current = newZoom;
            onZoomChange?.(newZoom);
          } else if (g.mode === 'pan') {
            applyPan(
              clampPan(
                g.panBase.x + gestureState.dx,
                g.panBase.y + gestureState.dy,
                zoomRef.current,
              ),
            );
          }
        },
        onPanResponderRelease: () => {
          readOnlyGestureRef.current.mode = 'idle';
        },
        onPanResponderTerminate: () => {
          readOnlyGestureRef.current.mode = 'idle';
        },
      }),
    [applyPan, beginReadOnlyPinch, clampPan, onZoomChange, readOnly],
  );

  const onViewportLayout = useCallback(
    (e: {nativeEvent: {layout: {width: number; height: number}}}) => {
      const w = e.nativeEvent.layout.width;
      const h = e.nativeEvent.layout.height;
      const hadSize = viewportRef.current.width > 0 && viewportRef.current.height > 0;
      viewportRef.current = {width: w, height: h};
      viewportContainerRef.current?.measureInWindow((x, y) => {
        viewportOriginRef.current = {x, y};
      });
      if (!hadSize && w > 0 && h > 0 && autoFitPendingRef.current) {
        autoFitPendingRef.current = false;
        requestAnimationFrame(() => fitToContent());
      }
    },
    [fitToContent],
  );

  const toggleSelect = useCallback(
    (id: string) => {
      onSelectionChange?.(
        (() => {
          if (!multiSelect) return new Set(selectedIds.has(id) ? [] : [id]);
          const next = new Set(selectedIds);
          if (next.has(id)) next.delete(id);
          else next.add(id);
          return next;
        })(),
      );
    },
    [multiSelect, onSelectionChange, selectedIds],
  );

  const finishMarquee = (rect: {x1: number; y1: number; x2: number; y2: number} | null) => {
    marqueeActive.current = false;
    setScrollEnabled(true);
    setMarquee(null);
    if (rect && onSelectionChange) {
      const ids = idsInRect(layout.elements, rect.x1, rect.y1, rect.x2, rect.y2, cellPx);
      if (ids.length) onSelectionChange(new Set(ids));
    }
  };

  const onGridTouchStart = (e: GestureResponderEvent) => {
    if (readOnly || e.nativeEvent.touches.length !== 1) return;
    elementTouched.current = false;
    const t = e.nativeEvent.touches[0];
    touchStart.current = {x: t.locationX, y: t.locationY};
    if (tool === 'select' && multiSelect) marqueeActive.current = false;
  };

  const onGridTouchMove = (e: GestureResponderEvent) => {
    if (readOnly || !touchStart.current || e.nativeEvent.touches.length !== 1) return;
    const t = e.nativeEvent.touches[0];
    const dx = t.locationX - touchStart.current.x;
    const dy = t.locationY - touchStart.current.y;
    if (tool !== 'select' || !multiSelect) return;
    if (Math.hypot(dx, dy) < MARQUEE_THRESHOLD) return;
    if (!marqueeActive.current) {
      marqueeActive.current = true;
      setScrollEnabled(false);
    }
    setMarquee({
      x1: touchStart.current.x,
      y1: touchStart.current.y,
      x2: t.locationX,
      y2: t.locationY,
    });
  };

  const onGridTouchEnd = (locationX: number, locationY: number) => {
    if (readOnly) return;
    if (marqueeActive.current || marquee) {
      finishMarquee(
        marquee ?? (touchStart.current
          ? {x1: touchStart.current.x, y1: touchStart.current.y, x2: locationX, y2: locationY}
          : null),
      );
      touchStart.current = null;
      return;
    }
    if (elementTouched.current) {
      elementTouched.current = false;
      touchStart.current = null;
      return;
    }
    const start = touchStart.current;
    const moved =
      start != null &&
      Math.hypot(locationX - start.x, locationY - start.y) > MARQUEE_THRESHOLD;
    touchStart.current = null;
    if (moved) return;

    if (tool === 'select') {
      onSelectionChange?.(new Set());
      return;
    }
    const {x, y} = cellFromTouch(locationX, locationY, cellPx);
    onPlace?.(x, y);
    void placeRotation;
  };

  const startDrag = (id: string, pageX: number, pageY: number) => {
    const ids = selectedIds.has(id) ? new Set(selectedIds) : new Set([id]);
    if (!selectedIds.has(id)) onSelectionChange?.(ids);
    setScrollEnabled(false);
    dragStartPage.current = {x: pageX, y: pageY};
    setDrag({ids, dx: 0, dy: 0});
  };

  const onDragOverlayMove = (pageX: number, pageY: number) => {
    if (!drag) return;
    const scale = zoomRef.current;
    const cell = CELL_PX * scale;
    const dx = Math.round((pageX - dragStartPage.current.x) / cell);
    const dy = Math.round((pageY - dragStartPage.current.y) / cell);
    setDrag((d) => {
      if (!d || (d.dx === dx && d.dy === dy)) return d;
      if (!moveBy(layout.elements, d.ids, dx, dy)) return d;
      return {...d, dx, dy};
    });
  };

  const endDrag = () => {
    if (drag && (drag.dx !== 0 || drag.dy !== 0)) {
      onMove?.(drag.ids, drag.dx, drag.dy);
    }
    setDrag(null);
    if (!pinchRef.current.active) setScrollEnabled(true);
  };

  const elementViews = useMemo(
    () =>
      drawOrder.map((el) => {
        const selected = selectedIds.has(el.id);
        const highlighted =
          isSpot(el) && !!el.number && highlightNumbers.has(el.number.trim());
        const focusMode = dimNonHighlighted && highlightNumbers.size > 0;
        const dimmed = focusMode && !highlighted;
        const spotNumber = isSpot(el) && el.number ? el.number.trim().toUpperCase() : '';
        const unownedSpot =
          readOnly &&
          assignedSpotNumbers != null &&
          isSpot(el) &&
          (!spotNumber || !assignedSpotNumbers.has(spotNumber));
        const isDragged = drag?.ids.has(el.id) ?? false;
        return (
          <LayoutElementView
            key={el.id}
            el={el}
            cellPx={cellPx}
            selected={selected}
            highlighted={highlighted}
            highlightColor={highlightColor}
            dimmed={dimmed}
            unownedSpot={unownedSpot}
            dragDx={isDragged ? (drag?.dx ?? 0) : 0}
            dragDy={isDragged ? (drag?.dy ?? 0) : 0}
            readOnly={readOnly}
            onPress={() => {
              elementTouched.current = true;
              if (!readOnly) toggleSelect(el.id);
            }}
            onPressIn={(px, py) => {
              elementTouched.current = true;
              dragStartPage.current = {x: px, y: py};
            }}
            onLongPress={() => startDrag(el.id, dragStartPage.current.x, dragStartPage.current.y)}
          />
        );
      }),
    [
      assignedSpotNumbers,
      cellPx,
      dimNonHighlighted,
      drag,
      drawOrder,
      highlightColor,
      highlightNumbers,
      readOnly,
      selectedIds,
      toggleSelect,
    ],
  );

  if (readOnly) {
    return (
      <View
        ref={viewportContainerRef}
        style={styles.viewerViewport}
        onLayout={onViewportLayout}
        {...readOnlyPanResponder.panHandlers}>
        <View
          style={{
            width,
            height,
            transform: [{translateX: panOffset.x}, {translateY: panOffset.y}],
          }}>
          <View style={{width, height, backgroundColor: '#E8ECF0'}} pointerEvents="none">
            {elementViews}
          </View>
        </View>
      </View>
    );
  }

  return (
    <View
      style={styles.flex}
      onLayout={onViewportLayout}
      {...panResponder.panHandlers}>
      <ScrollView
        ref={scrollHRef}
        style={styles.flex}
        scrollEnabled={scrollEnabled && !drag}
        horizontal
        nestedScrollEnabled
        contentContainerStyle={{width, height: '100%'}}
        scrollEventThrottle={64}
        showsHorizontalScrollIndicator={false}>
        <ScrollView
          ref={scrollVRef}
          scrollEnabled={scrollEnabled && !drag}
          nestedScrollEnabled
          contentContainerStyle={{width, height}}
          showsVerticalScrollIndicator={false}>
          <View
            style={{width, height, backgroundColor: '#E8ECF0'}}
            onStartShouldSetResponder={() => !readOnly && tool !== undefined}
            onMoveShouldSetResponder={() => marqueeActive.current}
            onTouchStart={onGridTouchStart}
            onTouchMove={onGridTouchMove}
            onTouchEnd={(ev) => onGridTouchEnd(ev.nativeEvent.locationX, ev.nativeEvent.locationY)}
            onTouchCancel={() => finishMarquee(null)}>
            {marquee && (
              <View
                pointerEvents="none"
                style={[
                  styles.marquee,
                  {
                    left: Math.min(marquee.x1, marquee.x2),
                    top: Math.min(marquee.y1, marquee.y2),
                    width: Math.abs(marquee.x2 - marquee.x1),
                    height: Math.abs(marquee.y2 - marquee.y1),
                  },
                ]}
              />
            )}

            {elementViews}
          </View>
        </ScrollView>
      </ScrollView>

      {drag && !readOnly && (
        <View
          style={StyleSheet.absoluteFill}
          onTouchMove={(ev) => onDragOverlayMove(ev.nativeEvent.pageX, ev.nativeEvent.pageY)}
          onTouchEnd={endDrag}
          onTouchCancel={endDrag}
        />
      )}
    </View>
  );
});

const styles = StyleSheet.create({
  flex: {flex: 1},
  viewerViewport: {flex: 1, overflow: 'hidden'},
  marquee: {
    position: 'absolute',
    borderWidth: 2,
    borderColor: '#007AFF',
    backgroundColor: 'rgba(0,122,255,0.12)',
  },
});

export default LayoutSurface;
