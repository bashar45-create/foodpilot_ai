import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

const schema = z.object({
  username: z.string().min(1),
  password: z.string().min(1),
});

type LoginValues = z.infer<typeof schema>;

export function LoginForm({ onSubmit, isLoading }: { onSubmit: (values: LoginValues) => Promise<void>; isLoading?: boolean }): JSX.Element {
  const { register, handleSubmit, formState: { errors } } = useForm<LoginValues>({ resolver: zodResolver(schema) });

  return (
    <form className="space-y-4" onSubmit={handleSubmit(onSubmit)}>
      <div>
        <Input placeholder="Username" {...register('username')} />
        {errors.username ? <p className="mt-2 text-xs text-zinc-500">{errors.username.message}</p> : null}
      </div>
      <div>
        <Input type="password" placeholder="Password" {...register('password')} />
        {errors.password ? <p className="mt-2 text-xs text-zinc-500">{errors.password.message}</p> : null}
      </div>
      <Button type="submit" className="w-full" disabled={isLoading}>
        Sign in
      </Button>
    </form>
  );
}
