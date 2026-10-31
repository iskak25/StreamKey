import { api } from "./api";
import { guestIdToken } from "./firebase";

/** Silent guest session: an anonymous Firebase user exchanged for our session cookie. The viewer sees no sign-in step. */
export async function startGuestSession(): Promise<void> {
  const idToken = await guestIdToken();
  const { csrfToken } = await api<{ csrfToken: string }>("/csrf");
  await api("/auth/session", { method: "POST", csrf: csrfToken, body: { idToken } });
}
