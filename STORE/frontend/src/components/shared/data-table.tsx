import type { ReactNode } from 'react';

import { Card } from '@/components/ui/card';
import { LoadingState } from '@/components/shared/loading-state';
import { EmptyState } from '@/components/shared/empty-state';

export interface DataTableColumn<T> {
  header: string;
  cell: (row: T) => ReactNode;
}

export function DataTable<T extends { id?: string }>({
  title,
  columns,
  rows,
  isLoading,
  emptyMessage = 'No records found.',
}: {
  title: string;
  columns: Array<DataTableColumn<T>>;
  rows: T[];
  isLoading?: boolean;
  emptyMessage?: string;
}): JSX.Element {
  if (isLoading) {
    return <LoadingState label={`Loading ${title.toLowerCase()}...`} />;
  }

  if (rows.length === 0) {
    return <EmptyState title={title} description={emptyMessage} />;
  }

  return (
    <Card className="overflow-hidden p-0">
      <div className="border-b border-zinc-200 px-6 py-4">
        <h3 className="text-sm font-semibold uppercase tracking-[0.25em] text-zinc-500">{title}</h3>
      </div>
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-zinc-200 text-left text-sm">
          <thead className="bg-zinc-50 text-xs uppercase tracking-[0.2em] text-zinc-500">
            <tr>
              {columns.map((column) => (
                <th key={column.header} className="px-6 py-4 font-semibold">{column.header}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100 bg-white">
            {rows.map((row, index) => (
              <tr key={row.id ?? index} className="hover:bg-zinc-50/80">
                {columns.map((column) => (
                  <td key={column.header} className="px-6 py-4 align-middle text-zinc-700">{column.cell(row)}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
