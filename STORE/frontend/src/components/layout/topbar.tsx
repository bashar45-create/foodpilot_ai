import { Search } from 'lucide-react';

import { Input } from '@/components/ui/input';

export function Topbar(): JSX.Element {
  return (
    <div className="flex items-center gap-4">
      <div className="relative w-full max-w-xl">
        <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
        <Input className="pl-11" placeholder="Search stores, inventory, tickets..." />
      </div>
    </div>
  );
}
