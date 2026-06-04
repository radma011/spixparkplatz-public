import React, {useMemo} from 'react';
import {View, Text, StyleSheet} from 'react-native';
import MaterialCommunityIcons from 'react-native-vector-icons/MaterialCommunityIcons';
import {ELEMENT_COLORS, SYMBOL_ICONS, SYMBOL_LABELS} from '../constants';
import {EditorTool, SymbolKind} from '../types';
import {normalizeSpotRotation, normalizeSymbolRotation, spotSize} from '../gridMath';

export const TOOL_PREVIEW_HEIGHT = 84;

type PlaceTool = Exclude<EditorTool, 'select'>;

type Props = {
  tool: PlaceTool;
  spotRotation: number;
  symbolRotation: number;
  /** 0–1, z. B. inaktives Werkzeug */
  opacity?: number;
};

/** Füllt den Eltern-Button (flex:1) — kein eigenes Pressable. */
const PlacementPreview: React.FC<Props> = ({
  tool,
  spotRotation,
  symbolRotation,
  opacity = 1,
}) => {
  const content = useMemo(() => {
    if (tool === 'street') {
      return (
        <View style={styles.fill}>
          <View
            style={[
              styles.streetShape,
              {
                backgroundColor: ELEMENT_COLORS.street,
                width: '88%',
                aspectRatio: 1,
                maxHeight: '88%',
              },
            ]}
          />
        </View>
      );
    }

    if (tool === 'spot') {
      const rot = normalizeSpotRotation(spotRotation);
      const {width, height} = spotSize(rot);
      const aspect = width / height;
      return (
        <View style={styles.fill}>
          <View
            style={[
              styles.spotShape,
              {
                aspectRatio: aspect,
                width: aspect >= 1 ? '88%' : undefined,
                height: aspect < 1 ? '88%' : undefined,
                maxWidth: '88%',
                maxHeight: '88%',
                backgroundColor: ELEMENT_COLORS.spot,
              },
            ]}>
            <MaterialCommunityIcons name="parking" size={28} color="#fff" />
          </View>
        </View>
      );
    }

    const kind = tool as SymbolKind; // entrance | exit | door
    const rot = normalizeSymbolRotation(symbolRotation);
    return (
      <View style={styles.fill}>
        <View
          style={[
            styles.symbolShape,
            {backgroundColor: ELEMENT_COLORS[kind], width: '88%', aspectRatio: 1, maxHeight: '88%'},
          ]}>
          <MaterialCommunityIcons
            name={SYMBOL_ICONS[kind]}
            size={36}
            color="#fff"
            style={{transform: [{rotate: `${rot}deg`}]}}
          />
          <Text style={styles.symbolLabel} numberOfLines={1}>
            {SYMBOL_LABELS[kind]}
          </Text>
        </View>
      </View>
    );
  }, [tool, spotRotation, symbolRotation]);

  return <View style={[styles.root, {opacity}]}>{content}</View>;
};

const styles = StyleSheet.create({
  root: {flex: 1, width: '100%', alignSelf: 'stretch'},
  fill: {
    flex: 1,
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  spotShape: {
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  symbolShape: {
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  streetShape: {
    borderRadius: 0,
  },
  symbolLabel: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '700',
    marginTop: 2,
  },
});

export default PlacementPreview;
