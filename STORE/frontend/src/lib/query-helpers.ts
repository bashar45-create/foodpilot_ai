import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { UseMutationOptions, UseQueryOptions } from '@tanstack/react-query';

/**
 * Thin re-exports so feature hooks can pull query/mutation primitives from one place.
 * The goal is to keep page code tidy: import { useQuery, useMutation, useQueryClient } from '@/lib/query-helpers'.
 */
export { useQuery, useMutation, useQueryClient };
export type { UseMutationOptions, UseQueryOptions };