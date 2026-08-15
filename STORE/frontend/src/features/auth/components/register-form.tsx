import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

const schema = z.object({
  businessName: z.string().min(1),
  name: z.string().min(1),
  email: z.string().email(),
  password: z.string().min(8).regex(/(?=.*\d)/, 'Password must include at least one number'),
});

type RegisterValues = z.infer<typeof schema>;

export function RegisterForm({ onSubmit, isLoading }: { onSubmit: (values: RegisterValues) => Promise<void>; isLoading?: boolean }): JSX.Element {
  const { register, handleSubmit, formState: { errors } } = useForm<RegisterValues>({ resolver: zodResolver(schema) });

  return (
    <form className="space-y-4" onSubmit={handleSubmit(onSubmit)}>
      <Input placeholder="Business name" {...register('businessName')} />
      {errors.businessName ? <p className="text-xs text-zinc-500">{errors.businessName.message}</p> : null}
      <Input placeholder="Owner name" {...register('name')} />
      <Input placeholder="Email" {...register('email')} />
      <Input type="password" placeholder="Password" {...register('password')} />
      <Button type="submit" className="w-full" disabled={isLoading}>Create account</Button>
    </form>
  );
}
