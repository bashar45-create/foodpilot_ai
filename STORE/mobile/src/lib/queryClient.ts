import { QueryClient } from '@tanstack/react-query';

// Query defaults tuned for the mobile worker app:
// - generous staleTime so the user doesn't re-fetch every screen mount
// - cached data is shown instantly, then refreshed in the background
// - retry once before surfacing the error to the worker
// - gcTime stays short; there's no benefit holding data the worker no longer needs
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60_000,
      gcTime: 5 * 60_000,
      retry: 1,
      refetchOnWindowFocus: false,
      refetchOnReconnect: true,
    },
  },
});
