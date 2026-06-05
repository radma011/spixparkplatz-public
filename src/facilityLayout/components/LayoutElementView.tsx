import React from 'react';
import {View, Text, Pressable, StyleSheet} from 'react-native';
import MaterialCommunityIcons from 'react-native-vector-icons/MaterialCommunityIcons';
import {
  ELEMENT_COLORS,
  SYMBOL_ICONS,
  SYMBOL_LABELS,
  symbolShowsTextLabel,
  UNOWNED_SPOT_OPACITY,
} from '../constants';
import {
  formatSpotLabelForZoom,
  maxSpotLabelFontSize,
  maxSpotLabelFontSizeVertical,
  SPOT_LABEL_PAD_PX,
} from '../spotLabel';
import {elementFootprint, normalizeSymbolRotation} from '../gridMath';
import {symbolUsesCustomLabel, maxCustomSymbolLabelFontSize} from '../symbolLabel';
import {CELL_PX, LayoutElement, isSpot, isStreet, isSymbol} from '../types';

type Props = {
  el: LayoutElement;
  cellPx: number;
  selected: boolean;
  highlighted: boolean;
  highlightColor?: string;
  /** De-emphasize when another spot is focused (viewer highlight mode). */
  dimmed?: boolean;
  /** Viewer: no user in facility has this spot in their profile. */
  unownedSpot?: boolean;
  dragDx: number;
  dragDy: number;
  readOnly: boolean;
  onPress: () => void;
  onPressIn: (pageX: number, pageY: number) => void;
  onLongPress: () => void;
};

