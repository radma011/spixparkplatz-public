import React, {useEffect, useMemo, useRef, useState} from 'react';
import {ScrollView, View, Text, StyleSheet, TouchableOpacity, useColorScheme, Dimensions, useWindowDimensions} from 'react-native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import MaterialCommunityIcons from 'react-native-vector-icons/MaterialCommunityIcons';
import FirestoreService from '../services/FirestoreService';
import ParkingAvailabilityService from '../services/ParkingAvailabilityService';
import {ParkingRequest} from '../models/ParkingRequest';
import {ParkingAvailability, isRecurring} from '../models/ParkingAvailability';
import {formatDateLabel, formatTime} from '../utils/dateUtils';
import {getColors} from '../theme/colors';
import WatermarkBackground from '../components/WatermarkBackground';
import {calculateNextOccurrences} from '../utils/recurrenceUtils';

interface Props {
  onBack: () => void;
  currentUserId: string;
  facilityCode: string;
  onOpenRequest: (requestId: string, tab: 'active' | 'fulfilled') => void;
}

function startOfMonth(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

function addMonths(d: Date, months: number) {
  return new Date(d.getFullYear(), d.getMonth() + months, 1);
}

function startOfWeek(d: Date) {
  const weekday = mondayFirstWeekdayIndex(d); // 0..6
  const res = new Date(d);
  res.setHours(0, 0, 0, 0);
  res.setDate(res.getDate() - weekday);
  return res;
}

function addDays(d: Date, days: number) {
  const res = new Date(d);
  res.setDate(res.getDate() + days);
  return res;
}

function daysInMonth(d: Date) {
  return new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
}

// Monday-first (Mo..So)
function mondayFirstWeekdayIndex(d: Date) {
  const js = d.getDay(); // 0=Sun
  return (js + 6) % 7; // 0=Mon..6=Sun
}

const MONTHS_DE = [
  'Januar',
  'Februar',
  'März',
  'April',
  'Mai',
  'Juni',
  'Juli',
  'August',
  'September',
  'Oktober',
  'November',
  'Dezember',
];

const WEEKDAYS_DE = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'];

function dayKey(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function overlapsDay(from: Date, until: Date, day: Date) {
  const start = new Date(day);
  start.setHours(0, 0, 0, 0);
  const end = new Date(day);
  end.setHours(23, 59, 59, 999);
  return from.getTime() <= end.getTime() && until.getTime() >= start.getTime();
}

function timeRangeForDay(from: Date, until: Date, day: Date) {
  const startOf = new Date(day);
  startOf.setHours(0, 0, 0, 0);
  const endOf = new Date(day);
  endOf.setHours(23, 59, 59, 999);

  const s = new Date(Math.max(from.getTime(), startOf.getTime()));
  const e = new Date(Math.min(until.getTime(), endOf.getTime()));
  return `${formatTime(s)}–${formatTime(e)}`;
}

function entryLabel(e: CalendarEntry) {
  if (e.kind === 'availability') {
    return 'Verfügbar';
  }
  if (e.kind === 'offer') {
    return 'Angebot';
  }
  // For requests, check if fulfilled
  if (e.isFulfilled) {
    return 'Erfüllt';
  }
  return 'Anfrage';
}

function formatEntryLine(e: CalendarEntry, day: Date) {
  const parts: string[] = [];
  parts.push(entryLabel(e));
  // Always show a "user" slot so the format stays consistent.
  // Open requests may not have an involved other user yet.
  parts.push(e.otherUsername ?? '—');
  parts.push(timeRangeForDay(e.from, e.until, day));
  // Always show a "parking" slot too (open requests won't have one yet).
  parts.push(e.offeredSpotId ? `P ${e.offeredSpotId}` : 'P —');
  return parts.join(' · ');
}

type EntryKind = 'request' | 'offer' | 'availability';
type CalendarEntry = {
  id: string;
  kind: EntryKind;
  marker: 'open' | 'hasOffer' | 'offer' | 'request' | 'availability';
  from: Date;
  until: Date;
  offeredSpotId?: string;
  otherUsername?: string;
  isFulfilled: boolean;
  isRecurring?: boolean; // For availability entries
};

const CalendarScreen: React.FC<Props> = ({onBack, currentUserId, facilityCode, onOpenRequest}) => {
  const insets = useSafeAreaInsets();
  const colors = getColors(useColorScheme());
  const {width, height} = useWindowDimensions();
  const isLandscape = width > height;
  const isTablet = Math.min(width, height) >= 600; // Tablet threshold
  const [mode, setMode] = useState<'month' | 'week'>('month');
  const today = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }, []);
  const [selectedDate, setSelectedDate] = useState<Date>(today);
  const [cursor, setCursor] = useState<Date>(today);
  const [myRequests, setMyRequests] = useState<ParkingRequest[]>([]);
  const [myOffers, setMyOffers] = useState<ParkingRequest[]>([]);
  const [openRequests, setOpenRequests] = useState<ParkingRequest[]>([]);
  const [availabilities, setAvailabilities] = useState<ParkingAvailability[]>([]);
  const [publicUsers, setPublicUsers] = useState<Record<string, {username?: string; phone?: string}>>({});
  const publicUserUnsubsRef = useRef<Record<string, () => void>>({});
  
  // Filter states for legend
  const [showOpen, setShowOpen] = useState(true);
  const [showHasOffer, setShowHasOffer] = useState(true);
  const [showOffer, setShowOffer] = useState(true);
  const [availabilityFilter, setAvailabilityFilter] = useState<'all' | 'mine' | 'none'>('all');
  const [showRequest, setShowRequest] = useState(true);

  // Subscribe: my requests + my offers
  useEffect(() => {
    const unsubReq = FirestoreService.watchMyRequests(currentUserId, facilityCode).onSnapshot((snap: any) => {
      const items = snap.docs
        .map((doc: any) => FirestoreService.parkingRequestFromDocSnap(doc))
        .filter((r: ParkingRequest) => r.facilityCode === facilityCode); // Filter by facilityCode client-side
      setMyRequests(items);
    });

    const unsubOffers = FirestoreService.watchMyOffers(currentUserId, facilityCode).onSnapshot((snap: any) => {
      const items = snap.docs
        .map((doc: any) => FirestoreService.parkingRequestFromDocSnap(doc))
        .filter((r: ParkingRequest) => r.facilityCode === facilityCode); // Filter by facilityCode client-side
      setMyOffers(items);
    });

    return () => {
      try { unsubReq(); } catch {}
      try { unsubOffers(); } catch {}
    };
  }, [currentUserId, facilityCode]);

  // Subscribe: open requests (no offer yet) so they are visible in the calendar too.
  useEffect(() => {
    const unsub = FirestoreService.watchOpenRequests(facilityCode).onSnapshot((snap: any) => {
      const items = snap.docs
        .map((doc: any) => FirestoreService.parkingRequestFromDocSnap(doc))
        .filter((r: ParkingRequest | null): r is ParkingRequest => {
          // Filter by facilityCode client-side (index-free query)
          if (!r || r.facilityCode !== facilityCode) return false;
          return !r.isFulfilled && !r.offeredSpotId && !r.isArchived;
        });
      // We only want OTHER people's open requests here; own requests are already in myRequests.
      setOpenRequests(items.filter((r: ParkingRequest) => r.requestedBy !== currentUserId));
    });
    return () => {
      try { unsub(); } catch {}
    };
  }, [currentUserId, facilityCode]);

  // Subscribe: availabilities (all active availabilities in the facility)
  useEffect(() => {
    // Watch all availabilities in the facility
    const unsub = ParkingAvailabilityService.watchFacilityAvailabilities(facilityCode).onSnapshot(
      (snapshot: any) => {
        const allAvailabilities = snapshot.docs.map((doc: any) =>
          ParkingAvailabilityService.availabilityFromDocSnap(doc),
        );
        setAvailabilities(allAvailabilities);
      },
      (error: any) => {
        console.error('Error watching availabilities:', error);
      },
    );
    return () => {
      try { unsub(); } catch {}
    };
  }, [facilityCode]);

  // Keep a live cache of usernames for involved users (so we can show the other person's name in calendar)
  useEffect(() => {
    const ids = new Set<string>();
    myRequests.forEach((r) => {
      ids.add(r.requestedBy);
      if (r.offeredBy) ids.add(r.offeredBy);
    });
    myOffers.forEach((r) => {
      ids.add(r.requestedBy);
      if (r.offeredBy) ids.add(r.offeredBy);
    });
    openRequests.forEach((r) => {
      ids.add(r.requestedBy);
    });

    ids.forEach((uid) => {
      if (uid === currentUserId) return;
      if (publicUserUnsubsRef.current[uid]) return;
      publicUserUnsubsRef.current[uid] = FirestoreService.watchPublicUser(uid, (data) => {
        if (!data) return;
        setPublicUsers((prev) => ({...prev, [uid]: data}));
      });
    });

    Object.keys(publicUserUnsubsRef.current).forEach((uid) => {
      if (ids.has(uid)) return;
      try {
        publicUserUnsubsRef.current[uid]?.();
      } finally {
        delete publicUserUnsubsRef.current[uid];
        setPublicUsers((prev) => {
          const next = {...prev};
          delete next[uid];
          return next;
        });
      }
    });
  }, [myRequests, myOffers, openRequests, currentUserId]);

  useEffect(() => {
    return () => {
      Object.values(publicUserUnsubsRef.current).forEach((fn) => {
        try { fn(); } catch {}
      });
      publicUserUnsubsRef.current = {};
    };
  }, []);

  const entries = useMemo<CalendarEntry[]>(() => {
    const out: CalendarEntry[] = [];
    const seen = new Set<string>(); // use id only; for calendar we don't want duplicates

    // Calculate date range for current view (month or week)
    const viewStart = mode === 'month' ? startOfMonth(cursor) : weekStart;
    const viewEnd = mode === 'month' 
      ? new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0, 23, 59, 59)
      : addDays(weekStart, 6);

    // Add requests (filtered by showOpen, showHasOffer, showOffer, showRequest)
    myRequests.forEach((r) => {
      if (seen.has(r.id)) return;
      seen.add(r.id);
      const otherUid = r.offeredBy ?? null;
      const marker: CalendarEntry['marker'] =
        r.isFulfilled
          ? 'hasOffer' // Erfüllte Anfragen in grün (wie in der Legende)
          : !r.offeredSpotId
            ? 'offer' // Eigene offene Anfragen in lila (wie "Meine" in der Legende)
            : 'hasOffer'; // Anfragen mit Angebot auch grün
      
      // Apply filters
      if (marker === 'open' && !showOpen) return;
      if (marker === 'hasOffer' && !showHasOffer) return;
      if (marker === 'offer' && !showOffer) return;
      if (marker === 'request' && !showRequest) return;
      
      out.push({
        id: r.id,
        kind: 'request',
        marker,
        from: r.from,
        until: r.until,
        offeredSpotId: r.offeredSpotId,
        isFulfilled: r.isFulfilled,
        // For open own requests: show "Du" so the "User" slot isn't empty.
        otherUsername: otherUid ? publicUsers[otherUid]?.username : 'Du',
      });
    });

    myOffers.forEach((r) => {
      if (seen.has(r.id)) return;
      seen.add(r.id);
      if (!showOffer) return; // Filter offers
      const otherUid = r.requestedBy;
      out.push({
        id: r.id,
        kind: 'offer',
        marker: 'offer',
        from: r.from,
        until: r.until,
        offeredSpotId: r.offeredSpotId,
        isFulfilled: r.isFulfilled,
        otherUsername: publicUsers[otherUid]?.username,
      });
    });

    // Open requests from other users (no offer yet) – show requester as "user".
    openRequests.forEach((r) => {
      if (seen.has(r.id)) return;
      seen.add(r.id);
      if (!showOpen) return; // Filter open requests
      out.push({
        id: r.id,
        kind: 'request',
        marker: 'open',
        from: r.from,
        until: r.until,
        offeredSpotId: undefined,
        isFulfilled: false,
        otherUsername: publicUsers[r.requestedBy]?.username,
      });
    });

    // Add availabilities (filtered by availabilityFilter)
    if (availabilityFilter !== 'none') {
      availabilities.forEach((av) => {
        if (!av.isActive) return;
        
        // Filter by availabilityFilter
        if (availabilityFilter === 'mine' && av.userId !== currentUserId) return;

        if (isRecurring(av) && av.recurrence) {
          // For recurring availabilities, calculate occurrences within the view range
          const occurrences = calculateNextOccurrences(
            av.from,
            av.from,
            av.until,
            av.recurrence,
            100, // Get enough occurrences to cover the view
          ).filter((occ) => {
            // Filter to only include occurrences within the view range
            return occ >= viewStart && occ <= viewEnd;
          });

          // Create an entry for each occurrence
          occurrences.forEach((occurrence, index) => {
            const occurrenceEnd = new Date(occurrence);
            occurrenceEnd.setHours(av.until.getHours(), av.until.getMinutes(), 0, 0);
            
            out.push({
              id: `${av.id}-${index}-${occurrence.getTime()}`,
              kind: 'availability',
              marker: 'availability',
              from: occurrence,
              until: occurrenceEnd,
              offeredSpotId: av.spotId,
              otherUsername: av.userId === currentUserId ? 'Du' : (av.username || publicUsers[av.userId]?.username),
              isFulfilled: false,
              isRecurring: true,
            });
          });
        } else {
          // One-time availability
          out.push({
            id: av.id,
            kind: 'availability',
            marker: 'availability',
            from: av.from,
            until: av.until,
            offeredSpotId: av.spotId,
            otherUsername: av.userId === currentUserId ? 'Du' : (av.username || publicUsers[av.userId]?.username),
            isFulfilled: false,
            isRecurring: false,
          });
        }
      });
    }

    return out;
  }, [myRequests, myOffers, openRequests, availabilities, publicUsers, currentUserId, cursor, mode, weekStart, showOpen, showHasOffer, showOffer, availabilityFilter, showRequest]);

  // Keep cursor aligned with selection (helps week mode always show selected day)
  useEffect(() => {
    setCursor(selectedDate);
  }, [selectedDate]);

  const grid = useMemo(() => {
    const first = startOfMonth(cursor);
    const offset = mondayFirstWeekdayIndex(first);
    const totalDays = daysInMonth(cursor);
    const cells: Array<{key: string; day?: number}> = [];
    for (let i = 0; i < offset; i++) {
      cells.push({key: `e-${i}`});
    }
    for (let day = 1; day <= totalDays; day++) {
      cells.push({key: `d-${day}`, day});
    }
    // pad to full weeks (7 columns)
    while (cells.length % 7 !== 0) {
      cells.push({key: `t-${cells.length}`});
    }
    return cells;
  }, [cursor]);

  const monthDayStats = useMemo(() => {
    const first = startOfMonth(cursor);
    const total = daysInMonth(cursor);
    const map: Record<string, {open: number; hasOffer: number; offer: number; other: number; availability: number}> = {};
    for (let d = 1; d <= total; d++) {
      const day = new Date(first.getFullYear(), first.getMonth(), d);
      const k = dayKey(day);
      map[k] = {open: 0, hasOffer: 0, offer: 0, other: 0, availability: 0};
      entries.forEach((e) => {
        if (overlapsDay(e.from, e.until, day)) {
          if (e.marker === 'open') map[k].open += 1;
          else if (e.marker === 'hasOffer') map[k].hasOffer += 1;
          else if (e.marker === 'offer') map[k].offer += 1;
          else if (e.marker === 'availability') map[k].availability += 1;
          else map[k].other += 1;
        }
      });
    }
    return map;
  }, [cursor, entries]);

  // Dynamic "week" view: yesterday -> today + 5 days (rolling 7-day window)
  const weekStart = useMemo(() => {
    const s = new Date(cursor);
    s.setHours(0, 0, 0, 0);
    return addDays(s, -1);
  }, [cursor]);
  const weekDays = useMemo(
    () => Array.from({length: 7}, (_, i) => addDays(weekStart, i)),
    [weekStart],
  );
  const weekEntriesByDay = useMemo(() => {
    const map: Record<string, CalendarEntry[]> = {};
    weekDays.forEach((d) => (map[dayKey(d)] = []));
    entries.forEach((e) => {
      weekDays.forEach((d) => {
        if (overlapsDay(e.from, e.until, d)) {
          map[dayKey(d)].push(e);
        }
      });
    });
    Object.keys(map).forEach((k) => {
      map[k].sort((a, b) => a.from.getTime() - b.from.getTime());
    });
    return map;
  }, [entries, weekDays]);

  const title = `${MONTHS_DE[cursor.getMonth()]} ${cursor.getFullYear()}`;
  const selectedKey = useMemo(() => dayKey(selectedDate), [selectedDate]);
  const todayKey = useMemo(() => dayKey(today), [today]);

  const selectedDayEntries = useMemo(() => {
    return entries
      .filter((e) => overlapsDay(e.from, e.until, selectedDate))
      .sort((a, b) => a.from.getTime() - b.from.getTime());
  }, [entries, selectedDate]);

  const eventStyleFor = (e: CalendarEntry) => {
    if (e.marker === 'availability') {
      return [
        styles.eventAvailability,
        colors.isDark && {backgroundColor: '#065F46', borderColor: '#10B981'},
      ];
    }
    if (e.marker === 'offer') {
      return [
        styles.eventOffer,
        colors.isDark && {backgroundColor: '#581C87', borderColor: '#A855F7'},
      ];
    }
    if (e.marker === 'hasOffer') return styles.eventHasOffer;
    if (e.marker === 'open') return styles.eventOpen;
    return [
      styles.eventRequest,
      colors.isDark && {backgroundColor: '#1E3A8A', borderColor: '#60A5FA'},
    ];
  };

  const eventTextStyleFor = (e: CalendarEntry) => {
    if (e.marker === 'open' || e.marker === 'hasOffer' || e.marker === 'availability') return styles.eventTextWhite;
    return [styles.eventText, {color: colors.text}];
  };

  return (
    <WatermarkBackground style={{backgroundColor: colors.isDark ? colors.screenBg : '#fff'}}>
      <View style={[styles.container, {backgroundColor: 'transparent'}]}>
      <View style={[styles.header, {paddingTop: 16 + insets.top}]}>
        <TouchableOpacity onPress={onBack} style={styles.headerBtn}>
          <MaterialCommunityIcons name="arrow-left" size={22} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Kalender</Text>
        <View style={styles.headerBtn} />
      </View>

      <View style={styles.modeRow}>
        <TouchableOpacity
          onPress={() => {
            setMode('month');
            setSelectedDate(today);
          }}
          style={[
            styles.modeBtn,
            {borderColor: colors.border, backgroundColor: colors.surface2},
            mode === 'month' && {backgroundColor: colors.brand, borderColor: colors.brand},
          ]}>
          <Text
            style={[
              styles.modeText,
              {color: colors.text},
              mode === 'month' && {color: '#fff'},
            ]}>
            Monat
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => {
            setMode('week');
            setSelectedDate(today);
          }}
          style={[
            styles.modeBtn,
            {borderColor: colors.border, backgroundColor: colors.surface2},
            mode === 'week' && {backgroundColor: colors.brand, borderColor: colors.brand},
          ]}>
          <Text
            style={[
              styles.modeText,
              {color: colors.text},
              mode === 'week' && {color: '#fff'},
            ]}>
            Woche
          </Text>
        </TouchableOpacity>
      </View>

      <View style={styles.monthRow}>
        <TouchableOpacity
          accessibilityLabel={mode === 'month' ? 'Vorheriger Monat' : 'Vorherige Woche'}
          onPress={() =>
            setCursor((d) => (mode === 'month' ? addMonths(d, -1) : addDays(d, -7)))
          }
          style={[styles.monthBtn, {backgroundColor: colors.surface2, borderColor: colors.border}]}>
          <MaterialCommunityIcons name="chevron-left" size={22} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.monthTitle, {color: colors.text}]}>
          {mode === 'month'
            ? title
            : `${WEEKDAYS_DE[mondayFirstWeekdayIndex(weekDays[0])]} ${String(weekDays[0].getDate()).padStart(2, '0')}.${String(weekDays[0].getMonth() + 1).padStart(2, '0')} – ${WEEKDAYS_DE[mondayFirstWeekdayIndex(weekDays[6])]} ${String(weekDays[6].getDate()).padStart(2, '0')}.${String(weekDays[6].getMonth() + 1).padStart(2, '0')}`}
        </Text>
        <TouchableOpacity
          accessibilityLabel={mode === 'month' ? 'Nächster Monat' : 'Nächste Woche'}
          onPress={() =>
            setCursor((d) => (mode === 'month' ? addMonths(d, 1) : addDays(d, 7)))
          }
          style={[styles.monthBtn, {backgroundColor: colors.surface2, borderColor: colors.border}]}>
          <MaterialCommunityIcons name="chevron-right" size={22} color={colors.text} />
        </TouchableOpacity>
      </View>

      {mode === 'month' ? (
        <View style={[styles.monthContent, isLandscape && isTablet && styles.monthContentLandscapeTablet]}>
          {isLandscape && isTablet ? (
            // Landscape Tablet: Two-column layout
            <View style={styles.landscapeTabletLayout}>
              {/* Left column: Calendar grid */}
              <View style={styles.landscapeCalendarColumn}>
                <View style={styles.weekdaysRow}>
                  {WEEKDAYS_DE.map((w) => (
                    <Text key={w} style={[styles.weekday, {color: colors.isDark ? '#9CA3AF' : styles.weekday.color}]}>
                      {w}
                    </Text>
                  ))}
                </View>
                <View style={styles.grid}>
                  {grid.map((c) => {
                    if (!c.day) return <View key={c.key} style={styles.cell} />;
                    const day = new Date(cursor.getFullYear(), cursor.getMonth(), c.day);
                    day.setHours(0, 0, 0, 0);
                    const k = dayKey(day);
                    const stats = monthDayStats[k] || {open: 0, hasOffer: 0, offer: 0, other: 0};
                    const isSelected = k === selectedKey;
                    const isToday = k === todayKey;

                    const hasDots = (stats.open > 0 && showOpen) || 
                                   (stats.hasOffer > 0 && showHasOffer) || 
                                   (stats.offer > 0 && showOffer) || 
                                   (stats.availability > 0 && availabilityFilter !== 'none') || 
                                   (stats.other > 0 && showRequest);
                    
                    return (
                      <TouchableOpacity
                        key={c.key}
                        onPress={() => setSelectedDate(day)}
                        style={[
                          styles.cell,
                          isSelected && [
                            styles.cellSelected,
                            colors.isDark ? styles.cellSelectedDark : styles.cellSelectedLight,
                          ],
                          isToday && styles.cellTodayOutline,
                        ]}>
                        <View style={styles.dayContent}>
                          <View style={styles.dayTextContainer}>
                            <Text
                              style={[
                                styles.dayText,
                                {color: colors.text},
                                isSelected && styles.dayTextSelected,
                              ]}>
                              {c.day}
                            </Text>
                            <View style={styles.dotsRow}>
                              {hasDots ? (
                                <>
                                  {stats.open > 0 && showOpen ? <View style={[styles.dot, styles.dotOpen]} /> : null}
                                  {stats.hasOffer > 0 && showHasOffer ? <View style={[styles.dot, styles.dotHasOffer]} /> : null}
                                  {stats.offer > 0 && showOffer ? <View style={[styles.dot, styles.dotOffer]} /> : null}
                                  {stats.availability > 0 && availabilityFilter !== 'none' ? <View style={[styles.dot, styles.dotAvailability]} /> : null}
                                  {stats.other > 0 && showRequest ? <View style={[styles.dot, styles.dotRequest]} /> : null}
                                </>
                              ) : null}
                            </View>
                          </View>
                        </View>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>
              
              {/* Right column: Day entries */}
              <View style={[styles.landscapeEntriesColumn, {borderLeftColor: colors.border}]}>
                <View style={styles.dayListHeader}>
                  <Text style={[styles.dayListTitle, {color: colors.text}]}>
                    Einträge · {formatDateLabel(selectedDate)}
                  </Text>
                  {selectedKey === todayKey ? <Text style={styles.dayListBadge}>Heute</Text> : null}
                </View>
                <ScrollView style={styles.dayList} contentContainerStyle={styles.dayListContent}>
                  {selectedDayEntries.length === 0 ? (
                    <Text style={[styles.weekEmpty, {color: colors.subtext}]}>Keine Einträge</Text>
                  ) : (
                    selectedDayEntries.map((e) => (
                      <TouchableOpacity
                        key={`${e.kind}-${e.id}-${selectedKey}`}
                        onPress={() => onOpenRequest(e.id, e.isFulfilled ? 'fulfilled' : 'active')}
                        style={[styles.eventPill, eventStyleFor(e)]}>
                        <Text style={eventTextStyleFor(e)} numberOfLines={1}>
                          {formatEntryLine(e, selectedDate)}
                        </Text>
                      </TouchableOpacity>
                    ))
                  )}
                </ScrollView>
              </View>
            </View>
          ) : (
            // Portrait: Original layout
            <>
              <View style={styles.weekdaysRow}>
                {WEEKDAYS_DE.map((w) => (
                  <Text key={w} style={[styles.weekday, {color: colors.isDark ? '#9CA3AF' : styles.weekday.color}]}>
                    {w}
                  </Text>
                ))}
              </View>

              <View style={styles.grid}>
                {grid.map((c) => {
                  if (!c.day) return <View key={c.key} style={styles.cell} />;
                  const day = new Date(cursor.getFullYear(), cursor.getMonth(), c.day);
                  day.setHours(0, 0, 0, 0);
                  const k = dayKey(day);
                  const stats = monthDayStats[k] || {open: 0, hasOffer: 0, offer: 0, other: 0};
                  const isSelected = k === selectedKey;
                  const isToday = k === todayKey;

                  const hasDots = (stats.open > 0 && showOpen) || 
                                 (stats.hasOffer > 0 && showHasOffer) || 
                                 (stats.offer > 0 && showOffer) || 
                                 (stats.availability > 0 && availabilityFilter !== 'none') || 
                                 (stats.other > 0 && showRequest);
                  
                  return (
                    <TouchableOpacity
                      key={c.key}
                      onPress={() => setSelectedDate(day)}
                      style={[
                        styles.cell,
                        isSelected && [
                          styles.cellSelected,
                          colors.isDark ? styles.cellSelectedDark : styles.cellSelectedLight,
                        ],
                        isToday && styles.cellTodayOutline,
                      ]}>
                      <View style={styles.dayContent}>
                        <View style={styles.dayTextContainer}>
                          <Text
                            style={[
                              styles.dayText,
                              {color: colors.text},
                              isSelected && styles.dayTextSelected,
                            ]}>
                            {c.day}
                          </Text>
                          <View style={styles.dotsRow}>
                            {hasDots ? (
                              <>
                                {stats.open > 0 && showOpen ? <View style={[styles.dot, styles.dotOpen]} /> : null}
                                {stats.hasOffer > 0 && showHasOffer ? <View style={[styles.dot, styles.dotHasOffer]} /> : null}
                                {stats.offer > 0 && showOffer ? <View style={[styles.dot, styles.dotOffer]} /> : null}
                                {stats.availability > 0 && availabilityFilter !== 'none' ? <View style={[styles.dot, styles.dotAvailability]} /> : null}
                                {stats.other > 0 && showRequest ? <View style={[styles.dot, styles.dotRequest]} /> : null}
                              </>
                            ) : null}
                          </View>
                        </View>
                      </View>
                    </TouchableOpacity>
                  );
                })}
              </View>

              <View style={styles.dayListHeader}>
                <Text style={[styles.dayListTitle, {color: colors.text}]}>
                  Einträge · {formatDateLabel(selectedDate)}
                </Text>
                {selectedKey === todayKey ? <Text style={styles.dayListBadge}>Heute</Text> : null}
              </View>

              <ScrollView style={styles.dayList} contentContainerStyle={styles.dayListContent}>
                {selectedDayEntries.length === 0 ? (
                  <Text style={[styles.weekEmpty, {color: colors.subtext}]}>Keine Einträge</Text>
                ) : (
                  selectedDayEntries.map((e) => (
                    <TouchableOpacity
                      key={`${e.kind}-${e.id}-${selectedKey}`}
                      onPress={() => onOpenRequest(e.id, e.isFulfilled ? 'fulfilled' : 'active')}
                      style={[styles.eventPill, eventStyleFor(e)]}>
                      <Text style={eventTextStyleFor(e)} numberOfLines={1}>
                        {formatEntryLine(e, selectedDate)}
                      </Text>
                    </TouchableOpacity>
                  ))
                )}
              </ScrollView>
            </>
          )}
        </View>
      ) : (
        <ScrollView style={styles.weekList} contentContainerStyle={styles.weekListContent}>
          {weekDays.map((d) => {
            const k = dayKey(d);
            const items = weekEntriesByDay[k] || [];
            const isToday = k === todayKey;
            return (
              <View
                key={k}
                style={[
                  styles.weekDayBlock,
                  {borderBottomColor: colors.border},
                  isToday && styles.weekDayToday,
                  isToday && colors.isDark && {backgroundColor: colors.surface2},
                ]}>
                <Text style={[styles.weekDayTitle, {color: colors.text}]}>
                  {WEEKDAYS_DE[(mondayFirstWeekdayIndex(d) + 0) % 7]}, {String(d.getDate()).padStart(2, '0')}.
                  {String(d.getMonth() + 1).padStart(2, '0')}.
                </Text>
                {items.length === 0 ? (
                  <Text style={[styles.weekEmpty, {color: colors.subtext}]}>—</Text>
                ) : (
                  items.map((e) => (
                    <TouchableOpacity
                      key={`${e.kind}-${e.id}-${k}`}
                      onPress={() => onOpenRequest(e.id, e.isFulfilled ? 'fulfilled' : 'active')}
                      style={[styles.eventPill, eventStyleFor(e)]}>
                      <Text style={eventTextStyleFor(e)} numberOfLines={1}>
                        {formatEntryLine(e, d)}
                      </Text>
                    </TouchableOpacity>
                  ))
                )}
              </View>
            );
          })}
        </ScrollView>
      )}

      <View style={[styles.legend, {paddingBottom: insets.bottom + 12}]}>
        <TouchableOpacity
          style={styles.legendItem}
          onPress={() => setShowOpen(!showOpen)}
          activeOpacity={0.7}>
          <View style={[styles.dot, styles.dotOpen, !showOpen && styles.dotDisabled]} />
          <Text style={[styles.legendText, {color: colors.text}, !showOpen && styles.legendTextDisabled]}>
            Offen
          </Text>
        </TouchableOpacity>
        
        <TouchableOpacity
          style={styles.legendItem}
          onPress={() => setShowHasOffer(!showHasOffer)}
          activeOpacity={0.7}>
          <View style={[styles.dot, styles.dotHasOffer, !showHasOffer && styles.dotDisabled]} />
          <Text style={[styles.legendText, {color: colors.text}, !showHasOffer && styles.legendTextDisabled]}>
            Erfüllt
          </Text>
        </TouchableOpacity>
        
        <TouchableOpacity
          style={styles.legendItem}
          onPress={() => {
            // Cycle through: all -> mine -> none -> all
            if (availabilityFilter === 'all') setAvailabilityFilter('mine');
            else if (availabilityFilter === 'mine') setAvailabilityFilter('none');
            else setAvailabilityFilter('all');
          }}
          activeOpacity={0.7}>
          <View style={[styles.dot, styles.dotAvailability, availabilityFilter === 'none' && styles.dotDisabled]} />
          <Text
            style={[
              styles.legendText,
              {color: colors.text},
              availabilityFilter === 'none' && styles.legendTextDisabled,
            ]}>
            {availabilityFilter === 'all' ? 'Alle Verfügbar' : availabilityFilter === 'mine' ? 'Meine Verfügbar' : 'Verfügbar'}
          </Text>
        </TouchableOpacity>
        
        <TouchableOpacity
          style={styles.legendItem}
          onPress={() => setShowOffer(!showOffer)}
          activeOpacity={0.7}>
          <View style={[styles.dot, styles.dotOffer, !showOffer && styles.dotDisabled]} />
          <Text style={[styles.legendText, {color: colors.text}, !showOffer && styles.legendTextDisabled]}>
            Meine
          </Text>
        </TouchableOpacity>
        
        <TouchableOpacity
          style={styles.legendItem}
          onPress={() => setShowRequest(!showRequest)}
          activeOpacity={0.7}>
          <View style={[styles.dot, styles.dotRequest, !showRequest && styles.dotDisabled]} />
          <Text style={[styles.legendText, {color: colors.text}, !showRequest && styles.legendTextDisabled]}>
            Sonstige
          </Text>
        </TouchableOpacity>
      </View>
      </View>
    </WatermarkBackground>
  );
};

const styles = StyleSheet.create({
  container: {flex: 1, backgroundColor: '#fff'},
  header: {
    paddingHorizontal: 16,
    paddingBottom: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#007AFF',
  },
  headerTitle: {fontSize: 20, fontWeight: 'bold', color: '#fff'},
  headerBtn: {width: 36, height: 36, alignItems: 'center', justifyContent: 'center'},

  modeRow: {
    flexDirection: 'row',
    gap: 10,
    paddingHorizontal: 16,
    paddingTop: 12,
  },
  modeBtn: {
    flex: 1,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    backgroundColor: '#F3F4F6',
    paddingVertical: 10,
    alignItems: 'center',
  },
  modeBtnActive: {
    backgroundColor: '#111827',
    borderColor: '#111827',
  },
  modeText: {fontWeight: '800', color: '#111827'},
  modeTextActive: {color: '#fff'},

  monthRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 10,
  },
  monthTitle: {fontSize: 18, fontWeight: '800', color: '#111827'},
  monthBtn: {
    width: 36,
    height: 36,
    borderRadius: 999,
    backgroundColor: '#F3F4F6',
    alignItems: 'center',
    justifyContent: 'center',
    borderColor: '#E5E7EB',
    borderWidth: 1,
  },

  weekdaysRow: {
    flexDirection: 'row',
    paddingHorizontal: 12,
    marginTop: 4,
  },
  weekday: {
    flex: 1,
    textAlign: 'center',
    fontWeight: '800',
    color: '#6B7280',
    fontSize: 12,
  },

  monthContent: {
    flex: 1,
    minHeight: 0,
  },
  monthContentLandscapeTablet: {
    // No maxHeight needed - using two-column layout instead
  },
  landscapeTabletLayout: {
    flexDirection: 'row',
    flex: 1,
    gap: 0,
  },
  landscapeCalendarColumn: {
    width: '50%',
    paddingHorizontal: 12,
  },
  landscapeEntriesColumn: {
    width: '50%',
    borderLeftWidth: 1,
    paddingLeft: 16,
    paddingRight: 16,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: 12,
    paddingTop: 8,
  },
  cell: {
    width: `${100 / 7}%`,
    aspectRatio: 1.2,
    padding: 4,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dayContent: {
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
    height: '100%',
  },
  dayTextContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    height: 24, // Fixed height to keep numbers aligned
  },
  dayText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#111827',
    textAlign: 'center',
    lineHeight: 16,
    height: 16, // Fixed height for the number
  },
  cellSelected: {
    borderRadius: 12,
  },
  cellSelectedLight: {
    backgroundColor: '#3B82F6',
    borderWidth: 2,
    borderColor: '#60A5FA',
  },
  cellSelectedDark: {
    backgroundColor: '#3B82F6',
    borderWidth: 2,
    borderColor: '#60A5FA',
  },
  cellTodayOutline: {
    borderWidth: 2,
    borderColor: '#16A34A',
    borderRadius: 12,
  },
  dayTextSelected: {color: '#fff'},

  dotsRow: {
    flexDirection: 'row',
    gap: 6,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 2,
    height: 7, // Fixed height to reserve space for dots
  },
  dot: {width: 7, height: 7, borderRadius: 999},
  dotOpen: {backgroundColor: '#FF9800'},
  dotHasOffer: {backgroundColor: '#4CAF50'},
  dotAvailability: {backgroundColor: '#10B981'},
  dotRequest: {backgroundColor: '#2563EB'},
  dotOffer: {backgroundColor: '#9333EA'},

  dayListHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 6,
  },
  dayListTitle: {fontWeight: '900', color: '#111827'},
  dayListBadge: {fontWeight: '900', color: '#16A34A'},
  dayList: {flex: 1, minHeight: 0, paddingHorizontal: 16},
  dayListContent: {paddingBottom: 10},

  weekList: {flex: 1, minHeight: 0, paddingHorizontal: 16, paddingTop: 6},
  weekListContent: {paddingBottom: 10},
  weekDayBlock: {paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#F3F4F6'},
  weekDayToday: {backgroundColor: '#F0FDF4', borderRadius: 12, paddingHorizontal: 10},
  weekDayTitle: {fontWeight: '900', color: '#111827', marginBottom: 6},
  weekEmpty: {color: '#9CA3AF'},
  eventPill: {
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 10,
    marginBottom: 6,
  },
  eventRequest: {backgroundColor: '#EFF6FF', borderColor: '#BFDBFE', borderWidth: 1},
  eventOffer: {backgroundColor: '#FAF5FF', borderColor: '#E9D5FF', borderWidth: 1},
  // Open requests (no offer yet) use the same orange as the "Offen" chip on request cards.
  eventOpen: {backgroundColor: '#FF9800', borderColor: '#FF9800', borderWidth: 1},
  // Requests that already have an offer should be clearly distinguishable.
  eventHasOffer: {backgroundColor: '#4CAF50', borderColor: '#4CAF50', borderWidth: 1},
  // Availabilities (Frei-Angebote) in green/teal
  eventAvailability: {backgroundColor: '#10B981', borderColor: '#10B981', borderWidth: 1},
  eventText: {fontWeight: '800', color: '#111827', fontSize: 12},
  eventTextWhite: {fontWeight: '800', color: '#fff', fontSize: 12},

  legend: {
    flexDirection: 'row',
    justifyContent: 'center',
    flexWrap: 'wrap',
    gap: 12,
    paddingHorizontal: 16,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#F3F4F6',
    marginTop: 6,
  },
  legendItem: {flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 4},
  legendText: {fontSize: 12, fontWeight: '800', color: '#111827'},
  legendTextDisabled: {textDecorationLine: 'line-through', opacity: 0.5},
  dotDisabled: {opacity: 0.3},

  hint: {display: 'none'},
});

export default CalendarScreen;


