const functions = require('firebase-functions');
const admin = require('firebase-admin');
admin.initializeApp();

/**
 * Callable function for staff authentication
 * Allows staff members (admin, manager, cashier, accountant) to sign in
 * using email and password stored in Firestore
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
    // Query Firestore for user with matching email and password
    const usersRef = admin.firestore().collection('users');
    const snapshot = await usersRef
      .where('email', '==', email)
      .where('password', '==', password)
      .limit(1)
      .get();

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

    // Check if user is approved
    if (userData.status !== 'approved') {
      throw new functions.https.HttpsError(
        'permission-denied',
        'Account is not approved'
      );
    }

    // Update last login time
    await userDoc.ref.update({
      lastLoginAt: new Date().toISOString()
    });

    // Return user data (without password)
    const { password: _, ...userWithoutPassword } = userData;
    return userWithoutPassword;
  } catch (error) {
    console.error('Error signing in staff:', error);
    throw new functions.https.HttpsError(
      'internal',
      error.message
    );
  }
});
