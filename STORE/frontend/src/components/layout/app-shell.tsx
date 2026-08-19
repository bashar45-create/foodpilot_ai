import type { ReactNode } from 'react';
import { LayoutDashboard, Boxes, ClipboardList, Package, ReceiptText, Settings, Shield, UserCircle2, BarChart3, TrendingUp, Send, Sparkles } from 'lucide-react';
import { NavLink } from 'react-router-dom';

import { useAuth } from '@/context/auth-context';
import { useActiveStore } from '@/hooks/use-active-store';
import { useLowStockToasts } from '@/hooks/use-low-stock-toasts';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';

interface AppShellProps {
  children: ReactNode;
}

const ownerNav = [
  { to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/stores', label: 'Stores', icon: Boxes },
  { to: '/employees', label: 'Employees', icon: UserCircle2 },
  { to: '/inventory', label: 'Inventory', icon: Package },
  { to: '/recipes', label: 'Recipes', icon: ClipboardList },
  { to: '/menu', label: 'Food Menu', icon: ReceiptText },
  { to: '/sales', label: 'Sales', icon: ReceiptText },
  { to: '/forecast', label: 'Forecast', icon: TrendingUp },
  { to: '/allocations', label: 'Allocations', icon: Send },
  { to: '/reports', label: 'Reports', icon: BarChart3 },
  { to: '/tickets', label: 'Tickets', icon: Shield },
  { to: '/ai-assistant', label: 'AI Assistant', icon: Sparkles },
  { to: '/settings', label: 'Settings', icon: Settings },
];

const workerNav = [
  { to: '/dashboard', label: 'Home', icon: LayoutDashboard },
  { to: '/inventory', label: 'Inventory', icon: Package },
  { to: '/sales', label: 'Sales', icon: ReceiptText },
  { to: '/attendance', label: 'Attendance', icon: ClipboardList },
  { to: '/tickets', label: 'Tickets', icon: Shield },
  { to: '/profile', label: 'Profile', icon: UserCircle2 },
];

function NavItem({ to, label, icon: Icon }: { to: string; label: string; icon: typeof LayoutDashboard }): JSX.Element {
  return (
    <NavLink
      to={to}
      className={({ isActive }) =>
        cn(
          'flex items-center gap-3 rounded-2xl px-4 py-3 text-sm font-semibold transition',
          isActive ? 'bg-white text-zinc-950' : 'text-zinc-300 hover:bg-white/10 hover:text-white',
        )
      }
    >
      <Icon className="h-4 w-4" />
      <span>{label}</span>
    </NavLink>
  );
}

export function AppShell({ children }: AppShellProps): JSX.Element {
  const { user, logout } = useAuth();
  const { storeId } = useActiveStore();
  useLowStockToasts(storeId);
  const nav = user?.role === 'WORKER' ? workerNav : ownerNav;

  return (
    <div className="min-h-screen bg-white text-zinc-950">
      <div className="mx-auto flex min-h-screen max-w-[1700px] gap-6 p-4 lg:p-6">
        <aside className="hidden w-[290px] shrink-0 rounded-[32px] bg-zinc-950 p-4 text-white shadow-soft lg:flex lg:flex-col">
          <div className="flex items-center justify-between px-3 py-4">
            <div>
              <p className="text-xs uppercase tracking-[0.35em] text-zinc-400">foodpilot_ai</p>
              <h1 className="mt-2 text-2xl font-black tracking-tight">Command Center</h1>
            </div>
          </div>
          <nav className="mt-8 flex-1 space-y-2">
            {nav.map((item) => (
              <NavItem key={item.to} {...item} />
            ))}
          </nav>
          <div className="rounded-[28px] border border-white/10 bg-white/5 p-4 text-sm text-zinc-300">
            <p className="font-semibold text-white">Signed in</p>
            <p className="mt-1 truncate">{user?.username ?? user?.name ?? 'Admin user'}</p>
            <Button variant="outline" className="mt-4 w-full border-white/10 bg-white text-zinc-950 hover:bg-zinc-100" onClick={() => void logout()}>
              Sign out
            </Button>
          </div>
        </aside>

        <main className="flex min-w-0 flex-1 flex-col gap-6">
          <header className="flex items-center justify-between rounded-[32px] border border-zinc-300 bg-white px-6 py-5 shadow-soft">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.3em] text-zinc-500">foodpilot_ai Dashboard</p>
              <h2 className="mt-2 text-2xl font-black tracking-tight text-zinc-950">{user?.name ?? 'Workspace overview'}</h2>
            </div>
          </header>
          <section className="min-w-0 flex-1">{children}</section>
        </main>
      </div>
    </div>
  );
}


/* Summary: This file contains the  logic for the frontend. */