const LayoutElementView: React.FC<Props> = ({
  el,
  cellPx,
  selected,
  highlighted,
  highlightColor = '#FBBF24',
  dimmed = false,
  unownedSpot = false,
  dragDx,
  dragDy,
  readOnly,
  onPress,
  onPressIn,
  onLongPress,
}) => {
  const {width: fw, height: fh} = elementFootprint(el);
  const w = fw * cellPx;
  const h = fh * cellPx;
  const symbolRot = isSymbol(el) ? normalizeSymbolRotation(el.rotation) : 0;
  const baseColor = ELEMENT_COLORS[isSpot(el) ? 'spot' : el.type];
  const spotBg = highlighted && isSpot(el) ? highlightColor : baseColor;
  const showSymbolLabel = isSymbol(el) && symbolShowsTextLabel(cellPx);
  const symbolIconSize = Math.min(w, h) * (showSymbolLabel ? 0.55 : 0.72);
  const customSymbolLabel = isSymbol(el) && symbolUsesCustomLabel(el) ? el.label!.trim() : '';

  const spotLabelNode = (() => {
    if (!isSpot(el)) return null;
    const zoom = cellPx / CELL_PX;
    const label = formatSpotLabelForZoom(el.number, el.floorFrom, el.floorTo, zoom);
    // 0° = 1×2 (hoch), 90° = 2×1 (breit) — nur bei hohen Plätzen Schrift drehen
    const isVerticalSpot = h > w;
    const pad = SPOT_LABEL_PAD_PX;
    const innerW = Math.max(1, w - pad * 2);
    const innerH = Math.max(1, h - pad * 2);
    const textProps = {
      numberOfLines: 1 as const,
      adjustsFontSizeToFit: true,
      minimumFontScale: 0.25,
      allowFontScaling: false,
      children: label,
    };
    if (isVerticalSpot) {
      const fontSize = maxSpotLabelFontSizeVertical(innerH, innerW, label.length);
      return (
        <View style={[styles.spotLabelRotWrap, {width: innerW, height: innerH}]}>
          <Text
            {...textProps}
            style={[
              styles.spotLabel,
              styles.spotLabelRotated,
              {fontSize, width: innerH, height: innerW},
            ]}
          />
        </View>
      );
    }
    const fontSize = maxSpotLabelFontSize(innerW, innerH, label.length);
    return (
      <Text
        {...textProps}
        style={[
          styles.spotLabel,
          {
            fontSize,
            width: innerW,
            height: innerH,
            lineHeight: innerH,
          },
        ]}
      />
    );
  })();

  const symbolCustomLabelNode = (() => {
    if (!customSymbolLabel) return null;
    const pad = SPOT_LABEL_PAD_PX;
    const innerW = Math.max(1, w - pad * 2);
    const innerH = Math.max(1, h - pad * 2);
    const shortLabel = customSymbolLabel.length <= 8;
    const maxLines = shortLabel ? 1 : 3;
    const fontSize = maxCustomSymbolLabelFontSize(innerW, innerH, customSymbolLabel);
    return (
      <Text
        style={[
          styles.spotLabel,
          {
            fontSize,
            width: innerW,
            height: innerH,
            lineHeight: shortLabel ? innerH : innerH / maxLines,
          },
        ]}
        numberOfLines={maxLines}
        adjustsFontSizeToFit
        minimumFontScale={0.25}
        allowFontScaling={false}>
        {customSymbolLabel}
      </Text>
    );
  })();

  return (
    <View
      style={[
        styles.wrap,
        {
          left: (el.x + dragDx) * cellPx,
          top: (el.y + dragDy) * cellPx,
          width: w,
          height: h,
          opacity: dimmed
            ? 0.48
            : highlighted
              ? 1
              : unownedSpot
                ? UNOWNED_SPOT_OPACITY
                : 1,
          zIndex: dragDx || dragDy
            ? 30
            : highlighted
              ? 25
              : selected
                ? 20
                : isStreet(el)
                  ? 1
                  : dimmed
                    ? 5
                    : 10,
        },
      ]}>
      {selected && (
        <View
          style={[styles.ring, isStreet(el) && styles.ringStreet]}
          pointerEvents="none"
        />
      )}
      <Pressable
        disabled={readOnly}
        delayLongPress={380}
        style={[
          styles.body,
          isStreet(el) ? styles.bodyStreet : styles.bodyRounded,
          {
            backgroundColor: spotBg,
            borderWidth: highlighted ? 3 : 0,
            borderColor: highlighted ? highlightColor : 'transparent',
          },
        ]}
        onPress={onPress}
        onPressIn={(e) => onPressIn(e.nativeEvent.pageX, e.nativeEvent.pageY)}
        onLongPress={readOnly ? undefined : onLongPress}>
        {isStreet(el) ? null : isSpot(el) ? (
          spotLabelNode
        ) : isSymbol(el) ? (
          customSymbolLabel ? (
            symbolCustomLabelNode
          ) : (
            <View style={styles.symbolInner}>
              <MaterialCommunityIcons
                name={SYMBOL_ICONS[el.type]}
                size={symbolIconSize}
                color="#fff"
                style={{transform: [{rotate: `${symbolRot}deg`}]}}
              />
              {showSymbolLabel ? (
                <Text style={styles.symbolText} numberOfLines={1}>
                  {SYMBOL_LABELS[el.type]}
                </Text>
              ) : null}
            </View>
          )
        ) : null}
      </Pressable>
    </View>
  );
};

const styles = StyleSheet.create({
  wrap: {position: 'absolute'},
  ring: {
    ...StyleSheet.absoluteFillObject,
    borderWidth: 2,
    borderColor: '#007AFF',
    borderRadius: 4,
    margin: -2,
  },
  ringStreet: {
    borderRadius: 0,
  },
  body: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  bodyRounded: {
    borderRadius: 6,
  },
  bodyStreet: {
    borderRadius: 0,
  },
  spotLabel: {
    color: '#fff',
    fontWeight: '700',
    textAlign: 'center',
    textAlignVertical: 'center',
    includeFontPadding: false,
  },
  spotLabelRotWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  spotLabelRotated: {
    transform: [{rotate: '-90deg'}],
  },
  symbolInner: {alignItems: 'center', justifyContent: 'center'},
  symbolText: {color: '#fff', fontSize: 8, fontWeight: '600', marginTop: 1},
});

export default LayoutElementView;
