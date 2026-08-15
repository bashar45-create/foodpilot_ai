import { useEffect, useState } from 'react';
import type { SubmitErrorHandler } from 'react-hook-form';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { Plus, Pencil, Trash2, AlertTriangle, PackagePlus, ArrowUpRight, ArrowDownRight } from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Sheet, Sheet as _Sheet } from '@/components/ui/sheet';
import { Table, TableBody, TableCell, TableEmpty, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogFooter } from '@/components/ui/dialog';
import {
  useAdjustStock,
  useCreateIngredient,
  useDeleteIngredient,
  useIngredients,
  useUpdateIngredientMutation,
} from '@/features/inventory/hooks/use-ingredients';
import { AllocateFoodCard } from '@/components/shared/allocate-food-card';
import type { Ingredient } from '@/api/endpoints/ingredients';
import { ApiException } from '@/types/api';

const schema = z.object({
  name: z.string().min(1, 'Required'),
  category: z.string().optional(),
  unit: z.string().min(1, 'Required'),
  costPerUnit: z.coerce.number().min(0).optional(),
  currentStock: z.coerce.number().min(0).optional(),
  minimumStock: z.coerce.number().min(0).optional(),
  maximumStock: z.coerce.number().min(0).optional(),
});

type FormValues = z.infer<typeof schema>;

const restockSchema = z.object({
  direction: z.enum(['add', 'remove']),
  quantity: z.coerce.number().positive('Must be greater than 0'),
  reason: z.string().min(2, 'Add a short reason (e.g. "Restock from supplier", "Spillage")'),
});

type RestockValues = z.infer<typeof restockSchema>;

function RestockDialog({
  ingredient,
  open,
  onOpenChange,
  onSubmit,
  isPending,
}: {
  ingredient: Ingredient | null;
  open: boolean;
  onOpenChange: (next: boolean) => void;
  onSubmit: (values: RestockValues) => Promise<void> | void;
  isPending: boolean;
}): JSX.Element {
  const form = useForm<RestockValues>({
    resolver: zodResolver(restockSchema),
    defaultValues: { direction: 'add', quantity: 0, reason: 'Restock from supplier' },
  });

  useEffect(() => {
    if (open) {
      form.reset({ direction: 'add', quantity: 0, reason: 'Restock from supplier' });
    }
  }, [open, form]);

  const direction = form.watch('direction');
  const currentStock = Number(ingredient?.currentStock ?? 0);
  const qty = Number(form.watch('quantity') || 0);
  const projected = direction === 'add' ? currentStock + qty : currentStock - qty;

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={ingredient ? `Restock — ${ingredient.name}` : 'Restock'}
      description="Adjust the on-hand stock for this ingredient. Use Add to receive new inventory; use Remove for shrinkage, spillage, or manual write-offs."
    >
      <form className="space-y-4" onSubmit={form.handleSubmit(onSubmit)}>
        <div className="rounded-2xl border border-zinc-300 bg-zinc-50 p-3 text-sm">
          <div className="flex items-center justify-between">
            <span className="text-zinc-500">Current pool</span>
            <span className="font-semibold text-zinc-950">{currentStock} {ingredient?.unit ?? ''}</span>
          </div>
          <div className="mt-2 flex items-center justify-between">
            <span className="text-zinc-500">After adjustment</span>
            <span className={`font-semibold ${projected < 0 ? 'text-red-600' : 'text-emerald-700'}`}>
              {projected.toFixed(2)} {ingredient?.unit ?? ''}
            </span>
          </div>
        </div>
        <div>
          <Label>Direction</Label>
          <div className="mt-1 grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => form.setValue('direction', 'add', { shouldValidate: true })}
              className={`flex items-center justify-center gap-2 rounded-2xl border px-3 py-2 text-sm font-semibold transition ${
                direction === 'add'
                  ? 'border-emerald-300 bg-emerald-50 text-emerald-700'
                  : 'border-zinc-300 bg-white text-zinc-700 hover:bg-zinc-50'
              }`}
            >
              <ArrowUpRight className="h-4 w-4" /> Add stock
            </button>
            <button
              type="button"
              onClick={() => form.setValue('direction', 'remove', { shouldValidate: true })}
              className={`flex items-center justify-center gap-2 rounded-2xl border px-3 py-2 text-sm font-semibold transition ${
                direction === 'remove'
                  ? 'border-red-300 bg-red-50 text-red-600'
                  : 'border-zinc-300 bg-white text-zinc-700 hover:bg-zinc-50'
              }`}
            >
              <ArrowDownRight className="h-4 w-4" /> Remove stock
            </button>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label htmlFor="restock-quantity">Quantity ({ingredient?.unit ?? ''})</Label>
            <Input
              id="restock-quantity"
              type="number"
              step="0.01"
              min={0.01}
              {...form.register('quantity', { valueAsNumber: true })}
              className="mt-1"
            />
            {form.formState.errors.quantity ? (
              <p className="mt-1 text-xs text-red-600">{form.formState.errors.quantity.message}</p>
            ) : null}
          </div>
          <div>
            <Label htmlFor="restock-reason">Reason</Label>
            <Input id="restock-reason" {...form.register('reason')} className="mt-1" />
            {form.formState.errors.reason ? (
              <p className="mt-1 text-xs text-red-600">{form.formState.errors.reason.message}</p>
            ) : null}
          </div>
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button type="submit" disabled={isPending || projected < 0}>
            {direction === 'add' ? 'Add stock' : 'Remove stock'}
          </Button>
        </DialogFooter>
      </form>
    </Dialog>
  );
}

