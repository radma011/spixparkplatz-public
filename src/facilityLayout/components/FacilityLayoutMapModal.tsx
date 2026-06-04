import React from 'react';
import {Modal} from 'react-native';
import FacilityLayoutViewer from './FacilityLayoutViewer';

export const SPOT_HIGHLIGHT_GREEN = '#22C55E';

type Props = {
  visible: boolean;
  facilityCode: string;
  highlightSpotIds: string[];
  onClose: () => void;
  highlightColor?: string;
};

const FacilityLayoutMapModal: React.FC<Props> = ({
  visible,
  facilityCode,
  highlightSpotIds,
  onClose,
  highlightColor = SPOT_HIGHLIGHT_GREEN,
}) => (
  <Modal
    visible={visible}
    animationType="slide"
    presentationStyle="fullScreen"
    onRequestClose={onClose}>
    <FacilityLayoutViewer
      facilityCode={facilityCode}
      highlightSpotIds={highlightSpotIds}
      highlightColor={highlightColor}
      dimNonHighlighted={highlightSpotIds.length > 0}
      onClose={onClose}
    />
  </Modal>
);

export default FacilityLayoutMapModal;
