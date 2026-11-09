import { Skeleton } from "@/components/ui/skeleton";

export function PageSkeleton() {
  return (
    <div className="flex flex-col gap-4" aria-busy aria-label="Lädt">
      <Skeleton className="h-9 w-56" />
      <Skeleton className="h-5 w-80 max-w-full" />
      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <Skeleton className="h-40" />
        <Skeleton className="h-40" />
      </div>
    </div>
  );
}
