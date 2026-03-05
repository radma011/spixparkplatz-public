import React from 'react';
import {Text, View, useColorScheme} from 'react-native';
import BaseModal from './common/Modal';
import {getColors} from '../theme/colors';
import {modalStyles} from '../styles/modals';

interface Props {
  visible: boolean;
  onClose: () => void;
}

const PartialOffersInfoModal: React.FC<Props> = ({visible, onClose}) => {
  const colors = getColors(useColorScheme());

  return (
    <BaseModal
      visible={visible}
      onClose={onClose}
      title="Gestückelte Angebote akzeptieren"
      footer={null}>
      <View>
        <Text style={[modalStyles.modalText, {color: colors.text, marginBottom: 12}]}>
          Mit dieser Option legst du fest, ob du nur vollständige Angebote
          für den gesamten angefragten Zeitraum akzeptieren möchtest
          oder auch gestückelte Angebote.
        </Text>
        <Text style={[modalStyles.modalText, {color: colors.text}]}>
          Bei gestückelten Angeboten decken mehrere Angebote nur Teile deines
          Zeitraums ab. Du bekommst dann zwar eher einen Platz, musst dein
          Fahrzeug aber ggf. zwischendurch umparken.
        </Text>
      </View>
    </BaseModal>
  );
};

export default PartialOffersInfoModal;

