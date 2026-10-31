/** Placeholders with the final proportions, so the page does not jump when data arrives. */
export function CardGridSkeleton({ count = 4 }: { count?: number }) {
  return (
    <div className="concert-grid" aria-hidden="true">
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="skeleton skeleton-card" />
      ))}
    </div>
  );
}

export function RowListSkeleton({ count = 3 }: { count?: number }) {
  return (
    <div className="ticket-list" aria-hidden="true">
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="skeleton skeleton-row" />
      ))}
    </div>
  );
}
