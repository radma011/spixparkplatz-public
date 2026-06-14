import AsyncStorage from '@react-native-async-storage/async-storage';
import {getAppVersionInfo} from '../utils/appVersion';
import FirestoreService from './FirestoreService';

class AppVersionService {
  async syncIfNeeded(userId: string): Promise<void> {
    const info = getAppVersionInfo();
    const fingerprint = `${info.platform}:${info.version}:${info.buildNumber}`;
    const storageKey = `appVersionSync:${userId}`;

    try {
      const lastSynced = await AsyncStorage.getItem(storageKey);
      if (lastSynced === fingerprint) {
        return;
      }

      await FirestoreService.syncAppVersion(userId, info);
      await AsyncStorage.setItem(storageKey, fingerprint);
    } catch (error) {
      console.warn('[AppVersionService] Version sync failed:', error);
    }
  }
}

export default new AppVersionService();
