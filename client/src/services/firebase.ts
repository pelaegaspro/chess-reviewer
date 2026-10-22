import { initializeApp, getApps, FirebaseApp } from 'firebase/app';
import { 
  getAuth, 
  signInWithEmailAndPassword, 
  createUserWithEmailAndPassword, 
  updateProfile, 
  signInWithPopup, 
  GoogleAuthProvider, 
  signOut,
  onAuthStateChanged,
  User as FirebaseUser,
  Auth
} from 'firebase/auth';
import { getFirestore, Firestore } from 'firebase/firestore';

// Your web app's Firebase configuration for cheens-7a24e
export const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || "AIzaSyBrj64y-mP_0euDF4isZV1_LeaGZSLc6p4",
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || "cheens-7a24e.firebaseapp.com",
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || "cheens-7a24e",
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || "cheens-7a24e.firebasestorage.app",
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || "657651115371",
  appId: import.meta.env.VITE_FIREBASE_APP_ID || "1:657651115371:web:64f5ae759fc51d28a6982e",
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID || "G-7G7S8ES4WP"
};

let app: FirebaseApp | null = null;
let auth: Auth | null = null;
let db: Firestore | null = null;

export function initFirebase(): { app: FirebaseApp; auth: Auth; db: Firestore } {
  if (!app) {
    if (getApps().length === 0) {
      app = initializeApp(firebaseConfig);
    } else {
      app = getApps()[0];
    }
    auth = getAuth(app);
    db = getFirestore(app);
  }
  return { app: app!, auth: auth!, db: db! };
}

export const getFirebaseAuth = (): Auth => {
  if (!auth) initFirebase();
  return auth!;
};

export const getFirebaseDb = (): Firestore => {
  if (!db) initFirebase();
  return db!;
};

// 1. Email/Password Sign-Up
export async function firebaseRegisterEmail(email: string, pass: string, displayName?: string) {
  const authInstance = getFirebaseAuth();
  const credential = await createUserWithEmailAndPassword(authInstance, email, pass);
  if (displayName && credential.user) {
    await updateProfile(credential.user, { displayName });
  }
  const idToken = await credential.user.getIdToken();
  return {
    user: credential.user,
    idToken
  };
}

// 2. Email/Password Sign-In
export async function firebaseLoginEmail(email: string, pass: string) {
  const authInstance = getFirebaseAuth();
  const credential = await signInWithEmailAndPassword(authInstance, email, pass);
  const idToken = await credential.user.getIdToken();
  return {
    user: credential.user,
    idToken
  };
}

// 3. Google Sign-In (Popup)
export async function firebaseLoginGoogle() {
  const authInstance = getFirebaseAuth();
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: 'select_account' });
  const credential = await signInWithPopup(authInstance, provider);
  const idToken = await credential.user.getIdToken();
  return {
    user: credential.user,
    idToken
  };
}

// 4. Sign Out
export async function firebaseLogout() {
  const authInstance = getFirebaseAuth();
  await signOut(authInstance);
}

// 5. Auth State Listener
export function subscribeAuthState(callback: (user: FirebaseUser | null) => void) {
  const authInstance = getFirebaseAuth();
  return onAuthStateChanged(authInstance, callback);
}

export { app, auth, db };
