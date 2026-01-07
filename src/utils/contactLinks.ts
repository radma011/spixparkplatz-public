import {Linking} from 'react-native';

export function normalizePhone(input: string): {e164: string; digits: string} | null {
  const raw = (input || '').trim();
  if (!raw) return null;

  // Keep leading +, remove all other non-digits.
  const hasPlus = raw.startsWith('+');
  const digitsOnly = raw.replace(/[^\d]/g, '');
  if (!digitsOnly) return null;

  const e164 = hasPlus ? `+${digitsOnly}` : digitsOnly.startsWith('00') ? `+${digitsOnly.slice(2)}` : `+${digitsOnly}`;
  const digits = e164.replace(/[^\d]/g, '');
  return {e164, digits};
}

export async function tryOpenUrl(url: string): Promise<boolean> {
  try {
    await Linking.openURL(url);
    return true;
  } catch {
    return false;
  }
}


