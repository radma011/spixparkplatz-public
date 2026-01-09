import React, {useEffect, useMemo, useRef, useState} from 'react';
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
} from 'react-native';
import {getApp} from '@react-native-firebase/app';
import {getAuth} from '@react-native-firebase/auth';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import MaterialCommunityIcons from 'react-native-vector-icons/MaterialCommunityIcons';
import ParkingRequestService from '../services/ParkingRequestService';
import FirestoreService from '../services/FirestoreService';
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
import ParkingAvailabilityService from '../services/ParkingAvailabilityService';
import {ParkingAvailability, RecurrenceRule} from '../models/ParkingAvailability';
import AvailabilityCard from '../components/AvailabilityCard';
import NewAvailabilityModal from '../components/NewAvailabilityModal';

interface Props {
  currentUserId: string;
  userData: UserData;
  externalFocus?: {requestId: string; tab?: 'active' | 'fulfilled' | 'available'; offerId?: string};
}

type RequestSection = {title: string; data: ParkingRequest[]};

const ParkingRequestsScreen: React.FC<Props> = ({currentUserId, userData, externalFocus}) => {
  const insets = useSafeAreaInsets();
  const colors = getColors(useColorScheme());
  const [requests, setRequests] = useState<ParkingRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [mySpotId, setMySpotId] = useState<string | null>(null);
  const [showRequestModal, setShowRequestModal] = useState(false);
  const [showProfile, setShowProfile] = useState(false);
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
  const listRef = useRef<SectionList<ParkingRequest, RequestSection> | null>(null);
  const [offerModalRequest, setOfferModalRequest] = useState<ParkingRequest | null>(null);
  const [showOfferModal, setShowOfferModal] = useState(false);
  const [showComments, setShowComments] = useState(false);
  const [commentsRequestId, setCommentsRequestId] = useState<string | null>(null);
  const [facilityName, setFacilityName] = useState<string | null>(null);
  const [offeringRequestId, setOfferingRequestId] = useState<string | null>(null);
  const requestsUnsubscribeRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    initialize();
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
          .filter((r) => {
            // Filter by facilityCode client-side (index-free query)
            if (r.facilityCode !== currentUserData.facilityCode) {
              return false;
            }
            
            const isInvolved =
              r.requestedBy === currentUserId ||
              r.offeredBy === currentUserId ||
              (Array.isArray(r.fulfilledByUserIds) && r.fulfilledByUserIds.includes(currentUserId));

            // Archived requests stay visible for involved users, but will be shown greyed-out.
            if (r.isArchived) return isInvolved;
            // Zeige offene Anfragen
            if (isOpen(r)) {
              return true;
            }
            // Zeige erfüllte Anfragen, wenn der User beteiligt ist
            if (r.isFulfilled) {
              return isInvolved;
            }
            // Zeige Anfragen mit Angebot, wenn der User beteiligt ist
            // (Requester, Anbieter des vollständigen Angebots, oder User mit Standby-Angebot)
            // Load all non-fulfilled requests with offers - we'll check for standby offers in the frontend
            if (r.offeredSpotId && !r.isFulfilled) {
              // Always load requests with offers (not fulfilled) so we can check for standby offers
              return true;
            }
            return false;
          });
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
  }, [currentUserId, currentUserData.facilityCode]);

  // Load facility name
  useEffect(() => {
    const loadFacilityName = async () => {
      if (currentUserData.facilityCode) {
        try {
          const facilityInfo = await FirestoreService.getFacilityInfo(currentUserData.facilityCode);
          if (facilityInfo && facilityInfo.name) {
            setFacilityName(facilityInfo.name);
          }
        } catch (e) {
          console.error('Error loading facility name:', e);
        }
      }
    };
    loadFacilityName();
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

  // Keep a live cache of public profiles for all userIds visible in requests + offers.
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
  }, [requests, offersByRequestId]);

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
    try {
      // Ensure current user's public profile exists for other users (and for immediate UI resolution)
      await FirestoreService.upsertPublicUserData(currentUserId, {
        username: currentUserData.username,
        phone: currentUserData.phone,
      });

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
    } catch (error) {
      console.error('Initialisierungsfehler:', error);
    }
  };

  // Logout moved to ProfileScreen

  const handleCreateRequest = async (from: Date, until: Date, comment?: string) => {
    await ParkingRequestService.createRequest(
      currentUserId,
      currentUserData.username,
      currentUserData.phone,
      currentUserData.facilityCode,
      from,
      until,
      comment,
    );
    Alert.alert('Erfolg', 'Anfrage erstellt!');
  };

  const offerParkingSpot = async (request: ParkingRequest) => {
    if (mySpots.length === 0) {
      Alert.alert('Fehler', 'Du hast keinen Parkplatz zugewiesen');
      return;
    }
    setOfferingRequestId(request.id);
    setOfferModalRequest(request);
    setShowOfferModal(true);
  };

  const fulfillRequest = async (request: ParkingRequest) => {
    try {
      await ParkingRequestService.fulfillRequest(request.id);
      Alert.alert('Erfolg', 'Anfrage als erfüllt markiert');
    } catch (error) {
      Alert.alert('Fehler', 'Ein Fehler ist aufgetreten');
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
      await ParkingAvailabilityService.createAvailability(
        currentUserId,
        currentUserData.facilityCode,
        spotId,
        from,
        until,
        recurrence || undefined,
        currentUserData.username,
        currentUserData.phone,
        autoOffer,
      );
      Alert.alert('Erfolg', 'Verfügbarkeit erstellt!');
    } catch (error: any) {
      console.error('Fehler beim Erstellen der Verfügbarkeit:', error);
      Alert.alert('Fehler', error?.message || 'Verfügbarkeit konnte nicht erstellt werden');
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
      Alert.alert('Erfolg', 'Verfügbarkeit aktualisiert!');
    } catch (error: any) {
      console.error('Fehler beim Aktualisieren der Verfügbarkeit:', error);
      Alert.alert('Fehler', error?.message || 'Verfügbarkeit konnte nicht aktualisiert werden');
    }
  };

  const handleDeleteAvailability = async (availability: ParkingAvailability) => {
    Alert.alert(
      'Verfügbarkeit löschen',
      'Möchtest du diese Verfügbarkeit wirklich löschen?',
      [
        {text: 'Abbrechen', style: 'cancel'},
        {
          text: 'Löschen',
          style: 'destructive',
          onPress: async () => {
            try {
              await ParkingAvailabilityService.deleteAvailability(availability.id);
              Alert.alert('Erfolg', 'Verfügbarkeit gelöscht!');
            } catch (error: any) {
              console.error('Fehler beim Löschen der Verfügbarkeit:', error);
              Alert.alert('Fehler', error?.message || 'Verfügbarkeit konnte nicht gelöscht werden');
            }
          },
        },
      ],
    );
  };

  const archiveFulfilledRequest = (request: ParkingRequest) => {
    Alert.alert(
      'Erfüllung aufheben',
      'Möchtest du diese erfüllte Anfrage wirklich aufheben? Sie wird archiviert (nicht gelöscht).',
      [
        {text: 'Abbrechen', style: 'cancel'},
        {
          text: 'Aufheben',
          style: 'destructive',
          onPress: async () => {
            try {
              await ParkingRequestService.archiveFulfilledRequest(currentUserId, request);
              Alert.alert('Erfolg', 'Anfrage wurde archiviert');
            } catch (e) {
              console.error('Archive failed:', e);
              Alert.alert('Fehler', 'Anfrage konnte nicht archiviert werden');
            }
          },
        },
      ],
    );
  };

  const cancelOffer = (request: ParkingRequest) => {
    Alert.alert(
      'Angebot stornieren',
      'Möchtest du dein Angebot wirklich zurückziehen?',
      [
        {text: 'Abbrechen', style: 'cancel'},
        {
          text: 'Stornieren',
          style: 'destructive',
          onPress: async () => {
            try {
              // Der Anbieter ist der currentUserId (weil isMyOffer nur true ist, wenn offeredBy === currentUserId)
              await ParkingRequestService.cancelOffer(request.id, currentUserId);
              Alert.alert('Erfolg', 'Angebot wurde storniert');
            } catch (e) {
              console.error('Fehler beim Stornieren:', e);
              Alert.alert('Fehler', 'Angebot konnte nicht storniert werden');
            }
          },
        },
      ],
    );
  };

  const withdrawRequest = (request: ParkingRequest) => {
    Alert.alert(
      'Anfrage zurückziehen',
      'Möchtest du deine Anfrage wirklich zurückziehen?',
      [
        {text: 'Abbrechen', style: 'cancel'},
        {
          text: 'Zurückziehen',
          style: 'destructive',
          onPress: async () => {
            try {
              await ParkingRequestService.deleteRequest(request.id);
              Alert.alert('Erfolg', 'Anfrage wurde zurückgezogen');
            } catch (e) {
              console.error('Fehler beim Zurückziehen:', e);
              Alert.alert('Fehler', 'Anfrage konnte nicht zurückgezogen werden');
            }
          },
        },
      ],
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
    const ids = new Set<string>();
    displayRequests.forEach((r) => {
      const iAmRequester = r.requestedBy === currentUserId;
      const iAmFulfilledOfferer =
        r.isFulfilled && Array.isArray(r.fulfilledByUserIds) && r.fulfilledByUserIds.includes(currentUserId);
      const iAmLegacyOfferer = r.offeredBy === currentUserId;
      const isOpenToCover = !r.isFulfilled && !r.offeredSpotId; // include open requests so everyone can see coverage
      const hasOfferAndIAmRequester = !r.isFulfilled && r.offeredSpotId && iAmRequester; // Load offers for requester even if request has an offer
      const hasOfferAndNotFulfilled = !r.isFulfilled && r.offeredSpotId; // Load offers for all requests with offers (to check for standby)
      if (iAmRequester || iAmFulfilledOfferer || iAmLegacyOfferer || isOpenToCover || hasOfferAndIAmRequester || hasOfferAndNotFulfilled) ids.add(r.id);
    });

    ids.forEach((requestId) => {
      if (offerUnsubsRef.current[requestId]) return;
      offerUnsubsRef.current[requestId] = ParkingRequestService.watchOffersForRequest(requestId).onSnapshot(
        (snap: any) => {
          const offers: RequestOffer[] = (snap?.docs ?? [])
            .map((d: any) => {
              const data = d.data();
              const status = data.status ?? 'active';
              return {
                id: d.id,
                requestId,
                offererId: data.offererId,
                spotId: data.spotId,
                from: (data.from as any).toDate(),
                until: (data.until as any).toDate(),
                status: status as 'active' | 'withdrawn' | 'accepted' | 'standby',
                createdAt: data.createdAt ? (data.createdAt as any).toDate() : undefined,
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
        setOffersByRequestId((prev) => {
          const next = {...prev};
          delete next[requestId];
          return next;
        });
      }
    });
  }, [displayRequests, currentUserId]);

  const sortByStartAsc = (a: ParkingRequest, b: ParkingRequest) =>
    a.from.getTime() - b.from.getTime();

  const activeSections = useMemo(() => {
    const myRequests = displayRequests
      .filter((r) => r.requestedBy === currentUserId && !r.isFulfilled && !r.isArchived)
      .sort(sortByStartAsc);

    // IMPORTANT: use displayRequests here too, otherwise usernames/phones may briefly show as UID.
    const myOffers = displayRequests
      .filter(
        (r) => {
          if (r.isFulfilled || r.isArchived || r.requestedBy === currentUserId) return false;
          
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
    const sortByUntilDesc = (a: ParkingRequest, b: ParkingRequest) =>
      b.until.getTime() - a.until.getTime();

    const myFulfilledRequests = displayRequests
      .filter((r) => r.isFulfilled && !r.isArchived && r.requestedBy === currentUserId)
      .sort(sortByUntilDesc);

    const myFulfilledOffers = displayRequests
      .filter(
        (r) =>
          r.isFulfilled &&
          !r.isArchived &&
          r.requestedBy !== currentUserId &&
          (r.offeredBy === currentUserId ||
            (Array.isArray(r.fulfilledByUserIds) && r.fulfilledByUserIds.includes(currentUserId))),
      )
      .sort(sortByUntilDesc);

    const myArchived = displayRequests
      .filter(
        (r) =>
          r.isArchived &&
          (r.requestedBy === currentUserId ||
            r.offeredBy === currentUserId ||
            (Array.isArray(r.fulfilledByUserIds) && r.fulfilledByUserIds.includes(currentUserId))),
      )
      .sort(sortByUntilDesc);

    const sections: RequestSection[] = [];
    sections.push({title: 'MEINE ANFRAGEN', data: myFulfilledRequests});
    sections.push({title: 'MEINE ANGEBOTE', data: myFulfilledOffers});
    if (myArchived.length > 0) sections.push({title: 'AUFGEHOBEN', data: myArchived});
    return sections;
  }, [displayRequests, currentUserId]);

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
        </View>
        <View style={styles.headerButtons}>
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
          contentContainerStyle={[
            styles.list,
            availabilities.length === 0 && styles.listEmpty,
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
          {availabilities.length === 0 ? (
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyIcon}>📅</Text>
              <Text style={styles.emptyTitle}>Keine Verfügbarkeiten</Text>
              <Text style={styles.emptySubtitle}>
                Erstelle eine Verfügbarkeit, um anderen zu zeigen, wann dein Parkplatz frei ist
              </Text>
            </View>
          ) : (
            <>
              <Text style={[styles.sectionHeader, {color: colors.subtext}]}>MEINE VERFÜGBARKEITEN</Text>
              {availabilities.map((availability) => (
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
                />
              ))}
            </>
          )}
        </ScrollView>
      ) : (
        <SectionList
          sections={activeTab === 'active' ? activeSections : fulfilledSections}
          keyExtractor={(item) => item.id}
          ref={(r) => {
            listRef.current = r;
          }}
          renderItem={({item}) => (
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
              onAcceptOffer={async (offer) => {
                try {
                  await ParkingRequestService.acceptOffer(item.id, offer);
                  Alert.alert('Erfolg', 'Angebot angenommen');

                  // Best-effort: poll the request doc briefly to reflect fulfillment faster on slow server roundtrips.
                  // This avoids the UI waiting solely for the stream update (which depends on Cloud Function latency).
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
                } catch (error: any) {
                  console.error('Fehler beim Annehmen des Angebots:', error);
                  const errorMessage =
                    error?.message || 'Das Angebot konnte nicht angenommen werden. Es wurde möglicherweise bereits storniert.';
                  Alert.alert('Fehler', errorMessage);
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
            (activeTab === 'active'
              ? activeSections.every((s) => s.data.length === 0)
              : fulfilledSections.every((s) => s.data.length === 0)) && styles.listEmpty,
          ]}
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyIcon}>✓</Text>
              <Text style={styles.emptyTitle}>Keine Anfragen</Text>
              <Text style={styles.emptySubtitle}>
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
                const newRequests = await FirestoreService.getRelevantRequests(currentUserId, currentUserData.facilityCode);
                setRequests(newRequests);
                setLoading(false);
              }}
            />
          }
        />
      )}

      <TouchableOpacity
        style={styles.fab}
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
            Alert.alert('Fehler', 'Angebot konnte nicht erstellt werden');
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
          setOfferingRequestId(null);
          setShowOfferModal(false);
          setOfferModalRequest(null);
        }}
      />
      </View>
    </WatermarkBackground>
  );
};


const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
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
    padding: 16,
    backgroundColor: '#007AFF',
  },
  headerTitleContainer: {
    flexDirection: 'row',
    alignItems: 'baseline',
    flex: 1,
    flexWrap: 'wrap',
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#fff',
    marginRight: 4,
  },
  headerSubtitle: {
    fontSize: 16,
    fontWeight: 'normal',
    color: '#fff',
    opacity: 0.9,
  },
  headerButtons: {
    flexDirection: 'row',
    gap: 16,
  },
  headerButton: {
    padding: 6,
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

