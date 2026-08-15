import { useState } from 'react';
import { Download, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableEmpty, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select } from '@/components/ui/select';
import { DateRangePicker } from '@/components/shared/date-range-picker';
import {
  useEmployeesAnalytics,
  useFoodAnalytics,
  useInventoryAnalytics,
  useProfit,
  useRevenue,
  useStoresComparison,
} from '@/features/analytics/hooks/use-analytics';
import { downloadReportCsv } from '@/api/endpoints/analytics';
import { ApiException } from '@/types/api';

type GroupBy = 'day' | 'week' | 'month';

function defaultLast30Days(): { from?: string; to?: string } {
  const now = new Date();
  const start = new Date(now);
  start.setDate(start.getDate() - 30);
  const fmt = (d: Date) => d.toISOString().slice(0, 10);
  return { from: fmt(start), to: fmt(now) };
}

export function ReportsPage(): JSX.Element {
  const [range, setRange] = useState<{ from?: string; to?: string }>(defaultLast30Days());
  const [groupBy, setGroupBy] = useState<GroupBy>('day');
  const [exporting, setExporting] = useState<string | null>(null);

  const revenue = useRevenue(range, groupBy);
  const profit = useProfit(range);
  const inventory = useInventoryAnalytics(range);
  const employees = useEmployeesAnalytics(range);
  const stores = useStoresComparison(range);
  const food = useFoodAnalytics(range, 10);

  async function exportReport(
    report: 'revenue' | 'profit' | 'inventory' | 'employees' | 'stores' | 'food',
  ) {
    setExporting(report);
    try {
      const { blob, filename } = await downloadReportCsv(report, range, groupBy);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      a.rel = 'noopener';
      a.style.display = 'none';
      document.body.appendChild(a);
      a.click();
      // Give the browser a tick to start the download before revoking the URL.
      setTimeout(() => {
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      }, 1000);
      toast.success(`${report} report downloaded`);
    } catch (error) {
      const message = error instanceof ApiException ? error.message : 'Export failed';
      toast.error(message);
      console.error('[ExportCSV] failed', error);
    } finally {
      setExporting(null);
    }
  }

  function rangeText() {
    if (range.from && range.to) return `${range.from} → ${range.to}`;
    if (range.from) return `From ${range.from}`;
    if (range.to) return `Until ${range.to}`;
    return 'Last 30 days';
  }

  return (
    <div className="space-y-6">
      <Card className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="text-lg font-bold tracking-tight">Reports & analytics</h2>
          <p className="text-sm text-zinc-500">Time window: {rangeText()}</p>
        </div>
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label className="block text-xs font-medium text-zinc-500">Group by</label>
            <Select value={groupBy} onChange={(e) => setGroupBy(e.target.value as GroupBy)} className="mt-1">
              <option value="day">Day</option>
              <option value="week">Week</option>
              <option value="month">Month</option>
            </Select>
          </div>
          <DateRangePicker from={range.from} to={range.to} onChange={setRange} />
        </div>
      </Card>

      {/* Revenue */}
      <Card>
        <SectionHeader title="Revenue" subtitle={`Grouped by ${groupBy}`} onExport={() => exportReport('revenue')} exporting={exporting === 'revenue'} />
        {revenue.isLoading ? (
          <Skeleton className="h-32" />
        ) : !revenue.data?.buckets?.length ? (
          <p className="text-sm text-zinc-500">No revenue in this window.</p>
        ) : (
          <>
            <div className="mb-4 grid grid-cols-3 gap-4">
              <Mini label="Total revenue" value={`$${revenue.data.total.revenue.toFixed(2)}`} />
              <Mini label="Total sales" value={String(revenue.data.total.sales)} />
              <Mini label="Units sold" value={String(revenue.data.total.quantity)} />
            </div>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Bucket</TableHead>
                  <TableHead>Revenue</TableHead>
                  <TableHead>Sales</TableHead>
                  <TableHead>Quantity</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {revenue.data.buckets.map((b) => (
                  <TableRow key={b.key}>
                    <TableCell className="font-mono text-xs">{b.key}</TableCell>
                    <TableCell>${b.revenue.toFixed(2)}</TableCell>
                    <TableCell>{b.sales}</TableCell>
                    <TableCell>{b.quantity}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </>
        )}
      </Card>

      {/* Profit */}
      <Card>
        <SectionHeader title="Profit" subtitle="Revenue minus cost" onExport={() => exportReport('profit')} exporting={exporting === 'profit'} />
        {profit.isLoading ? (
          <Skeleton className="h-32" />
        ) : (
          <>
            <div className="mb-4 grid grid-cols-2 gap-4 md:grid-cols-4">
              <Mini label="Revenue" value={`$${profit.data?.total.revenue.toFixed(2) ?? '0'}`} />
              <Mini label="Cost" value={`$${profit.data?.total.cost.toFixed(2) ?? '0'}`} />
              <Mini label="Profit" value={`$${profit.data?.total.profit.toFixed(2) ?? '0'}`} />
              <Mini label="Margin" value={`${profit.data?.total.marginPct.toFixed(2) ?? 0}%`} />
            </div>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Store</TableHead>
                  <TableHead>Revenue</TableHead>
                  <TableHead>Cost</TableHead>
                  <TableHead>Profit</TableHead>
                  <TableHead>Margin</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {!profit.data?.byStore?.length ? (
                  <TableEmpty colspan={5}>No profit data.</TableEmpty>
                ) : (
                  profit.data.byStore.map((r) => (
                    <TableRow key={r.storeId}>
                      <TableCell>{r.storeName}</TableCell>
                      <TableCell>${r.revenue.toFixed(2)}</TableCell>
                      <TableCell>${r.cost.toFixed(2)}</TableCell>
                      <TableCell className="font-semibold">${r.profit.toFixed(2)}</TableCell>
                      <TableCell><Badge>{r.marginPct.toFixed(1)}%</Badge></TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </>
        )}
      </Card>

      {/* Inventory */}
      <Card>
        <SectionHeader title="Inventory" subtitle="Turnover, valuation, waste" onExport={() => exportReport('inventory')} exporting={exporting === 'inventory'} />
        {inventory.isLoading ? (
          <Skeleton className="h-32" />
        ) : (
          <>
            <div className="mb-4 grid grid-cols-2 gap-4 md:grid-cols-4">
              <Mini label="Valuation" value={`$${inventory.data?.summary.valuation.toFixed(2) ?? '0'}`} />
              <Mini label="Turnover ratio" value={String(inventory.data?.summary.turnoverRatio ?? 0)} />
              <Mini label="Waste %" value={`${inventory.data?.summary.wastePct ?? 0}%`} />
              <Mini label="Ingredients" value={String(inventory.data?.summary.ingredientCount ?? 0)} />
            </div>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Ingredient</TableHead>
                  <TableHead>Stock</TableHead>
                  <TableHead>Unit</TableHead>
                  <TableHead>Cost / unit</TableHead>
                  <TableHead>Valuation</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {!inventory.data?.byIngredient?.length ? (
                  <TableEmpty colspan={5}>No ingredients.</TableEmpty>
                ) : (
                  inventory.data.byIngredient.map((r) => (
                    <TableRow key={r.ingredientId}>
                      <TableCell>{r.name}</TableCell>
                      <TableCell>{r.currentStock}</TableCell>
                      <TableCell>{r.unit ?? '—'}</TableCell>
                      <TableCell>${r.costPerUnit.toFixed(4)}</TableCell>
                      <TableCell>${r.valuation.toFixed(2)}</TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </>
        )}
      </Card>

      {/* Employees */}
      <Card>
        <SectionHeader title="Employees" subtitle="Productivity ranking" onExport={() => exportReport('employees')} exporting={exporting === 'employees'} />
        {employees.isLoading ? (
          <Skeleton className="h-32" />
        ) : (
          <>
            {employees.data?.note ? <p className="mb-3 text-xs text-zinc-500">{employees.data.note}</p> : null}
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>#</TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Sales</TableHead>
                  <TableHead>Revenue</TableHead>
                  <TableHead>Quantity</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {!employees.data?.ranking?.length ? (
                  <TableEmpty colspan={6}>No employees found.</TableEmpty>
                ) : (
                  employees.data.ranking.map((r, i) => (
                    <TableRow key={r.userId}>
                      <TableCell>{i + 1}</TableCell>
                      <TableCell>{r.name}</TableCell>
                      <TableCell><Badge>{r.role ?? '—'}</Badge></TableCell>
                      <TableCell>{r.sales}</TableCell>
                      <TableCell>${r.revenue.toFixed(2)}</TableCell>
                      <TableCell>{r.quantity}</TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </>
        )}
      </Card>

      {/* Stores */}
      <Card>
        <SectionHeader title="Stores" subtitle="Per-store comparison" onExport={() => exportReport('stores')} exporting={exporting === 'stores'} />
        {stores.isLoading ? (
          <Skeleton className="h-32" />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Store</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Sales</TableHead>
                <TableHead>Revenue</TableHead>
                <TableHead>Low stock</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {!stores.data?.stores?.length ? (
                <TableEmpty colspan={6}>No stores.</TableEmpty>
              ) : (
                stores.data.stores.map((r) => (
                  <TableRow key={r.storeId}>
                    <TableCell className="font-semibold">{r.name}</TableCell>
                    <TableCell>{r.type ?? '—'}</TableCell>
                    <TableCell><Badge>{r.status ?? '—'}</Badge></TableCell>
                    <TableCell>{r.sales}</TableCell>
                    <TableCell>${r.revenue.toFixed(2)}</TableCell>
                    <TableCell>
                      {r.lowStockItems > 0 ? <Badge className="bg-red-50 text-red-700 border-red-200">{r.lowStockItems}</Badge> : '0'}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        )}
      </Card>

      {/* Food */}
      <Card>
        <SectionHeader title="Food performance" subtitle="Top sellers vs low performers" onExport={() => exportReport('food')} exporting={exporting === 'food'} />
        {food.isLoading ? (
          <Skeleton className="h-32" />
        ) : (
          <div className="grid gap-6 md:grid-cols-2">
            <FoodTable title="Top sellers" rows={food.data?.topSellers ?? []} accent="emerald" />
            <FoodTable title="Low performers" rows={food.data?.lowPerformers ?? []} accent="zinc" />
          </div>
        )}
      </Card>
    </div>
  );
}

function SectionHeader({ title, subtitle, onExport, exporting }: { title: string; subtitle?: string; onExport: () => void; exporting: boolean }) {
  return (
    <header className="mb-4 flex items-center justify-between gap-3">
      <div>
        <h3 className="text-lg font-bold tracking-tight">{title}</h3>
        {subtitle ? <p className="text-xs text-zinc-500">{subtitle}</p> : null}
      </div>
      <Button variant="outline" onClick={onExport} disabled={exporting}>
        {exporting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />}
        Export CSV
      </Button>
    </header>
  );
}

function Mini({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-zinc-300 bg-zinc-50 p-3">
      <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">{label}</p>
      <p className="mt-1 text-lg font-bold text-zinc-950">{value}</p>
    </div>
  );
}

function FoodTable({ title, rows, accent }: { title: string; rows: { foodItemId: string; name: string; category?: string; quantity: number; revenue: number; sales: number }[]; accent: 'emerald' | 'zinc' }) {
  return (
    <div>
      <h4 className={`mb-2 text-sm font-semibold ${accent === 'emerald' ? 'text-emerald-700' : 'text-zinc-700'}`}>{title}</h4>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Name</TableHead>
            <TableHead>Category</TableHead>
            <TableHead>Qty</TableHead>
            <TableHead>Revenue</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {!rows.length ? (
            <TableEmpty colspan={4}>No data.</TableEmpty>
          ) : (
            rows.map((r) => (
              <TableRow key={r.foodItemId}>
                <TableCell>{r.name}</TableCell>
                <TableCell>{r.category ?? '—'}</TableCell>
                <TableCell>{r.quantity}</TableCell>
                <TableCell>${r.revenue.toFixed(2)}</TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </div>
  );
}