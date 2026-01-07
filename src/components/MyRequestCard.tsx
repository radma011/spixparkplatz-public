import React from 'react';
import {Alert, View, Text, StyleSheet, TouchableOpacity, useColorScheme} from 'react-native';
import {ParkingRequest} from '../models/ParkingRequest';
import {formatDateRange, getTodayTomorrowBadge} from '../utils/dateUtils';
import MaterialCommunityIcons from 'react-native-vector-icons/MaterialCommunityIcons';
import {normalizePhone, tryOpenUrl} from '../utils/contactLinks';
import {getColors} from '../theme/colors';

interface Props {
  request: ParkingRequest & {section?: string};
  onDelete?: (requestId: string) => void;
}

const MyRequestCard: React.FC<Props> = ({request, onDelete}) => {
  const colors = getColors(useColorScheme());
  const hasOffer = !!request.offeredSpotId && !request.isFulfilled;
  const canDelete = !request.isFulfilled;
  const dayBadge = getTodayTomorrowBadge(request.from);
  const canContactOnFulfilled = request.isFulfilled && !!request.offeredByPhone;

  const commentPreview = React.useMemo(() => {
    const t = String(request.initialCommentText ?? request.lastCommentText ?? '').trim();
    if (!t) return null;
    return t.length > 90 ? `${t.slice(0, 90)}…` : t;
  }, [request.initialCommentText, request.lastCommentText]);

  const title = hasOffer || request.isFulfilled ? (request.offeredByUsername ?? '…') : 'Meine Anfrage';
  const subtitle = request.isFulfilled
    ? 'wurde erfüllt'
    : hasOffer
      ? 'hat dir einen Parkplatz angeboten'
      : 'sucht einen Parkplatz';

  const handleContact = () => {
    if (!request.offeredByPhone) {
      Alert.alert('Kontakt', 'Keine Telefonnummer verfügbar.');
      return;
    }
    const normalized = normalizePhone(request.offeredByPhone || '');
    if (!normalized) {
      Alert.alert('Fehler', 'Keine gültige Telefonnummer vorhanden');
      return;
    }
    const {e164, digits} = normalized;
    Alert.alert('Kontakt', 'Wie möchtest du die Person kontaktieren?', [
      {
        text: 'Anrufen',
        onPress: async () => {
          const ok = await tryOpenUrl(`tel:${e164}`);
          if (!ok) Alert.alert('Fehler', 'Konnte Telefon-App nicht öffnen');
        },
      },
      {
        text: 'SMS/iMessage',
        onPress: async () => {
          const ok = await tryOpenUrl(`sms:${e164}`);
          if (!ok) Alert.alert('Fehler', 'Konnte Nachrichten-App nicht öffnen');
        },
      },
      {
        text: 'WhatsApp',
        onPress: async () => {
          const ok = await tryOpenUrl(`https://wa.me/${digits}`);
          if (!ok) Alert.alert('Fehler', 'Konnte WhatsApp nicht öffnen');
        },
      },
      {
        text: 'Signal',
        onPress: async () => {
          const ok = await tryOpenUrl(`sgnl://send?phone=${encodeURIComponent(e164)}`);
          if (!ok) Alert.alert('Fehler', 'Konnte Signal nicht öffnen');
        },
      },
      {text: 'Abbrechen', style: 'cancel'},
    ]);
  };

  return (
    <View
      style={[
        styles.card,
        {backgroundColor: colors.surface},
        colors.isDark && {shadowOpacity: 0, elevation: 0, borderWidth: 1, borderColor: colors.border},
      ]}>
      <View style={styles.cardHeader}>
        <View style={styles.cardTitleContainer}>
          <View style={styles.titleRow}>
            {canContactOnFulfilled && (
              <TouchableOpacity
                accessibilityLabel="Kontakt"
                style={[styles.headerContactBtn, {backgroundColor: colors.surface2, borderColor: colors.border}]}
                onPress={handleContact}>
                <MaterialCommunityIcons name="message-text-outline" size={18} color={colors.text} />
              </TouchableOpacity>
            )}
            <Text style={[styles.cardTitle, {color: colors.text}]} numberOfLines={1}>
              {title}
            </Text>
          </View>
          <Text style={[styles.cardSubtitle, {color: colors.subtext}]} numberOfLines={1}>
            {subtitle}
          </Text>
        </View>

        <View style={styles.badgesRow}>
          {dayBadge && (
            <View style={styles.dayBadge}>
              <Text style={styles.dayBadgeText}>{dayBadge}</Text>
            </View>
          )}
          {request.isFulfilled ? (
            <View style={[styles.chip, styles.fulfilledChip]}>
              <Text style={[styles.chipText, styles.chipTextWhite]}>Erfüllt</Text>
            </View>
          ) : hasOffer ? (
            <View style={[styles.chip, styles.offerChip]}>
              <Text style={[styles.chipText, styles.chipTextWhite]}>Angeboten</Text>
            </View>
          ) : (
            <View style={[styles.chip, styles.openChip]}>
              <Text style={[styles.chipText, styles.chipTextWhite]}>Offen</Text>
            </View>
          )}
        </View>
      </View>

      {(hasOffer || request.isFulfilled) && request.offeredSpotId ? (
        <View style={styles.timeRow}>
          <Text style={[styles.dateText, {color: colors.text}]} numberOfLines={1}>
            {formatDateRange(request.from, request.until)}
          </Text>
          <Text style={styles.spotText} numberOfLines={1}>
            P {request.offeredSpotId}
          </Text>
        </View>
      ) : (
        <Text style={[styles.timeRangeText, {color: colors.text}]} numberOfLines={1}>
          {formatDateRange(request.from, request.until)}
        </Text>
      )}

      {!!commentPreview && (
        <Text style={[styles.commentPreview, {color: colors.subtext}]} numberOfLines={2}>
          {commentPreview}
        </Text>
      )}

      {canDelete && onDelete && (
        <View style={styles.actionsRow}>
          <TouchableOpacity style={[styles.actionBtn, styles.actionRed]} onPress={() => onDelete(request.id)}>
            <MaterialCommunityIcons name="trash-can-outline" size={16} color="#fff" />
            <Text style={styles.actionTextWhite}>Löschen</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  card: {
    borderRadius: 12,
    padding: 12,
    marginBottom: 10,
    shadowColor: '#000',
    shadowOffset: {width: 0, height: 2},
    shadowOpacity: 0.1,
    shadowRadius: 3,
    elevation: 2,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 4,
  },
  cardTitleContainer: {flex: 1},
  titleRow: {flexDirection: 'row', alignItems: 'center', gap: 8},
  headerContactBtn: {
    width: 28,
    height: 28,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  cardTitle: {fontSize: 15, fontWeight: 'bold'},
  cardSubtitle: {fontSize: 12, marginTop: 1},
  badgesRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  dayBadge: {
    backgroundColor: '#FEE2E2',
    borderColor: '#FCA5A5',
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 16,
  },
  dayBadgeText: {
    color: '#991B1B',
    fontSize: 11,
    fontWeight: '700',
  },
  chip: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 16,
  },
  openChip: {
    backgroundColor: '#FF9800',
  },
  offerChip: {
    backgroundColor: '#4CAF50',
  },
  fulfilledChip: {
    backgroundColor: '#2196F3',
  },
  chipText: {
    fontSize: 11,
    fontWeight: '600',
  },
  chipTextWhite: {
    color: '#fff',
  },
  timeRangeText: {
    fontSize: 12,
    fontWeight: '600',
    marginBottom: 4,
  },
  timeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    marginBottom: 4,
  },
  dateText: {flex: 1, fontSize: 12, fontWeight: '600'},
  spotText: {fontSize: 13, fontWeight: '900', color: '#16A34A'},
  commentPreview: {fontSize: 12, marginTop: 2, fontWeight: '600'},
  actionsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 2,
  },
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 7,
    paddingHorizontal: 10,
    borderRadius: 999,
  },
  actionTextWhite: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '700',
  },
  actionRed: {
    backgroundColor: '#DC2626',
  },
});

export default MyRequestCard;


