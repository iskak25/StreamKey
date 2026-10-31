import { RowListSkeleton } from "@/components/LoadingSkeleton";

export default function Loading() {
  return (
    <div className="container section stack" role="status" aria-label="Загрузка">
      <div className="skeleton skeleton-line" />
      <RowListSkeleton count={3} />
    </div>
  );
}
