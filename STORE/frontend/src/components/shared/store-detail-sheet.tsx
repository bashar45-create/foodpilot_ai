import { Boxes, MapPin, Phone, Clock, TrendingUp, Users, AlertTriangle, PackageCheck } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';

import { Sheet } from '@/components/ui/sheet';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableEmpty, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import type { Store } from '@/features/stores/hooks/use-stores';
import type { StoreSummaryResponse } from '@/api/endpoints/analytics';

interface StoreDetailSheetProps {
  store: Store | null;
  open: boolean;
  onOpenChange: (next: boolean) => void;
  summary: StoreSummaryResponse | undefined;
  isLoading: boolean;
  error?: Error | null;
}

function formatCurrency(value: number): string {
  return `$${(Number(value) || 0).toFixed(2)}`;
}

function formatDate(date?: string | null): string {
  if (!date) return '—';
  try {
    return formatDistanceToNow(new Date(date), { addSuffix: true });
  } catch {
    return '—';
  }
}

export function StoreDetailSheet({
  store,
  open,
  onOpenChange,
  summary,
  isLoading,
  error,
}: StoreDetailSheetProps): JSX.Element {
  const title = store ? `${store.name}` : 'Store detail';
  const description = store?.code ? `Code: ${store.code}` : undefined;

  return (
    <Sheet open={open} onOpenChange={onOpenChange} title={title} description={description} className="max-w-2xl">
      {!store ? null : (
        <div className="space-y-6">
          {/* Header / metadata */}
          <Card className="space-y-3">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-zinc-950 text-white">
                <Boxes className="h-4 w-4" />
              </div>
              <div className="flex-1">
                <p className="text-base font-semibold text-zinc-950">{store.name}</p>
                <p className="text-xs text-zinc-500">
                  {store.type ?? 'STORE'} · {store.code ?? 'no code'}
                </p>
              </div>
              <Badge className={store.isActive ?? true ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-zinc-100 text-zinc-500 border-zinc-200'}>
                {store.isActive ?? true ? 'OPEN' : 'CLOSED'}
              </Badge>
            </div>
            <div className="grid grid-cols-1 gap-2 text-xs text-zinc-600 sm:grid-cols-3">
              <span className="inline-flex items-center gap-1.5">
                <MapPin className="h-3.5 w-3.5" />
                {store.address ?? '—'}{store.city ? `, ${store.city}` : ''}
              </span>
              <span className="inline-flex items-center gap-1.5">
                <Phone className="h-3.5 w-3.5" />
                {store.phone ?? 'no phone'}
              </span>
              <span className="inline-flex items-center gap-1.5">
                <Clock className="h-3.5 w-3.5" />
                {store.openingTime ?? '—'} – {store.closingTime ?? '—'}
              </span>
            </div>
          </Card>

          {isLoading ? (
            <div className="space-y-3">
              <Skeleton className="h-20" />
              <Skeleton className="h-20" />
              <Skeleton className="h-20" />
            </div>
          ) : error ? (
            <Card className="text-sm text-red-600">
              Could not load store summary: {error.message}
            </Card>
          ) : !summary || !summary.store ? (
            <Card className="text-sm text-zinc-500">No data available for this store.</Card>
          ) : (
            <>
              {/* KPI strip */}
              <section className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
                <KpiTile label="Today sales" value={String(summary.today.sales)} sub={formatCurrency(summary.today.revenue)} />
                <KpiTile label="7-day sales" value={String(summary.last7.sales)} sub={formatCurrency(summary.last7.revenue)} />
                <KpiTile label="30-day sales" value={String(summary.last30.sales)} sub={formatCurrency(summary.last30.revenue)} />
                <KpiTile label="30-day profit" value={formatCurrency(summary.profit30d.profit)} sub={`${summary.profit30d.marginPct.toFixed(1)}% margin`} />
                <KpiTile label="Active employees" value={String(summary.totals.activeEmployeesCount)} sub={`${summary.employees.length} total`} />
                <KpiTile label="Active allocations" value={String(summary.totals.allocatedCount)} sub={summary.totals.lowStockItems > 0 ? `${summary.totals.lowStockItems} low-stock` : 'no low-stock'} />
              </section>

              {summary.totals.lowStockItems > 0 ? (
                <Card className="flex items-center gap-3 border-amber-200 bg-amber-50">
                  <AlertTriangle className="h-5 w-5 text-amber-600" />
                  <div className="flex-1 text-sm text-amber-900">
                    <p className="font-semibold">{summary.totals.lowStockItems} ingredient(s) are below threshold.</p>
                    <p className="text-xs text-amber-700">Restock before the next allocation to avoid shortages.</p>
                  </div>
                </Card>
              ) : null}

              {/* Allocations table */}
              <Card className="space-y-3">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-semibold text-zinc-950">Allocations (last 30 days)</p>
                  <Badge>{summary.allocations.length}</Badge>
                </div>
                {summary.allocations.length === 0 ? (
                  <p className="text-sm text-zinc-500">No allocations in the last 30 days.</p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Date</TableHead>
                        <TableHead>Food</TableHead>
                        <TableHead>Alloc.</TableHead>
                        <TableHead>Sold</TableHead>
                        <TableHead>Rem.</TableHead>
                        <TableHead>Cost</TableHead>
                        <TableHead>Revenue</TableHead>
                        <TableHead>Profit</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {summary.allocations.map((a) => (
                        <TableRow key={a.id}>
                          <TableCell className="text-xs">{a.date}</TableCell>
                          <TableCell className="font-medium text-zinc-950">{a.foodName ?? a.foodId}</TableCell>
                          <TableCell>{a.allocated}</TableCell>
                          <TableCell>{a.sold}</TableCell>
                          <TableCell className={a.remaining === 0 && a.allocated > 0 ? 'text-emerald-700' : ''}>{a.remaining}</TableCell>
                          <TableCell>{formatCurrency(a.totalCost)}</TableCell>
                          <TableCell>{formatCurrency(a.revenue)}</TableCell>
                          <TableCell className={a.profit >= 0 ? 'text-emerald-700' : 'text-red-600'}>{formatCurrency(a.profit)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </Card>

              {/* Top food + Employees */}
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                <Card className="space-y-3">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-semibold text-zinc-950">Top selling food (30d)</p>
                    <TrendingUp className="h-4 w-4 text-zinc-400" />
                  </div>
                  {summary.topFood.length === 0 ? (
                    <p className="text-sm text-zinc-500">No sales recorded yet.</p>
                  ) : (
                    <ul className="space-y-2">
                      {summary.topFood.map((f) => (
                        <li key={f.foodId} className="flex items-center justify-between rounded-2xl border border-zinc-200 bg-white px-3 py-2 text-sm">
                          <span className="font-medium text-zinc-950">{f.name ?? f.foodId}</span>
                          <span className="text-xs text-zinc-500">
                            {f.quantity} sold · <strong className="text-zinc-950">{formatCurrency(f.revenue)}</strong>
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </Card>

                <Card className="space-y-3">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-semibold text-zinc-950">Assigned employees</p>
                    <Users className="h-4 w-4 text-zinc-400" />
                  </div>
                  {summary.employees.length === 0 ? (
                    <p className="text-sm text-zinc-500">No employees assigned to this store.</p>
                  ) : (
                    <ul className="space-y-2">
                      {summary.employees.map((e) => (
                        <li key={e.id} className="flex items-center justify-between rounded-2xl border border-zinc-200 bg-white px-3 py-2 text-sm">
                          <div className="min-w-0">
                            <p className="truncate font-medium text-zinc-950">{e.name ?? e.username ?? e.email ?? e.id}</p>
                            <p className="text-xs text-zinc-500">
                              {e.role ?? '—'}
                              {e.lastLoginAt ? ` · last seen ${formatDate(e.lastLoginAt)}` : ''}
                            </p>
                          </div>
                          <Badge className={e.isActive === false ? 'bg-zinc-100 text-zinc-500 border-zinc-200' : 'bg-emerald-50 text-emerald-700 border-emerald-200'}>
                            {e.isActive === false ? 'inactive' : 'active'}
                          </Badge>
                        </li>
                      ))}
                    </ul>
                  )}
                </Card>
              </div>

              <div className="flex items-center justify-end gap-2">
                <Button variant="outline" onClick={() => onOpenChange(false)}>Close</Button>
                <Button onClick={() => window.location.assign(`/allocations?storeId=${store.id}`)}>
                  <PackageCheck className="mr-2 h-4 w-4" /> Manage allocations
                </Button>
              </div>
            </>
          )}
        </div>
      )}
    </Sheet>
  );
}

function KpiTile({ label, value, sub }: { label: string; value: string; sub?: string }): JSX.Element {
  return (
    <div className="rounded-2xl border border-zinc-300 bg-white p-3">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">{label}</p>
      <p className="mt-1 text-xl font-black tracking-tight text-zinc-950">{value}</p>
      {sub ? <p className="text-xs text-zinc-500">{sub}</p> : null}
    </div>
  );
}