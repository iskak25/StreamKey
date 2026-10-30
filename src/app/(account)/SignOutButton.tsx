"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/client/api";
import { firebaseSignOut } from "@/lib/client/firebase";

export default function SignOutButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function signOut() {
    setBusy(true);
    try {
      const { csrfToken } = await api<{ csrfToken: string }>("/csrf");
      await api("/auth/session", { method: "DELETE", csrf: csrfToken });
      await firebaseSignOut().catch(() => {});
    } finally {
      router.replace("/login");
    }
  }

  return (
    <button className="btn btn-ghost" type="button" onClick={signOut} disabled={busy}>
      Выйти
    </button>
  );
}
