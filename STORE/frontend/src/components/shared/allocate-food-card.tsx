import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { PackagePlus, ChefHat } from 'lucide-react';
import { toast } from 'sonner';

import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { useStores } from '@/features/stores/hooks/use-stores';
import { useFood } from '@/features/food/hooks/use-food';
import { useAllocateFood } from '@/features/inventory/hooks/use-allocate-food';
import { useIngredients } from '@/features/inventory/hooks/use-ingredients';
import { ApiException } from '@/types/api';
import type { FoodAllocationDeduction } from '@/api/endpoints/inventory';

const schema = z.object({
  storeId: z.string().min(1, 'Pick a store'),
  foodItemId: z.string().min(1, 'Pick a food item'),
  quantity: z.coerce.number().int().positive('Must be at least 1'),
});

type FormValues = z.infer<typeof schema>;

interface DeductionRow {
  ingredientId: string;
  quantity: number;
  before: number;
  after: number;
}

export function AllocateFoodCard(): JSX.Element {
  const { data: stores = [] } = useStores();
  const { data: foodItems = [] } = useFood();
  const { data: ingredients = [] } = useIngredients();
  const mutation = useAllocateFood();
  const [lastDeductions, setLastDeductions] = useState<{ foodName: string; quantity: number; deductions: DeductionRow[] } | null>(null);

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { storeId: '', foodItemId: '', quantity: 1 },
  });
  const { register, handleSubmit, reset, formState: { errors } } = form;

  async function onSubmit(values: FormValues) {
    try {
      const result = await mutation.mutateAsync({
        storeId: values.storeId,
        foodItemId: values.foodItemId,
        quantity: values.quantity,
      });
      const foodName = result.foodName || foodItems.find((f) => f.id === values.foodItemId)?.name || 'food item';
      setLastDeductions({
        foodName,
        quantity: result.quantity,
        deductions: result.deductions as FoodAllocationDeduction[],
      });
      toast.success(`Allocated ${result.quantity} × ${foodName}`);
      reset({ storeId: values.storeId, foodItemId: values.foodItemId, quantity: 1 });
    } catch (error) {
      toast.error(error instanceof ApiException ? error.message : 'Allocation failed');
    }
  }

  return (
    <Card>
      <header className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <ChefHat className="h-5 w-5 text-zinc-700" />
          <div>
            <h3 className="text-lg font-bold tracking-tight">Allocate food to store</h3>
            <p className="text-xs text-zinc-500">Ingredients are drawn from the master pool (Stock &raquo; pool) and mirrored onto the store&rsquo;s shelf. Restock from Inventory &raquo; Restock when the pool runs low; reclaim leftovers at end of day from the Allocations page.</p>
          </div>
        </div>
      </header>

      <form className="grid gap-3 md:grid-cols-4" onSubmit={handleSubmit(onSubmit)}>
        <div>
          <Label htmlFor="storeId">Store</Label>
          <Select id="storeId" {...register('storeId')} className="mt-1">
            <option value="">Select…</option>
            {stores.map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </Select>
          {errors.storeId ? <p className="mt-1 text-xs text-red-600">{errors.storeId.message}</p> : null}
        </div>
        <div>
          <Label htmlFor="foodItemId">Food item</Label>
          <Select id="foodItemId" {...register('foodItemId')} className="mt-1">
            <option value="">Select…</option>
            {foodItems.map((f) => (
              <option key={f.id} value={f.id}>{f.name}</option>
            ))}
          </Select>
          {errors.foodItemId ? <p className="mt-1 text-xs text-red-600">{errors.foodItemId.message}</p> : null}
        </div>
        <div>
          <Label htmlFor="quantity">Quantity</Label>
          <Input id="quantity" type="number" min={1} step={1} {...register('quantity', { valueAsNumber: true })} className="mt-1" />
          {errors.quantity ? <p className="mt-1 text-xs text-red-600">{errors.quantity.message}</p> : null}
        </div>
        <div className="flex items-end">
          <Button type="submit" disabled={mutation.isPending} className="w-full">
            <PackagePlus className="mr-2 h-4 w-4" /> Allocate
          </Button>
        </div>
      </form>

      {lastDeductions ? (
        <div className="mt-4 rounded-2xl border border-zinc-300 bg-zinc-50 p-3">
          <p className="text-sm font-semibold text-zinc-950">
            Last allocation: {lastDeductions.quantity} × {lastDeductions.foodName}
          </p>
          <ul className="mt-2 space-y-1 text-xs text-zinc-700">
            {lastDeductions.deductions.map((d) => {
              const name = ingredients.find((ing) => ing.id === d.ingredientId)?.name;
              return (
                <li key={d.ingredientId} className="flex justify-between">
                  <span className="font-medium text-zinc-950">
                    {name ?? <span className="font-mono text-xs text-zinc-400">{d.ingredientId}</span>}
                  </span>
                  <span>−{d.quantity} (stock {d.before} → {d.after})</span>
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}
    </Card>
  );
}