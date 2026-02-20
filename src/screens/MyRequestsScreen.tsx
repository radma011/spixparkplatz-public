import React, {useEffect, useMemo, useRef, useState} from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  useColorScheme,
} from 'react-native';
import {confirmAlert, showAlert} from '../utils/alertUtils';
import {getApp} from '@react-native-firebase/app';
import {getAuth} from '@react-native-firebase/auth';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import MaterialCommunityIcons from 'react-native-vector-icons/MaterialCommunityIcons';
import FirestoreService from '../services/FirestoreService';
import {ParkingRequest, isOpen, hasOffer} from '../models/ParkingRequest';
import MyRequestCard from '../components/MyRequestCard';
import ParkingRequestService from '../services/ParkingRequestService';
import {getColors} from '../theme/colors';
import WatermarkBackground from '../components/WatermarkBackground';
import {RequestOffer} from '../models/RequestOffer';

interface Props {
  currentUserId: string;
  facilityCode: string;
  onBack: () => void;
}

const MyRequestsScreen: React.FC<Props> = ({currentUserId, facilityCode, onBack}) => {
  const insets = useSafeAreaInsets();
  const colors = getColors(useColorScheme());
  const [requests, setRequests] = useState<ParkingRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [publicUsers, setPublicUsers] = useState<Record<string, {username?: string; phone?: string}>>(
    {},
  );
  const publicUserUnsubsRef = useRef<Record<string, () => void>>({});
  const [offersByRequestId, setOffersByRequestId] = useState<Record<string, RequestOffer[]>>({});
  const offerUnsubsRef = useRef<Record<string, () => void>>({});

  const handleDeleteRequest = (requestId: string) => {
    confirmAlert(
      'Anfrage löschen',
      'Möchtest du diese Anfrage wirklich löschen?',
      async () => {
        try {
          await ParkingRequestService.deleteRequest(requestId);
        } catch (e) {
          console.error('Fehler beim Löschen:', e);
          showAlert('Fehler', 'Anfrage konnte nicht gelöscht werden');
        }
      },
      undefined,
      'Löschen',
      'Abbrechen',
    );
  };

  useEffect(() => {
    const unsubscribe = FirestoreService.watchMyRequests(currentUserId, facilityCode).onSnapshot(
      (snapshot) => {
        const myRequests = snapshot.docs
          .map((doc) => FirestoreService.parkingRequestFromDocSnap(doc as any))
          .filter((r) => r.facilityCode === facilityCode) // Filter by facilityCode client-side
          .sort((a, b) => a.from.getTime() - b.from.getTime());
        setRequests(myRequests);
        setLoading(false);
      },
      (error) => {
        const isPermissionDenied = String((error as any)?.code || '').includes('permission-denied');
        const isLoggedOut = !getAuth(getApp()).currentUser;
        if (isPermissionDenied && isLoggedOut) {
          setLoading(false);
          return;
        }
        console.error('Fehler:', error);
        setLoading(false);
      },
    );

    return () => unsubscribe();
  }, [currentUserId, facilityCode]);

  useEffect(() => {
    const ids = new Set<string>();
    requests.forEach((r) => {
      if (r.offeredBy) ids.add(r.offeredBy);
    });
    ids.forEach((uid) => {
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
  }, [requests]);

  // Watch offers for requests with offers or open requests (to show coverage)
  useEffect(() => {
    const requestIds = new Set<string>();
    requests.forEach((r) => {
      // Load offers for all requests (to calculate coverage)
      // This includes requests with offers, fulfilled requests, and open requests
      if (hasOffer(r) || r.isFulfilled || isOpen(r)) {
        requestIds.add(r.id);
      }
    });

    // Subscribe to new requests
    requestIds.forEach((requestId) => {
      if (offerUnsubsRef.current[requestId]) return;
      offerUnsubsRef.current[requestId] = ParkingRequestService.watchOffersForRequest(requestId).onSnapshot(
        (snap: any) => {
          const previousOffers = offersByRequestId[requestId] || [];
          const previousOfferIds = new Set(previousOffers.map((o) => o.id));
          
          const offers: RequestOffer[] = (snap?.docs ?? []).map((d: any) => {
            const data = d.data();
            const createdAt = data.createdAt ? (data.createdAt as any).toDate() : undefined;
            
            // Check if this is a new offer (not in previous offers)
            const isNewOffer = !previousOfferIds.has(d.id);
            if (isNewOffer && createdAt) {
              // Check if it was created very recently (within 10 seconds) - likely auto-match
              const now = new Date();
              const timeSinceCreation = now.getTime() - createdAt.getTime();
              const isLikelyAutoMatch = timeSinceCreation < 10000; // 10 seconds
              
              // Only log in development mode
              if (process.env.NODE_ENV !== 'production') {
                console.log('[Auto-Matching] New offer detected on my request:', {
                  offerId: d.id,
                  requestId,
                  spotId: data.spotId,
                  offererId: data.offererId,
                  from: data.from ? (data.from as any).toDate().toISOString() : 'unknown',
                  until: data.until ? (data.until as any).toDate().toISOString() : 'unknown',
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
              from: data.from ? (data.from as any).toDate() : new Date(),
              until: data.until ? (data.until as any).toDate() : new Date(),
              status: (data.status as 'active' | 'accepted' | 'withdrawn') || 'active',
              offererUsername: data.offererUsername,
            } as RequestOffer;
          });
          setOffersByRequestId((prev) => ({...prev, [requestId]: offers}));
        },
      );
    });

    // Unsubscribe from removed requests
    Object.keys(offerUnsubsRef.current).forEach((requestId) => {
      if (requestIds.has(requestId)) return;
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
  }, [requests]);

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

  const displayRequests = useMemo(() => {
    return requests.map((r) => {
      const offeredByProfile = r.offeredBy ? publicUsers[r.offeredBy] : undefined;
      return {
        ...r,
        offeredByUsername: offeredByProfile?.username ?? r.offeredByUsername,
        offeredByPhone: offeredByProfile?.phone ?? r.offeredByPhone,
      } as ParkingRequest;
    });
  }, [requests, publicUsers]);


  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#007AFF" />
      </View>
    );
  }

  const openRequests = displayRequests.filter((r) => isOpen(r));
  const hasOfferRequests = displayRequests.filter((r) => hasOffer(r));
  const fulfilledRequests = displayRequests.filter((r) => r.isFulfilled);

  return (
    <WatermarkBackground style={{backgroundColor: colors.background}}>
      <View style={[styles.container, {backgroundColor: 'transparent'}]}>
      <View style={[styles.header, {paddingTop: 16 + insets.top, backgroundColor: colors.brand}]}>
        <TouchableOpacity onPress={onBack} style={styles.backButton}>
          <Text style={styles.backButtonText}>← Zurück</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Meine Anfragen</Text>
        <View style={styles.backButton} />
      </View>

      <FlatList
        data={[
          ...openRequests.map((r) => ({...r, section: 'open'})),
          ...hasOfferRequests.map((r) => ({...r, section: 'offer'})),
          ...fulfilledRequests.map((r) => ({...r, section: 'fulfilled'})),
        ]}
        keyExtractor={(item) => item.id}
        renderItem={({item}) => (
          <MyRequestCard 
            request={item} 
            onDelete={handleDeleteRequest}
            offers={offersByRequestId[item.id] ?? []}
            publicUsers={publicUsers}
            currentUserId={currentUserId}
            onAcceptOffer={async (offer) => {
              try {
                await ParkingRequestService.acceptOffer(item.id, offer);
                showAlert('Erfolg', 'Angebot angenommen');
              } catch (error: any) {
                console.error('Fehler beim Annehmen des Angebots:', error);
                const errorMessage = error?.message || 'Unbekannter Fehler';
                showAlert('Fehler', errorMessage);
              }
            }}
          />
        )}
        contentContainerStyle={styles.list}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <MaterialCommunityIcons name="information-outline" size={40} color={colors.subtext} />
            <Text style={[styles.emptyTitle, {color: colors.subtext}]}>Noch keine Anfragen</Text>
            <Text style={[styles.emptySubtitle, {color: colors.subtext}]}>Erstelle deine erste Anfrage</Text>
          </View>
        }
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
  backButton: {
    width: 80,
  },
  backButtonText: {
    color: '#fff',
    fontSize: 16,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#fff',
  },
  list: {
    padding: 16,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  emptyIcon: {
    fontSize: 64,
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
});

export default MyRequestsScreen;

