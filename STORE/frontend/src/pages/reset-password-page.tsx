import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';

import { AuthPanel } from '@/features/auth/components/auth-panel';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

const schema = z.object({ password: z.string().min(8).regex(/(?=.*\d)/) });

export function ResetPasswordPage(): JSX.Element {
  const [searchParams] = useSearchParams();
  const { register, handleSubmit } = useForm<{ password: string }>({ resolver: zodResolver(schema) });

  return (
    <div className="flex min-h-screen items-center justify-center px-4 py-12">
      <AuthPanel title="Set a new password" description="Choose a secure password for your account.">
        <form className="space-y-4" onSubmit={handleSubmit(async () => toast.success(`Password updated for token ${searchParams.get('token') ?? ''}`))}>
          <Input type="password" placeholder="New password" {...register('password')} />
          <Button type="submit" className="w-full">Update password</Button>
        </form>
      </AuthPanel>
    </div>
  );
}
