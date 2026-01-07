import React from 'react';
import {View, Text, StyleSheet, TouchableOpacity, Share, Alert} from 'react-native';
import QRCode from 'react-native-qrcode-svg';
import {useColorScheme} from 'react-native';
import {getColors} from '../theme/colors';

interface Props {
  facilityCode: string;
  facilityName?: string;
}

const QRCodeGenerator: React.FC<Props> = ({facilityCode, facilityName}) => {
  const colors = getColors(useColorScheme());
  const deepLinkUrl = `parkplatz://register?code=${facilityCode}`;

  const handleShare = async () => {
    try {
      await Share.share({
        message: `Registriere dich für ${facilityName || facilityCode}:\n${deepLinkUrl}`,
        url: deepLinkUrl,
        title: `Registrierung ${facilityName || facilityCode}`,
      });
    } catch (error: any) {
      if (error.message !== 'User did not share') {
        Alert.alert('Fehler', 'QR-Code konnte nicht geteilt werden');
      }
    }
  };

  return (
    <View style={[styles.container, {backgroundColor: colors.screenBg}]}>
      <Text style={[styles.title, {color: colors.text}]}>QR-Code für Registrierung</Text>
      {facilityName && (
        <Text style={[styles.subtitle, {color: colors.subtext}]}>{facilityName}</Text>
      )}
      <Text style={[styles.code, {color: colors.text}]}>{facilityCode}</Text>
      
      <View style={[styles.qrContainer, {backgroundColor: colors.surface, shadowColor: colors.isDark ? '#000' : '#000'}]}>
        <QRCode
          value={deepLinkUrl}
          size={250}
          color={colors.isDark ? '#FFFFFF' : '#000000'}
          backgroundColor={colors.isDark ? colors.surface : '#FFFFFF'}
        />
      </View>

      <Text style={[styles.hint, {color: colors.subtext}]}>
        Scanne diesen Code mit der App, um dich mit dem Code {facilityCode} zu registrieren
      </Text>

      <TouchableOpacity style={[styles.shareButton, {backgroundColor: colors.brand}]} onPress={handleShare}>
        <Text style={styles.shareButtonText}>QR-Code teilen</Text>
      </TouchableOpacity>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 8,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 18,
    marginBottom: 4,
    textAlign: 'center',
  },
  code: {
    fontSize: 32,
    fontWeight: 'bold',
    marginBottom: 30,
    letterSpacing: 2,
  },
  qrContainer: {
    padding: 20,
    borderRadius: 12,
    marginBottom: 20,
    shadowOffset: {width: 0, height: 2},
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  hint: {
    fontSize: 14,
    textAlign: 'center',
    marginBottom: 30,
    paddingHorizontal: 20,
  },
  shareButton: {
    paddingHorizontal: 30,
    paddingVertical: 12,
    borderRadius: 8,
  },
  shareButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
});

export default QRCodeGenerator;

