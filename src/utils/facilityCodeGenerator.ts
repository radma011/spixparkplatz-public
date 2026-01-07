/**
 * Generiert einen zufälligen Parkanlagen-Code im Format XXXX-XXXX
 * Verwendet Großbuchstaben (A-Z) und Ziffern (0-9)
 * 
 * @returns Ein zufälliger Code im Format XXXX-XXXX (z.B. "A3B7-K9M2")
 */
export function generateFacilityCode(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  
  const generatePart = (): string => {
    let part = '';
    for (let i = 0; i < 4; i++) {
      part += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return part;
  };
  
  return `${generatePart()}-${generatePart()}`;
}

/**
 * Generiert einen verfügbaren Parkanlagen-Code, der noch nicht in der Datenbank existiert
 * Prüft automatisch auf Existenz und generiert bei Bedarf einen neuen Code
 * 
 * @param checkExists Funktion zum Prüfen ob ein Code bereits existiert
 * @param maxAttempts Maximale Anzahl Versuche (Standard: 10)
 * @returns Ein verfügbarer Code im Format XXXX-XXXX
 * @throws Error wenn nach maxAttempts kein verfügbarer Code gefunden wurde
 */
export async function generateAvailableFacilityCode(
  checkExists: (code: string) => Promise<boolean>,
  maxAttempts: number = 10
): Promise<string> {
  let attempts = 0;
  
  while (attempts < maxAttempts) {
    const code = generateFacilityCode();
    const exists = await checkExists(code);
    
    if (!exists) {
      return code;
    }
    
    attempts++;
  }
  
  throw new Error(`Konnte nach ${maxAttempts} Versuchen keinen verfügbaren Code generieren`);
}

