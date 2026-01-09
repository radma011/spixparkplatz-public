import React from 'react';
import {TouchableOpacity, Text, StyleSheet, ViewStyle, TextStyle, ActivityIndicator} from 'react-native';
import {buttonStyles} from '../../styles/buttons';

type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'cancel';

interface ButtonProps {
  onPress: () => void;
  label: string;
  variant?: ButtonVariant;
  disabled?: boolean;
  loading?: boolean;
  style?: ViewStyle;
  textStyle?: TextStyle;
  fullWidth?: boolean;
}

const Button: React.FC<ButtonProps> = ({
  onPress,
  label,
  variant = 'primary',
  disabled = false,
  loading = false,
  style,
  textStyle,
  fullWidth = true,
}) => {
  const getVariantStyle = () => {
    switch (variant) {
      case 'primary':
        return [buttonStyles.modalButton, buttonStyles.submitButton];
      case 'secondary':
        return [buttonStyles.modalButton, buttonStyles.cancelButton];
      case 'danger':
        return [buttonStyles.modalButton, buttonStyles.actionRed];
      case 'cancel':
        return [buttonStyles.modalButton, buttonStyles.cancelButton];
      default:
        return [buttonStyles.modalButton, buttonStyles.submitButton];
    }
  };

  const getTextStyle = () => {
    switch (variant) {
      case 'primary':
      case 'danger':
        return buttonStyles.submitButtonText;
      case 'secondary':
      case 'cancel':
        return buttonStyles.cancelButtonText;
      default:
        return buttonStyles.submitButtonText;
    }
  };

  return (
    <TouchableOpacity
      style={[
        ...getVariantStyle(),
        !fullWidth && {flex: 0},
        (disabled || loading) && buttonStyles.submitButtonDisabled,
        style,
      ]}
      onPress={onPress}
      disabled={disabled || loading}>
      {loading ? (
        <ActivityIndicator color={variant === 'primary' || variant === 'danger' ? '#fff' : '#666'} />
      ) : (
        <Text style={[getTextStyle(), textStyle]}>{label}</Text>
      )}
    </TouchableOpacity>
  );
};

export default Button;
