import type { Auth } from "firebase/auth";

/**
 * Client-side Firebase Auth config. Values are NEXT_PUBLIC_* and are inlined
 * at build time; when absent (password mode) this module stays inert so the
 * app builds and runs without a Firebase project.
 *
 * NOTE: firebase/auth is loaded via dynamic import on first use (not a static
 * import) so password-mode bundles never include the Firebase SDK.
 */
const firebaseClientConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

/** True when the NEXT_PUBLIC_FIREBASE_* build-time config is present. */
export function isFirebaseClientConfigured(): boolean {
  return Boolean(firebaseClientConfig.apiKey);
}

let authPromise: Promise<Auth> | null = null;

/** Lazily initializes the Firebase app and returns the Auth instance. */
export function getFirebaseAuth(): Promise<Auth> {
  if (!isFirebaseClientConfigured()) {
    return Promise.reject(
      new Error("Firebase client is not configured (NEXT_PUBLIC_FIREBASE_API_KEY is not set)"),
    );
  }
  if (!authPromise) {
    authPromise = (async () => {
      const { getApps, initializeApp } = await import("firebase/app");
      const { getAuth } = await import("firebase/auth");
      const app = getApps().length > 0 ? getApps()[0]! : initializeApp(firebaseClientConfig);
      return getAuth(app);
    })();
  }
  return authPromise;
}
