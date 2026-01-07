import React from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleProp,
  ViewStyle,
} from 'react-native';
import WatermarkBackground from './WatermarkBackground';

type Props = {
  children: React.ReactNode;
  contentContainerStyle?: StyleProp<ViewStyle>;
  keyboardVerticalOffset?: number;
  scrollEnabled?: boolean;
};

/**
 * Consistent keyboard-avoid behavior for form screens:
 * - iOS: KeyboardAvoidingView with padding
 * - Android: relies on windowSoftInputMode=adjustResize (set in AndroidManifest) + height fallback
 */
export default function KeyboardAwareScreen({
  children,
  contentContainerStyle,
  keyboardVerticalOffset = 0,
  scrollEnabled = true,
}: Props) {
  return (
    <KeyboardAvoidingView
      style={{flex: 1}}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={keyboardVerticalOffset}>
      <WatermarkBackground>
        <ScrollView
          style={{flex: 1}}
          contentContainerStyle={contentContainerStyle}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
          scrollEnabled={scrollEnabled}
          automaticallyAdjustKeyboardInsets={Platform.OS === 'ios'}>
          {children}
        </ScrollView>
      </WatermarkBackground>
    </KeyboardAvoidingView>
  );
}