export function InventoryPage(): JSX.Element {
  const [filter, setFilter] = useState<'all' | 'low'>('all');
  const { data, isLoading } = useIngredients(filter === 'low' ? { lowStock: true } : {});
  const [editing, setEditing] = useState<Ingredient | null>(null);
  const [creating, setCreating] = useState(false);
  const [restockTarget, setRestockTarget] = useState<Ingredient | null>(null);
  const createMutation = useCreateIngredient();
  const updateMutation = useUpdateIngredientMutation();
  const deleteMutation = useDeleteIngredient();
  const adjustMutation = useAdjustStock();

  const form = useForm<FormValues>({ resolver: zodResolver(schema) });
  const { register, handleSubmit, reset, formState: { errors } } = form;

  function openCreate() {
    reset({ name: '', category: '', unit: 'kg', costPerUnit: 0, currentStock: 0, minimumStock: 0 });
    setEditing(null);
    setCreating(true);
  }

  function openEdit(ing: Ingredient) {
    reset({
      name: ing.name,
      category: ing.category ?? '',
      unit: ing.unit,
      costPerUnit: ing.costPerUnit ?? 0,
      currentStock: ing.currentStock ?? 0,
      minimumStock: ing.minimumStock ?? 0,
      maximumStock: ing.maximumStock ?? 0,
    });
    setEditing(ing);
    setCreating(true);
  }

  const onInvalid: SubmitErrorHandler<FormValues> = (formErrors) => {
    const entries = Object.entries(formErrors);
    const summary = entries
      .map(([key, value]) => {
        const v = value as { message?: string } | undefined;
        return v?.message ? `${key}: ${v.message}` : key;
      })
      .join('; ');
    console.warn('[inventory] validation failed', formErrors);
    toast.error(summary || 'Please fix the highlighted fields');
  };

  async function onSubmit(values: FormValues) {
    try {
      if (editing && editing.id) {
        await updateMutation.mutateAsync({ id: editing.id, input: values });
        toast.success(`Updated ${values.name}`);
      } else {
        await createMutation.mutateAsync(values);
        toast.success(`Created ${values.name}`);
      }
      setCreating(false);
      setEditing(null);
    } catch (error) {
      const message = error instanceof ApiException ? error.message : 'Failed to save ingredient';
      toast.error(message);
      console.error('[inventory] save failed', error);
    }
  }

  async function onDelete(ing: Ingredient) {
    if (!confirm(`Delete ${ing.name}?`)) return;
    try {
      await deleteMutation.mutateAsync(ing.id);
      toast.success(`Deleted ${ing.name}`);
    } catch (error) {
      toast.error(error instanceof ApiException ? error.message : 'Delete failed');
    }
  }

  async function onRestock(values: RestockValues) {
    if (!restockTarget) return;
    const signed = values.direction === 'add' ? values.quantity : -values.quantity;
    try {
      await adjustMutation.mutateAsync({
        ingredientId: restockTarget.id,
        quantity: signed,
        reason: values.reason,
      });
      toast.success(
        values.direction === 'add'
          ? `Added ${values.quantity} ${restockTarget.unit} to ${restockTarget.name}`
          : `Removed ${values.quantity} ${restockTarget.unit} from ${restockTarget.name}`,
      );
      setRestockTarget(null);
    } catch (error) {
      toast.error(error instanceof ApiException ? error.message : 'Stock adjustment failed');
    }
  }

  return (
    <div className="space-y-4">
      <AllocateFoodCard />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Select value={filter} onChange={(e) => setFilter(e.target.value as 'all' | 'low')}>
            <option value="all">All ingredients</option>
            <option value="low">Low stock only</option>
          </Select>
        </div>
        <Button onClick={openCreate}>
          <Plus className="mr-2 h-4 w-4" /> New ingredient
        </Button>
      </div>

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
              <TableHead>Name</TableHead>
              <TableHead>Category</TableHead>
              <TableHead>Unit</TableHead>
              <TableHead>Cost / unit</TableHead>
              <TableHead>Stock (pool)</TableHead>
              <TableHead>Min</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {data?.length === 0 ? (
              <TableEmpty colspan={7}>No ingredients found. Add one to get started.</TableEmpty>
            ) : (
              data?.map((ing) => {
                const minStock = Number(ing.minimumStock ?? 0);
                const curStock = Number(ing.currentStock ?? 0);
                const isLow = minStock > 0 && curStock < minStock;
                return (
                  <TableRow key={ing.id}>
                    <TableCell className="font-semibold text-zinc-950">{ing.name}</TableCell>
                    <TableCell>{ing.category ?? '—'}</TableCell>
                    <TableCell>{ing.unit}</TableCell>
                    <TableCell>${(ing.costPerUnit ?? 0).toFixed(2)}</TableCell>
                    <TableCell>
                      <span className="inline-flex items-center gap-1">
                        {curStock}
                        {isLow ? <AlertTriangle className="h-3.5 w-3.5 text-red-500" /> : null}
                      </span>
                    </TableCell>
                    <TableCell>{ing.minimumStock ?? 0}</TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button variant="ghost" onClick={() => setRestockTarget(ing)} aria-label={`Restock ${ing.name}`} title="Restock / adjust stock">
                          <PackagePlus className="h-4 w-4 text-emerald-600" />
                        </Button>
                        <Button variant="ghost" onClick={() => openEdit(ing)} aria-label="Edit" title="Edit">
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" onClick={() => onDelete(ing)} aria-label="Delete" title="Delete">
                          <Trash2 className="h-4 w-4 text-red-500" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      )}

      <Sheet
        open={creating}
        onOpenChange={(o) => {
          setCreating(o);
          if (!o) setEditing(null);
        }}
        title={editing ? 'Edit ingredient' : 'New ingredient'}
        description={editing ? 'Update the ingredient details.' : 'Add a new ingredient to the catalog.'}
      >
        <form className="space-y-4" onSubmit={handleSubmit(onSubmit, onInvalid)} noValidate>
          <div>
            <Label htmlFor="name">Name</Label>
            <Input id="name" {...register('name')} className="mt-1" />
            {errors.name ? <p className="mt-1 text-xs text-red-600">{errors.name.message}</p> : null}
          </div>
          <div>
            <Label htmlFor="category">Category</Label>
            <Input id="category" {...register('category')} className="mt-1" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="unit">Unit</Label>
              <Select id="unit" {...register('unit')} className="mt-1">
                <option value="kg">kg</option>
                <option value="g">g</option>
                <option value="l">l</option>
                <option value="ml">ml</option>
                <option value="pcs">pcs</option>
                <option value="pack">pack</option>
              </Select>
            </div>
            <div>
              <Label htmlFor="costPerUnit">Cost / unit</Label>
              <Input id="costPerUnit" type="number" step="0.01" {...register('costPerUnit')} className="mt-1" />
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <Label htmlFor="currentStock">Stock (pool)</Label>
              <Input id="currentStock" type="number" step="0.01" {...register('currentStock')} className="mt-1" />
            </div>
            <div>
              <Label htmlFor="minimumStock">Min</Label>
              <Input id="minimumStock" type="number" step="0.01" {...register('minimumStock')} className="mt-1" />
            </div>
            <div>
              <Label htmlFor="maximumStock">Max</Label>
              <Input id="maximumStock" type="number" step="0.01" {...register('maximumStock')} className="mt-1" />
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" type="button" onClick={() => setCreating(false)}>Cancel</Button>
            <Button type="submit" disabled={createMutation.isPending || updateMutation.isPending}>
              {editing ? 'Save changes' : 'Create ingredient'}
            </Button>
          </div>
        </form>
      </Sheet>

      <RestockDialog
        ingredient={restockTarget}
        open={restockTarget !== null}
        onOpenChange={(next) => { if (!next) setRestockTarget(null); }}
        onSubmit={onRestock}
        isPending={adjustMutation.isPending}
      />
    </div>
  );
}
