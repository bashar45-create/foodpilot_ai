import { Card } from '@/components/ui/card';

export function LoadingState({ label = 'Loading...' }: { label?: string }): JSX.Element {
  return (
    <Card className="flex items-center justify-center py-16 text-sm font-medium text-zinc-500">
      {label}
    </Card>
  );
}
