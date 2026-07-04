import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { initializeFirestore, persistentLocalCache, persistentMultipleTabManager } from 'firebase/firestore';

// Configuration reading from environment variables with fallback to the user's new Firebase project
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || "AIzaSyDyeaS6QlBItl9iHxmBvItkC9n5k_E_CYg",
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || "just-smile-e4829.firebaseapp.com",
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || "just-smile-e4829",
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || "just-smile-e4829.firebasestorage.app",
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || "754751173104",
  appId: import.meta.env.VITE_FIREBASE_APP_ID || "1:754751173104:web:b96c225098ed83b4746d35",
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID || "G-0QCFTW2LFS"
};


// Initialize Firebase App
const app = initializeApp(firebaseConfig);

// Initialize Firestore with local cache for offline/low bandwidth optimization
const db = initializeFirestore(app, {
  localCache: persistentLocalCache({
    tabManager: persistentMultipleTabManager()
  })
});

// Initialize Firebase Authentication
const auth = getAuth(app);

export { app, db, auth };
export default app;
