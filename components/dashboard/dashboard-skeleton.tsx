import { Card, CardBody } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

export function DashboardSkeleton() {
  return (
    <div className="mx-auto flex max-w-7xl flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="space-y-2">
          <Skeleton className="h-6 w-32" />
          <Skeleton className="h-4 w-48" />
        </div>
        <Skeleton className="h-10 w-28 rounded-lg" />
      </div>

      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Card key={i}>
            <CardBody className="pt-4">
              <Skeleton className="h-3 w-20" />
              <Skeleton className="mt-2 h-7 w-28" />
              <Skeleton className="mt-2 h-3 w-24" />
            </CardBody>
          </Card>
        ))}
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <div className="order-2 flex flex-col gap-4 xl:order-1 xl:col-span-2">
          <Card>
            <CardBody className="pt-4">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="mt-4 h-56 w-full rounded-lg sm:h-72" />
            </CardBody>
          </Card>
          <Card>
            <CardBody className="pt-4">
              <Skeleton className="h-40 w-full rounded-lg" />
            </CardBody>
          </Card>
        </div>
        <div className="order-1 flex flex-col gap-4 xl:order-2">
          <Card>
            <CardBody className="pt-4">
              <Skeleton className="h-48 w-full rounded-lg" />
            </CardBody>
          </Card>
        </div>
      </div>
    </div>
  );
}

/** Pulsing stat card variant for live feed connecting state. */
export function StatCardLive({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex size-1.5 rounded-full bg-warn animate-live",
        className,
      )}
      aria-label="Syncing live data"
    />
  );
}
