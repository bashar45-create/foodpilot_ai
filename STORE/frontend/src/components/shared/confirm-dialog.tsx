import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';

export function ConfirmDialog({ title, description, confirmLabel = 'Confirm', onConfirm }: { title: string; description: string; confirmLabel?: string; onConfirm: () => void }): JSX.Element {
  return (
    <Card className="space-y-4">
      <div>
        <h3 className="text-lg font-bold tracking-tight">{title}</h3>
        <p className="mt-2 text-sm text-zinc-500">{description}</p>
      </div>
      <div className="flex justify-end gap-3">
        <Button variant="outline">Cancel</Button>
        <Button onClick={onConfirm}>{confirmLabel}</Button>
      </div>
    </Card>
  );
}
