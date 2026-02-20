import React from 'react';
import {Alert, View, Text, StyleSheet, TouchableOpacity, useColorScheme} from 'react-native';
import {showAlert} from '../utils/alertUtils';
import {ParkingRequest} from '../models/ParkingRequest';
import {formatDateRange} from '../utils/dateUtils';
import MaterialCommunityIcons from 'react-native-vector-icons/MaterialCommunityIcons';
import {getColors} from '../theme/colors';
import {RequestOffer} from '../models/RequestOffer';
import ActionButton from './common/ActionButton';
import StatusChip from './common/StatusChip';
import DayBadge from './common/DayBadge';
import {buttonStyles} from '../styles/buttons';
import {cardStyles} from '../styles/cards';
import {chipStyles} from '../styles/chips';
import {showContactOptions} from '../utils/contactUtils';

interface Props {
  request: ParkingRequest;
  currentUserId: string;
  mySpots: string[];
  onOffer: (request: ParkingRequest) => void;
  onFulfill: (request: ParkingRequest) => void;
  onCancelOffer: (request: ParkingRequest) => void;
  onWithdraw: (request: ParkingRequest) => void;
  offers?: RequestOffer[];
  publicUsers?: Record<string, {username?: string; phone?: string}>;
  onAcceptOffer?: (offer: RequestOffer) => void;
  onArchiveFulfilled?: (request: ParkingRequest) => void;
  focusOfferId?: string | null;
  onOpenComments?: (requestId: string) => void;
  highlight?: boolean;
  isOffering?: boolean;
}

