import React from 'react';
import {View, Text, Pressable, StyleSheet} from 'react-native';
import MaterialCommunityIcons from 'react-native-vector-icons/MaterialCommunityIcons';
import {ELEMENT_COLORS, SYMBOL_ICONS, SYMBOL_LABELS} from '../constants';
import {formatSpotLabel, spotFontSize} from '../spotLabel';
import {normalizeSymbolRotation} from '../gridMath';
import {LayoutElement, isSpot} from '../types';

type Props = {
  el: LayoutElement;
  cellPx: number;
  selected: boolean;
  highlighted: boolean;
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
  dragDx,
  dragDy,
  readOnly,
  onPress,
  onPressIn,
  onLongPress,
}) => {
  const w = (isSpot(el) ? el.width : 1) * cellPx;
  const h = (isSpot(el) ? el.height : 1) * cellPx;
  const symbolRot = !isSpot(el) ? normalizeSymbolRotation(el.rotation) : 0;

  return (
    <View
      style={[
        styles.wrap,
        {
          left: (el.x + dragDx) * cellPx,
          top: (el.y + dragDy) * cellPx,
          width: w,
          height: h,
          zIndex: dragDx || dragDy ? 30 : selected ? 20 : 10,
        },
      ]}>
      {selected && <View style={styles.ring} pointerEvents="none" />}
      <Pressable
        disabled={readOnly}
        delayLongPress={380}
        style={[
          styles.body,
          {
            backgroundColor: ELEMENT_COLORS[isSpot(el) ? 'spot' : el.type],
            borderWidth: highlighted ? 2 : 0,
            borderColor: '#FBBF24',
          },
        ]}
        onPress={onPress}
        onPressIn={(e) => onPressIn(e.nativeEvent.pageX, e.nativeEvent.pageY)}
        onLongPress={readOnly ? undefined : onLongPress}>
        {isSpot(el) ? (
          <Text
            style={[
              styles.spotLabel,
              {
                fontSize: spotFontSize(
                  w,
                  h,
                  formatSpotLabel(el.number, el.floorFrom, el.floorTo).length,
                ),
              },
            ]}
            numberOfLines={1}
            adjustsFontSizeToFit
            minimumFontScale={0.4}>
            {formatSpotLabel(el.number, el.floorFrom, el.floorTo)}
          </Text>
        ) : (
          <View style={styles.symbolInner}>
            <MaterialCommunityIcons
              name={SYMBOL_ICONS[el.type]}
              size={Math.min(w, h) * 0.55}
              color="#fff"
              style={{transform: [{rotate: `${symbolRot}deg`}]}}
            />
            <Text style={styles.symbolText} numberOfLines={1}>
              {SYMBOL_LABELS[el.type]}
            </Text>
          </View>
        )}
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
  body: {
    flex: 1,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  spotLabel: {color: '#fff', fontWeight: '700', textAlign: 'center', paddingHorizontal: 2},
  symbolInner: {alignItems: 'center', justifyContent: 'center'},
  symbolText: {color: '#fff', fontSize: 8, fontWeight: '600', marginTop: 1},
});

export default LayoutElementView;
