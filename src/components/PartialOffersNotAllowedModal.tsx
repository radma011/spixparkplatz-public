import React from 'react';
import {Text, View, useColorScheme, StyleSheet, TouchableOpacity} from 'react-native';
import {getColors} from '../theme/colors';
import {modalStyles} from '../styles/modals';

interface Props {
  visible: boolean;
  onClose: () => void;
}

const PartialOffersNotAllowedModal: React.FC<Props> = ({visible, onClose}) => {
  const colors = getColors(useColorScheme());

  if (!visible) {
    return null;
  }

  return (
    <View style={styles.overlay}>
      <TouchableOpacity style={styles.backdrop} activeOpacity={1} onPress={onClose} />
      <TouchableOpacity
        style={[styles.card, {backgroundColor: colors.surface}]}
        activeOpacity={1}
        onPress={onClose}>
        <Text
          style={[
            modalStyles.modalTitle,
            {color: colors.text, fontSize: 18, marginBottom: 8},
          ]}>
          Teilangebote nicht möglich
        </Text>
        <Text style={[modalStyles.modalText, {color: colors.text}]}>
          Danke für Dein Angebot! Leider wird für die Anfrage ein durchgängiger
          Parkplatz benötigt. Wenn Du diesen anbieten kannst, wähle bitte
          „Vollständig“.
        </Text>
      </TouchableOpacity>
    </View>
  );
};

const styles = StyleSheet.create({
  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.4)',
    padding: 24,
  },
  backdrop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  card: {
    width: '100%',
    maxWidth: 480,
    borderRadius: 16,
    paddingHorizontal: 20,
    paddingVertical: 16,
  },
});

export default PartialOffersNotAllowedModal;

