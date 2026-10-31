import { getApp, getApps, initializeApp } from "firebase/app";
import {
  browserLocalPersistence,
  browserPopupRedirectResolver,
  browserSessionPersistence,
  getAuth,
  GoogleAuthProvider,
  indexedDBLocalPersistence,
  initializeAuth,
  inMemoryPersistence,
  linkWithPopup,
  signInAnonymously,
  signInWithPopup,
  signOut,
  type Auth,
} from "firebase/auth";

// Public web config (not a secret): safety comes from deny-all Rules and server-side checks.
const config = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

/**
 * Initialized WITHOUT the popup resolver: the resolver loads Google's iframe and script at startup, which pages other than
 * /login must not allow (CSP) and which in-app browsers choke on. The resolver is passed to the popup calls instead.
 * Persistence falls back to memory when the browser blocks storage.
 */
function auth(): Auth {
  const app = getApps().length ? getApp() : initializeApp(config);
  try {
    return initializeAuth(app, { persistence: [indexedDBLocalPersistence, browserLocalPersistence, browserSessionPersistence, inMemoryPersistence] });
  } catch {
    return getAuth(app); // already initialized
  }
}

/**
 * Opens the Google popup and returns a fresh ID token. It is handed to the server once and never stored by us.
 * A guest (anonymous) session is upgraded in place so its uid, and the tickets bought with it, are kept; if that
 * Google account already exists, the regular Google sign-in is used instead.
 */
export async function googleIdToken(): Promise<string> {
  const a = auth();
  await a.authStateReady();
  const provider = new GoogleAuthProvider();
  if (a.currentUser?.isAnonymous) {
    try {
      return await (await linkWithPopup(a.currentUser, provider, browserPopupRedirectResolver)).user.getIdToken(true);
    } catch (e) {
      if ((e as { code?: string }).code !== "auth/credential-already-in-use") throw e;
    }
  }
  return (await signInWithPopup(a, provider, browserPopupRedirectResolver)).user.getIdToken(true);
}

/** Guest session for buying a ticket without an account: an anonymous Firebase user, invisible to the viewer. */
export async function guestIdToken(): Promise<string> {
  const a = auth();
  await a.authStateReady();
  // A remembered Google user must sign in again (full account), never silently become a second, guest identity.
  if (a.currentUser && !a.currentUser.isAnonymous) throw Object.assign(new Error("needs-google"), { code: "auth/needs-google" });
  const user = a.currentUser ?? (await signInAnonymously(a)).user;
  return user.getIdToken(true);
}

export const firebaseSignOut = (): Promise<void> => signOut(auth());
