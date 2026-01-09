import React, {ReactNode} from 'react';
import {
  View,
  Text,
  Modal,
  TouchableOpacity,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  useColorScheme,
} from 'react-native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {modalStyles} from '../../styles/modals';
import {getColors} from '../../theme/colors';

interface BaseModalProps {
  visible: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  footer?: ReactNode;
  maxHeight?: number | string;
}

const BaseModal: React.FC<BaseModalProps> = ({
  visible,
  onClose,
  title,
  children,
  footer,
  maxHeight = 500,
}) => {
  const colors = getColors(useColorScheme());
  const insets = useSafeAreaInsets();

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent={true}
      onRequestClose={onClose}>
      <View
        style={[
          modalStyles.modalOverlay,
          {paddingTop: Math.max(insets.top + 20, 40)},
        ]}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={{width: '100%', maxWidth: 500}}>
          <View
            style={[
              modalStyles.modalContent,
              {backgroundColor: colors.surface},
              colors.isDark && {
                borderWidth: 1,
                borderColor: colors.border,
                shadowOpacity: 0,
                elevation: 0,
              },
            ]}>
            <View style={[modalStyles.modalHeader, {borderBottomColor: colors.border}]}>
              <View style={modalStyles.modalHeaderContent}>
                <Text style={[modalStyles.modalTitle, {color: colors.text}]}>{title}</Text>
              </View>
              <TouchableOpacity onPress={onClose}>
                <Text style={[modalStyles.modalCloseButton, {color: colors.subtext}]}>✕</Text>
              </TouchableOpacity>
            </View>

            <ScrollView
              style={[modalStyles.modalBody, {maxHeight}]}
              contentContainerStyle={modalStyles.modalBodyContent}
              keyboardShouldPersistTaps="handled">
              {children}
            </ScrollView>

            {footer && (
              <View style={[modalStyles.modalFooter, {borderTopColor: colors.border}]}>
                {footer}
              </View>
            )}
          </View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
};

export default BaseModal;
