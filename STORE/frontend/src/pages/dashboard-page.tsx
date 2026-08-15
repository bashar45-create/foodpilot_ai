import { useActiveStore } from '@/hooks/use-active-store';
import { KpiCard } from '@/components/shared/kpi-card';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { AlertTriangle } from 'lucide-react';
import { useDashboard, useLowStockAnalytics } from '@/features/analytics/hooks/use-analytics';
import { useStoreLowStock } from '@/features/store-inventory/hooks/use-store-inventory';
import { useProjectedDailyForecast } from '@/features/forecast/hooks/use-forecast';
import { useSales } from '@/features/sales/hooks/use-sales';
import { useNotifications } from '@/features/notifications/hooks/use-notifications';
import { formatDistanceToNow } from 'date-fns';
import { Link } from 'react-router-dom';
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { LowStockItem } from '@/api/endpoints/analytics';
import { useStaleActiveAllocations } from '@/features/allocations/hooks/use-allocations';

const FORECAST_COLORS = ['#09090b', '#3f3f46', '#71717a', '#a1a1aa', '#d4d4d8', '#52525b', '#27272a'];

interface ForecastChartDatum {
  date: string;
  [foodName: string]: number | string;
}

export function DashboardPage(): JSX.Element {
  const { storeId } = useActiveStore();
  const { data, isLoading } = useDashboard(storeId ?? undefined);
  // Primary low-stock source: analytics endpoint that merges master pool + per-store shelf.
  const { data: lowStockResp, isLoading: lowStockLoading, dataUpdatedAt: lowStockUpdatedAt } =
    useLowStockAnalytics(storeId ?? undefined, 50);
  // Fallback to per-store shelf (used as a backup if the analytics endpoint is unavailable).
  const { data: shelfLowStock = [] } = useStoreLowStock(storeId ?? undefined);
  const { data: forecast } = useProjectedDailyForecast(7, 6);
  const { data: sales = [] } = useSales(storeId ?? undefined);
  const { data: notifications = [] } = useNotifications(storeId ?? undefined);
  const { data: staleActive } = useStaleActiveAllocations();

  const mergedLowStock: LowStockItem[] = (() => {
    const fromAnalytics = lowStockResp?.items ?? [];
    if (fromAnalytics.length > 0) return fromAnalytics;
    // Map shelf rows into the unified LowStockItem shape so the UI renders either way.
    return (shelfLowStock as any[]).map((row) => {
      const ing = row.ingredient ?? {};
      const qty = Number(row.quantity ?? 0);
      const cost = Number(ing.costPerUnit ?? row.costPerUnit ?? 0);
      return {
        ingredientId: row.ingredientId ?? ing.id ?? row.id ?? '',
        ingredientName: ing.name ?? row.ingredientName ?? row.ingredientId ?? 'Unknown',
        unit: ing.unit ?? row.unit,
        category: ing.category ?? row.category,
        currentStock: qty,
        minimumStock: Number(row.minimumStock ?? 0),
        costPerUnit: cost,
        lineValue: qty * cost,
        source: 'shelf' as const,
        storeId: storeId ?? null,
      } satisfies LowStockItem;
    });
  })();

  // Build per-date bars from the projected forecast shape.
  const chartData: ForecastChartDatum[] = (() => {
    if (!forecast?.items?.length) return [];
    const dates = forecast.days ?? [];
    return dates.map((date) => {
      const row: ForecastChartDatum = { date: date.slice(5) }; // MM-DD
      forecast.items.forEach((item) => {
        const point = item.daily.find((p) => p.date === date);
        row[item.name] = point?.predictedQuantity ?? 0;
      });
      return row;
    });
  })();

  const topFoodNames = (forecast?.items ?? []).slice(0, 6).map((i) => i.name);

  return (
    <div className="space-y-6">
      {staleActive && staleActive.count > 0 ? (
        <div className="flex items-start gap-3 rounded-3xl border border-amber-300 bg-amber-50 p-4">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-700" />
          <div className="flex-1">
            <p className="text-sm font-semibold text-amber-900">
              {staleActive.count} unreclaimed allocation{staleActive.count === 1 ? '' : 's'} from previous days
            </p>
            <p className="mt-1 text-xs text-amber-800">
              Stock is still on store shelves from days before {staleActive.today}. Reclaim or reverse them in the
              Allocations page to refund ingredients back to the master pool. Data is never auto-deleted — this is
              a nudge to keep stock counts accurate.
            </p>
          </div>
          <Link
            to="/allocations"
            className="shrink-0 rounded-2xl bg-amber-700 px-4 py-2 text-xs font-semibold text-white hover:bg-amber-800"
          >
            Review
          </Link>
        </div>
      ) : null}
      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <KpiCard label="Today's revenue" value={isLoading ? '—' : `$${(data?.totals?.todayRevenue ?? 0).toFixed(2)}`} />
        <KpiCard label="Sales today" value={isLoading ? '—' : String(data?.totals?.todaySales ?? 0)} />
        <KpiCard
          label="Low stock"
          value={
            isLoading || lowStockLoading
              ? '—'
              : String(
                  typeof data?.totals?.lowStockItems === 'number'
                    ? data.totals.lowStockItems
                    : mergedLowStock.length,
                )
          }
        />
        <KpiCard label="Active stores" value={isLoading ? '—' : String(data?.totals?.activeStores ?? 0)} />
      </section>

      <section className="grid gap-6 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <header className="mb-4 flex items-center justify-between">
            <div>
              <h3 className="text-lg font-bold tracking-tight">7-day forecast</h3>
              <p className="text-xs text-zinc-500">
                Predicted daily quantity per top food item, based on the last {forecast?.basisDays ?? 28} days of sales.
              </p>
            </div>
            <Link to="/forecast" className="text-sm font-semibold text-zinc-600 hover:underline">
              View all
            </Link>
          </header>
          {chartData.length === 0 || topFoodNames.length === 0 ? (
            <p className="text-sm text-zinc-500">Not enough sales history yet — start recording sales to populate the forecast.</p>
          ) : (
            <>
              <div className="h-64 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={chartData} margin={{ top: 8, right: 16, bottom: 0, left: -16 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e4e4e7" />
                    <XAxis dataKey="date" stroke="#71717a" fontSize={11} />
                    <YAxis stroke="#71717a" fontSize={11} allowDecimals={false} />
                    <Tooltip cursor={{ fill: 'rgba(0,0,0,0.04)' }} contentStyle={{ borderRadius: 12, borderColor: '#d4d4d8' }} />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                    {topFoodNames.map((name, idx) => (
                      <Bar
                        key={name}
                        dataKey={name}
                        stackId="forecast"
                        fill={FORECAST_COLORS[idx % FORECAST_COLORS.length]}
                        radius={idx === topFoodNames.length - 1 ? [6, 6, 0, 0] : undefined}
                      />
                    ))}
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <ul className="mt-4 divide-y divide-zinc-200">
                {forecast?.items.slice(0, 6).map((item) => (
                  <li key={item.foodItemId} className="flex items-center justify-between py-2">
                    <div>
                      <p className="text-sm font-semibold text-zinc-950">{item.name}</p>
                      <p className="text-xs text-zinc-500">{item.category ?? 'Uncategorized'}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-semibold text-zinc-950">~{item.totalPredicted} units</p>
                      <p className="text-xs text-zinc-500">avg {item.weightedAverage.toFixed(1)}/day</p>
                    </div>
                  </li>
                ))}
              </ul>
            </>
          )}
        </Card>

        <Card>
          <header className="mb-4 flex items-center justify-between gap-2">
            <div>
              <h3 className="text-lg font-bold tracking-tight">Low stock</h3>
              <p className="text-xs text-zinc-500">
                Master pool & store shelf combined
                {lowStockUpdatedAt
                  ? ` · updated ${formatDistanceToNow(new Date(lowStockUpdatedAt), { addSuffix: true })}`
                  : ''}
              </p>
            </div>
            <div className="flex items-center gap-2">
              {lowStockResp && lowStockResp.totalValue > 0 ? (
                <Badge className="bg-amber-50 text-amber-700 border-amber-200">
                  ${lowStockResp.totalValue.toFixed(2)} at risk
                </Badge>
              ) : null}
              <Link to="/inventory" className="text-sm font-semibold text-zinc-600 hover:underline">
                Manage
              </Link>
            </div>
          </header>
          {isLoading || lowStockLoading ? (
            <div className="space-y-2">
              <Skeleton className="h-10" />
              <Skeleton className="h-10" />
              <Skeleton className="h-10" />
            </div>
          ) : mergedLowStock.length === 0 ? (
            <p className="text-sm text-zinc-500">Nothing below minimum. Keep it up.</p>
          ) : (
            <ul className="space-y-2">
              {mergedLowStock.slice(0, 6).map((row) => {
                const ingredientName = row.ingredientName ?? row.ingredientId ?? 'Unknown';
                const unit = row.unit ?? '';
                const costPerUnit = Number(row.costPerUnit ?? 0);
                const qty = Number(row.currentStock ?? 0);
                const minStock = Number(row.minimumStock ?? 0);
                const lineValue = Number(row.lineValue ?? qty * costPerUnit);
                const ratio = minStock > 0 ? qty / minStock : 0;
                const isPool = row.source === 'pool';
                return (
                  <li
                    key={`${row.source}-${row.ingredientId}`}
                    className="flex items-center justify-between gap-3 rounded-2xl border border-zinc-300 bg-zinc-50 px-3 py-2 text-sm"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <p className="truncate font-semibold text-zinc-950">{ingredientName}</p>
                        <span
                          className={
                            isPool
                              ? 'inline-flex shrink-0 rounded-full bg-zinc-900 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white'
                              : 'inline-flex shrink-0 rounded-full bg-white px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-zinc-700 border border-zinc-300'
                          }
                          title={isPool ? 'Master pool stock' : 'Store shelf stock'}
                        >
                          {isPool ? 'Pool' : 'Shelf'}
                        </span>
                      </div>
                      <p className="text-xs text-zinc-500">
                        {unit}
                        {costPerUnit > 0 ? ` · $${costPerUnit.toFixed(2)}/unit` : ''}
                        {lineValue > 0 ? ` · value $${lineValue.toFixed(2)}` : ''}
                        {minStock > 0 ? ` · ${(ratio * 100).toFixed(0)}% of min` : ''}
                      </p>
                    </div>
                    <Badge className="ml-2 shrink-0 bg-red-50 text-red-600 border-red-200">
                      {qty} / {minStock || '—'}
                    </Badge>
                  </li>
                );
              })}
              {mergedLowStock.length > 6 ? (
                <li className="pt-1 text-center text-xs text-zinc-500">
                  +{mergedLowStock.length - 6} more below minimum
                </li>
              ) : null}
            </ul>
          )}
        </Card>
      </section>

      <section className="grid gap-6 xl:grid-cols-2">
        <Card>
          <header className="mb-4 flex items-center justify-between">
            <h3 className="text-lg font-bold tracking-tight">Recent sales</h3>
            <Link to="/sales" className="text-sm font-semibold text-zinc-600 hover:underline">
              Record
            </Link>
          </header>
          {sales.length === 0 ? (
            <p className="text-sm text-zinc-500">No sales recorded yet.</p>
          ) : (
            <ul className="divide-y divide-zinc-200">
              {sales.slice(0, 5).map((sale: any) => (
                <li key={sale.id} className="flex items-center justify-between py-3">
                  <div>
                    <p className="text-sm font-semibold text-zinc-950">{sale.foodName} × {sale.quantity}</p>
                    <p className="text-xs text-zinc-500">
                      {sale.channel} · {formatDistanceToNow(new Date(sale.createdAt), { addSuffix: true })}
                    </p>
                  </div>
                  <p className="text-sm font-semibold text-zinc-950">${sale.totalPrice.toFixed(2)}</p>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card>
          <header className="mb-4 flex items-center justify-between">
            <h3 className="text-lg font-bold tracking-tight">Notifications</h3>
            <Link to="/notifications" className="text-sm font-semibold text-zinc-600 hover:underline">
              All
            </Link>
          </header>
          {notifications.length === 0 ? (
            <p className="text-sm text-zinc-500">No alerts.</p>
          ) : (
            <ul className="space-y-2">
              {notifications.slice(0, 5).map((n: any) => (
                <li key={n.id} className="rounded-2xl border border-zinc-300 bg-zinc-50 px-3 py-2">
                  <p className="text-sm font-semibold text-zinc-950">{n.title}</p>
                  <p className="text-xs text-zinc-500">{n.message}</p>
                  <p className="mt-1 text-xs text-zinc-400">
                    {formatDistanceToNow(new Date(n.createdAt), { addSuffix: true })}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </section>
    </div>
  );
}