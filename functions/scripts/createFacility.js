/**
 * Script zum Erstellen von Facility-Codes in Firestore
 * 
 * Usage:
 *   cd functions
 *   node scripts/createFacility.js
 * 
 * Oder mit spezifischen Codes:
 *   node scripts/createFacility.js PARK01 "Parkhaus Zentrum" PARK02 "Parkhaus Nord"
 */

const admin = require('firebase-admin');

// Initialisiere Firebase Admin (verwendet die Standard-Credentials)
if (!admin.apps.length) {
  admin.initializeApp();
}

const db = admin.firestore();

async function createFacility(code, name, active = true) {
  if (!code || !code.trim()) {
    throw new Error('Facility-Code darf nicht leer sein');
  }
  
  const normalizedCode = code.trim().toUpperCase();
  
  const facilityRef = db.collection('facilities').doc(normalizedCode);
  const existing = await facilityRef.get();
  
  if (existing.exists) {
    console.log(`⚠️  Facility ${normalizedCode} existiert bereits. Überspringe...`);
    return;
  }
  
  await facilityRef.set({
    // code field is redundant - Document-ID is already the code
    name: name || normalizedCode,
    active: active !== false,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
  });
  
  console.log(`✅ Facility ${normalizedCode} erstellt${name ? ` (${name})` : ''}`);
}

async function main() {
  const args = process.argv.slice(2);
  
  // Wenn Argumente übergeben wurden, verwende diese
  if (args.length > 0) {
    // Erwartetes Format: CODE1 "Name1" CODE2 "Name2" ...
    for (let i = 0; i < args.length; i += 2) {
      const code = args[i];
      const name = args[i + 1] || code;
      await createFacility(code, name);
    }
  } else {
    // Standard-Facilities erstellen (Beispiele)
    console.log('Erstelle Standard-Facilities...\n');
    
    await createFacility('PARK01', 'Parkhaus Zentrum');
    await createFacility('PARK02', 'Parkhaus Nord');
    await createFacility('PARK03', 'Parkhaus Süd');
    
    console.log('\n✅ Alle Standard-Facilities erstellt');
    console.log('\nHinweis: Du kannst auch eigene Facilities erstellen:');
    console.log('  node scripts/createFacility.js CODE1 "Name1" CODE2 "Name2"');
  }
}

main()
  .then(() => {
    console.log('\nFertig!');
    process.exit(0);
  })
  .catch((err) => {
    console.error('\n❌ Fehler:', err.message);
    process.exit(1);
  });

