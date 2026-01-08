import React, {useState} from 'react';
import {View, Text, StyleSheet, TouchableOpacity, useColorScheme, Modal, ScrollView, Platform} from 'react-native';
import {ParkingAvailability, isAvailabilityActive, isRecurring} from '../models/ParkingAvailability';
import {formatDateRange, getTodayTomorrowBadge} from '../utils/dateUtils';
import MaterialCommunityIcons from 'react-native-vector-icons/MaterialCommunityIcons';
import {normalizePhone, tryOpenUrl} from '../utils/contactLinks';
import {getColors} from '../theme/colors';
import {calculateNextOccurrences, formatOccurrence} from '../utils/recurrenceUtils';

interface Props {
  availability: ParkingAvailability;
  currentUserId: string;
  onEdit?: (availability: ParkingAvailability) => void;
  onDelete?: (availability: ParkingAvailability) => void;
  onDeactivate?: (availability: ParkingAvailability) => void;
  onActivate?: (availability: ParkingAvailability) => void;
  publicUsers?: Record<string, {username?: string; phone?: string}>;
  highlight?: boolean;
}

const AvailabilityCard: React.FC<Props> = ({
  availability,
  currentUserId,
  onEdit,
  onDelete,
  onDeactivate,
  onActivate,
  publicUsers,
  highlight,
}) => {
  const colors = getColors(useColorScheme());
  const isMyAvailability = availability.userId === currentUserId;
  const isActive = isAvailabilityActive(availability);
  const isRecurringAvailability = isRecurring(availability);
  const dayBadge = getTodayTomorrowBadge(availability.from);
  const [showDebugModal, setShowDebugModal] = useState(false);

  const recurrenceLabel = () => {
    if (!availability.recurrence) return null;
    const {pattern, interval = 1} = availability.recurrence;
    switch (pattern) {
      case 'daily':
        return interval === 1 ? 'Täglich' : `Alle ${interval} Tage`;
      case 'weekly':
        if (availability.recurrence.daysOfWeek && availability.recurrence.daysOfWeek.length > 0) {
          const dayNames = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'];
          const days = availability.recurrence.daysOfWeek.map((d) => dayNames[d]).join(', ');
          return `Wöchentlich (${days})`;
        }
        return interval === 1 ? 'Wöchentlich' : `Alle ${interval} Wochen`;
      case 'monthly':
        return interval === 1 ? 'Monatlich' : `Alle ${interval} Monate`;
      default:
        return 'Wiederkehrend';
    }
  };

  const handleLongPress = () => {
    if (isRecurringAvailability && availability.recurrence) {
      setShowDebugModal(true);
    }
  };

  const nextOccurrences = isRecurringAvailability && availability.recurrence
    ? calculateNextOccurrences(
        availability.from,
        availability.from,
        availability.until,
        availability.recurrence,
        10,
      )
    : [];

  return (
    <>
      <TouchableOpacity
        activeOpacity={1}
        onLongPress={handleLongPress}
        delayLongPress={500}>
        <View
          style={[
            styles.card,
            {
              backgroundColor: colors.surface,
              borderColor: colors.border,
              shadowColor: colors.shadow,
            },
            !isActive && styles.cardInactive,
            highlight && {borderWidth: 2, borderColor: colors.brand},
          ]}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <MaterialCommunityIcons
            name={isRecurringAvailability ? 'repeat' : 'calendar-clock'}
            size={20}
            color={isActive ? colors.brand : colors.subtext}
          />
          <Text style={[styles.spotLabel, {color: colors.text}]}>Parkplatz {availability.spotId}</Text>
          {!isActive && (
            <View style={[styles.badge, {backgroundColor: '#FF9500'}]}>
              <MaterialCommunityIcons name="pause" size={12} color="#fff" />
              <Text style={[styles.badgeText, {marginLeft: 4}]}>Pausiert</Text>
            </View>
          )}
          {isActive && dayBadge && (
            <View style={[styles.badge, {backgroundColor: colors.brand}]}>
              <Text style={styles.badgeText}>{dayBadge}</Text>
            </View>
          )}
        </View>
        {!isMyAvailability && (
          <View style={styles.headerRight}>
            <Text style={[styles.username, {color: colors.text}]} numberOfLines={1}>
              {availability.username || publicUsers?.[availability.userId]?.username || 'Unbekannt'}
            </Text>
          </View>
        )}
      </View>

      {/* Recurrence Chips - unterhalb der Überschrift */}
      {isRecurringAvailability && isActive && (
        <View style={styles.recurrenceChipsRow}>
          <View style={[styles.badge, {backgroundColor: colors.brand + '40'}]}>
            <MaterialCommunityIcons name="repeat" size={12} color={colors.brand} />
            <Text style={[styles.badgeText, {color: colors.brand, marginLeft: 4}]}>
              {recurrenceLabel()}
            </Text>
          </View>
        </View>
      )}

      {/* Time Range */}
      <View style={styles.timeRow}>
        <MaterialCommunityIcons name="clock-outline" size={16} color={colors.subtext} />
        <Text style={[styles.timeText, {color: colors.text}]}>
          {formatDateRange(availability.from, availability.until)}
        </Text>
      </View>

      {/* Recurrence Info */}
      {isRecurringAvailability && availability.recurrence && (
        <View style={styles.recurrenceInfo}>
          <Text style={[styles.recurrenceText, {color: colors.subtext}]}>
            {recurrenceLabel()}
            {availability.recurrence.endDate && (
              <> · Bis {formatDateRange(availability.recurrence.endDate, availability.recurrence.endDate)}</>
            )}
            {availability.recurrence.occurrences && (
              <> · {availability.recurrence.occurrences} Wiederholungen</>
            )}
          </Text>
        </View>
      )}

      {/* Status */}
      {!isActive && (
        <View style={[styles.statusRow, styles.statusRowPaused]}>
          <MaterialCommunityIcons name="pause-circle" size={16} color="#FF9500" />
          <Text style={[styles.statusText, {color: '#FF9500', marginLeft: 6}]}>
            {availability.isMatched ? '✓ Gematcht (pausiert)' : 'Pausiert - nicht für Matching verfügbar'}
          </Text>
        </View>
      )}

      {/* Actions */}
      {isMyAvailability && (
        <View style={styles.actionsRow}>
          {onEdit && (
            <TouchableOpacity
              style={[styles.actionBtn, styles.actionPrimary]}
              onPress={() => onEdit(availability)}>
              <MaterialCommunityIcons name="pencil" size={16} color="#fff" />
              <Text style={styles.actionTextWhite}>Bearbeiten</Text>
            </TouchableOpacity>
          )}
          {isActive && onDeactivate && (
            <TouchableOpacity
              style={[styles.actionBtn, styles.actionDark]}
              onPress={() => onDeactivate(availability)}>
              <MaterialCommunityIcons name="pause" size={16} color="#fff" />
              <Text style={styles.actionTextWhite}>Pausieren</Text>
            </TouchableOpacity>
          )}
          {!isActive && onActivate && (
            <TouchableOpacity
              style={[styles.actionBtn, styles.actionPrimary]}
              onPress={() => onActivate(availability)}>
              <MaterialCommunityIcons name="play" size={16} color="#fff" />
              <Text style={styles.actionTextWhite}>Aktivieren</Text>
            </TouchableOpacity>
          )}
          {onDelete && (
            <TouchableOpacity
              style={[styles.actionBtn, styles.actionDanger]}
              onPress={() => onDelete(availability)}>
              <MaterialCommunityIcons name="delete-outline" size={16} color="#fff" />
              <Text style={styles.actionTextWhite}>Löschen</Text>
            </TouchableOpacity>
          )}
        </View>
      )}

      {/* Contact (if not my availability) */}
      {!isMyAvailability && availability.phone && (
        <View style={styles.contactRow}>
          <TouchableOpacity
            style={[styles.contactBtn, {backgroundColor: colors.brand}]}
            onPress={() => tryOpenUrl(`tel:${normalizePhone(availability.phone!)}`)}>
            <MaterialCommunityIcons name="phone" size={16} color="#fff" />
            <Text style={styles.contactText}>Anrufen</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
      </TouchableOpacity>

      {/* Debug Modal für wiederkehrende Verfügbarkeiten */}
      {isRecurringAvailability && (
        <Modal
          visible={showDebugModal}
          animationType="slide"
          transparent={true}
          onRequestClose={() => setShowDebugModal(false)}>
          <View style={styles.debugModalOverlay}>
            <View style={[styles.debugModalContent, {backgroundColor: colors.surface}]}>
              <View style={[styles.debugModalHeader, {borderBottomColor: colors.border}]}>
                <Text style={[styles.debugModalTitle, {color: colors.text}]}>
                  Nächste 10 Termine (Debug)
                </Text>
                <TouchableOpacity onPress={() => setShowDebugModal(false)}>
                  <Text style={[styles.debugModalClose, {color: colors.subtext}]}>✕</Text>
                </TouchableOpacity>
              </View>
              <ScrollView style={styles.debugModalBody}>
                {nextOccurrences.length > 0 ? (
                  nextOccurrences.map((occurrence, index) => (
                    <View key={index} style={[styles.debugOccurrenceItem, {borderBottomColor: colors.border}]}>
                      <Text style={[styles.debugOccurrenceText, {color: colors.text}]}>
                        {formatOccurrence(occurrence, availability.until)}
                      </Text>
                    </View>
                  ))
                ) : (
                  <Text style={[styles.debugNoOccurrences, {color: colors.subtext}]}>
                    Keine zukünftigen Termine gefunden
                  </Text>
                )}
              </ScrollView>
            </View>
          </View>
        </Modal>
      )}
    </>
  );
};

const styles = StyleSheet.create({
  card: {
    marginHorizontal: 16,
    marginBottom: 12,
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    shadowOffset: {width: 0, height: 2},
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  cardInactive: {
    opacity: 0.6,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    gap: 8,
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  spotLabel: {
    fontSize: 16,
    fontWeight: '700',
  },
  username: {
    fontSize: 14,
    fontWeight: '600',
  },
  badge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    flexDirection: 'row',
    alignItems: 'center',
  },
  badgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#fff',
  },
  recurrenceChipsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
    marginBottom: 4,
    gap: 8,
    flexWrap: 'wrap',
  },
  timeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
    gap: 6,
  },
  timeText: {
    fontSize: 14,
    fontWeight: '500',
  },
  recurrenceInfo: {
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: 'rgba(0,0,0,0.1)',
  },
  recurrenceText: {
    fontSize: 12,
  },
  statusRow: {
    marginTop: 8,
    flexDirection: 'row',
    alignItems: 'center',
  },
  statusRowPaused: {
    padding: 8,
    backgroundColor: '#FFF4E6',
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#FF9500',
  },
  statusText: {
    fontSize: 12,
    fontStyle: 'italic',
  },
  actionsRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 12,
    flexWrap: 'wrap',
  },
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    gap: 6,
  },
  actionPrimary: {
    backgroundColor: '#007AFF',
  },
  actionDark: {
    backgroundColor: '#666',
  },
  actionDanger: {
    backgroundColor: '#FF3B30',
  },
  actionTextWhite: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '600',
  },
  contactRow: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: 'rgba(0,0,0,0.1)',
  },
  contactBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    gap: 6,
    alignSelf: 'flex-start',
  },
  contactText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '600',
  },
  debugModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  debugModalContent: {
    width: '90%',
    maxWidth: 500,
    maxHeight: '80%',
    borderRadius: 16,
    shadowColor: '#000',
    shadowOffset: {width: 0, height: 2},
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    elevation: 5,
  },
  debugModalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    borderBottomWidth: 1,
  },
  debugModalTitle: {
    fontSize: 18,
    fontWeight: '700',
  },
  debugModalClose: {
    fontSize: 24,
    fontWeight: '300',
  },
  debugModalBody: {
    padding: 20,
    maxHeight: 400,
  },
  debugOccurrenceItem: {
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  debugOccurrenceText: {
    fontSize: 14,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  debugNoOccurrences: {
    fontSize: 14,
    fontStyle: 'italic',
    textAlign: 'center',
    paddingVertical: 20,
  },
});

export default AvailabilityCard;

