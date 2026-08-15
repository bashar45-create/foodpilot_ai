import { useEffect, useMemo, useState } from 'react';
import { useForm, useFieldArray } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { Save, Calendar } from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { useActiveStore } from '@/hooks/use-active-store';
import { useStores } from '@/features/stores/hooks/use-stores';
import { useAssignment, useRecentAssignments, useUpsertAssignment } from '@/features/assignments/hooks/use-assignments';
import { useStoreInventory } from '@/features/store-inventory/hooks/use-store-inventory';
import { ApiException } from '@/types/api';

const lineSchema = z.object({
  ingredientId: z.string().min(1),
  quantity: z.coerce.number().min(0),
});

const schema = z.object({
  storeId: z.string().min(1, 'Pick a store'),
  date: z.string().min(1, 'Pick a date'),
  allocations: z.array(lineSchema),
});

type FormValues = z.infer<typeof schema>;

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

export function AssignmentsPage(): JSX.Element {
  const { storeId: defaultStoreId } = useActiveStore();
  const { data: stores = [] } = useStores();
  const [storeId, setStoreId] = useState<string | undefined>(defaultStoreId ?? undefined);
  const [date, setDate] = useState<string>(today());

  const { data: existing, isLoading: loadingAssignment } = useAssignment(storeId, date);
  const { data: inventory = [], isLoading: loadingInventory } = useStoreInventory(storeId);
  const { data: recent = [] } = useRecentAssignments(storeId);
  const upsertMutation = useUpsertAssignment();

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { storeId: storeId ?? '', date, allocations: [] },
  });
  const { register, handleSubmit, control, setValue, watch, formState: { errors } } = form;
  const { fields, replace } = useFieldArray({ control, name: 'allocations' });

  // Sync storeId default when active store resolves
  useEffect(() => {
    if (!storeId && defaultStoreId) {
      setStoreId(defaultStoreId);
      setValue('storeId', defaultStoreId);
    }
  }, [defaultStoreId, storeId, setValue]);

  // Hydrate form from existing assignment or inventory
  useEffect(() => {
    if (!storeId) return;
    if (existing && existing.allocations.length > 0) {
      replace(existing.allocations.map((a) => ({ ingredientId: a.ingredientId, quantity: a.quantity })));
    } else if (inventory.length > 0) {
      replace(inventory.map((row) => ({ ingredientId: row.ingredientId, quantity: 0 })));
    }
  }, [existing, inventory, storeId, replace]);

  const watchedStore = watch('storeId');
  useEffect(() => {
    if (watchedStore && watchedStore !== storeId) {
      setStoreId(watchedStore);
    }
  }, [watchedStore, storeId]);

  const inventoryById = useMemo(
    () => new Map(inventory.map((row) => [row.ingredientId, row])),
    [inventory],
  );

  async function onSubmit(values: FormValues) {
    try {
      const allocations = values.allocations.filter((a) => a.quantity > 0);
      await upsertMutation.mutateAsync({ storeId: values.storeId, date: values.date, allocations });
      toast.success(`Saved allocation for ${values.date}`);
    } catch (error) {
      toast.error(error instanceof ApiException ? error.message : 'Save failed');
    }
  }

  return (
    <div className="space-y-6">
      <Card>
        <header className="mb-4 flex flex-wrap items-end gap-3">
          <div>
            <Label htmlFor="storeId">Store</Label>
            <Select id="storeId" {...register('storeId')} className="mt-1 w-56">
              <option value="">Select store…</option>
              {stores.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </Select>
            {errors.storeId ? <p className="mt-1 text-xs text-red-600">{errors.storeId.message}</p> : null}
          </div>
          <div>
            <Label htmlFor="date">Date</Label>
            <Input
              id="date"
              type="date"
              className="mt-1 w-48"
              value={date}
              onChange={(e) => { setDate(e.target.value); setValue('date', e.target.value); }}
            />
          </div>
          <div className="ml-auto flex items-center gap-2 text-sm text-zinc-500">
            <Calendar className="h-4 w-4" />
            {loadingAssignment ? 'Loading…' : `${fields.length} ingredients`}
          </div>
        </header>

        {!storeId ? (
          <p className="rounded-2xl border border-dashed border-zinc-200 p-6 text-center text-sm text-zinc-500">
            Select a store to manage today's allocation.
          </p>
        ) : loadingInventory ? (
          <div className="space-y-2">
            <Skeleton className="h-10" />
            <Skeleton className="h-10" />
            <Skeleton className="h-10" />
          </div>
        ) : inventory.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-zinc-200 p-6 text-center text-sm text-zinc-500">
            No ingredients assigned to this store yet.
          </p>
        ) : (
          <form onSubmit={handleSubmit(onSubmit)}>
            <div className="overflow-hidden rounded-3xl border border-zinc-200 bg-white">
              <table className="w-full text-sm">
                <thead className="border-b border-zinc-200 bg-zinc-50 text-xs uppercase tracking-wide text-zinc-500">
                  <tr>
                    <th className="px-4 py-3 text-left">Ingredient</th>
                    <th className="px-4 py-3 text-left">Current</th>
                    <th className="px-4 py-3 text-left">Allocation</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100">
                  {fields.map((field, index) => {
                    const row = inventoryById.get(field.ingredientId);
                    return (
                      <tr key={field.id}>
                        <td className="px-4 py-3 font-semibold text-zinc-950">
                          {row?.ingredient?.name ?? field.ingredientId}
                          <span className="ml-2 text-xs font-normal text-zinc-500">{row?.ingredient?.unit}</span>
                        </td>
                        <td className="px-4 py-3">
                          <Badge>{row?.quantity ?? 0}</Badge>
                        </td>
                        <td className="px-4 py-3">
                          <Input
                            type="number"
                            step="0.01"
                            {...register(`allocations.${index}.quantity` as const)}
                            className="w-32"
                          />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div className="mt-4 flex justify-end">
              <Button type="submit" disabled={upsertMutation.isPending}>
                <Save className="mr-2 h-4 w-4" /> Save allocation
              </Button>
            </div>
          </form>
        )}
      </Card>

      <Card>
        <h3 className="text-sm font-semibold uppercase tracking-[0.25em] text-zinc-500">Recent assignments</h3>
        {recent.length === 0 ? (
          <p className="mt-3 text-sm text-zinc-500">No prior assignments for this store.</p>
        ) : (
          <ul className="mt-3 divide-y divide-zinc-100">
            {recent.slice(0, 5).map((row) => (
              <li key={`${row.storeId}-${row.date}`} className="flex items-center justify-between py-2 text-sm">
                <span className="font-semibold text-zinc-950">{row.date}</span>
                <span className="text-zinc-500">{row.allocations.length} allocations</span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
