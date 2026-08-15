import { useEffect, useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { Plus, Pencil, Power, Trash2, UserCog, KeyRound, CalendarDays, Eye, EyeOff, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableEmpty, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogFooter } from '@/components/ui/dialog';
import {
  useCreateUser,
  useDeleteUser,
  useResetUserPassword,
  useToggleUserStatus,
  useUpdateUserMutation,
  useUsers,
} from '@/features/users/hooks/use-users';
import { useStores } from '@/features/stores/hooks/use-stores';
import { useEmployeeAttendance } from '@/features/attendance/hooks/use-attendance';
import type { AttendanceRecord, AttendanceStatus } from '@/api/endpoints/attendance';
import type { UserRecord, UserRole } from '@/api/endpoints/users';
import { ApiException } from '@/types/api';

const createSchema = z.object({
  email: z.string().email('Valid email required'),
  name: z.string().min(1, 'Required'),
  role: z.enum(['OWNER', 'MANAGER', 'WORKER']),
  password: z.string().min(6, 'Min 6 chars'),
  assignedStore: z.string().optional(),
});

const editSchema = z.object({
  email: z.string().email('Valid email required'),
  name: z.string().min(1, 'Required'),
  role: z.enum(['OWNER', 'MANAGER', 'WORKER', 'SUPER_ADMIN']),
  assignedStore: z.string().optional(),
});

const resetPasswordSchema = z.object({
  password: z.string().min(6, 'Password must be at least 6 characters'),
});

type CreateValues = z.infer<typeof createSchema>;
type EditValues = z.infer<typeof editSchema>;
type ResetPasswordValues = z.infer<typeof resetPasswordSchema>;
const EDIT_ROLES: UserRole[] = ['OWNER', 'MANAGER', 'WORKER', 'SUPER_ADMIN'];

const ATTENDANCE_STATUS_LABEL: Record<AttendanceStatus, string> = {
  PRESENT: 'Present',
  LATE: 'Late',
  ABSENT: 'Absent',
  LEAVE: 'Leave',
};

const ATTENDANCE_STATUS_CLASS: Record<AttendanceStatus, string> = {
  PRESENT: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  LATE: 'bg-amber-50 text-amber-700 border-amber-200',
  ABSENT: 'bg-red-50 text-red-600 border-red-200',
  LEAVE: 'bg-blue-50 text-blue-600 border-blue-200',
};

function generateTempPassword(): string {
  return `temp-${Math.random().toString(36).slice(2, 8)}`;
}

function isoDate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function formatTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
}

