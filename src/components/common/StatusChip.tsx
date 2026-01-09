import React from 'react';
import {View, Text, ViewStyle, TextStyle} from 'react-native';
import {chipStyles} from '../../styles/chips';

type StatusChipType = 'myRequest' | 'offer' | 'open' | 'fulfilled' | 'archived';

interface StatusChipProps {
  type: StatusChipType;
  label: string;
  style?: ViewStyle;
  textStyle?: TextStyle;
}

const StatusChip: React.FC<StatusChipProps> = ({type, label, style, textStyle}) => {
  const getChipStyle = () => {
    switch (type) {
      case 'myRequest':
        return chipStyles.myRequestChip;
      case 'offer':
        return chipStyles.offerChip;
      case 'open':
        return chipStyles.openChip;
      case 'fulfilled':
        return chipStyles.fulfilledChip;
      case 'archived':
        return chipStyles.archivedChip;
      default:
        return chipStyles.openChip;
    }
  };

  const useWhiteText = type !== 'myRequest';

  return (
    <View style={[chipStyles.chip, getChipStyle(), style]}>
      <Text
        style={[
          chipStyles.chipText,
          useWhiteText && chipStyles.chipTextWhite,
          textStyle,
        ]}>
        {label}
      </Text>
    </View>
  );
};

export default StatusChip;
