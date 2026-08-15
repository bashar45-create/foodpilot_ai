import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { ShoppingCart, Plus } from 'lucide-react';
import { toast } from 'sonner';
import { formatDistanceToNow } from 'date-fns';

import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableEmpty, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogFooter } from '@/components/ui/dialog';
import { useActiveStore } from '@/hooks/use-active-store';
import { useStores } from '@/features/stores/hooks/use-stores';
import { useFood } from '@/features/food/hooks/use-food';
import { useRecordSale, useSales } from '@/features/sales/hooks/use-sales';
import { ApiException } from '@/types/api';

const schema = z.object({
  storeId: z.string().min(1, 'Pick a store'),
  foodItemId: z.string().min(1, 'Pick a food item'),
  quantity: z.coerce.number().int().positive('Must be > 0'),
  channel: z.enum(['POS', 'ONLINE', 'KIOSK']).default('POS'),
});

type FormValues = z.infer<typeof schema>;

export function SalesPage(): JSX.Element {
  const { storeId: defaultStoreId } = useActiveStore();
  const { data: stores = [] } = useStores();
  const { data: food = [] } = useFood();
  const { data: sales = [], isLoading } = useSales(defaultStoreId ?? undefined);
  const recordMutation = useRecordSale();
  const [opening, setOpening] = useState(false);

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { storeId: defaultStoreId ?? '', foodItemId: '', quantity: 1, channel: 'POS' },
  });
  const { register, handleSubmit, reset, formState: { errors } } = form;

  useEffect(() => {
    if (!form.getValues('storeId') && defaultStoreId) {
      reset({ storeId: defaultStoreId, foodItemId: '', quantity: 1, channel: 'POS' });
    }
  }, [defaultStoreId, form, reset]);

  async function onSubmit(values: FormValues) {
    try {
      const sale = await recordMutation.mutateAsync(values);
      toast.success(`Recorded ${sale.foodName} × ${sale.quantity} — $${Number(sale.totalPrice ?? 0).toFixed(2)}`);
      setOpening(false);
      reset({ storeId: values.storeId, foodItemId: '', quantity: 1, channel: values.channel });
    } catch (error) {
      toast.error(error instanceof ApiException ? error.message : 'Sale failed');
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-zinc-500">{sales.length} sales</p>
        <Button onClick={() => setOpening(true)}>
          <Plus className="mr-2 h-4 w-4" /> Record sale
        </Button>
      </div>

      {isLoading ? (
        <div className="space-y-2">
          <Skeleton className="h-12" />
          <Skeleton className="h-12" />
        </div>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Item</TableHead>
              <TableHead>Qty</TableHead>
              <TableHead>Channel</TableHead>
              <TableHead>Total</TableHead>
              <TableHead>Profit</TableHead>
              <TableHead>When</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sales.length === 0 ? (
              <TableEmpty colspan={6}>No sales yet. Record one to get started.</TableEmpty>
            ) : (
              sales.map((sale) => {
                const profit = Number(sale.profit ?? 0);
                const total = Number(sale.totalPrice ?? 0);
                return (
                <TableRow key={sale.id}>
                  <TableCell className="font-semibold text-zinc-950">{sale.foodName}</TableCell>
                  <TableCell>{sale.quantity}</TableCell>
                  <TableCell><Badge>{sale.channel}</Badge></TableCell>
                  <TableCell>${total.toFixed(2)}</TableCell>
                  <TableCell className={profit >= 0 ? 'text-emerald-600' : 'text-red-600'}>
                    ${profit.toFixed(2)}
                  </TableCell>
                  <TableCell className="text-zinc-500">
                    {formatDistanceToNow(new Date(sale.createdAt), { addSuffix: true })}
                  </TableCell>
                </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      )}

      <Dialog open={opening} onOpenChange={setOpening} title="Record sale">
        <form className="space-y-4" onSubmit={handleSubmit(onSubmit)}>
          <div>
            <Label htmlFor="storeId">Store</Label>
            <Select id="storeId" {...register('storeId')} className="mt-1">
              <option value="">Select store…</option>
              {stores.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </Select>
            {errors.storeId ? <p className="mt-1 text-xs text-red-600">{errors.storeId.message}</p> : null}
          </div>
          <div>
            <Label htmlFor="foodItemId">Food item</Label>
            <Select id="foodItemId" {...register('foodItemId')} className="mt-1">
              <option value="">Select food…</option>
              {food.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.name} — ${f.price.toFixed(2)}
                </option>
              ))}
            </Select>
            {errors.foodItemId ? <p className="mt-1 text-xs text-red-600">{errors.foodItemId.message}</p> : null}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="quantity">Quantity</Label>
              <Input id="quantity" type="number" step="1" min={1} {...register('quantity')} className="mt-1" />
              {errors.quantity ? <p className="mt-1 text-xs text-red-600">{errors.quantity.message}</p> : null}
            </div>
            <div>
              <Label htmlFor="channel">Channel</Label>
              <Select id="channel" {...register('channel')} className="mt-1">
                <option value="POS">POS</option>
                <option value="ONLINE">Online</option>
                <option value="KIOSK">Kiosk</option>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpening(false)}>Cancel</Button>
            <Button type="submit" disabled={recordMutation.isPending}>
              <ShoppingCart className="mr-2 h-4 w-4" /> Record
            </Button>
          </DialogFooter>
        </form>
      </Dialog>
    </div>
  );
}
