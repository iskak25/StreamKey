import { getApp, getApps, initializeApp } from "firebase/app";
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut } from "firebase/auth";

// Public web config (not a secret): safety comes from deny-all Rules and server-side checks.
const config = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

const auth = () => getAuth(getApps().length ? getApp() : initializeApp(config));

/** Opens the Google popup and returns a fresh ID token. It is handed to the server once and never stored by us. */
export async function googleIdToken(): Promise<string> {
  const cred = await signInWithPopup(auth(), new GoogleAuthProvider());
  return cred.user.getIdToken(true);
}

export const firebaseSignOut = (): Promise<void> => signOut(auth());
