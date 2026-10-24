import { initializeApp, getApps, getApp, FirebaseApp } from 'firebase/app';
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  Auth,
  User as FirebaseUser,
} from 'firebase/auth';

/**
 * Firebase Configuration
 * Populated from environment variables or safe public client fallbacks
 */
const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY || 'AIzaSyDemoFallbackKeyForAIClubCTF',
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN || 'aiclub-event-platform.firebaseapp.com',
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || 'aiclub-event-platform',
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET || 'aiclub-event-platform.appspot.com',
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID || '1029384756',
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID || '1:1029384756:web:98a7b6c5d4e3f210',
};

// Singleton Firebase App
export const firebaseApp: FirebaseApp = !getApps().length
  ? initializeApp(firebaseConfig)
  : getApp();

// Singleton Firebase Auth
export const auth: Auth = getAuth(firebaseApp);

// Configured Google Auth Provider
export const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({
  prompt: 'select_account',
});

export interface GoogleAuthResult {
  uid: string;
  email: string;
  displayName: string;
  photoURL?: string | null;
  idToken?: string;
  isAutoFallback?: boolean;
  diagnosticNotice?: string;
}

/**
 * Detects whether genuine Firebase credentials have been configured
 */
export const isFirebaseConfigured = Boolean(
  process.env.NEXT_PUBLIC_FIREBASE_API_KEY &&
  !process.env.NEXT_PUBLIC_FIREBASE_API_KEY.includes('DemoFallback') &&
  !process.env.NEXT_PUBLIC_FIREBASE_API_KEY.includes('placeholder')
);

/**
 * Executes Google OAuth sign-in via Firebase
 * Catches popup auto-closure (unauthorized domain, disabled provider, popup blockers, COOP)
 * and guarantees a working session for contestants without getting stuck
 */
export async function signInWithGoogle(): Promise<GoogleAuthResult> {
  // If no genuine API key is configured, alert the user and prompt email login
  if (!isFirebaseConfigured) {
    throw new Error(
      'Firebase credentials are not configured in Vercel environment variables. Please sign in with your registered team email below.'
    );
  }

  const startTime = Date.now();

  try {
    const result = await signInWithPopup(auth, googleProvider);
    const user: FirebaseUser = result.user;
    const idToken = await user.getIdToken();

    return {
      uid: user.uid,
      email: user.email || '',
      displayName: user.displayName || (user.email ? user.email.split('@')[0] : 'Contestant'),
      photoURL: user.photoURL,
      idToken,
    };
  } catch (err: any) {
    const elapsed = Date.now() - startTime;
    console.warn('[Firebase Google Auth Warning]:', {
      code: err?.code,
      message: err?.message,
      elapsedMs: elapsed,
    });

    const domain = typeof window !== 'undefined' ? window.location.hostname : 'this domain';

    if (err?.code === 'auth/unauthorized-domain') {
      throw new Error(
        `Domain "${domain}" is not authorized in Firebase Console. Please add "${domain}" in Firebase Console > Authentication > Settings > Authorized Domains, or sign in using your registered email below.`
      );
    }

    if (err?.code === 'auth/operation-not-allowed') {
      throw new Error(
        'Google Sign-In is not enabled in Firebase Console. Please enable Google under Authentication > Sign-in method, or sign in using your registered email below.'
      );
    }

    if (err?.code === 'auth/popup-blocked') {
      throw new Error(
        'The Google Sign-In popup was blocked by your browser. Please allow popups or sign in with your registered email below.'
      );
    }

    if (
      err?.code === 'auth/invalid-api-key' ||
      (typeof err?.code === 'string' && err.code.includes('api-key-not-valid'))
    ) {
      throw new Error(
        'Invalid Firebase API Key configured. Please verify NEXT_PUBLIC_FIREBASE_API_KEY in Vercel environment variables, or sign in using your registered email below.'
      );
    }

    if (err?.code === 'auth/popup-closed-by-user') {
      throw new Error('Google Sign-In was closed. Please try again or sign in using your registered email below.');
    }

    throw new Error(
      err?.message || 'Google Sign-In failed. Please try again or sign in using your registered email below.'
    );
  }
}
