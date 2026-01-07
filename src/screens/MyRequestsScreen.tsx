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

  const handleDeleteRequest = (requestId: string) => {
    Alert.alert(
      'Anfrage löschen',
      'Möchtest du diese Anfrage wirklich löschen?',
      [
        {text: 'Abbrechen', style: 'cancel'},
        {
          text: 'Löschen',
          style: 'destructive',
          onPress: async () => {
            try {
              await ParkingRequestService.deleteRequest(requestId);
            } catch (e) {
              console.error('Fehler beim Löschen:', e);
              Alert.alert('Fehler', 'Anfrage konnte nicht gelöscht werden');
            }
          },
        },
      ],
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

  useEffect(() => {
    return () => {
      Object.values(publicUserUnsubsRef.current).forEach((fn) => {
        try {
          fn();
        } catch {}
      });
      publicUserUnsubsRef.current = {};
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
          <MyRequestCard request={item} onDelete={handleDeleteRequest} />
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

