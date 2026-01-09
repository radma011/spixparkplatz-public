import React from 'react';
import {Alert, View, Text, StyleSheet, TouchableOpacity, useColorScheme} from 'react-native';
import {ParkingRequest} from '../models/ParkingRequest';
import {formatDateRange, getTodayTomorrowBadge} from '../utils/dateUtils';
import MaterialCommunityIcons from 'react-native-vector-icons/MaterialCommunityIcons';
import {normalizePhone, tryOpenUrl} from '../utils/contactLinks';
import {getColors} from '../theme/colors';
import {RequestOffer} from '../models/RequestOffer';

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
}) => {
  const colors = getColors(useColorScheme());
  const isMyRequest = request.requestedBy === currentUserId;
  
  // Finde mein aktives Angebot (auch bei Teilangeboten)
  const myActiveOffer = React.useMemo(() => {
    return offers.find(
      (o) => o.status === 'active' && o.offererId === currentUserId
    );
  }, [offers, currentUserId]);
  
  const isMyOffer = !!myActiveOffer || request.offeredBy === currentUserId;
  const hasOffer = !!request.offeredSpotId && !request.isFulfilled;
  const isFulfilled = request.isFulfilled;
  const isArchived = !!request.isArchived;
  const dayBadge = getTodayTomorrowBadge(request.from);

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
  const isInvolvedInFulfilled =
    isFulfilled &&
    !isArchived && // Nicht anzeigen, wenn bereits archiviert
    !hasOffer && // Nicht anzeigen, wenn noch ein Angebot vorhanden ist (dann sollte cancelOffer verwendet werden)
    !request.offeredSpotId && // Nicht anzeigen, wenn noch offeredSpotId vorhanden ist (dann sollte cancelOffer verwendet werden)
    // Nur für Requester anzeigen, nicht für Anbieter (Anbieter sollte cancelOffer verwenden)
    (isMyRequest ||
      (Array.isArray(request.fulfilledByUserIds) && request.fulfilledByUserIds.includes(currentUserId) && !isMyOffer));
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

  const handleContact = () => {
    if (!contactPhone) {
      Alert.alert(
        'Kontakt',
        'Keine Telefonnummer im Profil hinterlegt (oder Profil ist noch nicht synchronisiert).',
      );
      return;
    }
    const normalized = normalizePhone(contactPhone || '');
    if (!normalized) {
      Alert.alert('Fehler', 'Keine gültige Telefonnummer vorhanden');
      return;
    }

    const {e164, digits} = normalized;

    Alert.alert(
      'Kontakt',
      'Wie möchtest du die Person kontaktieren?',
      [
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
            // wa.me requires digits only
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
      ],
    );
  };

  return (
    <View
      style={[
        styles.card,
        {backgroundColor: colors.surface},
        colors.isDark && {shadowOpacity: 0, elevation: 0, borderWidth: 1, borderColor: colors.border},
        isArchived && {opacity: 0.55},
        highlight && styles.cardHighlight,
      ]}>
      <View style={styles.cardHeader}>
        <View style={styles.cardTitleContainer}>
          <View style={styles.titleRow}>
            {showHeaderContact && (
              <TouchableOpacity
                accessibilityLabel={contactTitle}
                style={[
                  styles.headerContactBtn,
                  {backgroundColor: colors.surface2, borderColor: colors.border},
                ]}
                onPress={handleContact}>
                <MaterialCommunityIcons name="message-text-outline" size={18} color={colors.text} />
              </TouchableOpacity>
            )}
            <Text
              style={[
                styles.cardTitle,
                isMyRequest && styles.myRequestTitle,
                {color: colors.text},
              ]}>
              {displayTitle}
            </Text>
          </View>
          <Text style={[styles.cardSubtitle, {color: colors.subtext}]}>
            {subtitleWithArchived}
          </Text>
        </View>
        <View style={styles.badgesRow}>
          {dayBadge && (
            <View style={styles.dayBadge}>
              <Text style={styles.dayBadgeText}>{dayBadge}</Text>
            </View>
          )}
          {isArchived ? (
            <View style={[styles.chip, styles.archivedChip]}>
              <Text style={[styles.chipText, styles.chipTextWhite]}>Aufgehoben</Text>
            </View>
          ) : isFulfilled ? (
            <View style={[styles.chip, styles.fulfilledChip]}>
              <Text style={[styles.chipText, styles.chipTextWhite]}>Erfüllt</Text>
            </View>
          ) : isMyRequest ? (
            <View style={[styles.chip, styles.myRequestChip]}>
              <Text style={styles.chipText}>Meine Anfrage</Text>
            </View>
          ) : hasOffer ? (
            <View style={[styles.chip, styles.offerChip]}>
              <Text style={[styles.chipText, styles.chipTextWhite]}>
                Angeboten
              </Text>
            </View>
          ) : (
            <View style={[styles.chip, styles.openChip]}>
              <Text style={[styles.chipText, styles.chipTextWhite]}>Offen</Text>
            </View>
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
                    style={styles.commentChipRow}
                    activeOpacity={0.7}>
                    <View style={[styles.commentChip, {backgroundColor: colors.surface2, borderColor: colors.border}]}>
                      <Text style={[styles.commentChipText, {color: colors.subtext}]} numberOfLines={1}>
                        {commentPreview || 'Noch keine Nachrichten zu dieser Anfrage...'}
                      </Text>
                    </View>
                    <View style={[styles.commentIconBtn, {backgroundColor: colors.brand, borderColor: colors.brand}]}>
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
                    <Text style={[styles.offerLabel, {color: colors.subtext}]}>
                      {isFullOffer ? 'Vollständig' : 'Teilweise'}
                    </Text>
                    <Text style={[styles.offerDetails, {color: colors.text}]}>
                      P {myActiveOffer.spotId} · {formatDateRange(myActiveOffer.from, myActiveOffer.until)}
                    </Text>
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
                    style={styles.commentChipRow}
                    activeOpacity={0.7}>
                    <View style={[styles.commentChip, {backgroundColor: colors.surface2, borderColor: colors.border}]}>
                      <Text style={[styles.commentChipText, {color: colors.subtext}]} numberOfLines={1}>
                        {commentPreview || 'Noch keine Nachrichten zu dieser Anfrage...'}
                      </Text>
                    </View>
                    <View style={[styles.commentIconBtn, {backgroundColor: colors.brand, borderColor: colors.brand}]}>
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
                    style={styles.commentChipRow}
                    activeOpacity={0.7}>
                    <View style={[styles.commentChip, {backgroundColor: colors.surface2, borderColor: colors.border}]}>
                      <Text style={[styles.commentChipText, {color: colors.subtext}]} numberOfLines={1}>
                        {commentPreview || 'Noch keine Nachrichten zu dieser Anfrage...'}
                      </Text>
                    </View>
                    <View style={[styles.commentIconBtn, {backgroundColor: colors.brand, borderColor: colors.brand}]}>
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
                    style={styles.commentChipRow}
                    activeOpacity={0.7}>
                    <View style={[styles.commentChip, {backgroundColor: colors.surface2, borderColor: colors.border}]}>
                      <Text style={[styles.commentChipText, {color: colors.subtext}]} numberOfLines={1}>
                        {commentPreview || 'Noch keine Nachrichten zu dieser Anfrage...'}
                      </Text>
                    </View>
                    <View style={[styles.commentIconBtn, {backgroundColor: colors.brand, borderColor: colors.brand}]}>
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
            const activeOffers = offers.filter((o) => o.status !== 'withdrawn');
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
                    <TouchableOpacity
                      disabled={!onAcceptOffer}
                      onPress={() => onAcceptOffer?.(o)}
                      style={[
                        styles.actionBtn,
                        styles.actionBlue,
                        styles.actionBtnCompact,
                        !onAcceptOffer && {opacity: 0.5},
                      ]}>
                      <MaterialCommunityIcons name="check-circle-outline" size={16} color="#fff" />
                      <Text style={styles.actionTextWhite}>Annehmen</Text>
                    </TouchableOpacity>
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
          <TouchableOpacity 
            style={[styles.actionBtn, styles.actionPrimary]} 
            onPress={() => onOffer(request)}>
            <MaterialCommunityIcons name="hand-extended-outline" size={16} color="#fff" />
            <Text style={styles.actionTextWhite}>
              {mySpots.length === 1 ? `Anbieten (${mySpots[0]})` : 'Anbieten'}
            </Text>
          </TouchableOpacity>
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
            <TouchableOpacity
              style={[styles.actionBtn, styles.actionBlue, styles.actionBtnCompact]}
              onPress={() => {
                if (!onAcceptOffer) return;
                if (!fullOffer) {
                  Alert.alert('Bitte warten', 'Angebotsdetails werden noch geladen.');
                  return;
                }
                // Zusätzliche Prüfung vor dem Aufruf
                if (!request.offeredSpotId || !request.offeredBy) {
                  Alert.alert('Fehler', 'Das Angebot wurde bereits storniert');
                  return;
                }
                onAcceptOffer(fullOffer);
              }}>
              <MaterialCommunityIcons name="check-circle-outline" size={16} color="#fff" />
              <Text style={styles.actionTextWhite}>Annehmen</Text>
            </TouchableOpacity>
            {onWithdraw && (
              <TouchableOpacity 
                style={[styles.actionBtn, styles.actionRed, styles.actionBtnCompact]} 
                onPress={() => onWithdraw(request)}>
                <MaterialCommunityIcons name="trash-can-outline" size={16} color="#fff" />
                <Text style={styles.actionTextWhite}>Anfrage zurückziehen</Text>
              </TouchableOpacity>
            )}
          </View>
        )}

        {/* Contact button moved to header (icon-only) */}

        {/* Storno-Button für Anbieter: anzeigen, wenn ich ein aktives Angebot habe (auch bei Teilangeboten) */}
        {isMyOffer && myActiveOffer && !isArchived && (
          <TouchableOpacity style={[styles.actionBtn, styles.actionRed]} onPress={() => onCancelOffer(request)}>
            <MaterialCommunityIcons name="close-circle-outline" size={16} color="#fff" />
            <Text style={styles.actionTextWhite}>Storno</Text>
          </TouchableOpacity>
        )}

        {isMyRequest && !isFulfilled && !hasOffer && (
          <TouchableOpacity style={[styles.actionBtn, styles.actionRed]} onPress={() => onWithdraw(request)}>
            <MaterialCommunityIcons name="trash-can-outline" size={16} color="#fff" />
            <Text style={styles.actionTextWhite}>Anfrage zurückziehen</Text>
          </TouchableOpacity>
        )}

        {isInvolvedInFulfilled && onArchiveFulfilled && (
          <TouchableOpacity
            style={[styles.actionBtn, styles.actionRed]}
            onPress={() => onArchiveFulfilled(request)}>
            <MaterialCommunityIcons name="backup-restore" size={16} color="#fff" />
            <Text style={styles.actionTextWhite}>Aufheben</Text>
          </TouchableOpacity>
        )}
          </>
        )}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#fff',
    borderRadius: 8,
    padding: 10,
    marginBottom: 8,
    shadowColor: '#000',
    shadowOffset: {width: 0, height: 2},
    shadowOpacity: 0.1,
    shadowRadius: 3,
    elevation: 2,
  },
  cardHighlight: {
    borderWidth: 2,
    borderColor: '#16A34A',
  },
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
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 4,
  },
  cardTitleContainer: {
    flex: 1,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  headerContactBtn: {
    width: 28,
    height: 28,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F3F4F6',
    borderColor: '#E5E7EB',
    borderWidth: 1,
  },
  cardTitle: {
    fontSize: 15,
    fontWeight: 'bold',
    color: '#000',
  },
  myRequestTitle: {
    color: '#007AFF',
  },
  cardSubtitle: {
    fontSize: 12,
    color: '#666',
    marginTop: 1,
  },
  commentChipRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 6,
    marginBottom: 8,
    gap: 6,
  },
  commentChip: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    flex: 1,
    maxWidth: '100%',
    minHeight: 32,
    justifyContent: 'center',
  },
  commentChipText: {
    fontSize: 12,
    fontWeight: '600',
    lineHeight: 16,
  },
  commentIconBtn: {
    width: 32,
    height: 32,
    borderRadius: 8,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chip: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 16,
  },
  myRequestChip: {
    backgroundColor: '#E3F2FD',
  },
  offerChip: {
    backgroundColor: '#4CAF50',
  },
  openChip: {
    backgroundColor: '#FF9800',
  },
  fulfilledChip: {
    backgroundColor: '#2196F3',
  },
  archivedChip: {
    backgroundColor: 'red',
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
  actionPrimary: {
    backgroundColor: '#16A34A',
  },
  actionBlue: {
    backgroundColor: '#2563EB',
  },
  actionDark: {
    backgroundColor: '#111827',
  },
  actionRed: {
    backgroundColor: '#DC2626',
  },
  actionGray: {
    backgroundColor: '#6B7280',
  },
});

export default RequestCard;

