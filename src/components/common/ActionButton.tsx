import React from 'react';
import {TouchableOpacity, Text, StyleSheet, ViewStyle, TextStyle, ActivityIndicator} from 'react-native';
import MaterialCommunityIcons from 'react-native-vector-icons/MaterialCommunityIcons';
import {buttonStyles} from '../../styles/buttons';

type ActionButtonVariant = 'primary' | 'blue' | 'dark' | 'red' | 'gray' | 'danger';

interface ActionButtonProps {
  onPress: () => void;
  label: string;
  icon?: string;
  variant?: ActionButtonVariant;
  compact?: boolean;
  disabled?: boolean;
  loading?: boolean;
  style?: ViewStyle;
  textStyle?: TextStyle;
}

const ActionButton: React.FC<ActionButtonProps> = ({
  onPress,
  label,
  icon,
  variant = 'primary',
  compact = false,
  disabled = false,
  loading = false,
  style,
  textStyle,
}) => {
  const getVariantStyle = () => {
    switch (variant) {
      case 'primary':
        return buttonStyles.actionPrimary;
      case 'blue':
        return buttonStyles.actionBlue;
      case 'dark':
        return buttonStyles.actionDark;
      case 'red':
        return buttonStyles.actionRed;
      case 'gray':
        return buttonStyles.actionGray;
      case 'danger':
        return buttonStyles.actionDanger;
      default:
        return buttonStyles.actionPrimary;
    }
  };

  return (
    <TouchableOpacity
      style={[
        buttonStyles.actionBtn,
        getVariantStyle(),
        compact && buttonStyles.actionBtnCompact,
        (disabled || loading) && {opacity: 0.5},
        style,
      ]}
      onPress={onPress}
      disabled={disabled || loading}>
      {loading ? (
        <ActivityIndicator size="small" color="#fff" />
      ) : (
        icon && <MaterialCommunityIcons name={icon as any} size={16} color="#fff" />
      )}
      <Text style={[buttonStyles.actionTextWhite, textStyle]}>
        {loading ? 'Wird gesendet...' : label}
      </Text>
    </TouchableOpacity>
  );
};

export default ActionButton;
