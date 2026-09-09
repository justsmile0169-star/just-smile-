const functions = require('firebase-functions');
const admin = require('firebase-admin');
admin.initializeApp();

/**
 * Callable function for staff authentication
 * Allows staff members (admin, manager, cashier, accountant) to sign in
 * using email and password stored in Firestore, and optionally generates a custom auth token
 */
exports.signInStaff = functions.https.onCall(async (data, context) => {
  const { email, password } = data;

  if (!email || !password) {
    throw new functions.https.HttpsError(
      'invalid-argument',
      'Email and password are required'
    );
  }

  try {
    const emailTrimmed = email.trim();
    const emailLower = emailTrimmed.toLowerCase();
    const usersRef = admin.firestore().collection('users');

    let snapshot = await usersRef.where('email', '==', emailTrimmed).limit(1).get();
    if (snapshot.empty && emailTrimmed !== emailLower) {
      snapshot = await usersRef.where('email', '==', emailLower).limit(1).get();
    }

    if (snapshot.empty) {
      throw new functions.https.HttpsError(
        'not-found',
        'Invalid email or password'
      );
    }

    const userDoc = snapshot.docs[0];
    const userData = userDoc.data();

    // Check if user is staff (not doctor)
    if (userData.role === 'doctor') {
      throw new functions.https.HttpsError(
        'permission-denied',
        'Doctors must use Firebase Auth'
      );
    }

    // Check if user is approved/active
    if (userData.status && userData.status !== 'approved' && userData.status !== 'active') {
      throw new functions.https.HttpsError(
        'permission-denied',
        'Account is not approved'
      );
    }

    // Compare password (supports bcrypt hash or plaintext)
    let passwordMatches = false;
    if (userData.password) {
      const isBcrypt = userData.password.startsWith('$2') && userData.password.length > 50;
      if (isBcrypt) {
        try {
          const bcrypt = require('bcryptjs');
          passwordMatches = await bcrypt.compare(password, userData.password);
        } catch (e) {
          // Fallback if bcryptjs is not loaded
          passwordMatches = false;
        }
      } else {
        passwordMatches = (userData.password === password);
      }
    }

    if (!passwordMatches) {
      throw new functions.https.HttpsError(
        'not-found',
        'Invalid email or password'
      );
    }

    // Create Firebase Auth custom token so client can authenticate with full privileges
    let customToken = null;
    try {
      customToken = await admin.auth().createCustomToken(userDoc.id, {
        role: userData.role
      });
    } catch (tokenErr) {
      console.warn('Could not create custom token for staff:', tokenErr);
    }

    // Update last login time
    await userDoc.ref.update({
      lastLoginAt: new Date().toISOString()
    });

    // Return user data (without password) and the customToken
    const { password: _, ...userWithoutPassword } = userData;
    return {
      user: userWithoutPassword,
      customToken
    };
  } catch (error) {
    console.error('Error signing in staff:', error);
    if (error instanceof functions.https.HttpsError) {
      throw error;
    }
    throw new functions.https.HttpsError(
      'internal',
      error.message
    );
  }
});
