"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { api, errCode, organizerMessage } from "@/lib/client/api";
import ConfirmDialog from "./ConfirmDialog";
import { PencilIcon, TrashIcon } from "./icons";

/**
 * Admin-only shortcuts on a catalog card: edit and delete. "Delete" archives the concert
 * (it leaves the catalog and its access links stop working); purchase records are kept.
 * The buttons are a convenience: the admin API re-checks the role on every call.
 */
export default function ConcertAdminTools({ concertId }: { concertId: string }) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const lock = useRef(false);

  async function remove() {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError(null);
    try {
      const { csrfToken } = await api<{ csrfToken: string }>("/csrf");
      await api(`/admin/concerts/${concertId}/archive`, { method: "POST", csrf: csrfToken, body: {} });
      setConfirming(false);
      router.refresh();
    } catch (e) {
      setError(organizerMessage(errCode(e)));
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }

  return (
    <>
      <div className="concert-tools">
        <Link className="concert-tool" href={`/admin/concerts/${concertId}`} aria-label="Редактировать концерт" title="Редактировать">
          <PencilIcon />
        </Link>
        <button className="concert-tool concert-tool-danger" type="button" onClick={() => setConfirming(true)} aria-label="Удалить концерт" title="Удалить">
          <TrashIcon />
        </button>
      </div>
      <ConfirmDialog
        open={confirming}
        title="Удалить концерт?"
        confirmLabel="Удалить"
        danger
        busy={busy}
        error={error}
        onConfirm={remove}
        onCancel={() => {
          setConfirming(false);
          setError(null);
        }}
      >
        Концерт исчезнет с сайта, выданные ссылки перестанут работать. Записи об оплатах сохранятся.
      </ConfirmDialog>
    </>
  );
}
