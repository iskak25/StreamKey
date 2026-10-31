import Link from "next/link";
import BuyButton from "@/app/concerts/[id]/BuyButton";
import { formatPrice, type ConcertPhase } from "@/lib/shared/concerts";
import type { TicketState } from "./ConcertCard";
import ConcertStatusBadge from "./ConcertStatusBadge";

/**
 * Buy panel. Desktop: sticky card on the right. Phones: the card is replaced by a bar pinned above the tab bar
 * (same BuyButton, but only the card instance auto-continues a purchase after sign-in).
 */
export default function TicketPurchaseCard({
  concertId,
  phase,
  priceKgs,
  signedIn,
  ticket,
  orderId,
  variant,
}: {
  concertId: string;
  phase: ConcertPhase;
  priceKgs: number;
  signedIn: boolean;
  ticket: TicketState;
  orderId: string | null;
  variant: "card" | "bar";
}) {
  const ended = phase === "ended";
  const paidOrderId = ticket === "paid" ? orderId : null;
  const button = (
    <BuyButton concertId={concertId} ended={ended} free={priceKgs === 0} signedIn={signedIn} paidOrderId={paidOrderId} autoStart={variant === "card"} block={variant === "card"} />
  );

  if (variant === "bar") {
    return (
      <div className="purchase-bar">
        <span className="purchase-price">{ticket === "paid" ? "Куплен" : formatPrice(priceKgs)}</span>
        {button}
      </div>
    );
  }

  return (
    <aside className="card purchase purchase-inline" aria-label="Покупка билета">
      <ConcertStatusBadge phase={phase} />
      <p className="purchase-price">{ticket === "paid" ? "Билет куплен" : formatPrice(priceKgs)}</p>
      {ticket === "pending" && !ended && (
        <p className="notice">
          Ожидаем оплату. Если вы уже заплатили, <Link href={`/orders/${orderId}`}>проверьте статус</Link>.
        </p>
      )}
      {button}
      <hr className="divider" />
      <ul className="steps-list">
        <li>Оплатите билет по QR-коду, вход не нужен.</li>
        <li>Получите личную ссылку на трансляцию.</li>
        <li>Откройте её в браузере, где будете смотреть: ссылка закрепится за ним.</li>
      </ul>
    </aside>
  );
}
