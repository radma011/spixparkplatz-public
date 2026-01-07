import {ColorSchemeName} from 'react-native';

export function getColors(scheme: ColorSchemeName) {
  const isDark = scheme === 'dark';
  return {
    isDark,

    // Base surfaces
    screenBg: isDark ? '#0B0F14' : '#f5f5f5',
    surface: isDark ? '#111827' : '#ffffff',
    surface2: isDark ? '#1F2937' : '#F3F4F6',
    border: isDark ? '#374151' : '#E5E7EB',

    // Text
    text: isDark ? '#F9FAFB' : '#111827',
    subtext: isDark ? '#9CA3AF' : '#666666',

    // Brand
    brand: '#007AFF',
  };
}


