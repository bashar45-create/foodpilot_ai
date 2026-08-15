import { useMutation, useQuery, useQueryClient } from '@/lib/query-helpers';
import {
  assignUserToStore,
  createUser,
  deleteUser,
  listUsers,
  resetUserPassword,
  toggleUserStatus,
  updateUser,
  type CreateUserRequest,
  type UpdateUserRequest,
  type UserRecord,
} from '@/api/endpoints/users';
import { userKeys } from '@/api/queryKeys';
import { useSyncAwareRefetchInterval } from '@/lib/sync/useSyncAwareRefetchInterval';

type UpdateUserPayload = { id: string; input: UpdateUserRequest };

export function useUsers() {
  const refetchInterval = useSyncAwareRefetchInterval();
  return useQuery({
    queryKey: userKeys.list(),
    queryFn: () => listUsers(),
    refetchInterval,
  });
}

export function useCreateUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateUserRequest) => createUser(input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: userKeys.list() });
    },
  });
}

export function useUpdateUser(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: UpdateUserRequest) => updateUser(id, input),
    onSuccess: (user: UserRecord) => {
      qc.invalidateQueries({ queryKey: userKeys.list() });
      qc.setQueryData(userKeys.detail(user.id), user);
    },
  });
}

export function useDeleteUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteUser(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: userKeys.list() });
    },
  });
}

export function useToggleUserStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) =>
      toggleUserStatus(id, isActive),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: userKeys.list() });
    },
  });
}

export function useAssignUserToStore() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, storeId }: { id: string; storeId: string | null }) =>
      assignUserToStore(id, storeId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: userKeys.list() });
    },
  });
}

export function useResetUserPassword() {
  return useMutation({
    mutationFn: ({ id, password }: { id: string; password: string }) =>
      resetUserPassword(id, password),
  });
}

/**
 * Mutation that takes the user id at call time so the latest state value is always used.
 * Use this when the id is only known after the hook first mounts (e.g. from a dialog that opens later).
 */
export function useUpdateUserMutation() {
  const qc = useQueryClient();
  return useMutation<UserRecord, Error, UpdateUserPayload>({
    mutationFn: ({ id, input }) => {
      if (!id) {
        return Promise.reject(new Error('Missing user id'));
      }
      return updateUser(id, input);
    },
    onSuccess: (user) => {
      qc.invalidateQueries({ queryKey: userKeys.list() });
      qc.setQueryData(userKeys.detail(user.id), user);
    },
  });
}