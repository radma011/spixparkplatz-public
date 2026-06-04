import React, {
  forwardRef,
  useCallback,
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
} from '../types';
import {
  canvasPx,
  cellFromTouch,
  idsInRect,
  moveBy,
  viewBoundsPx,
  zoomToFitBounds,
  MIN_LAYOUT_ZOOM,
  MAX_LAYOUT_ZOOM,
} from '../gridMath';

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
  multiSelect?: boolean;
  zoom?: number;
  onZoomChange?: (zoom: number) => void;
  onSelectionChange?: (ids: Set<string>) => void;
  onPlace?: (x: number, y: number) => void;
  onMove?: (ids: Set<string>, dx: number, dy: number) => void;
};

function touchDistance(touches: ReadonlyArray<{pageX: number; pageY: number}>): number {
  if (touches.length < 2) return 0;
  const a = touches[0];
  const b = touches[1];
  return Math.hypot(b.pageX - a.pageX, b.pageY - a.pageY);
}

const LayoutSurface = forwardRef<LayoutSurfaceHandle, Props>(function LayoutSurface(
  {
    layout,
    readOnly = false,
    tool = 'select',
    placeRotation = 0,
    selectedIds = new Set(),
    highlightNumbers = new Set(),
    multiSelect = true,
    zoom = 1,
    onZoomChange,
    onSelectionChange,
    onPlace,
    onMove,
  },
  ref,
) {
  const cellPx = CELL_PX * zoom;
  const {width, height} = useMemo(() => {
    const base = canvasPx();
    return {width: base.width * zoom, height: base.height * zoom};
  }, [zoom]);

  const scrollHRef = useRef<ScrollView>(null);
  const scrollVRef = useRef<ScrollView>(null);
  const viewportRef = useRef({width: 0, height: 0});
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

  const fitToContent = useCallback(() => {
    const {width: vw, height: vh} = viewportRef.current;
    if (vw <= 0 || vh <= 0) return;
    const bounds = viewBoundsPx(layout.elements);
    const nextZoom = zoomToFitBounds(vw, vh, bounds);
    onZoomChange?.(nextZoom);
    const scrollX = Math.max(0, bounds.x * nextZoom - vw * 0.05);
    const scrollY = Math.max(0, bounds.y * nextZoom - vh * 0.05);
    requestAnimationFrame(() => {
      scrollHRef.current?.scrollTo({x: scrollX, y: 0, animated: false});
      scrollVRef.current?.scrollTo({x: 0, y: scrollY, animated: false});
    });
  }, [layout.elements, onZoomChange]);

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

  return (
    <View
      style={styles.flex}
      onLayout={(e) => {
        viewportRef.current = {
          width: e.nativeEvent.layout.width,
          height: e.nativeEvent.layout.height,
        };
      }}
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

            {layout.elements.map((el) => {
              const selected = selectedIds.has(el.id);
              const highlighted =
                isSpot(el) && !!el.number && highlightNumbers.has(el.number.trim());
              const isDragged = drag?.ids.has(el.id) ?? false;
              return (
                <LayoutElementView
                  key={el.id}
                  el={el}
                  cellPx={cellPx}
                  selected={selected}
                  highlighted={highlighted}
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
                  onLongPress={() =>
                    startDrag(el.id, dragStartPage.current.x, dragStartPage.current.y)
                  }
                />
              );
            })}
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
  marquee: {
    position: 'absolute',
    borderWidth: 2,
    borderColor: '#007AFF',
    backgroundColor: 'rgba(0,122,255,0.12)',
  },
});

export default LayoutSurface;
