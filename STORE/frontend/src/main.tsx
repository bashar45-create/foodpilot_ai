import React from 'react';
import ReactDOM from 'react-dom/client';
import { QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from 'sonner';
import { RouterProvider } from 'react-router-dom';

import { AuthProvider } from '@/context/auth-context';
import { queryClient } from '@/lib/query-client';
import { SyncConnectionProvider } from '@/lib/sync/SyncConnectionContext';
import { router } from '@/routes/router';
import '@/index.css';

if (import.meta.env.DEV) {
  import('react-grab');
}

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <SyncConnectionProvider>
          <RouterProvider router={router} />
          <Toaster richColors position="top-right" />
        </SyncConnectionProvider>
      </AuthProvider>
    </QueryClientProvider>
  </React.StrictMode>,
);