const RequestCard: React.FC<Props> = ({
  request,
  currentUserId,
  mySpots,
  onOffer,
  onFulfill,
  onCancelOffer,
  onWithdraw,
  offers = [],
  publicUsers,
  onAcceptOffer,
  onArchiveFulfilled,
  focusOfferId,
  onOpenComments,
  highlight,
  isOffering = false,
}) => {
  const colors = getColors(useColorScheme());
  const isMyRequest = request.requestedBy === currentUserId;
  
  // Finde mein aktives oder standby Angebot (auch bei Teilangeboten)
  const myActiveOffer = React.useMemo(() => {
    return offers.find(
      (o) => (o.status === 'active' || o.status === 'standby') && o.offererId === currentUserId
    );
  }, [offers, currentUserId]);
  
  // Finde mein akzeptiertes Angebot (bei erfüllten Anfragen)
  const myAcceptedOffer = React.useMemo(() => {
    return offers.find(
      (o) => o.status === 'accepted' && o.offererId === currentUserId
    );
  }, [offers, currentUserId]);
  
  const isMyOffer = !!myActiveOffer || !!myAcceptedOffer || request.offeredBy === currentUserId;
  const hasOffer = !!request.offeredSpotId && !request.isFulfilled;
  const isFulfilled = request.isFulfilled;
  const isArchived = !!request.isArchived;

  const hasOfferOrFulfilled = hasOffer || isFulfilled;
  const showOffersList = request.requestedBy === currentUserId && !isFulfilled && !hasOfferOrFulfilled;
  
  // Für die Anzeige: Wenn es ein aktives Angebot gibt, zeige die Angebotszeit statt der Anfragezeit
  const activeOfferForDisplay = React.useMemo(() => {
    // Wenn ich ein aktives Angebot habe, zeige das
    if (myActiveOffer) return myActiveOffer;
    
    // Sonst prüfe, ob es ein anderes aktives Angebot gibt
    if (!hasOffer || !request.offeredSpotId || !request.offeredBy) return null;
    const found = offers.find(
      (o) =>
        o.status === 'active' &&
        o.offererId === request.offeredBy &&
        o.spotId === request.offeredSpotId
    );
    return found || null;
  }, [myActiveOffer, hasOffer, request.offeredSpotId, request.offeredBy, offers]);
  
  // Zeige die Angebotszeit, wenn es ein aktives Angebot gibt (auch bei Teilangeboten)
  const displayFrom = activeOfferForDisplay ? activeOfferForDisplay.from : request.from;
  const displayUntil = activeOfferForDisplay ? activeOfferForDisplay.until : request.until;
  const acceptedOffererNames = React.useMemo(() => {
    const names = offers
      .filter((o) => o.status === 'accepted')
      .map((o) => {
        const fromOffer = (o as any).offererUsername as string | undefined;
        const fromPublic = publicUsers?.[o.offererId]?.username;
        return (fromOffer ?? fromPublic ?? '').trim();
      })
      .filter((n) => n.length > 0);
    return Array.from(new Set(names));
  }, [offers, publicUsers]);

  const fullOffer = React.useMemo(() => {
    // Prüfe zuerst, ob offeredSpotId und offeredBy noch vorhanden sind
    if (!request.offeredSpotId || !request.offeredBy) return null;
    if (!hasOffer) return null;
    
    const byId = request.fullOfferId ? offers.find((o) => o.id === request.fullOfferId) : undefined;
    if (byId && byId.status === 'active') return byId;
    
    const found = offers.find(
      (o) =>
        o.status === 'active' &&
        o.from.getTime() <= request.from.getTime() &&
        o.until.getTime() >= request.until.getTime(),
    );
    
    // Zusätzliche Prüfung: Das gefundene Angebot muss auch wirklich noch aktiv sein
    // und der offererId muss mit offeredBy übereinstimmen
    if (found && found.status === 'active' && found.offererId === request.offeredBy) {
      return found;
    }
    
    return null;
  }, [hasOffer, offers, request.fullOfferId, request.offeredSpotId, request.offeredBy, request.from, request.until]);

  const shouldShowCoverage = React.useMemo(() => {
    if (isFulfilled) return false;
    // show coverage whenever there is at least one offer (accepted or active)
    // Show for both requester and offerer views
    return offers.length > 0;
  }, [isFulfilled, offers.length]);

  const coverage = React.useMemo(() => {
    if (!shouldShowCoverage) return null;
    // Use accepted offers first, fallback to active offers if no accepted ones
    const accepted = offers.filter((o) => o.status === 'accepted');
    const active = offers.filter((o) => o.status === 'active');
    const offersToUse = accepted.length > 0 ? accepted : active;
    
    // Wenn keine Offers vorhanden sind, keine Abdeckung
    if (offersToUse.length === 0) return null;
    
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

    // merge
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
  const showOtherUserAsTitle = hasOfferOrFulfilled;
  // When an offer exists (or the request is fulfilled), show the OTHER involved user:
  // - requester sees offerer
  // - offerer sees requester
  const displayTitle = showOtherUserAsTitle
    ? (isMyRequest
        ? (isFulfilled
            ? (acceptedOffererNames.length > 0 ? acceptedOffererNames.join(', ') : 'Anbieter')
            : (request.offeredByUsername ?? 'Anbieter'))
        : isMyOffer
          ? (request.requestedByUsername ?? 'Unbekannt')
          : (request.offeredByUsername ?? request.requestedByUsername ?? 'Unbekannt'))
    : (request.requestedByUsername ?? 'Unbekannt');
  const displaySubtitle = showOtherUserAsTitle
    ? (isMyRequest
        ? (isFulfilled && acceptedOffererNames.length > 1
            ? 'stellen dir folgende Parkplätze'
            : 'stellt dir folgenden Parkplatz')
        : isMyOffer
          ? 'bekommt folgenden Parkplatz'
          : 'stellt folgenden Parkplatz zur Verfügung')
    : isFulfilled
      ? 'hatte einen Parkplatz gesucht'
      : 'sucht einen Parkplatz';

  const subtitleWithArchived = isArchived ? 'wurde aufgehoben' : displaySubtitle;

  const commentPreview = React.useMemo(() => {
    // Always show the FIRST (initial) comment on the card (not the latest chat message).
    const t = String(request.initialCommentText ?? request.lastCommentText ?? '').trim();
    if (!t) return null;
    const short = t.length > 90 ? `${t.slice(0, 90)}…` : t;
    return short;
  }, [request.initialCommentText, request.lastCommentText]);

  const canContactOfferer = isMyRequest && hasOffer && !isFulfilled;
  const canContactOnFulfilled = isFulfilled && (isMyRequest || isMyOffer);
  // Für Requester: Zeige "Aufheben"-Button bei erfüllten Anfragen
  const canRequesterUnfulfill = 
    isFulfilled &&
    !isArchived &&
    isMyRequest;
  
  // Für Anbieter: Zeige "Storno"-Button bei erfüllten Anfragen (wenn ich ein akzeptiertes Angebot habe)
  const canOffererCancelFulfilled = 
    isFulfilled &&
    !isArchived &&
    !isMyRequest &&
    (!!myAcceptedOffer || request.offeredBy === currentUserId);
  const canContactRequesterOnOpen = !isMyRequest && !hasOfferOrFulfilled;

  const contactPhone = hasOfferOrFulfilled
    ? (isMyRequest
        ? request.offeredByPhone
        : isMyOffer
          ? request.requestedByPhone
          : undefined)
    : (!isMyRequest ? request.requestedByPhone : undefined);

  const contactTitle = hasOfferOrFulfilled
    ? (isMyRequest ? 'Anbieter kontaktieren' : 'Anfragenden kontaktieren')
    : 'Anfragenden kontaktieren';

  const showHeaderContact =
    (canContactOfferer || canContactOnFulfilled || canContactRequesterOnOpen) && !!contactPhone;


  const isStandby = myActiveOffer?.status === 'standby' && hasOffer;
  
  return (
    <View
      style={[
        cardStyles.card,
        {backgroundColor: colors.surface},
        colors.isDark && {shadowOpacity: 0, elevation: 0, borderWidth: 1, borderColor: colors.border},
        isArchived && {opacity: 0.55},
        isStandby && {opacity: 0.6},
        highlight && cardStyles.cardHighlight,
      ]}>
      <View style={cardStyles.cardHeader}>
        <View style={cardStyles.cardTitleContainer}>
          <View style={cardStyles.titleRow}>
            {showHeaderContact && (
              <TouchableOpacity
                accessibilityLabel={contactTitle}
                style={[
                  cardStyles.headerContactBtn,
                  {backgroundColor: colors.surface2, borderColor: colors.border},
                ]}
                onPress={() => showContactOptions(contactPhone)}>
                <MaterialCommunityIcons name="message-text-outline" size={18} color={colors.text} />
              </TouchableOpacity>
            )}
            <Text
              style={[
                cardStyles.cardTitle,
                isMyRequest && {color: '#007AFF'},
                {color: colors.text},
              ]}>
              {displayTitle}
            </Text>
          </View>
          <Text style={[cardStyles.cardSubtitle, {color: colors.subtext}]}>
            {subtitleWithArchived}
          </Text>
        </View>
        <View style={chipStyles.badgesRow}>
          <DayBadge date={request.from} />
          {isArchived ? (
            <StatusChip type="archived" label="Aufgehoben" />
          ) : isFulfilled ? (
            <StatusChip type="fulfilled" label="Erfüllt" />
          ) : isMyRequest ? (
            <StatusChip type="myRequest" label="Meine Anfrage" />
          ) : hasOffer ? (
            <StatusChip type="offer" label="Angeboten" />
          ) : (
            <StatusChip type="open" label="Offen" />
          )}
        </View>
      </View>

      {/* Info-Zeile mit Parkplatz: nur anzeigen, wenn Angebot noch aktiv ist (nicht storniert) */}
      {(() => {
        // Bei nicht-erfüllten Requests
        if (!isFulfilled) {
          // Wenn ich ein aktives Angebot habe (Anbieter-Sicht)
          if (myActiveOffer) {
            const isFullOffer = myActiveOffer.from.getTime() <= request.from.getTime() && 
                               myActiveOffer.until.getTime() >= request.until.getTime();
            return (
              <View style={{marginBottom: 8}}>
                <Text style={[styles.timeRangeText, {color: colors.text}]} numberOfLines={1}>
                  {formatDateRange(request.from, request.until)}
                </Text>
                {onOpenComments && (
                  <TouchableOpacity
                    onPress={() => onOpenComments(request.id)}
                    style={chipStyles.commentChipRow}
                    activeOpacity={0.7}>
                    <View style={[chipStyles.commentChip, {backgroundColor: colors.surface2, borderColor: colors.border}]}>
                      <Text style={[chipStyles.commentChipText, {color: colors.subtext}]} numberOfLines={1}>
                        {commentPreview || 'Noch keine Nachrichten zu dieser Anfrage...'}
                      </Text>
                    </View>
                    <View style={[chipStyles.commentIconBtn, {backgroundColor: colors.brand, borderColor: colors.border}]}>
                      <MaterialCommunityIcons name="message-text-outline" size={16} color="#fff" />
                    </View>
                  </TouchableOpacity>
                )}
                  {shouldShowCoverage && coverage && !isArchived && (
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
                <View style={styles.offersBox}>
                  <Text style={[styles.offersTitle, {color: colors.subtext}]}>Mein Angebot</Text>
                  <View style={[styles.offerBox, {backgroundColor: colors.surface2, borderColor: colors.border}]}>
                    <View style={styles.offerLabelRow}>
                      <Text style={[styles.offerLabel, {color: colors.subtext}]}>
                        {isFullOffer ? 'Vollständig' : 'Teilweise'}
                      </Text>
                      {myActiveOffer.status === 'standby' && (
                        <View style={[chipStyles.standbyBadge, {backgroundColor: '#FF9500', borderColor: '#FF9500'}]}>
                          <Text style={chipStyles.standbyBadgeText}>Standby</Text>
                        </View>
                      )}
                    </View>
                    <Text style={[styles.offerDetails, {color: colors.text}]}>
                      P {myActiveOffer.spotId} · {formatDateRange(myActiveOffer.from, myActiveOffer.until)}
                    </Text>
                    {myActiveOffer.status === 'standby' && (
                      <Text style={[styles.standbyText, {color: colors.subtext}]}>
                        Ein vollständiges Angebot eines anderen Users liegt vor.{'\n'}Warten auf Entscheidung
                      </Text>
                    )}
                  </View>
                </View>
              </View>
            );
          }
          
          // Wenn es ein Angebot gibt (Anfragender-Sicht)
          if (hasOffer && request.offeredSpotId) {
            // Versuche das aktive Angebot zu finden
            const offerToDisplay = activeOfferForDisplay || offers.find(
              (o) => o.status === 'active' && 
                     o.offererId === request.offeredBy && 
                     o.spotId === request.offeredSpotId
            );
            
            if (offerToDisplay) {
              const isFullOffer = offerToDisplay.from.getTime() <= request.from.getTime() && 
                                 offerToDisplay.until.getTime() >= request.until.getTime();
              const offererName = request.offeredByUsername || 
                                 publicUsers?.[request.offeredBy || '']?.username || 
                                 (offerToDisplay as any).offererUsername || 
                                 'Unbekannt';
              return (
                <View>
                  <Text style={[styles.timeRangeText, {color: colors.text}]} numberOfLines={1}>
                    {formatDateRange(request.from, request.until)}
                  </Text>
                {onOpenComments && (
                  <TouchableOpacity
                    onPress={() => onOpenComments(request.id)}
                    style={chipStyles.commentChipRow}
                    activeOpacity={0.7}>
                    <View style={[chipStyles.commentChip, {backgroundColor: colors.surface2, borderColor: colors.border}]}>
                      <Text style={[chipStyles.commentChipText, {color: colors.subtext}]} numberOfLines={1}>
                        {commentPreview || 'Noch keine Nachrichten zu dieser Anfrage...'}
                      </Text>
                    </View>
                    <View style={[chipStyles.commentIconBtn, {backgroundColor: colors.brand, borderColor: colors.border}]}>
                      <MaterialCommunityIcons name="message-text-outline" size={16} color="#fff" />
                    </View>
                  </TouchableOpacity>
                )}
                  {shouldShowCoverage && coverage && !isArchived && (
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
                  <View style={[styles.offerBox, {backgroundColor: colors.surface2, borderColor: colors.border, marginTop: 8, marginBottom: 8}]}>
                    <Text style={[styles.offerLabel, {color: colors.subtext}]}>
                      {isFullOffer ? 'Vollständig' : 'Teilweise'}
                    </Text>
                    <Text style={[styles.offerDetails, {color: colors.text}]}>
                      P {offerToDisplay.spotId} ({offererName}) · {formatDateRange(offerToDisplay.from, offerToDisplay.until)}
                    </Text>
                  </View>
                </View>
              );
            }
            
            // Fallback: Wenn kein aktives Angebot gefunden wurde, zeige trotzdem die Box
            const offererName = request.offeredByUsername || 
                               publicUsers?.[request.offeredBy || '']?.username || 
                               'Unbekannt';
            return (
              <View>
                <Text style={[styles.timeRangeText, {color: colors.text}]} numberOfLines={1}>
                  {formatDateRange(request.from, request.until)}
                </Text>
                {onOpenComments && (
                  <TouchableOpacity
                    onPress={() => onOpenComments(request.id)}
                    style={chipStyles.commentChipRow}
                    activeOpacity={0.7}>
                    <View style={[chipStyles.commentChip, {backgroundColor: colors.surface2, borderColor: colors.border}]}>
                      <Text style={[chipStyles.commentChipText, {color: colors.subtext}]} numberOfLines={1}>
                        {commentPreview || 'Noch keine Nachrichten zu dieser Anfrage...'}
                      </Text>
                    </View>
                    <View style={[chipStyles.commentIconBtn, {backgroundColor: colors.brand, borderColor: colors.border}]}>
                      <MaterialCommunityIcons name="message-text-outline" size={16} color="#fff" />
                    </View>
                  </TouchableOpacity>
                )}
                  {shouldShowCoverage && coverage && !isArchived && (
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
                <View style={[styles.offerBox, {backgroundColor: colors.surface2, borderColor: colors.border, marginTop: 8, marginBottom: 8}]}>
                  <Text style={[styles.offerLabel, {color: colors.subtext}]}>Angebot</Text>
                  <Text style={[styles.offerDetails, {color: colors.text}]}>
                    P {request.offeredSpotId} ({offererName}) · {formatDateRange(displayFrom, displayUntil)}
                  </Text>
                </View>
              </View>
            );
          }
          // Bei offenen Anfragen (kein Angebot) zeige Zeit und Abdeckung, falls vorhanden
          return (
            <View>
              <Text style={[styles.timeRangeText, {color: colors.text}]} numberOfLines={1}>
                {formatDateRange(displayFrom, displayUntil)}
              </Text>
                {onOpenComments && (
                  <TouchableOpacity
                    onPress={() => onOpenComments(request.id)}
                    style={chipStyles.commentChipRow}
                    activeOpacity={0.7}>
                    <View style={[chipStyles.commentChip, {backgroundColor: colors.surface2, borderColor: colors.border}]}>
                      <Text style={[chipStyles.commentChipText, {color: colors.subtext}]} numberOfLines={1}>
                        {commentPreview || 'Noch keine Nachrichten zu dieser Anfrage...'}
                      </Text>
                    </View>
                    <View style={[chipStyles.commentIconBtn, {backgroundColor: colors.brand, borderColor: colors.border}]}>
                      <MaterialCommunityIcons name="message-text-outline" size={16} color="#fff" />
                    </View>
                  </TouchableOpacity>
                )}
                  {shouldShowCoverage && coverage && !isArchived && (
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
            </View>
          );
        }
        
        // Bei erfüllten Requests: nur anzeigen, wenn es noch angenommene Angebote gibt (nicht zurückgezogene)
        if (isFulfilled) {
          const hasAcceptedOffers = offers.some((o) => o.status === 'accepted');
          // Wenn offeredSpotId noch vorhanden ist, aber keine angenommenen Angebote mehr ODER offeredBy fehlt, dann wurde storniert
          if (request.offeredSpotId && (!hasAcceptedOffers || !request.offeredBy)) {
            // Angebot wurde storniert, keine Info-Zeile anzeigen - zeige normale Zeit-Zeile
            return (
              <Text style={[styles.timeRangeText, {color: colors.text}]} numberOfLines={1}>
                {formatDateRange(displayFrom, displayUntil)}
              </Text>
            );
          }
          // Wenn es angenommene Angebote gibt und offeredBy noch vorhanden ist, zeige die Info
          if (hasAcceptedOffers && request.offeredSpotId && request.offeredBy) {
            return (
              <View style={styles.timeRow}>
                <Text style={[styles.dateText, {color: colors.text}]} numberOfLines={1}>
                  {formatDateRange(displayFrom, displayUntil)}
                </Text>
                <Text style={styles.spotText} numberOfLines={1}>
                  P {request.offeredSpotId}
                </Text>
              </View>
            );
          }
        }
        
        // Normale Zeit-Zeile anzeigen, wenn keine Parkplatz-Info-Zeile angezeigt wird
        return (
          <Text style={[styles.timeRangeText, {color: colors.text}]} numberOfLines={1}>
            {formatDateRange(displayFrom, displayUntil)}
          </Text>
        );
      })()}


      {isFulfilled && (
        <View style={styles.fulfilledBox}>
          <Text style={[styles.fulfilledTitle, {color: colors.subtext}]}>Erfüllt durch</Text>
          {(() => {
            // Filtere nur angenommene Angebote heraus (nicht zurückgezogene)
            const acceptedOffers = offers.filter((o) => o.status === 'accepted');
            if (acceptedOffers.length === 0) {
              return (
                <Text style={[styles.fulfilledEmpty, {color: colors.subtext}]}>
                  Details werden geladen…
                </Text>
              );
            }
            return acceptedOffers
              .sort((a, b) => a.from.getTime() - b.from.getTime())
              .map((o, idx, arr) => (
                <View
                  key={o.id}
                  style={[
                    styles.fulfilledRow,
                    {borderColor: colors.border},
                    idx === arr.length - 1 && {borderBottomWidth: 0},
                  ]}>
                  <Text style={[styles.fulfilledTime, {color: colors.text}]} numberOfLines={1}>
                    {formatDateRange(o.from, o.until)}
                  </Text>
                  <Text style={styles.fulfilledSpot} numberOfLines={1}>
                    P {o.spotId}
                  </Text>
                  <Text style={[styles.fulfilledUser, {color: colors.text}]} numberOfLines={1}>
                    {publicUsers?.[o.offererId]?.username ?? (o as any).offererUsername ?? 'Unbekannt'}
                  </Text>
                </View>
              ));
          })()}
        </View>
      )}


      {showOffersList && (
        <View style={styles.offersBox}>
          <Text style={[styles.offersTitle, {color: colors.subtext}]}>Angebote</Text>
          {(() => {
            // Filtere zurückgezogene Angebote heraus - nur aktive und angenommene anzeigen
            const activeOffers = offers.filter((o) => o.status !== 'withdrawn' && o.status !== 'standby');
            if (activeOffers.length === 0) {
              return <Text style={[styles.offerEmpty, {color: colors.subtext}]}>Noch keine Angebote</Text>;
            }
            return activeOffers.map((o) => {
              const full =
                o.from.getTime() <= request.from.getTime() && o.until.getTime() >= request.until.getTime();
              const isAccepted = o.status === 'accepted';
              const isFocused = !!focusOfferId && o.id === focusOfferId;
              const offererName = publicUsers?.[o.offererId]?.username ?? 
                                 (o as any).offererUsername ?? 
                                 'Unbekannt';
              return (
                <View
                  key={o.id}
                  style={[
                    styles.offerRowContainer,
                    {borderColor: colors.border},
                    isFocused && {borderWidth: 2, borderColor: '#F59E0B', borderRadius: 10},
                  ]}>
                  <View style={[styles.offerBox, {backgroundColor: colors.surface2, borderColor: colors.border}]}>
                    <Text style={[styles.offerLabel, {color: colors.subtext}]}>
                      {isAccepted ? 'Angenommen' : full ? 'Vollständig' : 'Teilweise'}
                    </Text>
                    <Text style={[styles.offerDetails, {color: colors.text}]}>
                      P {o.spotId} ({offererName}) · {formatDateRange(o.from, o.until)}
                    </Text>
                  </View>
                  {!isAccepted && (
                    <ActionButton
                      onPress={() => onAcceptOffer?.(o)}
                      label="Annehmen"
                      icon="check-circle-outline"
                      variant="blue"
                      compact={true}
                      disabled={!onAcceptOffer}
                    />
                  )}
                </View>
              );
            });
          })()}
        </View>
      )}

      {/* metaLine removed: header already shows the offerer on offers/fulfilled */}

      <View style={styles.actionsRow}>
        {/* No actions on archived cards */}
        {isArchived ? null : (
          <>
        {!isMyRequest && !hasOffer && !isFulfilled && mySpots.length > 0 && (
          <ActionButton
            onPress={() => onOffer(request)}
            label={mySpots.length === 1 ? `Anbieten (${mySpots[0]})` : 'Anbieten'}
            icon="hand-extended-outline"
            variant="primary"
            loading={isOffering}
          />
        )}

        {/* Annehmen-Button: nur anzeigen, wenn Angebot noch existiert (offeredSpotId, offeredBy, fullOffer) */}
        {/* Zusätzlich prüfen, ob fullOffer wirklich noch aktiv ist und mit offeredBy übereinstimmt */}
        {isMyRequest && 
         hasOffer && 
         !isFulfilled && 
         request.offeredSpotId && 
         request.offeredBy && 
         fullOffer && 
         fullOffer.status === 'active' && 
         fullOffer.offererId === request.offeredBy && (
          <View style={styles.actionBtnRow}>
            <ActionButton
              onPress={() => {
                if (!onAcceptOffer) return;
                if (!fullOffer) {
                  showAlert('Bitte warten', 'Angebotsdetails werden noch geladen.');
                  return;
                }
                // Zusätzliche Prüfung vor dem Aufruf
                if (!request.offeredSpotId || !request.offeredBy) {
                  showAlert('Fehler', 'Das Angebot wurde bereits storniert');
                  return;
                }
                onAcceptOffer(fullOffer);
              }}
              label="Annehmen"
              icon="check-circle-outline"
              variant="blue"
              compact={true}
            />
            {onWithdraw && (
              <ActionButton
                onPress={() => onWithdraw(request)}
                label="Anfrage zurückziehen"
                icon="trash-can-outline"
                variant="red"
                compact={true}
              />
            )}
          </View>
        )}

        {/* Contact button moved to header (icon-only) */}

        {/* Storno-Button für Anbieter: anzeigen, wenn ich ein aktives Angebot habe (auch bei Teilangeboten) */}
        {isMyOffer && myActiveOffer && !isArchived && !isFulfilled && (
          <ActionButton
            onPress={() => onCancelOffer(request)}
            label="Storno"
            icon="close-circle-outline"
            variant="red"
          />
        )}

        {/* Storno-Button für Anbieter bei erfüllten Anfragen */}
        {canOffererCancelFulfilled && onCancelOffer && (
          <ActionButton
            onPress={() => onCancelOffer(request)}
            label="Storno"
            icon="close-circle-outline"
            variant="red"
          />
        )}

        {isMyRequest && !isFulfilled && !hasOffer && (
          <ActionButton
            onPress={() => onWithdraw(request)}
            label="Anfrage zurückziehen"
            icon="trash-can-outline"
            variant="red"
          />
        )}

        {/* Aufheben-Button für Requester bei erfüllten Anfragen */}
        {canRequesterUnfulfill && onArchiveFulfilled && (
          <ActionButton
            onPress={() => onArchiveFulfilled(request)}
            label="Aufheben"
            icon="backup-restore"
            variant="red"
          />
        )}
          </>
        )}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  // Card, chip, and badge styles moved to src/styles/cards.ts and src/styles/chips.ts
  timeRangeText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#111',
    marginBottom: 4,
  },
  timeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    marginBottom: 4,
  },
  dateText: {
    flex: 1,
    fontSize: 12,
    fontWeight: '600',
    color: '#111',
  },
  spotText: {
    fontSize: 13,
    fontWeight: '900',
    color: '#16A34A',
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
  coverageText: {
    fontSize: 11,
    fontWeight: '700',
    marginTop: 8,
    marginBottom: 0,
  },
  offerRowContainer: {
    marginBottom: 8,
    gap: 8,
  },
  offerBox: {
    marginTop: 8,
    marginBottom: 8,
    padding: 10,
    borderRadius: 8,
    borderWidth: 1,
  },
  offerLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 4,
  },
  offerLabel: {
    fontSize: 11,
    fontWeight: '800',
  },
  // Standby badge styles moved to src/styles/chips.ts
  standbyText: {
    fontSize: 10,
    fontWeight: '600',
    marginTop: 4,
    fontStyle: 'italic',
  },
  offerDetails: {
    fontSize: 12,
    fontWeight: '700',
    flexWrap: 'wrap',
  },
  offerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    paddingVertical: 6,
    borderBottomWidth: 1,
  },
  offerText: {
    flex: 1,
    fontSize: 12,
    fontWeight: '800',
  },
  offerAcceptBtn: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
  },
  offerAcceptBtnCompact: {
    alignSelf: 'flex-start',
  },
  offerAcceptText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '900',
  },
  offerEmpty: {
    fontSize: 12,
    fontWeight: '700',
    paddingVertical: 6,
  },
  fulfilledBox: {
    marginTop: 8,
    paddingTop: 6,
  },
  fulfilledTitle: {
    fontSize: 12,
    fontWeight: '900',
    marginBottom: 6,
  },
  fulfilledEmpty: {
    fontSize: 12,
    fontWeight: '700',
    paddingVertical: 4,
  },
  fulfilledRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 6,
    borderBottomWidth: 1,
  },
  fulfilledTime: {
    flex: 1,
    fontSize: 12,
    fontWeight: '800',
  },
  fulfilledSpot: {
    fontSize: 12,
    fontWeight: '900',
    color: '#16A34A',
  },
  fulfilledUser: {
    maxWidth: 110,
    fontSize: 12,
    fontWeight: '800',
  },
  metaLine: {
    fontSize: 12,
    color: '#555',
    marginBottom: 4,
  },
  actionsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 2,
    alignItems: 'flex-start',
  },
  actionBtnRow: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
    flexShrink: 0,
  },
  // Action button styles moved to src/styles/buttons.ts
});

export default RequestCard;