function AttendanceDialog({ user, open, onOpenChange }: { user: UserRecord | null; open: boolean; onOpenChange: (next: boolean) => void }): JSX.Element {
  // Default window: last 30 days
  const today = useMemo(() => new Date(), []);
  const startDate = useMemo(() => {
    const d = new Date();
    d.setDate(today.getDate() - 29);
    return isoDate(d);
  }, [today]);
  const endDate = useMemo(() => isoDate(today), [today]);
  const range = useMemo(() => ({ start: startDate, end: endDate }), [startDate, endDate]);

  const { data, isLoading, error } = useEmployeeAttendance(user?.id ?? null, range);

  // Build a complete day-by-day list so missing days are shown as ABSENT
  const days = useMemo(() => {
    const result: { date: string; record: AttendanceRecord | null }[] = [];
    const recordsByDate = new Map<string, AttendanceRecord>();
    (data?.records ?? []).forEach((r) => recordsByDate.set(r.date, r));
    const cursor = new Date(startDate);
    const end = new Date(endDate);
    while (cursor <= end) {
      const key = isoDate(cursor);
      result.push({ date: key, record: recordsByDate.get(key) ?? null });
      cursor.setDate(cursor.getDate() + 1);
    }
    return result;
  }, [data, startDate, endDate]);

  const counts = useMemo(() => {
    const tally: Record<AttendanceStatus, number> = { PRESENT: 0, LATE: 0, ABSENT: 0, LEAVE: 0 };
    days.forEach((d) => {
      tally[d.record?.status ?? 'ABSENT'] += 1;
    });
    return tally;
  }, [days]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange} title={`Attendance — ${user?.name ?? ''}`} className="max-w-2xl">
      <p className="text-xs text-zinc-500">
        Showing {startDate} → {endDate} (last 30 days). Days without a record are marked Absent.
      </p>
      <div className="mt-4 flex flex-wrap gap-2">
        <Badge className={ATTENDANCE_STATUS_CLASS.PRESENT}>{counts.PRESENT} Present</Badge>
        <Badge className={ATTENDANCE_STATUS_CLASS.LATE}>{counts.LATE} Late</Badge>
        <Badge className={ATTENDANCE_STATUS_CLASS.ABSENT}>{counts.ABSENT} Absent</Badge>
        <Badge className={ATTENDANCE_STATUS_CLASS.LEAVE}>{counts.LEAVE} Leave</Badge>
      </div>
      <div className="mt-4 max-h-96 overflow-y-auto rounded-2xl border border-zinc-300">
        {isLoading ? (
          <div className="space-y-2 p-3">
            <Skeleton className="h-8" />
            <Skeleton className="h-8" />
            <Skeleton className="h-8" />
          </div>
        ) : error ? (
          <p className="p-4 text-sm text-red-600">Failed to load attendance.</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-zinc-50 text-xs uppercase tracking-wide text-zinc-500">
              <tr>
                <th className="px-4 py-2 text-left">Date</th>
                <th className="px-4 py-2 text-left">Status</th>
                <th className="px-4 py-2 text-left">Clock in</th>
                <th className="px-4 py-2 text-left">Clock out</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-200">
              {days.slice().reverse().map((d) => {
                const status: AttendanceStatus = d.record?.status ?? 'ABSENT';
                return (
                  <tr key={d.date}>
                    <td className="px-4 py-2 font-medium text-zinc-950">{d.date}</td>
                    <td className="px-4 py-2">
                      <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-semibold ${ATTENDANCE_STATUS_CLASS[status]}`}>
                        {ATTENDANCE_STATUS_LABEL[status]}
                      </span>
                    </td>
                    <td className="px-4 py-2 text-zinc-700">{formatTime(d.record?.clockIn)}</td>
                    <td className="px-4 py-2 text-zinc-700">{formatTime(d.record?.clockOut)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Close</Button>
      </DialogFooter>
    </Dialog>
  );
}

function ResetPasswordDialog({ user, open, onOpenChange, onSubmit, isPending }: {
  user: UserRecord | null;
  open: boolean;
  onOpenChange: (next: boolean) => void;
  onSubmit: (password: string) => Promise<void> | void;
  isPending: boolean;
}): JSX.Element {
  const [show, setShow] = useState(false);
  const form = useForm<ResetPasswordValues>({
    resolver: zodResolver(resetPasswordSchema),
    defaultValues: { password: generateTempPassword() },
  });

  useEffect(() => {
    if (open) {
      form.reset({ password: generateTempPassword() });
      setShow(false);
    }
  }, [open, form]);

  const passwordValue = form.watch('password') ?? '';

  const handleSubmit = form.handleSubmit(async (values) => {
    await onSubmit(values.password);
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange} title={`Reset password — ${user?.name ?? ''}`} description="Set a new temporary password. The user can sign in with it and change it later.">
      <form className="space-y-4" onSubmit={handleSubmit}>
        <div>
          <Label htmlFor="reset-password">New temporary password</Label>
          <div className="relative mt-1">
            <Input
              id="reset-password"
              type={show ? 'text' : 'password'}
              autoComplete="new-password"
              {...form.register('password')}
              className="pr-20"
            />
            <div className="absolute inset-y-0 right-1 flex items-center gap-1">
              <button
                type="button"
                onClick={() => setShow((s) => !s)}
                className="rounded-full p-1 text-zinc-500 hover:bg-zinc-100"
                aria-label={show ? 'Hide password' : 'Show password'}
              >
                {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
              <button
                type="button"
                onClick={() => form.setValue('password', generateTempPassword(), { shouldValidate: true })}
                className="rounded-full p-1 text-zinc-500 hover:bg-zinc-100"
                aria-label="Generate new random password"
                title="Generate new random password"
              >
                <RefreshCw className="h-4 w-4" />
              </button>
            </div>
          </div>
          {form.formState.errors.password ? (
            <p className="mt-1 text-xs text-red-600">{form.formState.errors.password.message}</p>
          ) : (
            <p className="mt-1 text-xs text-zinc-500">Minimum 6 characters.</p>
          )}
          <p className="mt-2 text-xs text-zinc-500">
            Strength: {passwordValue.length < 6 ? '—' : passwordValue.length < 10 ? 'OK' : 'Strong'}
          </p>
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button type="submit" disabled={isPending}>Reset password</Button>
        </DialogFooter>
      </form>
    </Dialog>
  );
}

export function EmployeesPage(): JSX.Element {
  const { data, isLoading } = useUsers();
  const { data: stores = [] } = useStores();
  const [opening, setOpening] = useState(false);
  const [editing, setEditing] = useState<UserRecord | null>(null);
  const [resetTarget, setResetTarget] = useState<UserRecord | null>(null);
  const [attendanceTarget, setAttendanceTarget] = useState<UserRecord | null>(null);

  const createForm = useForm<CreateValues>({ resolver: zodResolver(createSchema) });
  const editForm = useForm<EditValues>({ resolver: zodResolver(editSchema) });

  const createMutation = useCreateUser();
  const updateMutation = useUpdateUserMutation();
  const toggleMutation = useToggleUserStatus();
  const deleteMutation = useDeleteUser();
  const resetMutation = useResetUserPassword();

  useEffect(() => {
    if (!opening) {
      createForm.reset();
      editForm.reset();
      setEditing(null);
    }
  }, [opening, createForm, editForm]);

  function openCreate() {
    setEditing(null);
    createForm.reset({ email: '', name: '', role: 'WORKER', password: '', assignedStore: '' });
    setOpening(true);
  }

  function openEdit(user: UserRecord) {
    setEditing(user);
    editForm.reset({
      email: user.email,
      name: user.name,
      role: user.role,
      assignedStore: user.assignedStore ?? '',
    });
    setOpening(true);
  }

  async function onCreate(values: CreateValues) {
    try {
      await createMutation.mutateAsync({
        email: values.email,
        name: values.name,
        role: values.role,
        password: values.password,
        assignedStore: values.assignedStore || null,
      });
      toast.success(`Invited ${values.name}`);
      setOpening(false);
    } catch (error) {
      toast.error(error instanceof ApiException ? error.message : 'Invite failed');
    }
  }

  async function onEdit(values: EditValues) {
    if (!editing) return;
    try {
      await updateMutation.mutateAsync({
        id: editing.id,
        input: {
          email: values.email,
          name: values.name,
          role: values.role,
          assignedStore: values.assignedStore ? values.assignedStore : null,
        },
      });
      toast.success(`Updated ${values.name}`);
      setOpening(false);
    } catch (error) {
      toast.error(error instanceof ApiException ? error.message : 'Update failed');
    }
  }

  async function onResetPassword(password: string) {
    if (!resetTarget) return;
    try {
      await resetMutation.mutateAsync({ id: resetTarget.id, password });
      toast.success(`Password reset for ${resetTarget.name}`);
      setResetTarget(null);
    } catch (error) {
      toast.error(error instanceof ApiException ? error.message : 'Reset failed');
    }
  }

  async function onToggle(user: UserRecord) {
    try {
      await toggleMutation.mutateAsync({ id: user.id, isActive: !(user.isActive ?? true) });
      toast.success(`${user.name} ${user.isActive ? 'deactivated' : 'reactivated'}`);
    } catch (error) {
      toast.error(error instanceof ApiException ? error.message : 'Status change failed');
    }
  }

  async function onDelete(user: UserRecord) {
    if (!confirm(`Remove ${user.name}?`)) return;
    try {
      await deleteMutation.mutateAsync(user.id);
      toast.success(`Removed ${user.name}`);
    } catch (error) {
      toast.error(error instanceof ApiException ? error.message : 'Delete failed');
    }
  }

  const inEditMode = editing !== null;
  const isPending = createMutation.isPending || updateMutation.isPending;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-zinc-500">{data?.length ?? 0} members</p>
        <Button onClick={openCreate}>
          <Plus className="mr-2 h-4 w-4" /> Invite member
        </Button>
      </div>

      {isLoading ? (
        <div className="space-y-2">
          <Skeleton className="h-12" />
          <Skeleton className="h-12" />
          <Skeleton className="h-12" />
        </div>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Role</TableHead>
              <TableHead>Store</TableHead>
              <TableHead>Status</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {data?.length === 0 ? (
              <TableEmpty colspan={6}>No team members yet.</TableEmpty>
            ) : (
              data?.map((user) => (
                <TableRow key={user.id}>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <div className="flex h-8 w-8 items-center justify-center rounded-full bg-zinc-100 text-zinc-700">
                        <UserCog className="h-4 w-4" />
                      </div>
                      <span className="font-semibold text-zinc-950">{user.name}</span>
                    </div>
                  </TableCell>
                  <TableCell>{user.email}</TableCell>
                  <TableCell><Badge>{user.role}</Badge></TableCell>
                  <TableCell>{stores.find((s) => s.id === user.assignedStore)?.name ?? '—'}</TableCell>
                  <TableCell>
                    <Badge className={user.isActive ?? true ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-zinc-50 text-zinc-500'}>
                      {user.isActive ?? true ? 'ACTIVE' : 'DISABLED'}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      <Button variant="ghost" onClick={() => setAttendanceTarget(user)} aria-label={`View attendance for ${user.name}`} title="View attendance">
                        <CalendarDays className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" onClick={() => openEdit(user)} aria-label={`Edit ${user.name}`} title="Edit">
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" onClick={() => setResetTarget(user)} aria-label={`Reset password for ${user.name}`} title="Reset password">
                        <KeyRound className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" onClick={() => onToggle(user)} aria-label={`Toggle status for ${user.name}`} title="Toggle status">
                        <Power className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" onClick={() => onDelete(user)} aria-label={`Delete ${user.name}`} title="Delete">
                        <Trash2 className="h-4 w-4 text-red-500" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      )}

      <Dialog
        open={opening}
        onOpenChange={setOpening}
        title={inEditMode ? `Edit ${editing?.name ?? ''}` : 'Invite team member'}
      >
        {inEditMode ? (
          <form className="space-y-4" onSubmit={editForm.handleSubmit(onEdit)}>
            <div>
              <Label htmlFor="edit-name">Name</Label>
              <Input id="edit-name" {...editForm.register('name')} className="mt-1" />
              {editForm.formState.errors.name ? <p className="mt-1 text-xs text-red-600">{editForm.formState.errors.name.message}</p> : null}
            </div>
            <div>
              <Label htmlFor="edit-email">Email</Label>
              <Input id="edit-email" type="email" {...editForm.register('email')} className="mt-1" />
              {editForm.formState.errors.email ? <p className="mt-1 text-xs text-red-600">{editForm.formState.errors.email.message}</p> : null}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="edit-role">Role</Label>
                <Select id="edit-role" {...editForm.register('role')} className="mt-1">
                  {EDIT_ROLES.map((r) => (
                    <option key={r} value={r}>{r.charAt(0) + r.slice(1).toLowerCase()}</option>
                  ))}
                </Select>
              </div>
              <div>
                <Label htmlFor="edit-assignedStore">Store</Label>
                <Select id="edit-assignedStore" {...editForm.register('assignedStore')} className="mt-1">
                  <option value="">Unassigned</option>
                  {stores.map((s) => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </Select>
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpening(false)}>Cancel</Button>
              <Button type="submit" disabled={isPending}>Save changes</Button>
            </DialogFooter>
          </form>
        ) : (
          <form className="space-y-4" onSubmit={createForm.handleSubmit(onCreate)}>
            <div>
              <Label htmlFor="name">Name</Label>
              <Input id="name" {...createForm.register('name')} className="mt-1" />
              {createForm.formState.errors.name ? <p className="mt-1 text-xs text-red-600">{createForm.formState.errors.name.message}</p> : null}
            </div>
            <div>
              <Label htmlFor="email">Email</Label>
              <Input id="email" type="email" {...createForm.register('email')} className="mt-1" />
              {createForm.formState.errors.email ? <p className="mt-1 text-xs text-red-600">{createForm.formState.errors.email.message}</p> : null}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="role">Role</Label>
                <Select id="role" {...createForm.register('role')} className="mt-1">
                  {EDIT_ROLES.filter((r) => r !== 'SUPER_ADMIN').map((r) => (
                    <option key={r} value={r}>{r.charAt(0) + r.slice(1).toLowerCase()}</option>
                  ))}
                </Select>
              </div>
              <div>
                <Label htmlFor="assignedStore">Store</Label>
                <Select id="assignedStore" {...createForm.register('assignedStore')} className="mt-1">
                  <option value="">Unassigned</option>
                  {stores.map((s) => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </Select>
              </div>
            </div>
            <div>
              <Label htmlFor="password">Temporary password</Label>
              <Input id="password" type="password" {...createForm.register('password')} className="mt-1" />
              {createForm.formState.errors.password ? <p className="mt-1 text-xs text-red-600">{createForm.formState.errors.password.message}</p> : null}
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpening(false)}>Cancel</Button>
              <Button type="submit" disabled={isPending}>Send invite</Button>
            </DialogFooter>
          </form>
        )}
      </Dialog>

      <ResetPasswordDialog
        user={resetTarget}
        open={resetTarget !== null}
        onOpenChange={(next) => { if (!next) setResetTarget(null); }}
        onSubmit={onResetPassword}
        isPending={resetMutation.isPending}
      />

      <AttendanceDialog
        user={attendanceTarget}
        open={attendanceTarget !== null}
        onOpenChange={(next) => { if (!next) setAttendanceTarget(null); }}
      />
    </div>
  );
}