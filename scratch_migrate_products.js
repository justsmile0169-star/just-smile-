import admin from 'firebase-admin';
import { readFileSync } from 'fs';

// Load service account key
const serviceAccount = JSON.parse(
  readFileSync('./service-account-key.json.json', 'utf8')
);

// Initialize Firebase Admin
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

async function main() {
  try {
    console.log('Fetching all products via admin SDK...');
    const collRef = db.collection('products');
    const snapshot = await collRef.get();
    
    console.log(`Found ${snapshot.size} products.`);
    let updatedCount = 0;
    
    for (const doc of snapshot.docs) {
      const data = doc.data();
      const updates = {};
      
      // 1. If createdAt is missing, set it to the current ISO string
      if (!data.createdAt) {
        updates.createdAt = new Date().toISOString();
      }
      
      // 2. If isRoutineClinic is missing, set it to false
      if (data.isRoutineClinic === undefined) {
        updates.isRoutineClinic = false;
      }
      
      if (Object.keys(updates).length > 0) {
        await doc.ref.update(updates);
        console.log(`Updated product [${doc.id}]: ${data.name || 'No Name'} with keys:`, Object.keys(updates));
        updatedCount++;
      }
    }
    
    console.log(`Finished migrating products. Total updated: ${updatedCount}`);
    process.exit(0);
  } catch (error) {
    console.error('Error migrating products:', error);
    process.exit(1);
  }
}

main();
