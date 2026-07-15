/**
 * One-time script: Hash and update staff passwords in Firestore
 * Run: node scripts/reset-admin-password.mjs
 *
 * Edit the ACCOUNTS array below to set the correct passwords for your staff accounts.
 */

import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import bcrypt from 'bcryptjs';
import { readFileSync } from 'fs';
import { createInterface } from 'readline';

// ─── CONFIG ──────────────────────────────────────────────────────────────────
// Either set GOOGLE_APPLICATION_CREDENTIALS env var, or put the path to your
// service-account JSON below.
const SERVICE_ACCOUNT_PATH = process.env.GOOGLE_APPLICATION_CREDENTIALS || './service-account.json';
const PROJECT_ID = 'just-smile-e4829';

// ─── ACCOUNTS TO UPDATE ──────────────────────────────────────────────────────
// Add all staff accounts whose passwords need to be (re)hashed.
// email must match exactly as stored in Firestore.
const ACCOUNTS = [
  { email: 'admin@justsmile.com', newPassword: null }, // null = prompt interactively
];
// ─────────────────────────────────────────────────────────────────────────────

let app;
try {
  const serviceAccount = JSON.parse(readFileSync(SERVICE_ACCOUNT_PATH, 'utf8'));
  app = initializeApp({ credential: cert(serviceAccount), projectId: PROJECT_ID });
} catch {
  console.error(
    `\n❌  Could not load service account from: ${SERVICE_ACCOUNT_PATH}\n` +
    `   Download it from Firebase Console → Project Settings → Service Accounts.\n` +
    `   Then re-run:  node scripts/reset-admin-password.mjs\n`
  );
  process.exit(1);
}

const db = getFirestore(app);

async function prompt(question) {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => rl.question(question, (ans) => { rl.close(); resolve(ans); }));
}

async function main() {
  console.log('\n🔐  Staff Password Hasher — Just Smile\n');

  for (const account of ACCOUNTS) {
    console.log(`\n▶  Processing: ${account.email}`);

    // Find user in Firestore
    const snap = await db.collection('users').where('email', '==', account.email).get();
    if (snap.empty) {
      console.warn(`   ⚠️  No user found with email "${account.email}". Skipping.`);
      continue;
    }

    const userDoc = snap.docs[0];
    const userData = userDoc.data();
    console.log(`   Found: ${userData.name} (role: ${userData.role})`);

    // Get password
    let password = account.newPassword;
    if (!password) {
      password = await prompt(`   Enter new password for ${account.email}: `);
      if (!password || password.trim().length < 6) {
        console.warn('   ⚠️  Password too short (min 6 chars). Skipping.');
        continue;
      }
      password = password.trim();
    }

    // Hash with bcrypt
    const hashed = await bcrypt.hash(password, 10);
    await userDoc.ref.update({ password: hashed });

    console.log(`   ✅  Password updated and hashed for ${account.email}`);
  }

  console.log('\n✅  Done. You can now log in with the updated passwords.\n');
  process.exit(0);
}

main().catch((err) => { console.error(err); process.exit(1); });
