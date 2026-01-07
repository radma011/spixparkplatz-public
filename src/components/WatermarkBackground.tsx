import React from 'react';
import {Image, StyleProp, StyleSheet, View, ViewStyle, useColorScheme} from 'react-native';
import {getColors} from '../theme/colors';

type Props = {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
};

export default function WatermarkBackground({children, style}: Props) {
  const colors = getColors(useColorScheme());
  const opacity = colors.isDark ? 0.06 : 0.05;

  return (
    <View style={[styles.container, {backgroundColor: colors.screenBg}, style]}>
      <View pointerEvents="none" style={styles.watermarkWrap}>
        <Image
          source={require('../AppIcon.png')}
          style={[styles.watermark, {opacity}]}
          resizeMode="contain"
        />
      </View>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {flex: 1},
  watermarkWrap: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'flex-end',
    paddingBottom: 80,
  },
  watermark: {
    width: 320,
    height: 320,
    transform: [{rotate: '-10deg'}],
  },
});


