import { useState } from 'react';
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Sparkles, RefreshCw } from 'lucide-react';

import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Select } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useProjectedDailyForecast } from '@/features/forecast/hooks/use-forecast';

const COLORS = ['#09090b', '#3f3f46', '#71717a', '#a1a1aa', '#d4d4d8', '#52525b'];

export function ForecastPage(): JSX.Element {
  const [days, setDays] = useState(14);
  const { data, isLoading, isFetching, refetch } = useProjectedDailyForecast(days, 6);

  const chartData = (data?.days ?? []).map((date) => {
    const row: Record<string, number | string> = { date: date.slice(5) };
    (data?.items ?? []).forEach((item) => {
      const point = item.daily.find((p) => p.date === date);
      row[item.name] = point?.predictedQuantity ?? 0;
    });
    return row;
  });

  const items = data?.items ?? [];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-zinc-500">
          {days}-day projection · based on {data?.basisDays ?? 28} days of sales · top {items.length} food items
        </p>
        <div className="flex items-center gap-2">
          <Select value={String(days)} onChange={(event) => setDays(Number(event.target.value))} className="w-32">
            <option value="7">7 days</option>
            <option value="14">14 days</option>
            <option value="30">30 days</option>
          </Select>
          <Button variant="outline" onClick={() => refetch()} disabled={isFetching}>
            <RefreshCw className={`mr-2 h-4 w-4 ${isFetching ? 'animate-spin' : ''}`} /> Refresh
          </Button>
        </div>
      </div>

      <Card>
        {isLoading ? (
          <Skeleton className="h-80" />
        ) : items.length === 0 ? (
          <p className="py-12 text-center text-sm text-zinc-500">
            Forecasts appear once you have at least a few days of sales history.
          </p>
        ) : (
          <div className="h-80 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} margin={{ top: 8, right: 16, bottom: 0, left: -16 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e4e4e7" />
                <XAxis dataKey="date" stroke="#71717a" fontSize={11} />
                <YAxis stroke="#71717a" fontSize={11} allowDecimals={false} />
                <Tooltip contentStyle={{ borderRadius: 12, borderColor: '#d4d4d8' }} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                {items.map((item, idx) => (
                  <Bar
                    key={item.foodItemId}
                    dataKey={item.name}
                    stackId="forecast"
                    fill={COLORS[idx % COLORS.length]}
                    radius={idx === items.length - 1 ? [6, 6, 0, 0] : undefined}
                  />
                ))}
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </Card>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {isLoading
          ? Array.from({ length: 6 }).map((_, idx) => <Skeleton key={idx} className="h-32" />)
          : items.length === 0
          ? null
          : items.map((item) => (
              <Card key={item.foodItemId}>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Sparkles className="h-4 w-4 text-indigo-500" />
                    <p className="font-semibold text-zinc-950">{item.name}</p>
                  </div>
                  <Badge>{item.category ?? 'Uncategorized'}</Badge>
                </div>
                <p className="mt-3 text-2xl font-semibold text-zinc-950">
                  {item.totalPredicted}
                  <span className="ml-1 text-sm font-normal text-zinc-500">total units / {days}d</span>
                </p>
                <p className="mt-1 text-xs text-zinc-500">
                  Avg {item.weightedAverage.toFixed(1)} units/day
                </p>
              </Card>
            ))}
      </div>
    </div>
  );
}