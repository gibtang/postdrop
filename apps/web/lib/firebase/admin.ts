import type { Auth, DecodedIdToken } from "firebase-admin/auth";

/**
 * Server-side Firebase Admin auth for the shared project (see
 * docs/adr/0007-shared-firebase-project.md).
 *
 * NOTE: firebase-admin/app and firebase-admin/auth are loaded via dynamic
 * import on first use (not static imports) so password-mode deployments never
 * initialize the Admin SDK and the module is safe to import without the
 * FIREBASE_* env vars present.
 */
interface AdminEnv {
  projectId: string;
  clientEmail: string;
  privateKey: string;
}

function readAdminEnv(): AdminEnv | null {
  const projectId = process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const privateKey = process.env.FIREBASE_PRIVATE_KEY;
  if (!projectId || !clientEmail || !privateKey) return null;
  // Service-account keys are commonly stored with literal \n escapes.
  return { projectId, clientEmail, privateKey: privateKey.replace(/\\n/g, "\n") };
}

/** True when the FIREBASE_* runtime env vars are all present. */
export function isFirebaseAdminConfigured(): boolean {
  return readAdminEnv() !== null;
}

let authPromise: Promise<Auth> | null = null;

/** Lazily initializes the Admin SDK app and returns its Auth instance. */
export function getFirebaseAdminAuth(): Promise<Auth> {
  if (!authPromise) {
    authPromise = (async () => {
      const env = readAdminEnv();
      if (!env) {
        throw new Error(
          "Firebase admin is not configured: set FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL and FIREBASE_PRIVATE_KEY",
        );
      }
      const { getApps, initializeApp, cert } = await import("firebase-admin/app");
      const { getAuth } = await import("firebase-admin/auth");
      const app =
        getApps().length > 0
          ? getApps()[0]!
          : initializeApp({
              credential: cert({
                projectId: env.projectId,
                clientEmail: env.clientEmail,
                privateKey: env.privateKey,
              }),
            });
      return getAuth(app);
    })();
  }
  return authPromise;
}

/** Verifies a Firebase ID token against the shared project. */
export async function verifyIdToken(idToken: string): Promise<DecodedIdToken> {
  const auth = await getFirebaseAdminAuth();
  return auth.verifyIdToken(idToken);
}
