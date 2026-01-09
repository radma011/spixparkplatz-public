import React from 'react';
import {Alert, View, Text, StyleSheet, TouchableOpacity, useColorScheme} from 'react-native';
import {ParkingRequest} from '../models/ParkingRequest';
import {formatDateRange} from '../utils/dateUtils';
import MaterialCommunityIcons from 'react-native-vector-icons/MaterialCommunityIcons';
import {getColors} from '../theme/colors';
import {RequestOffer} from '../models/RequestOffer';
import ActionButton from './common/ActionButton';
import StatusChip from './common/StatusChip';
import DayBadge from './common/DayBadge';
import {cardStyles} from '../styles/cards';
import {chipStyles} from '../styles/chips';
import {showContactOptions} from '../utils/contactUtils';

interface Props {
  request: ParkingRequest & {section?: string};
  onDelete?: (requestId: string) => void;
  offers?: RequestOffer[];
  publicUsers?: Record<string, {username?: string; phone?: string}>;
  currentUserId?: string;
  onAcceptOffer?: (offer: RequestOffer) => void;
}

const MyRequestCard: React.FC<Props> = ({request, onDelete, offers = [], publicUsers, currentUserId, onAcceptOffer}) => {
  const colors = getColors(useColorScheme());
  const hasOffer = !!request.offeredSpotId && !request.isFulfilled;
  const canDelete = !request.isFulfilled;
  const canContactOnFulfilled = request.isFulfilled && !!request.offeredByPhone;
  
  // Finde das aktive Angebot für diesen Request
  const activeOfferForDisplay = React.useMemo(() => {
    if (!hasOffer || !request.offeredSpotId || !request.offeredBy) return null;
    return offers.find(
      (o) =>
        o.status === 'active' &&
        o.offererId === request.offeredBy &&
        o.spotId === request.offeredSpotId
    ) || null;
  }, [hasOffer, request.offeredSpotId, request.offeredBy, offers]);
  
  // Finde das vollständige Angebot für den Annehmen-Button
  const fullOffer = React.useMemo(() => {
    if (!hasOffer || !request.offeredSpotId || !request.offeredBy) return null;
    return offers.find(
      (o) =>
        o.status === 'active' &&
        o.offererId === request.offeredBy &&
        o.spotId === request.offeredSpotId &&
        o.from.getTime() <= request.from.getTime() &&
        o.until.getTime() >= request.until.getTime()
    ) || null;
  }, [hasOffer, request.offeredSpotId, request.offeredBy, offers, request.from, request.until]);
  
  // Abdeckung berechnen
  const shouldShowCoverage = React.useMemo(() => {
    if (request.isFulfilled) return false;
    return offers.length > 0;
  }, [request.isFulfilled, offers.length]);
  
  const coverage = React.useMemo(() => {
    if (!shouldShowCoverage) return null;
    const accepted = offers.filter((o) => o.status === 'accepted');
    const offersToUse = accepted.length > 0 ? accepted : offers.filter((o) => o.status === 'active');
    const minT = request.from.getTime();
    const maxT = request.until.getTime();
    const total = Math.max(0, maxT - minT);
    if (!total) return {percent: 0, gaps: [{start: minT, end: maxT}]};

    const intervals = offersToUse
      .map((o) => ({
        start: Math.max(o.from.getTime(), minT),
        end: Math.min(o.until.getTime(), maxT),
      }))
      .filter((i) => i.end > i.start)
      .sort((a, b) => a.start - b.start);

    const merged: Array<{start: number; end: number}> = [];
    for (const it of intervals) {
      const last = merged[merged.length - 1];
      if (!last || it.start > last.end) {
        merged.push({start: it.start, end: it.end});
      } else {
        last.end = Math.max(last.end, it.end);
      }
    }

    let covered = 0;
    merged.forEach((m) => (covered += m.end - m.start));
    const percent = Math.min(100, Math.max(0, Math.round((covered / total) * 100)));

    const gaps: Array<{start: number; end: number}> = [];
    let cursor = minT;
    for (const m of merged) {
      if (m.start > cursor) gaps.push({start: cursor, end: m.start});
      cursor = Math.max(cursor, m.end);
      if (cursor >= maxT) break;
    }
    if (cursor < maxT) gaps.push({start: cursor, end: maxT});

    return {percent, gaps};
  }, [offers, request.from, request.until, shouldShowCoverage]);

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


  return (
    <View
      style={[
        cardStyles.card,
        {backgroundColor: colors.surface},
        colors.isDark && {shadowOpacity: 0, elevation: 0, borderWidth: 1, borderColor: colors.border},
      ]}>
      <View style={cardStyles.cardHeader}>
        <View style={cardStyles.cardTitleContainer}>
          <View style={cardStyles.titleRow}>
            {canContactOnFulfilled && (
              <TouchableOpacity
                accessibilityLabel="Kontakt"
                style={[cardStyles.headerContactBtn, {backgroundColor: colors.surface2, borderColor: colors.border}]}
                onPress={() => showContactOptions(request.offeredByPhone)}>
                <MaterialCommunityIcons name="message-text-outline" size={18} color={colors.text} />
              </TouchableOpacity>
            )}
            <Text style={[cardStyles.cardTitle, {color: colors.text}]} numberOfLines={1}>
              {title}
            </Text>
          </View>
          <Text style={[cardStyles.cardSubtitle, {color: colors.subtext}]} numberOfLines={1}>
            {subtitle}
          </Text>
        </View>

        <View style={chipStyles.badgesRow}>
          <DayBadge date={request.from} />
          {request.isFulfilled ? (
            <StatusChip type="fulfilled" label="Erfüllt" />
          ) : hasOffer ? (
            <StatusChip type="offer" label="Angeboten" />
          ) : (
            <StatusChip type="open" label="Offen" />
          )}
        </View>
      </View>

      {(() => {
        // Bei nicht-erfüllten Requests mit Angebot
        if (!request.isFulfilled && hasOffer && request.offeredSpotId) {
          if (activeOfferForDisplay) {
            const isFullOffer = activeOfferForDisplay.from.getTime() <= request.from.getTime() && 
                               activeOfferForDisplay.until.getTime() >= request.until.getTime();
            const offererName = request.offeredByUsername || 
                               publicUsers?.[request.offeredBy || '']?.username || 
                               (activeOfferForDisplay as any).offererUsername || 
                               'Unbekannt';
            return (
              <View>
                <Text style={[styles.timeRangeText, {color: colors.text}]} numberOfLines={1}>
                  {formatDateRange(request.from, request.until)}
                </Text>
                {shouldShowCoverage && coverage && (
                  <Text style={[styles.coverageText, {color: colors.subtext}]}>
                    Abdeckung: {coverage.percent}%{' '}
                    {coverage.gaps.length === 0
                      ? '(vollständig)'
                      : `· Rest: ${coverage.gaps
                          .slice(0, 2)
                          .map((g) => formatDateRange(new Date(g.start), new Date(g.end)))
                          .join(' · ')}${coverage.gaps.length > 2 ? ' · …' : ''}`}
                  </Text>
                )}
                <View style={[styles.offerBox, {backgroundColor: colors.surface2, borderColor: colors.border}]}>
                  <Text style={[styles.offerLabel, {color: colors.subtext}]}>
                    {isFullOffer ? 'Vollständig' : 'Teilweise'}
                  </Text>
                  <Text style={[styles.offerDetails, {color: colors.text}]}>
                    P {activeOfferForDisplay.spotId} ({offererName}) · {formatDateRange(activeOfferForDisplay.from, activeOfferForDisplay.until)}
                  </Text>
                </View>
              </View>
            );
          }
          
          // Fallback: Wenn kein aktives Angebot gefunden wurde
          const offererName = request.offeredByUsername || 
                             publicUsers?.[request.offeredBy || '']?.username || 
                             'Unbekannt';
          return (
            <View>
              <Text style={[styles.timeRangeText, {color: colors.text}]} numberOfLines={1}>
                {formatDateRange(request.from, request.until)}
              </Text>
              {shouldShowCoverage && coverage && (
                <Text style={[styles.coverageText, {color: colors.subtext}]}>
                  Abdeckung: {coverage.percent}%{' '}
                  {coverage.gaps.length === 0
                    ? '(vollständig)'
                    : `· Rest: ${coverage.gaps
                        .slice(0, 2)
                        .map((g) => formatDateRange(new Date(g.start), new Date(g.end)))
                        .join(' · ')}${coverage.gaps.length > 2 ? ' · …' : ''}`}
                </Text>
              )}
              <View style={[styles.offerBox, {backgroundColor: colors.surface2, borderColor: colors.border}]}>
                <Text style={[styles.offerLabel, {color: colors.subtext}]}>Angebot</Text>
                <Text style={[styles.offerDetails, {color: colors.text}]}>
                  P {request.offeredSpotId} ({offererName}) · {formatDateRange(request.from, request.until)}
                </Text>
              </View>
            </View>
          );
        }
        
        // Bei erfüllten Requests oder ohne Angebot
        if (request.isFulfilled && request.offeredSpotId) {
          return (
            <View style={styles.timeRow}>
              <Text style={[styles.dateText, {color: colors.text}]} numberOfLines={1}>
                {formatDateRange(request.from, request.until)}
              </Text>
              <Text style={styles.spotText} numberOfLines={1}>
                P {request.offeredSpotId}
              </Text>
            </View>
          );
        }
        
        return (
          <Text style={[styles.timeRangeText, {color: colors.text}]} numberOfLines={1}>
            {formatDateRange(request.from, request.until)}
          </Text>
        );
      })()}

      {!!commentPreview && (
        <Text style={[styles.commentPreview, {color: colors.subtext}]} numberOfLines={2}>
          {commentPreview}
        </Text>
      )}

      {(canDelete && onDelete) || (hasOffer && !request.isFulfilled && fullOffer && onAcceptOffer) ? (
        <View style={styles.actionsRow}>
          {hasOffer && !request.isFulfilled && fullOffer && onAcceptOffer && (
            <ActionButton
              onPress={() => {
                if (!fullOffer) return;
                onAcceptOffer(fullOffer);
              }}
              label="Annehmen"
              icon="check-circle-outline"
              variant="blue"
              compact={true}
            />
          )}
          {canDelete && onDelete && (
            <ActionButton
              onPress={() => onDelete(request.id)}
              label="Anfrage zurückziehen"
              icon="trash-can-outline"
              variant="red"
            />
          )}
        </View>
      ) : null}
    </View>
  );
};

const styles = StyleSheet.create({
  // Card, chip, and badge styles moved to src/styles/cards.ts and src/styles/chips.ts
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
  actionBtnCompact: {
    alignSelf: 'flex-start',
  },
  actionTextWhite: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '700',
  },
  actionBlue: {
    backgroundColor: '#2563EB',
  },
  actionRed: {
    backgroundColor: '#DC2626',
  },
  offerBox: {
    marginTop: 8,
    marginBottom: 0,
    padding: 10,
    borderRadius: 8,
    borderWidth: 1,
  },
  offerLabel: {
    fontSize: 11,
    fontWeight: '800',
    marginBottom: 4,
  },
  offerDetails: {
    fontSize: 12,
    fontWeight: '700',
    flexWrap: 'wrap',
  },
  coverageText: {
    fontSize: 11,
    fontWeight: '700',
    marginTop: 8,
    marginBottom: 0,
  },
});

export default MyRequestCard;


