import React, {useState} from 'react';
import {TouchableOpacity, StyleSheet, type ViewStyle} from 'react-native';
import MaterialCommunityIcons from 'react-native-vector-icons/MaterialCommunityIcons';
import FacilityLayoutMapModal from './FacilityLayoutMapModal';

type Props = {
  facilityCode: string;
  spotId: string;
  iconColor?: string;
  style?: ViewStyle;
};

/** Karten-Icon neben einer Parkplatznummer — öffnet Lageplan mit grünem Highlight. */
const SpotLayoutMapButton: React.FC<Props> = ({facilityCode, spotId, iconColor = '#22C55E', style}) => {
  const [open, setOpen] = useState(false);
  const normalized = spotId.trim();
  if (!normalized || !facilityCode.trim()) return null;

  return (
    <>
      <TouchableOpacity
        onPress={() => setOpen(true)}
        hitSlop={{top: 8, bottom: 8, left: 8, right: 8}}
        style={[styles.btn, style]}
        accessibilityLabel={`Parkplatz ${normalized} auf Lageplan anzeigen`}>
        <MaterialCommunityIcons name="map-outline" size={22} color={iconColor} />
      </TouchableOpacity>
      <FacilityLayoutMapModal
        visible={open}
        facilityCode={facilityCode}
        highlightSpotIds={[normalized]}
        onClose={() => setOpen(false)}
      />
    </>
  );
};

const styles = StyleSheet.create({
  btn: {
    padding: 4,
    marginLeft: 2,
  },
});

export default SpotLayoutMapButton;
