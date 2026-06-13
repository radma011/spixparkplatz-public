import React, {useState} from 'react';
import {View, Text, StyleSheet, TouchableOpacity, useColorScheme, Modal, ScrollView, Platform} from 'react-native';
import {ParkingAvailability, isAvailabilityActive, isRecurring} from '../models/ParkingAvailability';
import {formatDateRange} from '../utils/dateUtils';
import type {OfferFromAvailability} from '../services/FirestoreService';
import MaterialCommunityIcons from 'react-native-vector-icons/MaterialCommunityIcons';
import {getColors} from '../theme/colors';
import {calculateNextOccurrences, formatOccurrence, getNextOccurrenceWindows} from '../utils/recurrenceUtils';
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

  const stripWindow = React.useMemo(() => {
    if (isRecurringAvailability && availability.recurrence) {
      const windows = getNextOccurrenceWindows(
        availability.from,
        availability.until,
        availability.recurrence,
        1,
      );
      if (windows.length > 0) return windows[0];
    }
    return { from: availability.from, until: availability.until };
  }, [availability.from, availability.until, availability.recurrence, isRecurringAvailability]);

  const deduplicatedOffers = React.useMemo(() => {
    const active = offersFromAvailability.filter(
      (x) => x.offer.status === 'active' || x.offer.status === 'accepted',
    );
    const byRequest = new Map<string, typeof active[0]>();
    for (const item of active) {
      const existing = byRequest.get(item.requestId);
      if (!existing) {
        byRequest.set(item.requestId, item);
        continue;
      }
      const itemFull =
        item.requestFrom &&
        item.requestUntil &&
        item.offer.from.getTime() <= item.requestFrom.getTime() &&
        item.offer.until.getTime() >= item.requestUntil.getTime();
      const existingFull =
        existing.requestFrom &&
        existing.requestUntil &&
        existing.offer.from.getTime() <= existing.requestFrom.getTime() &&
        existing.offer.until.getTime() >= existing.requestUntil.getTime();
      const itemAccepted = item.offer.status === 'accepted';
      const existingAccepted = existing.offer.status === 'accepted';
      const itemNewer =
        (item.offer.createdAt?.getTime() ?? 0) > (existing.offer.createdAt?.getTime() ?? 0);
      const replace =
        (itemAccepted && !existingAccepted) ||
        (!itemAccepted && !existingAccepted && itemFull && !existingFull) ||
        (!itemAccepted && !existingAccepted && itemFull === existingFull && itemNewer);
      if (replace) byRequest.set(item.requestId, item);
    }
    return Array.from(byRequest.values()).sort(
      (a, b) => a.offer.from.getTime() - b.offer.from.getTime(),
    );
  }, [offersFromAvailability]);

  const freeSlots = React.useMemo(() => {
    const avFrom = stripWindow.from.getTime();
    const avUntil = stripWindow.until.getTime();
    const total = avUntil - avFrom;
    if (total <= 0) return null;

    const assigned = offersFromAvailability.filter(
      (x) => x.offer.status === 'active' || x.offer.status === 'accepted',
    );
    if (assigned.length === 0) return null;

    const intervals = assigned
      .map((o) => ({
        start: Math.max(o.offer.from.getTime(), avFrom),
        end: Math.min(o.offer.until.getTime(), avUntil),
      }))
      .filter((i) => i.end > i.start)
      .sort((a, b) => a.start - b.start);

    const merged: Array<{ start: number; end: number }> = [];
    for (const it of intervals) {
      const last = merged[merged.length - 1];
      if (!last || it.start > last.end) merged.push({ start: it.start, end: it.end });
      else last.end = Math.max(last.end, it.end);
    }

    let covered = 0;
    merged.forEach((m) => (covered += m.end - m.start));
    const percent = Math.min(100, Math.max(0, Math.round(((total - covered) / total) * 100)));

    const gaps: Array<{ start: number; end: number }> = [];
    let cursor = avFrom;
    for (const m of merged) {
      if (m.start > cursor) gaps.push({ start: cursor, end: m.start });
      cursor = Math.max(cursor, m.end);
      if (cursor >= avUntil) break;
    }
    if (cursor < avUntil) gaps.push({ start: cursor, end: avUntil });

    return { percent, gaps };
  }, [stripWindow, offersFromAvailability]);

  const renderFreeDetails = () => {
    if (!freeSlots || freeSlots.gaps.length === 0) return null;

    return (
      <View style={styles.freeContainer}>
        <Text style={[styles.freeText, styles.freeHeading, {color: colors.subtext}]}>
          Noch frei: {freeSlots.percent}%
        </Text>
        {freeSlots.gaps.map((g, idx) => (
          <Text
            key={`free-${idx}`}
            style={[styles.freeText, styles.freeLine, {color: colors.subtext}]}>
            {formatDateRange(new Date(g.start), new Date(g.end))}
          </Text>
        ))}
      </View>
    );
  };

  const statusStripSegments = React.useMemo(() => {
    const avFrom = stripWindow.from.getTime();
    const avUntil = stripWindow.until.getTime();
    const total = avUntil - avFrom;
    if (total <= 0) return [];
    const overlapping = offersFromAvailability.filter((o) => {
      const from = o.offer.from.getTime();
      const until = o.offer.until.getTime();
      return from < avUntil && until > avFrom;
    });
    const accepted = overlapping.filter((x) => x.offer.status === 'accepted');
    const offered = overlapping.filter((x) => x.offer.status === 'active' || x.offer.status === 'standby');
    const merge = (list: typeof offersFromAvailability) => {
      const intervals = list
        .map((o) => ({
          start: Math.max(o.offer.from.getTime(), avFrom),
          end: Math.min(o.offer.until.getTime(), avUntil),
        }))
        .filter((i) => i.end > i.start)
        .sort((a, b) => a.start - b.start);
      const merged: Array<{ start: number; end: number }> = [];
      for (const it of intervals) {
        const last = merged[merged.length - 1];
        if (!last || it.start > last.end) merged.push({ start: it.start, end: it.end });
        else last.end = Math.max(last.end, it.end);
      }
      return merged;
    };
    const acceptedMerged = merge(accepted);
    const offeredMerged = merge(offered);
    if (acceptedMerged.length === 0 && offeredMerged.length === 0) return [{ start: avFrom, end: avUntil, type: 'free' as const }];
    const boundaries = new Set<number>([avFrom, avUntil]);
    [...acceptedMerged, ...offeredMerged].forEach((i) => {
      boundaries.add(i.start);
      boundaries.add(i.end);
    });
    const sorted = Array.from(boundaries).sort((a, b) => a - b);
    const segs: Array<{ start: number; end: number; type: 'free' | 'offered' | 'accepted' }> = [];
    for (let i = 0; i < sorted.length - 1; i++) {
      const start = sorted[i];
      const end = sorted[i + 1];
      const mid = (start + end) / 2;
      const inAccepted = acceptedMerged.some((m) => m.start < mid && m.end > mid);
      const inOffered = offeredMerged.some((m) => m.start < mid && m.end > mid);
      const type: 'free' | 'offered' | 'accepted' = inAccepted ? 'accepted' : inOffered ? 'offered' : 'free';
      segs.push({ start, end, type });
    }
    return segs;
  }, [stripWindow, offersFromAvailability]);

  const renderStatusStrip = () => {
    if (statusStripSegments.length === 0) return null;
    const avFrom = stripWindow.from.getTime();
    const avUntil = stripWindow.until.getTime();
    const total = avUntil - avFrom;
    if (total <= 0) return null;
    const color = (type: 'free' | 'offered' | 'accepted') =>
      type === 'free' ? '#22c55e' : type === 'offered' ? '#eab308' : '#dc2626';
    return (
      <View style={styles.statusStrip}>
        {statusStripSegments.map((seg, idx) => (
          <View
            key={`${seg.start}-${seg.end}-${idx}`}
            style={[
              styles.statusStripSegment,
              { flex: (seg.end - seg.start) / total, backgroundColor: color(seg.type) },
            ]}
          />
        ))}
      </View>
    );
  };

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
          <View style={styles.cardRow}>
            <View style={styles.cardContent}>
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

      {renderFreeDetails()}

      {/* Bereits angeboten (wie Angebote im Offen-Screen) – nur active/accepted, keine stornierten (withdrawn) oder standby */}
      {deduplicatedOffers.length > 0 && (() => {
        if (typeof __DEV__ !== 'undefined' && __DEV__) {
          const active = offersFromAvailability.filter(
            (x) => x.offer.status === 'active' || x.offer.status === 'accepted',
          );
          const withdrawn = offersFromAvailability.filter((x) => x.offer.status === 'withdrawn');
          const standby = offersFromAvailability.filter((x) => x.offer.status === 'standby');
          if (offersFromAvailability.length > 0) {
            console.log('[AvailabilityCard] Angebote für Parkplatz', availability.spotId, {
              gesamt: offersFromAvailability.length,
              angezeigt: active.length,
              storniert: withdrawn.length,
              standby: standby.length,
              alle: offersFromAvailability.map((o) => ({
                id: o.offer.id,
                requestId: o.requestId,
                status: o.offer.status,
                from: o.offer.from?.toISOString?.(),
                until: o.offer.until?.toISOString?.(),
                requestedBy: o.requestedBy ?? null,
                requestedByUsername: o.requestedByUsername ?? null,
              })),
            });
          }
        }
        return (
          <View style={styles.offersBox}>
            <Text style={[styles.offersTitle, {color: colors.subtext}]}>Bereits angeboten</Text>
            {deduplicatedOffers.map((item) => {
              const full =
                item.requestFrom &&
                item.requestUntil &&
                item.offer.from.getTime() <= item.requestFrom.getTime() &&
                item.offer.until.getTime() >= item.requestUntil.getTime();
              const requesterName =
                item.requestedByUsername ||
                (item.requestedBy && publicUsers?.[item.requestedBy]?.username) ||
                (item.requestedBy && !(item.requestedBy in (publicUsers ?? {})) ? '…' : 'Unbekannt');
              return (
                <View
                  key={`${item.requestId}-${item.offer.id}`}
                  style={[styles.offerRowContainer, {borderColor: colors.border}]}>
                  <View style={[styles.offerBox, {backgroundColor: colors.surface2, borderColor: colors.border}]}>
                    <Text style={[styles.offerLabel, {color: colors.subtext}]}>
                      {item.offer.status === 'accepted' ? 'Angenommen' : full ? 'Vollständig' : 'Teilweise'}
                    </Text>
                    <Text style={[styles.offerDetails, {color: colors.text}]}>
                      {item.offer.status === 'accepted'
                        ? `${formatDateRange(item.offer.from, item.offer.until)} · Anfrage von ${requesterName}`
                        : `Anfrage von ${requesterName} · ${formatDateRange(item.offer.from, item.offer.until)}`}
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
            {renderStatusStrip()}
          </View>
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
  cardRow: {
    flexDirection: 'row',
    alignItems: 'stretch',
  },
  cardContent: {
    flex: 1,
    minWidth: 0,
  },
  statusStrip: {
    width: 6,
    borderRadius: 3,
    overflow: 'hidden',
    marginLeft: 8,
    alignSelf: 'stretch',
  },
  statusStripSegment: {
    minHeight: 2,
  },
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
  freeText: {
    fontSize: 11,
    fontWeight: '700',
    marginTop: 8,
    marginBottom: 0,
  },
  freeContainer: {
    marginTop: 8,
    marginBottom: 4,
  },
  freeHeading: {
    marginTop: 4,
    marginBottom: 4,
  },
  freeLine: {
    marginTop: 0,
    marginBottom: 0,
    marginLeft: 10,
    fontWeight: '500',
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

