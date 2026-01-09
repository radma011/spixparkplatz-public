import React from 'react';
import {View, Text} from 'react-native';
import {chipStyles} from '../../styles/chips';
import {getTodayTomorrowBadge} from '../../utils/dateUtils';

interface DayBadgeProps {
  date: Date;
}

const DayBadge: React.FC<DayBadgeProps> = ({date}) => {
  const badge = getTodayTomorrowBadge(date);
  if (!badge) return null;

  return (
    <View style={chipStyles.dayBadge}>
      <Text style={chipStyles.dayBadgeText}>{badge}</Text>
    </View>
  );
};

export default DayBadge;
