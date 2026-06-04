import React, {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {
  View,
  Text,
  StyleSheet,
  SectionList,
  ScrollView,
  TouchableOpacity,
  Alert,
  RefreshControl,
  ActivityIndicator,
  useColorScheme,
  Platform,
  Modal,
  type ViewStyle,
} from 'react-native';
import {confirmAlert, showAlert} from '../utils/alertUtils';
import {getApp} from '@react-native-firebase/app';
import {getAuth, getIdToken, onAuthStateChanged} from '@react-native-firebase/auth';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import MaterialCommunityIcons from 'react-native-vector-icons/MaterialCommunityIcons';
import ParkingRequestService from '../services/ParkingRequestService';
import FirestoreService, {
  OfferFromAvailability,
  shouldIncludeRelevantRequest,
} from '../services/FirestoreService';
import {UserData} from '../services/AuthService';
import {ParkingRequest, isOpen} from '../models/ParkingRequest';
import ProfileScreen from './ProfileScreen';
import CalendarScreen from './CalendarScreen';
import NewRequestModal from '../components/NewRequestModal';
import RequestCard from '../components/RequestCard';
import {getColors} from '../theme/colors';
import OfferModal from '../components/OfferModal';
import {RequestOffer} from '../models/RequestOffer';
import CommentsModal from '../components/CommentsModal';
import WatermarkBackground from '../components/WatermarkBackground';
import {FacilityLayoutViewer} from '../facilityLayout';
import ParkingAvailabilityService from '../services/ParkingAvailabilityService';
import {ParkingAvailability, RecurrenceRule} from '../models/ParkingAvailability';
import {getNextOccurrenceWindows} from '../utils/recurrenceUtils';
import AvailabilityCard from '../components/AvailabilityCard';
import NewAvailabilityModal from '../components/NewAvailabilityModal';

interface Props {
  currentUserId: string;
  userData: UserData;
  externalFocus?: {requestId: string; tab?: 'active' | 'fulfilled' | 'available'; offerId?: string};
}

type RequestSection = {title: string; data: ParkingRequest[]};

// Abgeschlossene Ereignisse (nach Ende der Buchung) nur noch begrenzt anzeigen
const HIDE_OPEN_AFTER_END_MS = 3 * 60 * 60 * 1000; // 3h – Offen-Tab (align mit Backend-Archivierung)
const HIDE_FULFILLED_AFTER_END_MS = 24 * 60 * 60 * 1000; // 24h – Erfüllt-Tab
const HIDE_AVAILABILITY_AFTER_END_MS = 24 * 60 * 60 * 1000; // 24h – Frei-Tab (align mit Backend-Archivierung)

const isStillVisibleOpen = (r: ParkingRequest) =>
  r.until.getTime() > Date.now() - HIDE_OPEN_AFTER_END_MS;
const isStillVisibleFulfilled = (r: ParkingRequest) =>
  r.until.getTime() > Date.now() - HIDE_FULFILLED_AFTER_END_MS;

/** Effektives Ende einer Verfügbarkeit (letzte Buchung); null = wiederkehrend ohne endDate (läuft weiter). */
function getAvailabilityEnd(av: ParkingAvailability): Date | null {
  if (av.recurrence?.endDate) {
    const end = new Date(av.recurrence.endDate);
    end.setHours(
      av.until.getHours(),
      av.until.getMinutes(),
      av.until.getSeconds(),
      av.until.getMilliseconds(),
    );
    return end;
  }
  if (!av.recurrence) return av.until;
  return null; // wiederkehrend ohne endDate = nicht ausblenden
}

const isStillVisibleAvailability = (av: ParkingAvailability): boolean => {
  const end = getAvailabilityEnd(av);
  if (!end) return true;
  return end.getTime() > Date.now() - HIDE_AVAILABILITY_AFTER_END_MS;
};

const ParkingRequestsScreen: React.FC<Props> = ({currentUserId, userData, externalFocus}) => {
  const insets = useSafeAreaInsets();
  const colors = getColors(useColorScheme());
  const [requests, setRequests] = useState<ParkingRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [mySpotId, setMySpotId] = useState<string | null>(null);
  const [showRequestModal, setShowRequestModal] = useState(false);
  const [showProfile, setShowProfile] = useState(false);
  const [showLayoutMap, setShowLayoutMap] = useState(false);
  const [showCalendar, setShowCalendar] = useState(false);
  const [focusRequestId, setFocusRequestId] = useState<string | null>(null);
  const [focusOfferId, setFocusOfferId] = useState<string | null>(null);
  const [currentUserData, setCurrentUserData] = useState<UserData>(userData);
  const [activeTab, setActiveTab] = useState<'active' | 'fulfilled' | 'available'>('active');
  const [availabilities, setAvailabilities] = useState<ParkingAvailability[]>([]);
  const [showAvailabilityModal, setShowAvailabilityModal] = useState(false);
  const [editingAvailability, setEditingAvailability] = useState<ParkingAvailability | null>(null);
  const [publicUsers, setPublicUsers] = useState<Record<string, {username?: string; phone?: string}>>(
    {},
  );
  const publicUserUnsubsRef = useRef<Record<string, () => void>>({});
  const [offersByRequestId, setOffersByRequestId] = useState<Record<string, RequestOffer[]>>({});
  const offerUnsubsRef = useRef<Record<string, () => void>>({});
  const offerListenerInitializedRef = useRef<Set<string>>(new Set());
  const requestFlagsRef = useRef<Record<string, {isArchived: boolean}>>({});
  const [offersByAvailabilityId, setOffersByAvailabilityId] = useState<
    Record<string, OfferFromAvailability[]>
  >({});
  const availabilityOfferUnsubsRef = useRef<Record<string, () => void>>({});
  const listRef = useRef<SectionList<ParkingRequest, RequestSection> | null>(null);
  const [offerModalRequest, setOfferModalRequest] = useState<ParkingRequest | null>(null);
  const [showOfferModal, setShowOfferModal] = useState(false);
  const [showComments, setShowComments] = useState(false);
  const [commentsRequestId, setCommentsRequestId] = useState<string | null>(null);
  const [facilityName, setFacilityName] = useState<string | null>(null);
  const [facilityMemberCount, setFacilityMemberCount] = useState<number | null>(null);
  const [fulfilledStats, setFulfilledStats] = useState<{
    total: number;
    future: number;
    byUser: number;
  } | null>(null);
  const [offeringRequestId, setOfferingRequestId] = useState<string | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const isAdminRef = useRef(false);
  const requestsUnsubscribeRef = useRef<(() => void) | null>(null);

  const reloadRequests = useCallback(
    () =>
      FirestoreService.getRelevantRequests(currentUserId, currentUserData.facilityCode, {isAdmin}),
    [currentUserId, currentUserData.facilityCode, isAdmin],
  );

  useEffect(() => {
    // Wait for authentication to be ready before initializing
    const auth = getAuth(getApp());
    if (auth.currentUser) {
      initialize();
    } else {
      // Wait for auth state to be ready
      const unsubscribe = onAuthStateChanged(auth, (user) => {
        if (user) {
          initialize();
          unsubscribe();
        }
      });
      return () => unsubscribe();
    }
  }, []);

  // Setup listeners and re-setup when facilityCode changes
  useEffect(() => {
    // Cleanup previous listener if exists
    if (requestsUnsubscribeRef.current) {
      try {
        requestsUnsubscribeRef.current();
      } catch (e) {
        console.error('Error unsubscribing from previous listener:', e);
      }
      requestsUnsubscribeRef.current = null;
    }

    // Set loading state when facility code changes
    setLoading(true);
    setRequests([]); // Clear old requests

    // Setup new listener with current facilityCode
    const unsubscribe = FirestoreService.watchRelevantRequests(currentUserId, currentUserData.facilityCode).onSnapshot(
      (snapshot) => {
        const allRequests = snapshot.docs
          .map((doc) => {
            return FirestoreService.parkingRequestFromDocSnap(doc as any);
          })
          .filter((r) =>
            shouldIncludeRelevantRequest(r, currentUserId, currentUserData.facilityCode, {
              isAdmin: isAdminRef.current,
            }),
          );
        setRequests(allRequests);
        setLoading(false);
      },
      (error) => {
        // On logout, the auth context disappears before the component fully unmounts.
        // Firestore will then emit permission-denied; we can safely ignore that noise.
        const isPermissionDenied = String((error as any)?.code || '').includes('permission-denied');
        const isLoggedOut = !getAuth(getApp()).currentUser;
        if (isPermissionDenied && isLoggedOut) {
          setLoading(false);
          return;
        }
        console.error('Firestore Fehler:', error);
        setLoading(false);
      },
    );

    requestsUnsubscribeRef.current = unsubscribe;

    // Setup availability listener
    // Note: Query only filters by userId, facilityCode filtering is done client-side
    const availabilityUnsubscribe = ParkingAvailabilityService.watchUserAvailabilities(
      currentUserId,
      currentUserData.facilityCode,
    ).onSnapshot(
      (snapshot) => {
        const allAvailabilities = snapshot.docs
          .map((doc) => {
            return ParkingAvailabilityService.availabilityFromDocSnap(doc as any);
          })
          .filter((av) => av.facilityCode === currentUserData.facilityCode);
        setAvailabilities(allAvailabilities);
      },
      (error) => {
        const isPermissionDenied = String((error as any)?.code || '').includes('permission-denied');
        const isLoggedOut = !getAuth(getApp()).currentUser;
        if (isPermissionDenied && isLoggedOut) {
          return;
        }
        console.error('Firestore Fehler (Availabilities):', error);
      },
    );

    // Cleanup function
    return () => {
      if (requestsUnsubscribeRef.current) {
        try {
          requestsUnsubscribeRef.current();
        } catch (e) {
          console.error('Error unsubscribing from listener:', e);
        }
        requestsUnsubscribeRef.current = null;
      }
      try {
        availabilityUnsubscribe();
      } catch (e) {
        console.error('Error unsubscribing from availability listener:', e);
      }
    };
  }, [currentUserId, currentUserData.facilityCode, isAdmin]);

  // Load facility name and member count
  useEffect(() => {
    const loadFacilityInfo = async () => {
      if (currentUserData.facilityCode) {
        try {
          const [facilityInfo, count] = await Promise.all([
            FirestoreService.getFacilityInfo(currentUserData.facilityCode),
            FirestoreService.getFacilityMemberCount(currentUserData.facilityCode),
          ]);
          if (facilityInfo && facilityInfo.name) {
            setFacilityName(facilityInfo.name);
          }
          setFacilityMemberCount(count);
        } catch (e) {
          console.error('Error loading facility info:', e);
        }
      }
    };
    loadFacilityInfo();
  }, [currentUserData.facilityCode]);

  // Load fulfilled stats for header chip
  useEffect(() => {
    if (!currentUserData.facilityCode) return;
    let cancelled = false;
    FirestoreService.getFacilityFulfilledStats(currentUserData.facilityCode).then((stats) => {
      if (!cancelled && stats) {
        setFulfilledStats(stats);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [currentUserData.facilityCode]);

  useEffect(() => {
    if (!externalFocus?.requestId) return;
    setActiveTab(externalFocus.tab ?? 'active');
    setFocusRequestId(externalFocus.requestId);
    setFocusOfferId(externalFocus.offerId ?? null);
    // auto-clear offer highlight after a moment
    if (externalFocus.offerId) {
      setTimeout(() => setFocusOfferId(null), 6000);
    }
  }, [externalFocus?.requestId, externalFocus?.tab, externalFocus?.offerId]);

  // Keep a live cache of public profiles for all userIds visible in requests + offers + "Bereits angeboten".
  useEffect(() => {
    const ids = new Set<string>();
    requests.forEach((r) => {
      ids.add(r.requestedBy);
      if (r.offeredBy) {
        ids.add(r.offeredBy);
      }
    });
    // Also include offererIds (multi-offer fulfillment)
    Object.values(offersByRequestId).forEach((offers) => {
      offers.forEach((o) => {
        if (o.offererId) ids.add(o.offererId);
      });
    });
    // Requesters from "Bereits angeboten" (Frei-Tab), damit "Anfrage von {username}" korrekt angezeigt wird
    Object.values(offersByAvailabilityId).forEach((items) => {
      items.forEach((item) => {
        if (item.requestedBy) ids.add(item.requestedBy);
      });
    });

    // subscribe new ids
    ids.forEach((uid) => {
      if (publicUserUnsubsRef.current[uid]) return;
      publicUserUnsubsRef.current[uid] = FirestoreService.watchPublicUser(uid, (data) => {
        if (!data) return;
        setPublicUsers((prev) => ({
          ...prev,
          [uid]: data,
        }));
      });
    });

    // unsubscribe removed ids
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
  }, [requests, offersByRequestId, offersByAvailabilityId]);

  useEffect(() => {
    return () => {
      Object.values(publicUserUnsubsRef.current).forEach((fn) => {
        try {
          fn();
        } catch {}
      });
      publicUserUnsubsRef.current = {};

      Object.values(offerUnsubsRef.current).forEach((fn) => {
        try {
          fn();
        } catch {}
      });
      offerUnsubsRef.current = {};
    };
  }, []);

  const initialize = async () => {
    // Ensure user is authenticated before proceeding
    const auth = getAuth(getApp());
    
    try {
      if (!auth.currentUser) {
        console.warn('User not authenticated, skipping initialization');
        return;
      }

      // Verify auth token is available
      try {
        await getIdToken(auth.currentUser);
      } catch (tokenError) {
        console.error('Failed to get auth token:', tokenError);
        throw new Error('Authentication token not available');
      }

      // Check admin status
      try {
        const {getFirestore, doc, getDoc} = require('@react-native-firebase/firestore');
        const adminSnap = await getDoc(doc(getFirestore(), 'users', currentUserId));
        if (adminSnap.exists()) {
          const adminStatus = adminSnap.data()?.admin === true;
          isAdminRef.current = adminStatus;
          setIsAdmin(adminStatus);
        }
      } catch (_) {}

      // Ensure current user's public profile exists for other users (and for immediate UI resolution)
      try {
        await FirestoreService.upsertPublicUserData(currentUserId, {
          username: currentUserData.username,
          phone: currentUserData.phone,
        });
      } catch (upsertError: any) {
        console.error('Error upserting public user data:', upsertError);
        // Log detailed error information
        console.error('User ID:', currentUserId);
        console.error('Auth UID:', auth.currentUser?.uid);
        console.error('Error code:', upsertError?.code);
        console.error('Error message:', upsertError?.message);
        // Don't throw - this is not critical for app functionality
        // The user can still use the app even if public profile update fails
      }

      await ParkingRequestService.initializeFCMToken(currentUserId);
      
      // User-Parkplatz aus currentUserData setzen (erster Parkplatz)
      if (currentUserData.parkingSpots && currentUserData.parkingSpots.length > 0) {
        const spotId = currentUserData.parkingSpots[0];
        await FirestoreService.setUserParkingSpot(currentUserId, spotId);
        setMySpotId(spotId);
      } else {
        const userSpot = await ParkingRequestService.getUserParkingSpot(currentUserId);
        setMySpotId(userSpot);
      }
    } catch (error: any) {
      console.error('Initialisierungsfehler:', error);
      // Log more details about permission errors
      if (error?.code === 'permission-denied' || error?.message?.includes('permission')) {
        console.error('Permission denied. Make sure:');
        console.error('1. Firestore rules are deployed: npm run deploy:rules');
        console.error('2. User is authenticated:', auth?.currentUser?.uid || 'NO USER');
        console.error('3. Auth token is valid');
        console.error('4. Error details:', {
          code: error?.code,
          message: error?.message,
          stack: error?.stack,
        });
      }
    }
  };

  // Logout moved to ProfileScreen

  const handleCreateRequest = async (
    from: Date,
    until: Date,
    allowPartialOffers: boolean,
    comment?: string,
  ) => {
    await ParkingRequestService.createRequest(
      currentUserId,
      currentUserData.username,
      currentUserData.phone,
      currentUserData.facilityCode,
      from,
      until,
      allowPartialOffers,
      comment,
    );
    showAlert('Erfolg', 'Anfrage erstellt!');
    if (Platform.OS === 'web') {
      const newRequests = await reloadRequests();
      setRequests(newRequests);
    }
  };

  const offerParkingSpot = async (request: ParkingRequest) => {
    if (mySpots.length === 0) {
      showAlert('Fehler', 'Du hast keinen Parkplatz zugewiesen');
      return;
    }
    setOfferingRequestId(request.id);
    setOfferModalRequest(request);
    setShowOfferModal(true);
  };

  const fulfillRequest = async (request: ParkingRequest) => {
    try {
      await ParkingRequestService.fulfillRequest(request.id);
      showAlert('Erfolg', 'Anfrage als erfüllt markiert');
      if (Platform.OS === 'web') {
        const newRequests = await reloadRequests();
        setRequests(newRequests);
      }
    } catch (error) {
      showAlert('Fehler', 'Ein Fehler ist aufgetreten');
    }
  };

  const handleCreateAvailability = async (
    spotId: string,
    from: Date,
    until: Date,
    recurrence?: RecurrenceRule | null,
    autoOffer?: boolean,
  ) => {
    try {
      const facilityCode = (currentUserData.facilityCode ?? '').trim().toUpperCase();
      const availabilityId = await ParkingAvailabilityService.createAvailability(
        currentUserId,
        facilityCode,
        spotId,
        from,
        until,
        recurrence || undefined,
        currentUserData.username,
        currentUserData.phone,
        autoOffer,
      );
      const now = new Date();
      const optimistic: ParkingAvailability = {
        id: availabilityId,
        userId: currentUserId,
        facilityCode,
        spotId,
        from,
        until,
        recurrence: recurrence ?? undefined,
        isActive: true,
        isMatched: false,
        createdAt: now,
        updatedAt: now,
        createdBy: currentUserId,
        username: currentUserData.username,
        phone: currentUserData.phone,
        autoOffer: autoOffer !== false,
      };
      setAvailabilities((prev) =>
        prev.some((a) => a.id === availabilityId) ? prev : [...prev, optimistic],
      );
      showAlert('Erfolg', 'Verfügbarkeit erstellt!');
      if (Platform.OS === 'web') {
        const newAvailabilities = await ParkingAvailabilityService.getUserAvailabilities(
          currentUserId,
          currentUserData.facilityCode,
        );
        setAvailabilities(newAvailabilities);
      }
    } catch (error: any) {
      console.error('Fehler beim Erstellen der Verfügbarkeit:', error);
      showAlert('Fehler', error?.message || 'Verfügbarkeit konnte nicht erstellt werden');
    }
  };

  const handleUpdateAvailability = async (
    availabilityId: string,
    updates: {
      from?: Date;
      until?: Date;
      spotId?: string;
      recurrence?: RecurrenceRule | null;
      isActive?: boolean;
      autoOffer?: boolean;
    },
  ) => {
    try {
      await ParkingAvailabilityService.updateAvailability(availabilityId, updates);
      const existing = availabilities.find((a) => a.id === availabilityId)!;
      const merged: ParkingAvailability = {
        ...existing,
        ...updates,
        from: updates.from ?? existing.from,
        until: updates.until ?? existing.until,
        recurrence: updates.recurrence === null ? undefined : (updates.recurrence ?? existing.recurrence),
      };
      const allAfter = availabilities.map((a) => (a.id === availabilityId ? merged : a));
      await ParkingRequestService.recheckOffersAfterAvailabilityChange(
        currentUserId,
        currentUserData.facilityCode,
        merged.spotId,
        allAfter,
        currentUserData.username,
        currentUserData.phone ?? '',
      );
      if (updates.spotId !== undefined && existing.spotId !== updates.spotId) {
        await ParkingRequestService.recheckOffersAfterAvailabilityChange(
          currentUserId,
          currentUserData.facilityCode,
          existing.spotId,
          allAfter,
          currentUserData.username,
          currentUserData.phone ?? '',
        );
      }
      showAlert('Erfolg', 'Verfügbarkeit aktualisiert!');
      if (Platform.OS === 'web') {
        const newAvailabilities = await ParkingAvailabilityService.getUserAvailabilities(
          currentUserId,
          currentUserData.facilityCode,
        );
        setAvailabilities(newAvailabilities);
      }
    } catch (error: any) {
      console.error('Fehler beim Aktualisieren der Verfügbarkeit:', error);
      showAlert('Fehler', error?.message || 'Verfügbarkeit konnte nicht aktualisiert werden');
    }
  };

  const handleDeleteAvailability = async (availability: ParkingAvailability) => {
    confirmAlert(
      'Verfügbarkeit löschen',
      'Möchtest du diese Verfügbarkeit wirklich löschen?',
      async () => {
        try {
          await ParkingAvailabilityService.deleteAvailability(availability.id);
          const allAfter = availabilities.filter((a) => a.id !== availability.id);
          await ParkingRequestService.recheckOffersAfterAvailabilityChange(
            currentUserId,
            currentUserData.facilityCode,
            availability.spotId,
            allAfter,
            currentUserData.username,
            currentUserData.phone ?? '',
          );
          showAlert('Erfolg', 'Verfügbarkeit gelöscht!');
          if (Platform.OS === 'web') {
            const newAvailabilities = await ParkingAvailabilityService.getUserAvailabilities(
              currentUserId,
              currentUserData.facilityCode,
            );
            setAvailabilities(newAvailabilities);
          }
        } catch (error: any) {
          console.error('Fehler beim Löschen der Verfügbarkeit:', error);
          showAlert('Fehler', error?.message || 'Verfügbarkeit konnte nicht gelöscht werden');
        }
      },
      undefined,
      'Löschen',
      'Abbrechen',
    );
  };

  const archiveFulfilledRequest = (request: ParkingRequest) => {
    confirmAlert(
      'Erfüllung aufheben',
      'Möchtest du diese erfüllte Anfrage wirklich aufheben? Sie wird archiviert (nicht gelöscht).',
      async () => {
        try {
          await ParkingRequestService.archiveFulfilledRequest(currentUserId, request);
          showAlert('Erfolg', 'Anfrage wurde archiviert');
          if (Platform.OS === 'web') {
            const newRequests = await reloadRequests();
            setRequests(newRequests);
          }
        } catch (e) {
          console.error('Archive failed:', e);
          showAlert('Fehler', 'Anfrage konnte nicht archiviert werden');
        }
      },
      undefined,
      'Aufheben',
      'Abbrechen',
    );
  };

  const cancelOffer = (request: ParkingRequest) => {
    confirmAlert(
      'Angebot stornieren',
      'Möchtest du dein Angebot wirklich zurückziehen?',
      async () => {
        try {
          // Der Anbieter ist der currentUserId (weil isMyOffer nur true ist, wenn offeredBy === currentUserId)
          await ParkingRequestService.cancelOffer(request.id, currentUserId);
          showAlert('Erfolg', 'Angebot wurde storniert');
          if (Platform.OS === 'web') {
            const [newRequests, newOffers] = await Promise.all([
              reloadRequests(),
              ParkingRequestService.getOffersForRequest(request.id),
            ]);
            setRequests(newRequests);
            setOffersByRequestId((prev) => ({...prev, [request.id]: newOffers}));
          }
        } catch (e) {
          console.error('Fehler beim Stornieren:', e);
          showAlert('Fehler', 'Angebot konnte nicht storniert werden');
        }
      },
      undefined,
      'Stornieren',
      'Abbrechen',
    );
  };

  const withdrawRequest = (request: ParkingRequest) => {
    confirmAlert(
      'Anfrage zurückziehen',
      'Möchtest du deine Anfrage wirklich zurückziehen?',
      async () => {
        try {
          await ParkingRequestService.deleteRequest(request.id, currentUserData.username);
          showAlert('Erfolg', 'Anfrage wurde zurückgezogen');
          if (Platform.OS === 'web') {
            const newRequests = await reloadRequests();
            setRequests(newRequests);
          }
        } catch (e) {
          console.error('Fehler beim Zurückziehen:', e);
          showAlert('Fehler', 'Anfrage konnte nicht zurückgezogen werden');
        }
      },
      undefined,
      'Zurückziehen',
      'Abbrechen',
    );
  };

  const mySpots = useMemo(() => {
    const spotsFromProfile = (currentUserData.parkingSpots || [])
      .map((s) => s.trim())
      .filter((s) => s.length > 0)
      .slice(0, 3);
    // Nur spotsFromProfile verwenden - wenn alle Parkplätze gelöscht wurden, sollte mySpotId nicht mehr verwendet werden
    return spotsFromProfile;
  }, [currentUserData.parkingSpots]);

  const displayRequests = useMemo(() => {
    return requests.map((r) => {
      const requestedByProfile = publicUsers[r.requestedBy];
      const offeredByProfile = r.offeredBy ? publicUsers[r.offeredBy] : undefined;
      return {
        ...r,
        // Never show raw UIDs in UI; show placeholder until users_public is available.
        requestedByUsername: requestedByProfile?.username ?? r.requestedByUsername ?? '…',
        requestedByPhone: requestedByProfile?.phone ?? r.requestedByPhone,
        offeredByUsername:
          offeredByProfile?.username ??
          r.offeredByUsername ??
          (r.offeredBy ? '…' : undefined),
        offeredByPhone: offeredByProfile?.phone ?? r.offeredByPhone,
      } as ParkingRequest;
    });
  }, [requests, publicUsers]);

  // Subscribe to offers for my open requests (so I can choose which to accept).
  useEffect(() => {
    const flags: Record<string, {isArchived: boolean}> = {};
    displayRequests.forEach((r) => {
      flags[r.id] = {isArchived: r.isArchived === true};
    });
    requestFlagsRef.current = flags;

    const ids = new Set<string>();
    displayRequests.forEach((r) => {
      const iAmRequester = r.requestedBy === currentUserId;
      const iAmFulfilledOfferer =
        r.isFulfilled && Array.isArray(r.fulfilledByUserIds) && r.fulfilledByUserIds.includes(currentUserId);
      const iAmLegacyOfferer = r.offeredBy === currentUserId;
      const isOpenToCover = !r.isFulfilled && !r.offeredSpotId; // include open requests so everyone can see coverage
      const hasOfferAndIAmRequester = !r.isFulfilled && r.offeredSpotId && iAmRequester; // Load offers for requester even if request has an offer
      const hasOfferAndNotFulfilled = !r.isFulfilled && r.offeredSpotId; // Load offers for all requests with offers (to check for standby)
      const adminViewFulfilled = isAdmin && r.isFulfilled;
      if (
        iAmRequester ||
        iAmFulfilledOfferer ||
        iAmLegacyOfferer ||
        isOpenToCover ||
        hasOfferAndIAmRequester ||
        hasOfferAndNotFulfilled ||
        adminViewFulfilled
      ) {
        ids.add(r.id);
      }
    });

    ids.forEach((requestId) => {
      if (offerUnsubsRef.current[requestId]) return;
      offerUnsubsRef.current[requestId] = ParkingRequestService.watchOffersForRequest(requestId).onSnapshot(
        (snap: any) => {
          const isFirstSnapshot = !offerListenerInitializedRef.current.has(requestId);
          offerListenerInitializedRef.current.add(requestId);

          const previousOffers = offersByRequestId[requestId] || [];
          const previousOfferIds = new Set(previousOffers.map((o) => o.id));
          const parentArchived = requestFlagsRef.current[requestId]?.isArchived === true;
          
          const offers: RequestOffer[] = (snap?.docs ?? [])
            .map((d: any) => {
              const data = d.data();
              const status = data.status ?? 'active';
              const createdAt = data.createdAt ? (data.createdAt as any).toDate() : undefined;
              
              // Check if this is a new offer (not in previous offers)
              const isNewOffer = !isFirstSnapshot && !previousOfferIds.has(d.id);
              if (isNewOffer && createdAt && !parentArchived) {
                // Check if it was created very recently (within 10 seconds) - likely auto-match
                const now = new Date();
                const timeSinceCreation = now.getTime() - createdAt.getTime();
                const isLikelyAutoMatch = timeSinceCreation < 10000; // 10 seconds
                
                // Only log in development mode (native & web)
                const isDev =
                  (typeof __DEV__ !== 'undefined' && __DEV__) ||
                  (typeof globalThis !== 'undefined' &&
                    (globalThis as any).process &&
                    (globalThis as any).process.env &&
                    (globalThis as any).process.env.NODE_ENV !== 'production');
                if (isDev) {
                  console.log('[Auto-Matching] New offer detected:', {
                    offerId: d.id,
                    requestId,
                    spotId: data.spotId,
                    status: data.status ?? 'active',
                    offererId: data.offererId,
                    from: (data.from as any).toDate().toISOString(),
                    until: (data.until as any).toDate().toISOString(),
                    createdAt: createdAt.toISOString(),
                    timeSinceCreation: `${Math.round(timeSinceCreation / 1000)}s`,
                    likelyAutoMatch: isLikelyAutoMatch,
                  });
                }
              }
              
              return {
                id: d.id,
                requestId,
                offererId: data.offererId,
                spotId: data.spotId,
                from: (data.from as any).toDate(),
                until: (data.until as any).toDate(),
                status: status as 'active' | 'withdrawn' | 'accepted' | 'standby',
                createdAt,
              } as RequestOffer;
            });
          setOffersByRequestId((prev) => ({...prev, [requestId]: offers}));
        },
        (err: any) => {
          const isPermissionDenied = String(err?.code || '').includes('permission-denied');
          const isLoggedOut = !getAuth(getApp()).currentUser;
          if (isPermissionDenied && isLoggedOut) return;
          console.error('Offers listener error:', requestId, err);
        },
      );
    });

    Object.keys(offerUnsubsRef.current).forEach((requestId) => {
      if (ids.has(requestId)) return;
      try {
        offerUnsubsRef.current[requestId]?.();
      } finally {
        delete offerUnsubsRef.current[requestId];
        offerListenerInitializedRef.current.delete(requestId);
        setOffersByRequestId((prev) => {
          const next = {...prev};
          delete next[requestId];
          return next;
        });
      }
    });
  }, [displayRequests, currentUserId, isAdmin]);

  const sortByStartAsc = (a: ParkingRequest, b: ParkingRequest) =>
    a.from.getTime() - b.from.getTime();

  const activeSections = useMemo(() => {
    const myRequests = displayRequests
      .filter(
        (r) =>
          r.requestedBy === currentUserId &&
          !r.isFulfilled &&
          !r.isArchived &&
          isStillVisibleOpen(r),
      )
      .sort(sortByStartAsc);

    // IMPORTANT: use displayRequests here too, otherwise usernames/phones may briefly show as UID.
    const myOffers = displayRequests
      .filter(
        (r) => {
          if (r.isFulfilled || r.isArchived || r.requestedBy === currentUserId) return false;
          if (!isStillVisibleOpen(r)) return false;
          // Include if I have a full offer (offeredBy matches)
          if (r.offeredBy === currentUserId) return true;
          // Include if I have an active or standby offer in the subcollection
          const myOffersForRequest = offersByRequestId[r.id] || [];
          const hasMyOffer = myOffersForRequest.some(
            (o) => o.offererId === currentUserId && (o.status === 'active' || o.status === 'standby')
          );
          return hasMyOffer;
        }
      )
      .sort(sortByStartAsc);

    // Exclude requests where I already have an offer (to avoid duplicates with "Meine Angebote")
    const requestIdsWithMyOffers = new Set(
      myOffers.map(r => r.id)
    );
    
    const openRequests = displayRequests
      .filter((r) => {
        if (!isOpen(r) || r.requestedBy === currentUserId || r.isArchived) return false;
        if (!isStillVisibleOpen(r)) return false;
        // Exclude if I already have an offer for this request
        if (requestIdsWithMyOffers.has(r.id)) return false;
        return true;
      })
      .sort(sortByStartAsc);

    const sections: RequestSection[] = [];
    if (myOffers.length > 0) {
      sections.push({title: 'Meine Angebote', data: myOffers});
    }
    sections.unshift({title: 'Meine Anfragen', data: myRequests});
    sections.push({title: 'Offene Anfragen', data: openRequests});
    return sections;
  }, [displayRequests, currentUserId, offersByRequestId]);

  const fulfilledSections = useMemo(() => {
    const hasAcceptedOffers = (request: ParkingRequest) => {
      const offers = offersByRequestId[request.id] ?? [];
      return offers.some((o) => o.status === 'accepted');
    };

    const hasAcceptedOfferByMe = (request: ParkingRequest) => {
      const offers = offersByRequestId[request.id] ?? [];
      return offers.some((o) => o.status === 'accepted' && o.offererId === currentUserId);
    };

    const myFulfilledRequests = displayRequests
      .filter(
        (r) =>
          !r.isArchived &&
          isStillVisibleFulfilled(r) &&
          r.requestedBy === currentUserId &&
          (r.isFulfilled || (!r.isFulfilled && hasAcceptedOffers(r))),
      )
      .sort(sortByStartAsc);

    const myFulfilledOffers = displayRequests
      .filter((r) => {
        if (r.isArchived || r.requestedBy === currentUserId || !isStillVisibleFulfilled(r))
          return false;

        const isFullyFulfilledAndMine =
          r.isFulfilled &&
          (r.offeredBy === currentUserId ||
            (Array.isArray(r.fulfilledByUserIds) && r.fulfilledByUserIds.includes(currentUserId)));

        const isPartiallyFulfilledAndMine = !r.isFulfilled && hasAcceptedOfferByMe(r);

        return isFullyFulfilledAndMine || isPartiallyFulfilledAndMine;
      })
      .sort(sortByStartAsc);

    const myArchived = displayRequests
      .filter(
        (r) =>
          r.isArchived &&
          isStillVisibleFulfilled(r) &&
          (r.requestedBy === currentUserId ||
            r.offeredBy === currentUserId ||
            (Array.isArray(r.fulfilledByUserIds) && r.fulfilledByUserIds.includes(currentUserId))),
      )
      .sort(sortByStartAsc);

    const sections: RequestSection[] = [];
    sections.push({title: 'MEINE ANFRAGEN', data: myFulfilledRequests});
    sections.push({title: 'MEINE ANGEBOTE', data: myFulfilledOffers});
    if (myArchived.length > 0) sections.push({title: 'AUFGEHOBEN', data: myArchived});

    if (isAdmin) {
      const myIds = new Set([
        ...myFulfilledRequests.map((r) => r.id),
        ...myFulfilledOffers.map((r) => r.id),
        ...myArchived.map((r) => r.id),
      ]);
      const allFulfilled = displayRequests
        .filter(
          (r) =>
            !myIds.has(r.id) &&
            !r.isArchived &&
            isStillVisibleFulfilled(r) &&
            r.isFulfilled,
        )
        .sort(sortByStartAsc);
      if (allFulfilled.length > 0) {
        sections.push({title: 'ALLE ERFÜLLTEN (ADMIN)', data: allFulfilled});
      }
    }

    return sections;
  }, [displayRequests, currentUserId, offersByRequestId, isAdmin]);

  const displayAvailabilities = useMemo(() => {
    const filtered = availabilities.filter(isStillVisibleAvailability);
    return [...filtered].sort((a, b) => a.from.getTime() - b.from.getTime());
  }, [availabilities]);

  // Subscribe to "offers from this availability" when on Frei tab (for "Bereits angeboten" in each card).
  useEffect(() => {
    if (activeTab !== 'available') {
      Object.values(availabilityOfferUnsubsRef.current).forEach((unsub) => {
        try {
          unsub();
        } catch (_) {}
      });
      availabilityOfferUnsubsRef.current = {};
      setOffersByAvailabilityId({});
      return;
    }
    const list = displayAvailabilities;
    list.forEach((av) => {
      if (availabilityOfferUnsubsRef.current[av.id]) return;
      const unsub = FirestoreService.watchOffersByOffererAndSpot(
        av.userId,
        av.spotId,
        (items) => {
          // Nur Angebote anzeigen, deren Angebots-Zeitfenster in diese Verfügbarkeit fällt.
          // Bei wiederkehrenden: tatsächlich aktuelle Perioden (nächste Vorkommen ab jetzt) nutzen.
          // Stornierte (withdrawn) und standby nicht anzeigen.
          const filtered = items.filter(({offer}) => {
            if (offer.status === 'withdrawn' || offer.status === 'standby') return false;
            const from = offer.from.getTime();
            const until = offer.until.getTime();
            if (av.recurrence) {
              const windows = getNextOccurrenceWindows(av.from, av.until, av.recurrence, 20);
              return windows.some(
                (w) => from < w.until.getTime() && until > w.from.getTime(),
              );
            }
            return from < av.until.getTime() && until > av.from.getTime();
          });
          setOffersByAvailabilityId((prev) => ({...prev, [av.id]: filtered}));
        },
        currentUserData.facilityCode,
      );
      availabilityOfferUnsubsRef.current[av.id] = unsub;
    });
    const currentIds = new Set(list.map((a) => a.id));
    Object.keys(availabilityOfferUnsubsRef.current).forEach((id) => {
      if (currentIds.has(id)) return;
      try {
        availabilityOfferUnsubsRef.current[id]?.();
      } catch (_) {}
      delete availabilityOfferUnsubsRef.current[id];
      setOffersByAvailabilityId((prev) => {
        const next = {...prev};
        delete next[id];
        return next;
      });
    });
    return () => {
      list.forEach((av) => {
        try {
          availabilityOfferUnsubsRef.current[av.id]?.();
        } catch (_) {}
        delete availabilityOfferUnsubsRef.current[av.id];
      });
    };
  }, [activeTab, displayAvailabilities, currentUserData.facilityCode]);

  useEffect(() => {
    if (!focusRequestId) return;
    const sections = activeTab === 'active' ? activeSections : fulfilledSections;
    let sectionIndex = -1;
    let itemIndex = -1;
    sections.some((s, si) => {
      const idx = s.data.findIndex((r) => r.id === focusRequestId);
      if (idx >= 0) {
        sectionIndex = si;
        itemIndex = idx;
        return true;
      }
      return false;
    });
    if (sectionIndex < 0 || itemIndex < 0) return;

    // Defer to ensure SectionList rendered.
    setTimeout(() => {
      try {
        listRef.current?.scrollToLocation({
          sectionIndex,
          itemIndex,
          viewPosition: 0.15,
          animated: true,
        });
      } catch {}
    }, 0);
  }, [focusRequestId, activeTab, activeSections, fulfilledSections]);


  if (showProfile) {
    return (
      <ProfileScreen
        userData={currentUserData}
        onBack={() => setShowProfile(false)}
        onUserDataUpdated={(updatedData) => {
          setCurrentUserData(updatedData);
          // Parkplatz aktualisieren, falls geändert
          if (updatedData.parkingSpots && updatedData.parkingSpots.length > 0) {
            const spotId = updatedData.parkingSpots[0];
            FirestoreService.setUserParkingSpot(currentUserId, spotId);
            setMySpotId(spotId);
          } else {
            // Wenn alle Parkplätze gelöscht wurden, mySpotId zurücksetzen
            setMySpotId(null);
          }
        }}
      />
    );
  }

  if (showCalendar) {
    return (
      <CalendarScreen
        currentUserId={currentUserId}
        facilityCode={currentUserData.facilityCode}
        onBack={() => setShowCalendar(false)}
        onOpenRequest={(requestId, tab) => {
          setShowCalendar(false);
          setActiveTab(tab);
          setFocusRequestId(requestId);
        }}
      />
    );
  }

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#007AFF" />
      </View>
    );
  }

  return (
    <WatermarkBackground style={{backgroundColor: colors.screenBg}}>
      <View style={[styles.container, {backgroundColor: 'transparent'}]}>
      <View style={[styles.header, {paddingTop: 16 + insets.top}]}>
        <View style={styles.headerTitleContainer}>
          <Text style={styles.headerTitle}>Parkplatz-Anfragen</Text>
          {facilityName && (
            <Text style={styles.headerSubtitle}>({facilityName})</Text>
          )}
          <View style={styles.headerChipsRow}>
            {facilityMemberCount !== null && (
              <View style={styles.headerMemberCount}>
                <MaterialCommunityIcons name="account-group" size={14} color="rgba(255,255,255,0.95)" />
                <Text style={styles.headerMemberCountText}>{facilityMemberCount} User</Text>
              </View>
            )}
            {fulfilledStats !== null && (
              <View
                style={styles.headerFulfilledChip}
                accessibilityLabel={`Erfüllt: ${fulfilledStats.total} gesamt, ${fulfilledStats.future} zukünftig, ${fulfilledStats.byUser} von mir`}>
                <MaterialCommunityIcons name="check-circle" size={14} color="rgba(255,255,255,0.95)" />
                <Text style={styles.headerFulfilledChipText}>
                  {fulfilledStats.total + fulfilledStats.future} insgesamt erfüllt · {fulfilledStats.byUser} eigene
                </Text>
              </View>
            )}
          </View>
        </View>
        <View style={styles.headerButtons}>
          {currentUserData.facilityCode ? (
            <TouchableOpacity
              onPress={() => setShowLayoutMap(true)}
              style={styles.headerButton}
              accessibilityLabel="Lageplan anzeigen">
              <MaterialCommunityIcons name="map-outline" size={24} color="#fff" />
            </TouchableOpacity>
          ) : null}
          <TouchableOpacity
            onPress={() => setShowProfile(true)}
            style={styles.headerButton}>
            <MaterialCommunityIcons name="account-circle-outline" size={26} color="#fff" />
          </TouchableOpacity>
        </View>
      </View>

      {mySpots.length > 0 && (
        <View style={[styles.spotBanner, colors.isDark && {backgroundColor: colors.surface2}]}>
          <Text style={[styles.spotText, colors.isDark && {color: colors.text}]} numberOfLines={1}>
            Deine Parkplätze: {mySpots.join(', ')}
          </Text>
          <TouchableOpacity
            accessibilityLabel="Kalender öffnen"
            onPress={() => setShowCalendar(true)}
            style={[
              styles.spotBannerButton,
              {backgroundColor: colors.surface, borderColor: colors.border},
            ]}>
            <MaterialCommunityIcons name="calendar-month-outline" size={20} color={colors.text} />
          </TouchableOpacity>
        </View>
      )}

      <View style={[styles.tabs, {backgroundColor: colors.screenBg}]}>
        <TouchableOpacity
          onPress={() => setActiveTab('active')}
          style={[
            styles.tab,
            {backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.border},
            activeTab === 'active' && {backgroundColor: colors.brand, borderColor: colors.brand},
          ]}>
          <Text style={[styles.tabText, {color: colors.text}, activeTab === 'active' && styles.tabTextActive]}>
            Offen
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => setActiveTab('fulfilled')}
          style={[
            styles.tab,
            {backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.border},
            activeTab === 'fulfilled' && {backgroundColor: colors.brand, borderColor: colors.brand},
          ]}>
          <Text
            style={[
              styles.tabText,
              {color: colors.text},
              activeTab === 'fulfilled' && styles.tabTextActive,
            ]}>
            Erfüllt
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => setActiveTab('available')}
          style={[
            styles.tab,
            {backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.border},
            activeTab === 'available' && {backgroundColor: colors.brand, borderColor: colors.brand},
          ]}>
          <Text
            style={[
              styles.tabText,
              {color: colors.text},
              activeTab === 'available' && styles.tabTextActive,
            ]}>
            Frei
          </Text>
        </TouchableOpacity>
      </View>

      {activeTab === 'available' ? (
        <ScrollView
          style={[styles.listScroll, {backgroundColor: colors.screenBg}]}
          contentContainerStyle={[
            styles.list,
            {backgroundColor: colors.screenBg},
            displayAvailabilities.length === 0 && styles.listEmpty,
          ]}
          refreshControl={
            <RefreshControl
              refreshing={loading}
              onRefresh={async () => {
                setLoading(true);
                const newAvailabilities = await ParkingAvailabilityService.getUserAvailabilities(
                  currentUserId,
                  currentUserData.facilityCode,
                );
                setAvailabilities(newAvailabilities);
                setLoading(false);
              }}
            />
          }>
          {displayAvailabilities.length === 0 ? (
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyIcon}>📅</Text>
              <Text style={[styles.emptyTitle, {color: colors.text}]}>Keine Verfügbarkeiten</Text>
              <Text style={[styles.emptySubtitle, {color: colors.subtext}]}>
                Erstelle eine Verfügbarkeit, um anderen zu zeigen, wann dein Parkplatz frei ist
              </Text>
            </View>
          ) : (
            <>
              <Text style={[styles.sectionHeader, {color: colors.subtext}]}>MEINE VERFÜGBARKEITEN</Text>
              {displayAvailabilities.map((availability) => (
                <AvailabilityCard
                  key={availability.id}
                  availability={availability}
                  currentUserId={currentUserId}
                  onEdit={(av) => {
                    setEditingAvailability(av);
                    setShowAvailabilityModal(true);
                  }}
                  onDelete={handleDeleteAvailability}
                  onDeactivate={async (av) => {
                    await handleUpdateAvailability(av.id, {isActive: false});
                  }}
                  onActivate={async (av) => {
                    await handleUpdateAvailability(av.id, {isActive: true});
                  }}
                  publicUsers={publicUsers}
                  offersFromAvailability={offersByAvailabilityId[availability.id] ?? []}
                />
              ))}
            </>
          )}
        </ScrollView>
      ) : (
        <SectionList
          style={[styles.listScroll, {backgroundColor: colors.screenBg}]}
          sections={activeTab === 'active' ? activeSections : fulfilledSections}
          keyExtractor={(item) => item.id}
          ref={(r) => {
            listRef.current = r;
          }}
          renderItem={({item, section}) => (
            <RequestCard
              request={item}
              currentUserId={currentUserId}
              mySpots={mySpots}
              onOffer={offerParkingSpot}
              onFulfill={fulfillRequest}
              onCancelOffer={cancelOffer}
              onWithdraw={withdrawRequest}
              highlight={!!focusRequestId && item.id === focusRequestId}
              offers={offersByRequestId[item.id] ?? []}
              publicUsers={publicUsers}
              focusOfferId={focusOfferId}
              isOffering={offeringRequestId === item.id}
              contextTab={activeTab}
              adminOverview={section.title === 'ALLE ERFÜLLTEN (ADMIN)'}
              onAcceptOffer={async (offer) => {
                try {
                  await ParkingRequestService.acceptOffer(item.id, offer);
                  showAlert('Erfolg', 'Angebot angenommen');

                  if (Platform.OS === 'web') {
                    const [newRequests, newOffers] = await Promise.all([
                      reloadRequests(),
                      ParkingRequestService.getOffersForRequest(item.id),
                    ]);
                    setRequests(newRequests);
                    setOffersByRequestId((prev) => ({...prev, [item.id]: newOffers}));
                  } else {
                    // Best-effort: poll the request doc briefly to reflect fulfillment faster on slow server roundtrips.
                    const timeoutMs = 15000;
                    const intervalMs = 750;
                    const start = Date.now();
                    while (Date.now() - start < timeoutMs) {
                      const fresh = await FirestoreService.getParkingRequestById(item.id).catch(() => null);
                      if (fresh?.isFulfilled) {
                        setRequests((prev) => prev.map((r) => (r.id === fresh.id ? {...r, ...fresh} : r)));
                        break;
                      }
                      await new Promise<void>((resolve) => setTimeout(() => resolve(), intervalMs));
                    }
                  }
                } catch (error: any) {
                  console.error('Fehler beim Annehmen des Angebots:', error);
                  const errorMessage =
                    error?.message || 'Das Angebot konnte nicht angenommen werden. Es wurde möglicherweise bereits storniert.';
                  showAlert('Fehler', errorMessage);
                }
              }}
              onArchiveFulfilled={archiveFulfilledRequest}
              onOpenComments={(requestId) => {
                setCommentsRequestId(requestId);
                setShowComments(true);
              }}
            />
          )}
          renderSectionHeader={({section}) =>
            section.data.length > 0 ? (
              <Text style={[styles.sectionHeader, {color: colors.subtext}]}>{section.title}</Text>
            ) : null
          }
          stickySectionHeadersEnabled={false}
          contentContainerStyle={[
            styles.list,
            {backgroundColor: colors.screenBg},
            (activeTab === 'active'
              ? activeSections.every((s) => s.data.length === 0)
              : fulfilledSections.every((s) => s.data.length === 0)) && styles.listEmpty,
          ]}
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyIcon}>✓</Text>
              <Text style={[styles.emptyTitle, {color: colors.text}]}>Keine Anfragen</Text>
              <Text style={[styles.emptySubtitle, {color: colors.subtext}]}>
                {activeTab === 'fulfilled'
                  ? 'Noch keine erfüllten Anfragen'
                  : 'Keine offenen Anfragen'}
              </Text>
            </View>
          }
          refreshControl={
            <RefreshControl
              refreshing={loading}
              onRefresh={async () => {
                setLoading(true);
                const newRequests = await reloadRequests();
                setRequests(newRequests);
                if (currentUserData.facilityCode) {
                  const stats = await FirestoreService.getFacilityFulfilledStats(currentUserData.facilityCode);
                  if (stats) setFulfilledStats(stats);
                }
                setLoading(false);
              }}
            />
          }
        />
      )}

      <TouchableOpacity
        style={[
          styles.fab,
          Platform.OS === 'web'
            ? fabWebViewportStyle
            : {bottom: 16 + insets.bottom},
        ]}
        onPress={() => {
          if (activeTab === 'available') {
            setEditingAvailability(null);
            setShowAvailabilityModal(true);
          } else {
            setShowRequestModal(true);
          }
        }}>
        <Text style={styles.fabText}>+</Text>
      </TouchableOpacity>

      <NewRequestModal
        visible={showRequestModal}
        onClose={() => setShowRequestModal(false)}
        onSubmit={handleCreateRequest}
      />

      <NewAvailabilityModal
        visible={showAvailabilityModal}
        onClose={() => {
          setShowAvailabilityModal(false);
          setEditingAvailability(null);
        }}
        onSubmit={editingAvailability
          ? async (spotId, from, until, recurrence, autoOffer) => {
              await handleUpdateAvailability(editingAvailability.id, {
                spotId,
                from,
                until,
                recurrence,
                autoOffer,
              });
              setShowAvailabilityModal(false);
              setEditingAvailability(null);
            }
          : handleCreateAvailability}
        availableSpots={mySpots}
        editingAvailability={editingAvailability}
      />

      <CommentsModal
        visible={showComments}
        requestId={commentsRequestId}
        currentUserId={currentUserId}
        publicUsers={publicUsers}
        onClose={() => {
          setShowComments(false);
          setCommentsRequestId(null);
        }}
      />

      <OfferModal
        visible={showOfferModal}
        request={offerModalRequest}
        mySpots={mySpots}
        currentUserId={currentUserId}
        onClose={() => {
          setShowOfferModal(false);
          setOfferModalRequest(null);
          setOfferingRequestId(null);
        }}
        onSubmit={async (spotId, from, until, comment) => {
          if (!offerModalRequest) return;
          const ok = await ParkingRequestService.offerParkingSpot(
            offerModalRequest.id,
            currentUserId,
            currentUserData.username,
            currentUserData.phone,
            currentUserData.facilityCode,
            spotId,
            from,
            until,
          );
          if (!ok) {
            showAlert('Fehler', 'Angebot konnte nicht erstellt werden');
            setOfferingRequestId(null);
            return;
          }
          // Add comment to chat if provided
          if (comment && comment.trim()) {
            try {
              await ParkingRequestService.addComment(offerModalRequest.id, currentUserId, comment.trim());
            } catch (error) {
              console.error('Error adding comment:', error);
              // Don't show error to user, offer was created successfully
            }
          }
          const requestId = offerModalRequest.id;
          setOfferingRequestId(null);
          setShowOfferModal(false);
          setOfferModalRequest(null);
          if (Platform.OS === 'web') {
            const [newRequests, newOffers] = await Promise.all([
              reloadRequests(),
              ParkingRequestService.getOffersForRequest(requestId),
            ]);
            setRequests(newRequests);
            setOffersByRequestId((prev) => ({...prev, [requestId]: newOffers}));
          }
        }}
      />

      <Modal
        visible={showLayoutMap}
        animationType="slide"
        presentationStyle="fullScreen"
        onRequestClose={() => setShowLayoutMap(false)}>
        <FacilityLayoutViewer
          facilityCode={currentUserData.facilityCode}
          highlightSpotIds={mySpots}
          onClose={() => setShowLayoutMap(false)}
        />
      </Modal>
      </View>
    </WatermarkBackground>
  );
};


