import { Link } from 'react-router-dom';
import { toast } from 'sonner';

import { AuthPanel } from '@/features/auth/components/auth-panel';
import { RegisterForm } from '@/features/auth/components/register-form';
import { useAuth } from '@/context/auth-context';

export function RegisterPage(): JSX.Element {
  const { register: signUp, isLoading } = useAuth();

  return (
    <div className="flex min-h-screen items-center justify-center px-4 py-12">
      <AuthPanel title="Create your business" description="Register the first owner account and get the platform ready.">
        <RegisterForm
          isLoading={isLoading}
          onSubmit={async (values) => {
            try {
              await signUp({ businessName: values.businessName, name: values.name, email: values.email, password: values.password });
              toast.success('Account created');
            } catch {
              toast.error('Unable to register');
            }
          }}
        />
        <p className="text-sm text-zinc-500">
          Already have an account? <Link to="/login" className="font-semibold text-zinc-950">Sign in</Link>
        </p>
      </AuthPanel>
    </div>
  );
}
