import { useEffect, useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { Plus, Pencil, Trash2, Eye, PackagePlus, AlertTriangle, ArrowDownRight, RotateCcw, Undo2 } from 'lucide-react';
import { toast } from 'sonner';
import { formatDistanceToNow } from 'date-fns';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Card } from '@/components/ui/card';
import { KpiCard } from '@/components/shared/kpi-card';
import { Dialog, DialogFooter } from '@/components/ui/dialog';
import { Sheet } from '@/components/ui/sheet';
import { Table, TableBody, TableCell, TableEmpty, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import {
  useAllocations,
  useCreateAllocation,
  useDeleteAllocation,
  useReclaimAllocation,
  useUpdateAllocation,
} from '@/features/allocations/hooks/use-allocations';
import { useStores } from '@/features/stores/hooks/use-stores';
import { useFood } from '@/features/food/hooks/use-food';
import { useIngredients } from '@/features/inventory/hooks/use-ingredients';
import type { Allocation, AllocationCreateRequest } from '@/api/endpoints/allocations';
import { ApiException } from '@/types/api';

const createSchema = z.object({
  storeId: z.string().min(1, 'Pick a store'),
  foodItemId: z.string().min(1, 'Pick a food item'),
  quantity: z.coerce.number().int().positive('Must be at least 1'),
  date: z.string().optional(),
  notes: z.string().optional(),
});

type CreateValues = z.infer<typeof createSchema>;

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function isoDaysAgo(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString().slice(0, 10);
}

function AllocationDialog({
  open,
  onOpenChange,
  initial,
  onSubmit,
  isPending,
}: {
  open: boolean;
  onOpenChange: (next: boolean) => void;
  initial: Allocation | null;
  onSubmit: (values: CreateValues) => Promise<void> | void;
  isPending: boolean;
}): JSX.Element {
  const { data: stores = [] } = useStores();
  const { data: foodItems = [] } = useFood();
  const isEdit = initial !== null;

  const form = useForm<CreateValues>({
    resolver: zodResolver(createSchema),
    defaultValues: { storeId: '', foodItemId: '', quantity: 1, date: todayIso(), notes: '' },
  });

  useEffect(() => {
    if (!open) return;
    if (initial) {
      form.reset({
        storeId: initial.storeId,
        foodItemId: initial.foodItemId,
        quantity: initial.quantity,
        date: initial.date,
        notes: initial.notes ?? '',
      });
    } else {
      form.reset({ storeId: '', foodItemId: '', quantity: 1, date: todayIso(), notes: '' });
    }
  }, [open, initial, form]);

  const foodItemId = form.watch('foodItemId');
  const qty = Number(form.watch('quantity') || 0);
  const selectedFood = foodItems.find((f) => f.id === foodItemId);
  const unitPrice = Number(selectedFood?.price ?? 0);
  const totalValue = unitPrice * qty;

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={isEdit ? `Edit allocation — ${initial?.foodName ?? ''}` : 'Allocate food to store'}
      description={isEdit ? 'Update the allocation quantity. Stock deductions will be adjusted by the delta.' : 'Allocate food items to a store. Required ingredients are deducted from store inventory.'}
      className="max-w-xl"
    >
      <form className="space-y-4" onSubmit={form.handleSubmit(onSubmit)}>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label htmlFor="storeId">Store</Label>
            <Select id="storeId" {...form.register('storeId')} className="mt-1" disabled={isEdit}>
              <option value="">Select…</option>
              {stores.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </Select>
            {form.formState.errors.storeId ? (
              <p className="mt-1 text-xs text-red-600">{form.formState.errors.storeId.message}</p>
            ) : null}
          </div>
          <div>
            <Label htmlFor="foodItemId">Food item</Label>
            <Select id="foodItemId" {...form.register('foodItemId')} className="mt-1" disabled={isEdit}>
              <option value="">Select…</option>
              {foodItems.map((f) => (
                <option key={f.id} value={f.id}>{f.name}</option>
              ))}
            </Select>
            {form.formState.errors.foodItemId ? (
              <p className="mt-1 text-xs text-red-600">{form.formState.errors.foodItemId.message}</p>
            ) : null}
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label htmlFor="quantity">Quantity</Label>
            <Input id="quantity" type="number" min={1} step={1} {...form.register('quantity', { valueAsNumber: true })} className="mt-1" />
            {form.formState.errors.quantity ? (
              <p className="mt-1 text-xs text-red-600">{form.formState.errors.quantity.message}</p>
            ) : null}
          </div>
          <div>
            <Label htmlFor="date">Date</Label>
            <Input id="date" type="date" {...form.register('date')} className="mt-1" />
          </div>
        </div>
        <div>
          <Label htmlFor="notes">Notes (optional)</Label>
          <Input id="notes" {...form.register('notes')} className="mt-1" placeholder="e.g. morning shift, prep for event" />
        </div>
        {selectedFood ? (
          <div className="rounded-2xl border border-zinc-300 bg-zinc-50 p-3 text-sm">
            <div className="flex items-center justify-between">
              <span className="text-zinc-500">Unit price</span>
              <span className="font-semibold text-zinc-950">${unitPrice.toFixed(2)}</span>
            </div>
            <div className="mt-1 flex items-center justify-between">
              <span className="text-zinc-500">Estimated value</span>
              <span className="font-semibold text-zinc-950">${totalValue.toFixed(2)}</span>
            </div>
          </div>
        ) : null}
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button type="submit" disabled={isPending}>
            {isEdit ? 'Save changes' : 'Allocate'}
          </Button>
        </DialogFooter>
      </form>
    </Dialog>
  );
}

function AllocationDetailSheet({
  allocation,
  open,
  onOpenChange,
}: {
  allocation: Allocation | null;
  open: boolean;
  onOpenChange: (next: boolean) => void;
}): JSX.Element {
  const { data: stores = [] } = useStores();
  const { data: ingredients = [] } = useIngredients();
  const storeName = stores.find((s) => s.id === allocation?.storeId)?.name ?? allocation?.storeId;
  // Build a quick lookup so we can show ingredient names instead of raw IDs
  // when the backend's AllocationDeduction payload omits ingredientName.
  const ingredientNameById = useMemo(
    () => new Map(ingredients.map((ing) => [ing.id, ing.name])),
    [ingredients],
  );

  return (
    <Sheet open={open} onOpenChange={onOpenChange} title={allocation ? `${allocation.foodName} — ${storeName}` : 'Allocation detail'}>
      {allocation ? (
        <div className="space-y-4">
          <div className="rounded-2xl border border-zinc-300 bg-zinc-50 p-3 text-sm">
            <div className="flex items-center justify-between">
              <span className="text-zinc-500">Date</span>
              <span className="font-semibold text-zinc-950">{allocation.date}</span>
            </div>
            <div className="mt-1 flex items-center justify-between">
              <span className="text-zinc-500">Quantity allocated</span>
              <span className="font-semibold text-zinc-950">{allocation.quantity}</span>
            </div>
            <div className="mt-1 flex items-center justify-between">
              <span className="text-zinc-500">Sold (since allocation)</span>
              <span className="font-semibold text-zinc-950">{allocation.sold ?? 0}</span>
            </div>
            <div className="mt-1 flex items-center justify-between">
              <span className="text-zinc-500">Remaining</span>
              <span className="font-semibold text-zinc-950">{allocation.remaining ?? Math.max(Number(allocation.quantity) - (allocation.sold ?? 0), 0)}</span>
            </div>
            <div className="mt-1 flex items-center justify-between">
              <span className="text-zinc-500">Revenue</span>
              <span className="font-semibold text-zinc-950">${(allocation.revenue ?? 0).toFixed(2)}</span>
            </div>
            <div className="mt-1 flex items-center justify-between">
              <span className="text-zinc-500">Status</span>
              <Badge className={allocation.status === 'ACTIVE' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-zinc-100 text-zinc-500 border-zinc-200'}>
                {allocation.status}
              </Badge>
            </div>
            {allocation.notes ? (
              <div className="mt-2">
                <p className="text-xs text-zinc-500">Notes</p>
                <p className="text-sm text-zinc-950">{allocation.notes}</p>
              </div>
            ) : null}
          </div>
          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-500">Ingredient deductions</p>
            <ul className="space-y-2">
              {(allocation.deductions ?? []).map((d) => (
                <li key={d.ingredientId} className="flex items-center justify-between rounded-2xl border border-zinc-200 bg-white px-3 py-2 text-sm">
                  <span className="font-medium text-zinc-950">
                    {d.ingredientName ?? ingredientNameById.get(d.ingredientId) ?? d.ingredientId}
                  </span>
                  <span className="text-xs text-zinc-500">
                    {d.perUnit.toFixed(3)} × {allocation.quantity} = <strong className="text-zinc-950">{d.required.toFixed(3)}</strong> · {d.before} → {d.after}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      ) : null}
    </Sheet>
  );
}

export function AllocationsPage(): JSX.Element {
  const { data: stores = [] } = useStores();
  const [storeFilter, setStoreFilter] = useState<string>('');
  const [startDate, setStartDate] = useState<string>(() => isoDaysAgo(29));
  const [endDate, setEndDate] = useState<string>(() => todayIso());
  const [createOpen, setCreateOpen] = useState(false);
  const [editing, setEditing] = useState<Allocation | null>(null);
  const [viewing, setViewing] = useState<Allocation | null>(null);

  const params = useMemo(() => ({
    storeId: storeFilter || undefined,
    start: startDate || undefined,
    end: endDate || undefined,
  }), [storeFilter, startDate, endDate]);

  const { data, isLoading } = useAllocations(params);
  const createMutation = useCreateAllocation();
  const updateMutation = useUpdateAllocation();
  const deleteMutation = useDeleteAllocation();
  const reclaimMutation = useReclaimAllocation();

  const totals = useMemo(() => {
    const rows = data ?? [];
    let allocated = 0, sold = 0, revenue = 0, remaining = 0;
    for (const r of rows) {
      if (r.status !== 'ACTIVE') continue;
      const q = Number(r.quantity || 0);
      const s = Number(r.sold ?? 0);
      allocated += q;
      sold += s;
      revenue += Number(r.revenue ?? 0);
      remaining += Math.max(q - s, 0);
    }
    return { allocated, sold, revenue, remaining };
  }, [data]);

  async function onCreate(values: CreateValues) {
    try {
      const payload: AllocationCreateRequest = {
        storeId: values.storeId,
        foodItemId: values.foodItemId,
        quantity: values.quantity,
        date: values.date || undefined,
        notes: values.notes || undefined,
      };
      const created = await createMutation.mutateAsync(payload);
      toast.success(`Allocated ${values.quantity} × ${created.foodName ?? 'food item'}`);
      setCreateOpen(false);
    } catch (error) {
      toast.error(error instanceof ApiException ? error.message : 'Allocation failed');
    }
  }

  async function onEdit(values: CreateValues) {
    if (!editing) return;
    try {
      await updateMutation.mutateAsync({
        id: editing.id,
        input: { quantity: values.quantity, notes: values.notes || undefined },
      });
      toast.success('Allocation updated');
      setEditing(null);
    } catch (error) {
      toast.error(error instanceof ApiException ? error.message : 'Update failed');
    }
  }

  async function onDelete(allocation: Allocation) {
    if (!confirm(`Reverse allocation of ${allocation.quantity} × ${allocation.foodName ?? ''}? Stock will be refunded to the store.`)) return;
    try {
      await deleteMutation.mutateAsync(allocation.id);
      toast.success('Allocation reversed — stock refunded');
    } catch (error) {
      toast.error(error instanceof ApiException ? error.message : 'Reverse failed');
    }
  }

  async function onReclaim(allocation: Allocation) {
    const sold = Number(allocation.sold ?? 0);
    const allocated = Number(allocation.quantity || 0);
    const remaining = Number(allocation.remaining ?? Math.max(allocated - sold, 0));
    if (remaining <= 0) {
      toast.info('Nothing left to reclaim — everything allocated was sold.');
      return;
    }
    if (!confirm(
      `Reclaim ${remaining} unsold ${allocation.foodName ?? 'food item'} from this store? ` +
        `Leftover ingredients will be returned to the master pool.`,
    )) return;
    try {
      const updated = await reclaimMutation.mutateAsync(allocation.id);
      const reclaimed = Number(updated?.reclaimedRemaining ?? remaining);
      toast.success(`Reclaimed ${reclaimed} unit(s) — stock refunded to master pool`);
    } catch (error) {
      toast.error(error instanceof ApiException ? error.message : 'Reclaim failed');
    }
  }

  return (
    <div className="space-y-4">
      <Card>
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="flex flex-wrap items-end gap-3">
            <div>
              <Label htmlFor="storeFilter">Store</Label>
              <Select id="storeFilter" value={storeFilter} onChange={(e) => setStoreFilter(e.target.value)} className="mt-1 min-w-[180px]">
                <option value="">All stores</option>
                {stores.map((s) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </Select>
            </div>
            <div>
              <Label htmlFor="startDate">From</Label>
              <Input id="startDate" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="mt-1" />
            </div>
            <div>
              <Label htmlFor="endDate">To</Label>
              <Input id="endDate" type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="mt-1" />
            </div>
          </div>
          <Button onClick={() => { setEditing(null); setCreateOpen(true); }}>
            <Plus className="mr-2 h-4 w-4" /> New allocation
          </Button>
        </div>
      </Card>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <KpiCard label="Allocated" value={totals.allocated.toLocaleString()} />
        <KpiCard label="Sold" value={totals.sold.toLocaleString()} />
        <KpiCard label="Remaining" value={totals.remaining.toLocaleString()} />
        <KpiCard label="Revenue" value={`$${totals.revenue.toFixed(2)}`} />
      </section>

      {isLoading ? (
        <div className="space-y-2">
          <Skeleton className="h-12" />
          <Skeleton className="h-12" />
          <Skeleton className="h-12" />
        </div>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Date</TableHead>
              <TableHead>Store</TableHead>
              <TableHead>Food</TableHead>
              <TableHead>Allocated</TableHead>
              <TableHead>Sold</TableHead>
              <TableHead>Remaining</TableHead>
              <TableHead>Cost</TableHead>
              <TableHead>Revenue</TableHead>
              <TableHead>Status</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {!data?.length ? (
              <TableEmpty colspan={10}>No allocations in the selected range.</TableEmpty>
            ) : (
              data?.map((row) => {
                const storeName = stores.find((s) => s.id === row.storeId)?.name ?? row.storeId;
                const sold = Number(row.sold ?? 0);
                const allocated = Number(row.quantity || 0);
                const remaining = Number(row.remaining ?? Math.max(allocated - sold, 0));
                const revenue = Number(row.revenue ?? 0);
                const totalCost = Number(row.totalCost ?? 0);
                const isReversed = row.status === 'REVERSED';
                return (
                  <TableRow key={row.id}>
                    <TableCell>{row.date}</TableCell>
                    <TableCell className="font-medium text-zinc-950">{storeName}</TableCell>
                    <TableCell>{row.foodName ?? row.foodItemId}</TableCell>
                    <TableCell>{allocated}</TableCell>
                    <TableCell>{sold}</TableCell>
                    <TableCell>
                      <span className={remaining === 0 && allocated > 0 ? 'text-emerald-700' : ''}>{remaining}</span>
                    </TableCell>
                    <TableCell>${totalCost.toFixed(2)}</TableCell>
                    <TableCell>${revenue.toFixed(2)}</TableCell>
                    <TableCell>
                      <Badge className={isReversed ? 'bg-zinc-100 text-zinc-500 border-zinc-200' : 'bg-emerald-50 text-emerald-700 border-emerald-200'}>
                        {row.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button variant="ghost" onClick={() => setViewing(row)} aria-label="View deductions" title="View deductions">
                          <Eye className="h-4 w-4" />
                        </Button>
                        {row.status === 'ACTIVE' && remaining > 0 ? (
                          <Button
                            variant="ghost"
                            onClick={() => onReclaim(row)}
                            aria-label="Reclaim remaining"
                            title="Reclaim remaining (refund leftovers to master pool)"
                          >
                            <Undo2 className="h-4 w-4 text-amber-600" />
                          </Button>
                        ) : null}
                        {!isReversed ? (
                          <>
                            <Button variant="ghost" onClick={() => setEditing(row)} aria-label="Edit" title="Edit">
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button variant="ghost" onClick={() => onDelete(row)} aria-label="Reverse" title="Reverse (refund stock)">
                              <RotateCcw className="h-4 w-4 text-red-500" />
                            </Button>
                          </>
                        ) : null}
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      )}

      <AllocationDialog
        open={createOpen || editing !== null}
        onOpenChange={(next) => { if (!next) { setCreateOpen(false); setEditing(null); } }}
        initial={editing}
        onSubmit={editing ? onEdit : onCreate}
        isPending={createMutation.isPending || updateMutation.isPending}
      />

      <AllocationDetailSheet
        allocation={viewing}
        open={viewing !== null}
        onOpenChange={(next) => { if (!next) setViewing(null); }}
      />
    </div>
  );
}