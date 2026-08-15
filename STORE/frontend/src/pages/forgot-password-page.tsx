import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { toast } from 'sonner';

import { AuthPanel } from '@/features/auth/components/auth-panel';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

const schema = z.object({ email: z.string().email() });

export function ForgotPasswordPage(): JSX.Element {
  const { register, handleSubmit } = useForm<{ email: string }>({ resolver: zodResolver(schema) });

  return (
    <div className="flex min-h-screen items-center justify-center px-4 py-12">
      <AuthPanel title="Reset access" description="We will send a reset link if the account exists.">
        <form className="space-y-4" onSubmit={handleSubmit(async () => toast.success('Check your email for reset instructions.'))}>
          <Input placeholder="Email" {...register('email')} />
          <Button type="submit" className="w-full">Send reset link</Button>
        </form>
      </AuthPanel>
    </div>
  );
}
