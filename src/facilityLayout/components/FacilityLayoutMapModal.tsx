import React from 'react';
import {Modal} from 'react-native';
import {SPOT_HIGHLIGHT_GREEN} from '../constants';
import FacilityLayoutViewer from './FacilityLayoutViewer';

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
