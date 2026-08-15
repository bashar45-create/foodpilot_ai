import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';

/**
 * Skeleton placeholder shown while a lazy-loaded route chunk is being
 * downloaded. Keeps the surrounding AppShell mounted so the sidebar
 * stays responsive and the navigation feels instantaneous.
 */
export function PageFallback(): JSX.Element {
  return (
    <div className="space-y-6">
      <Card>
        <Skeleton className="h-8 w-1/3" />
        <Skeleton className="mt-2 h-4 w-1/2" />
      </Card>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Card key={i}>
            <Skeleton className="h-4 w-1/2" />
            <Skeleton className="mt-3 h-8 w-2/3" />
          </Card>
        ))}
      </div>
      <Card>
        <Skeleton className="h-64 w-full" />
      </Card>
    </div>
  );
}
