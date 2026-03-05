import React, {useState} from 'react';
import {View, Text, StyleSheet, TouchableOpacity, useColorScheme, Modal, ScrollView, Platform} from 'react-native';
import {ParkingAvailability, isAvailabilityActive, isRecurring} from '../models/ParkingAvailability';
import {formatDateRange} from '../utils/dateUtils';
import type {OfferFromAvailability} from '../services/FirestoreService';
import MaterialCommunityIcons from 'react-native-vector-icons/MaterialCommunityIcons';
import {getColors} from '../theme/colors';
import {calculateNextOccurrences, formatOccurrence} from '../utils/recurrenceUtils';
import ActionButton from './common/ActionButton';
import DayBadge from './common/DayBadge';
import {cardStyles} from '../styles/cards';
import {chipStyles} from '../styles/chips';
import {showContactOptions} from '../utils/contactUtils';

interface Props {
  availability: ParkingAvailability;
  currentUserId: string;
  onEdit?: (availability: ParkingAvailability) => void;
  onDelete?: (availability: ParkingAvailability) => void;
  onDeactivate?: (availability: ParkingAvailability) => void;
  onActivate?: (availability: ParkingAvailability) => void;
  publicUsers?: Record<string, {username?: string; phone?: string}>;
  highlight?: boolean;
  /** Offers already made from this availability (for "Bereits angeboten" on Frei tab). */
  offersFromAvailability?: OfferFromAvailability[];
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
  offersFromAvailability = [],
}) => {
  const colors = getColors(useColorScheme());
  const isMyAvailability = availability.userId === currentUserId;
  const isActive = isAvailabilityActive(availability);
  const isRecurringAvailability = isRecurring(availability);
  const [showDebugModal, setShowDebugModal] = useState(false);

  const recurrenceLabel = () => {
    if (!availability.recurrence) return null;
    const {pattern, interval = 1} = availability.recurrence;
    switch (pattern) {
      case 'daily':
        return interval === 1 ? 'Täglich' : `Alle ${interval} Tage`;
      case 'weekly':
        if (availability.recurrence.daysOfWeek && availability.recurrence.daysOfWeek.length > 0) {
          // Monday-first day names (0 = Monday, 1 = Tuesday, ..., 6 = Sunday)
          const dayNames = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'];
          // Convert JS dayOfWeek (0=So, 1=Mo, ...) to Monday-first index (0=Mo, 1=Di, ..., 6=So)
          const jsDayToMondayFirst = (jsDay) => jsDay === 0 ? 6 : jsDay - 1;
          const days = availability.recurrence.daysOfWeek
            .map((jsDay) => dayNames[jsDayToMondayFirst(jsDay)])
            .join(', ');
          return `Wöchentlich (${days})`;
        }
        return interval === 1 ? 'Wöchentlich' : `Alle ${interval} Wochen`;
      case 'monthly':
        return interval === 1 ? 'Monatlich' : `Alle ${interval} Monate`;
      default:
        return 'Wiederkehrend';
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
      <TouchableOpacity activeOpacity={1}>
        <View
          style={[
            cardStyles.card,
            {
              backgroundColor: colors.surface,
              borderColor: colors.border,
              shadowColor: '#000',
            },
            !isActive && cardStyles.cardInactive,
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
          {isActive && <DayBadge date={availability.from} />}
        </View>
        {!isMyAvailability && (
          <View style={styles.headerRight}>
            <Text style={[styles.username, {color: colors.text}]} numberOfLines={1}>
              {availability.username || publicUsers?.[availability.userId]?.username || 'Unbekannt'}
            </Text>
          </View>
        )}
      </View>

      {/* Recurrence Label (tap öffnet Modal mit wiederkehrenden Terminen) */}
      {isRecurringAvailability && isActive && (
        <TouchableOpacity
          style={styles.recurrenceChipsRow}
          onPress={() => setShowDebugModal(true)}
          activeOpacity={0.7}>
          <View style={[styles.badge, {backgroundColor: colors.brand + '40'}]}>
            <MaterialCommunityIcons name="repeat" size={12} color={colors.brand} />
            <Text style={[styles.badgeText, {color: colors.brand, marginLeft: 4}]}>
              {recurrenceLabel()}
            </Text>
          </View>
        </TouchableOpacity>
      )}

      {/* Time Range */}
      <View style={styles.timeRow}>
        <MaterialCommunityIcons name="clock-outline" size={16} color={colors.subtext} />
        <Text style={[styles.timeText, {color: colors.text}]}>
          {formatDateRange(availability.from, availability.until)}
        </Text>
      </View>

      {/* Bereits angeboten (wie Angebote im Offen-Screen) */}
      {offersFromAvailability.length > 0 && (() => {
        const active = offersFromAvailability.filter(
          (x) => x.offer.status !== 'withdrawn' && x.offer.status !== 'standby',
        );
        const seenOfferIds = new Set<string>();
        const toShow = active.filter((x) => {
          const key = `${x.requestId}:${x.offer.id}`;
          if (seenOfferIds.has(key)) return false;
          seenOfferIds.add(key);
          return true;
        });
        if (toShow.length === 0) return null;
        return (
          <View style={styles.offersBox}>
            <Text style={[styles.offersTitle, {color: colors.subtext}]}>Bereits angeboten</Text>
            {toShow.map((item) => {
              const full =
                item.requestFrom &&
                item.requestUntil &&
                item.offer.from.getTime() <= item.requestFrom.getTime() &&
                item.offer.until.getTime() >= item.requestUntil.getTime();
              const requesterName =
                (item.requestedBy && publicUsers?.[item.requestedBy]?.username) || 'Unbekannt';
              return (
                <View
                  key={`${item.requestId}-${item.offer.id}`}
                  style={[styles.offerRowContainer, {borderColor: colors.border}]}>
                  <View style={[styles.offerBox, {backgroundColor: colors.surface2, borderColor: colors.border}]}>
                    <Text style={[styles.offerLabel, {color: colors.subtext}]}>
                      {item.offer.status === 'accepted' ? 'Angenommen' : full ? 'Vollständig' : 'Teilweise'}
                    </Text>
                    <Text style={[styles.offerDetails, {color: colors.text}]}>
                      Anfrage von {requesterName} · {formatDateRange(item.offer.from, item.offer.until)}
                    </Text>
                  </View>
                </View>
              );
            })}
          </View>
        );
      })()}

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
            <ActionButton
              onPress={() => onEdit(availability)}
              label="Bearbeiten"
              icon="pencil"
              variant="primary"
            />
          )}
          {isActive && onDeactivate && (
            <ActionButton
              onPress={() => onDeactivate(availability)}
              label="Pausieren"
              icon="pause"
              variant="dark"
            />
          )}
          {!isActive && onActivate && (
            <ActionButton
              onPress={() => onActivate(availability)}
              label="Aktivieren"
              icon="play"
              variant="primary"
            />
          )}
          {onDelete && (
            <ActionButton
              onPress={() => onDelete(availability)}
              label="Löschen"
              icon="delete-outline"
              variant="danger"
            />
          )}
        </View>
      )}

      {/* Contact (if not my availability) */}
      {!isMyAvailability && availability.phone && (
        <View style={styles.contactRow}>
          <TouchableOpacity
            style={[styles.contactBtn, {backgroundColor: colors.brand}]}
            onPress={() => showContactOptions(availability.phone)}>
            <MaterialCommunityIcons name="phone" size={16} color="#fff" />
            <Text style={styles.contactText}>Anrufen</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
      </TouchableOpacity>

      {/* Modal: wiederkehrende Termine (öffnet sich bei Tap auf das Wiederkehrend-Label) */}
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
                  Wiederkehrende Termine
                </Text>
                <TouchableOpacity onPress={() => setShowDebugModal(false)}>
                  <Text style={[styles.debugModalClose, {color: colors.subtext}]}>✕</Text>
                </TouchableOpacity>
              </View>
              {availability.recurrence && (
                <View style={[styles.recurrenceSummaryInModal, {borderBottomColor: colors.border}]}>
                  <Text style={[styles.recurrenceSummaryText, {color: colors.subtext}]}>
                    {recurrenceLabel()}
                    {availability.recurrence.endDate && (
                      <> · Bis {formatDateRange(availability.recurrence.endDate, availability.recurrence.endDate)}</>
                    )}
                    {availability.recurrence.occurrences != null && (
                      <> · {availability.recurrence.occurrences} Wiederholungen</>
                    )}
                  </Text>
                </View>
              )}
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
  // Card styles moved to src/styles/cards.ts
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
  offersBox: {
    marginTop: 8,
    paddingTop: 6,
  },
  offersTitle: {
    fontSize: 12,
    fontWeight: '900',
    marginBottom: 6,
  },
  offerRowContainer: {
    marginBottom: 8,
    gap: 8,
  },
  offerBox: {
    marginTop: 4,
    marginBottom: 4,
    padding: 10,
    borderRadius: 8,
    borderWidth: 1,
  },
  offerLabel: {
    fontSize: 11,
    fontWeight: '800',
  },
  offerDetails: {
    fontSize: 12,
    fontWeight: '700',
    flexWrap: 'wrap',
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
    alignItems: 'center',
    flexShrink: 0,
  },
  // Action button styles moved to src/styles/buttons.ts
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
  recurrenceSummaryInModal: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: 1,
  },
  recurrenceSummaryText: {
    fontSize: 13,
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

