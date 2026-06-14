import {Platform} from 'react-native';
import {APP_VERSION_CODE, APP_VERSION_NAME} from '../constants/appVersion.generated';

export interface AppVersionInfo {
  version: string;
  buildNumber: number;
  platform: string;
}

export function getAppVersionInfo(): AppVersionInfo {
  return {
    version: APP_VERSION_NAME,
    buildNumber: APP_VERSION_CODE,
    platform: Platform.OS,
  };
}

export function formatAppVersion(info: AppVersionInfo = getAppVersionInfo()): string {
  return `${info.version} (${info.buildNumber})`;
}
