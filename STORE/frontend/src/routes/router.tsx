import { lazy, Suspense } from 'react';
import { createBrowserRouter, Navigate } from 'react-router-dom';

import { AppShell } from '@/components/layout/app-shell';
import { ProtectedRoute, RoleGuard } from '@/routes/guards';
import { LoginPage } from '@/pages/login-page';
import { PageFallback } from '@/components/layout/page-fallback';

// Route-level code splitting: each page becomes its own chunk that downloads
// only when the user navigates to it. This keeps the initial JS bundle — and
// time-to-interactive — small even as the app grows.
const DashboardPage = lazy(() =>
  import('@/pages/dashboard-page').then((m) => ({ default: m.DashboardPage })),
);
const StoresPage = lazy(() =>
  import('@/pages/stores-page').then((m) => ({ default: m.StoresPage })),
);
const EmployeesPage = lazy(() =>
  import('@/pages/employees-page').then((m) => ({ default: m.EmployeesPage })),
);
const InventoryPage = lazy(() =>
  import('@/pages/inventory-page').then((m) => ({ default: m.InventoryPage })),
);
const RecipesPage = lazy(() =>
  import('@/pages/recipes-page').then((m) => ({ default: m.RecipesPage })),
);
const FoodPage = lazy(() =>
  import('@/pages/food-page').then((m) => ({ default: m.FoodPage })),
);
const AssignmentsPage = lazy(() =>
  import('@/pages/assignments-page').then((m) => ({ default: m.AssignmentsPage })),
);
const AttendancePage = lazy(() =>
  import('@/pages/attendance-page').then((m) => ({ default: m.AttendancePage })),
);
const SalesPage = lazy(() =>
  import('@/pages/sales-page').then((m) => ({ default: m.SalesPage })),
);
const ReportsPage = lazy(() =>
  import('@/pages/reports-page').then((m) => ({ default: m.ReportsPage })),
);
const AnalyticsPage = lazy(() =>
  import('@/pages/analytics-page').then((m) => ({ default: m.AnalyticsPage })),
);
const AllocationsPage = lazy(() =>
  import('@/pages/allocations-page').then((m) => ({ default: m.AllocationsPage })),
);
const ForecastPage = lazy(() =>
  import('@/pages/forecast-page').then((m) => ({ default: m.ForecastPage })),
);
const TicketsPage = lazy(() =>
  import('@/pages/tickets-page').then((m) => ({ default: m.TicketsPage })),
);
const NotificationsPage = lazy(() =>
  import('@/pages/notifications-page').then((m) => ({ default: m.NotificationsPage })),
);
const SettingsPage = lazy(() =>
  import('@/pages/settings-page').then((m) => ({ default: m.SettingsPage })),
);
const ProfilePage = lazy(() =>
  import('@/pages/profile-page').then((m) => ({ default: m.ProfilePage })),
);
const AiAssistantPage = lazy(() =>
  import('@/pages/ai-assistant-page').then((m) => ({ default: m.AiAssistantPage })),
);
const HelpPage = lazy(() =>
  import('@/pages/help-page').then((m) => ({ default: m.HelpPage })),
);
const SupportPage = lazy(() =>
  import('@/pages/support-page').then((m) => ({ default: m.SupportPage })),
);
const ForbiddenPage = lazy(() =>
  import('@/pages/forbidden-page').then((m) => ({ default: m.ForbiddenPage })),
);
const NotFoundPage = lazy(() =>
  import('@/pages/not-found-page').then((m) => ({ default: m.NotFoundPage })),
);
const MaintenancePage = lazy(() =>
  import('@/pages/maintenance-page').then((m) => ({ default: m.MaintenancePage })),
);

function Shell({ children }: { children: JSX.Element }): JSX.Element {
  return (
    <AppShell>
      <Suspense fallback={<PageFallback />}>{children}</Suspense>
    </AppShell>
  );
}

function Bare({ children }: { children: JSX.Element }): JSX.Element {
  return <Suspense fallback={<PageFallback />}>{children}</Suspense>;
}

export const router = createBrowserRouter([
  { path: '/', element: <Navigate to="/dashboard" replace /> },
  { path: '/login', element: <LoginPage /> },
  { path: '/403', element: <Bare><ForbiddenPage /></Bare> },
  { path: '/maintenance', element: <Bare><MaintenancePage /></Bare> },
  {
    path: '/dashboard',
    element: (
      <ProtectedRoute>
        <Shell>
          <DashboardPage />
        </Shell>
      </ProtectedRoute>
    ),
  },
  {
    path: '/stores',
    element: (
      <ProtectedRoute>
        <Shell>
          <StoresPage />
        </Shell>
      </ProtectedRoute>
    ),
  },
  {
    path: '/employees',
    element: (
      <ProtectedRoute>
        <Shell>
          <RoleGuard roles={['OWNER', 'MANAGER']}>
            <EmployeesPage />
          </RoleGuard>
        </Shell>
      </ProtectedRoute>
    ),
  },
  {
    path: '/inventory',
    element: (
      <ProtectedRoute>
        <Shell>
          <InventoryPage />
        </Shell>
      </ProtectedRoute>
    ),
  },
  { path: '/recipes', element: <ProtectedRoute><Shell><RecipesPage /></Shell></ProtectedRoute> },
  { path: '/menu', element: <ProtectedRoute><Shell><FoodPage /></Shell></ProtectedRoute> },
  { path: '/assignments', element: <ProtectedRoute><Shell><AssignmentsPage /></Shell></ProtectedRoute> },
  { path: '/attendance', element: <ProtectedRoute><Shell><AttendancePage /></Shell></ProtectedRoute> },
  { path: '/sales', element: <ProtectedRoute><Shell><SalesPage /></Shell></ProtectedRoute> },
  { path: '/reports', element: <ProtectedRoute><Shell><ReportsPage /></Shell></ProtectedRoute> },
  {
    path: '/allocations',
    element: (
      <ProtectedRoute>
        <Shell>
          <RoleGuard roles={['OWNER', 'MANAGER']}>
            <AllocationsPage />
          </RoleGuard>
        </Shell>
      </ProtectedRoute>
    ),
  },
  { path: '/analytics', element: <ProtectedRoute><Shell><AnalyticsPage /></Shell></ProtectedRoute> },
  { path: '/forecast', element: <ProtectedRoute><Shell><ForecastPage /></Shell></ProtectedRoute> },
  { path: '/tickets', element: <ProtectedRoute><Shell><TicketsPage /></Shell></ProtectedRoute> },
  { path: '/notifications', element: <ProtectedRoute><Shell><NotificationsPage /></Shell></ProtectedRoute> },
  { path: '/settings', element: <ProtectedRoute><Shell><SettingsPage /></Shell></ProtectedRoute> },
  { path: '/profile', element: <ProtectedRoute><Shell><ProfilePage /></Shell></ProtectedRoute> },
  { path: '/ai-assistant', element: <ProtectedRoute><Shell><AiAssistantPage /></Shell></ProtectedRoute> },
  { path: '/help', element: <Bare><HelpPage /></Bare> },
  { path: '/support', element: <Bare><SupportPage /></Bare> },
  { path: '*', element: <Bare><NotFoundPage /></Bare> },
]);