/** Web only: pin FAB to browser viewport (react-native-web supports position: fixed). */
const fabWebViewportStyle: ViewStyle =
  Platform.OS === 'web'
    ? ({position: 'fixed', bottom: 24, zIndex: 1000} as unknown as ViewStyle)
    : {};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  listScroll: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 8,
    backgroundColor: '#007AFF',
  },
  headerTitleContainer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    flex: 1,
    flexWrap: 'wrap',
    columnGap: 8,
    rowGap: 3,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#fff',
    marginRight: 0,
  },
  headerSubtitle: {
    fontSize: 16,
    fontWeight: 'normal',
    color: '#fff',
    opacity: 0.9,
  },
  headerChipsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    marginTop: 3,
    gap: 8,
    flexWrap: 'wrap',
  },
  headerMemberCount: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 8,
    backgroundColor: 'rgba(255,255,255,0.2)',
    gap: 4,
  },
  headerMemberCountText: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.95)',
  },
  headerFulfilledChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 8,
    backgroundColor: 'rgba(255,255,255,0.2)',
    gap: 4,
  },
  headerFulfilledChipText: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.95)',
  },
  headerButtons: {
    flexDirection: 'row',
    alignSelf: 'flex-start',
  },
  headerButton: {
    paddingRight: 6,
  },
  spotBanner: {
    backgroundColor: '#E3F2FD',
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  spotText: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#1976D2',
    flex: 1,
  },
  spotBannerButton: {
    width: 34,
    height: 34,
    borderRadius: 999,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
    borderColor: 'rgba(0,0,0,0.08)',
    borderWidth: 1,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  emptyIcon: {
    fontSize: 64,
    color: '#ccc',
    marginBottom: 16,
  },
  emptyTitle: {
    fontSize: 18,
    color: '#666',
    marginBottom: 8,
  },
  emptySubtitle: {
    fontSize: 14,
    color: '#999',
  },
  list: {
    padding: 16,
  },
  listEmpty: {
    flexGrow: 1,
    justifyContent: 'center',
  },
  tabs: {
    flexDirection: 'row',
    backgroundColor: '#fff',
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 8,
    gap: 8,
  },
  tab: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: '#f0f0f0',
    alignItems: 'center',
  },
  tabActive: {
    backgroundColor: '#007AFF',
  },
  tabText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
  },
  tabTextActive: {
    color: '#fff',
  },
  sectionHeader: {
    marginTop: 12,
    marginBottom: 8,
    fontSize: 13,
    fontWeight: '700',
    color: '#666',
    textTransform: 'uppercase',
  },
  fab: {
    position: 'absolute',
    right: 16,
    bottom: 16,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#007AFF',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: {width: 0, height: 4},
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 8,
  },
  fabText: {
    color: '#fff',
    fontSize: 24,
    fontWeight: 'bold',
  },
});

export default ParkingRequestsScreen;

