import React, {useEffect} from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
} from 'react-native';
import UserService from '../services/UserService';
import ParkingRequestsScreen from './ParkingRequestsScreen';

interface Props {
  navigation?: any;
}

const availableUsers = [
  {id: 'User1', name: 'User 1 (T1)'},
  {id: 'User2', name: 'User 2 (T2)'},
  {id: 'User3', name: 'User 3 (T3)'},
  {id: 'User4', name: 'User 4 (T4)'},
];

const UserSelectionScreen: React.FC<Props> = ({navigation}) => {
  const [hasUser, setHasUser] = React.useState(false);
  const [userId, setUserId] = React.useState<string | null>(null);

  useEffect(() => {
    checkExistingUser();
  }, []);

  const checkExistingUser = async () => {
    const hasExistingUser = await UserService.hasCurrentUser();
    if (hasExistingUser) {
      const id = await UserService.getCurrentUserId();
      setUserId(id);
      setHasUser(true);
    }
  };

  const selectUser = async (selectedUserId: string) => {
    console.log('Selecting user:', selectedUserId);
    await UserService.setCurrentUser(selectedUserId);
    setUserId(selectedUserId);
    setHasUser(true);
  };

  if (hasUser && userId) {
    return <ParkingRequestsScreen currentUserId={userId} />;
  }

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <View style={styles.content}>
        <Text style={styles.icon}>🚗</Text>
        <Text style={styles.title}>Wähle deinen User</Text>
        <Text style={styles.subtitle}>Für Testing: Wähle einen User aus</Text>

        {availableUsers.map((user) => (
          <TouchableOpacity
            key={user.id}
            style={styles.button}
            onPress={() => selectUser(user.id)}
            activeOpacity={0.7}>
            <Text style={styles.buttonText}>{user.name}</Text>
          </TouchableOpacity>
        ))}

        <TouchableOpacity
          style={styles.resetButton}
          onPress={async () => {
            await UserService.clearCurrentUser();
            setHasUser(false);
            setUserId(null);
          }}>
          <Text style={styles.resetButtonText}>User zurücksetzen</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flexGrow: 1,
    justifyContent: 'center',
    padding: 24,
    backgroundColor: '#fff',
  },
  content: {
    alignItems: 'center',
  },
  icon: {
    fontSize: 80,
    marginBottom: 32,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 8,
    color: '#000',
  },
  subtitle: {
    fontSize: 14,
    color: '#666',
    marginBottom: 32,
  },
  button: {
    width: '100%',
    backgroundColor: '#007AFF',
    padding: 16,
    borderRadius: 8,
    marginBottom: 12,
    alignItems: 'center',
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  resetButton: {
    marginTop: 24,
    padding: 12,
  },
  resetButtonText: {
    color: '#666',
    fontSize: 14,
  },
});

export default UserSelectionScreen;

