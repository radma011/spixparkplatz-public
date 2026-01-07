import AsyncStorage from '@react-native-async-storage/async-storage';

class UserService {
  private static readonly USER_ID_KEY = 'current_user_id';
  private static readonly USER_NAME_KEY = 'current_user_name';

  static readonly availableUsers = [
    {id: 'User1', name: 'User 1 (T1)'},
    {id: 'User2', name: 'User 2 (T2)'},
    {id: 'User3', name: 'User 3 (T3)'},
    {id: 'User4', name: 'User 4 (T4)'},
  ];

  async getCurrentUserId(): Promise<string | null> {
    return await AsyncStorage.getItem(UserService.USER_ID_KEY);
  }

  async setCurrentUser(userId: string): Promise<void> {
    await AsyncStorage.setItem(UserService.USER_ID_KEY, userId);
    
    const user = UserService.availableUsers.find((u) => u.id === userId);
    if (user) {
      await AsyncStorage.setItem(UserService.USER_NAME_KEY, user.name);
    }
  }

  async getCurrentUserName(): Promise<string | null> {
    return await AsyncStorage.getItem(UserService.USER_NAME_KEY);
  }

  async hasCurrentUser(): Promise<boolean> {
    const userId = await this.getCurrentUserId();
    return userId !== null && userId.length > 0;
  }

  async clearCurrentUser(): Promise<void> {
    await AsyncStorage.removeItem(UserService.USER_ID_KEY);
    await AsyncStorage.removeItem(UserService.USER_NAME_KEY);
  }
}

export default new UserService();

