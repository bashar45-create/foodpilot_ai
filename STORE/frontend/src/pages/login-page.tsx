import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';

import { AuthPanel } from '@/features/auth/components/auth-panel';
import { LoginForm } from '@/features/auth/components/login-form';
import { useAuth } from '@/context/auth-context';
import { ApiException } from '@/types/api';

export function LoginPage(): JSX.Element {
  const { login, isLoading } = useAuth();
  const navigate = useNavigate();

  return (
    <div className="flex min-h-screen items-center justify-center px-4 py-12">
      <AuthPanel title="Welcome back" description="Sign in to manage stores, inventory, sales, and operations.">
        <LoginForm
          isLoading={isLoading}
          onSubmit={async (values) => {
            try {
              await login(values.username, values.password);
              navigate('/dashboard');
            } catch (error) {
              if (error instanceof ApiException && error.code === 'UNAUTHORIZED') {
                toast.error('Invalid credentials');
              } else {
                toast.error('Unable to sign in');
              }
            }
          }}
        />
        <p className="text-sm text-zinc-500">Hardcoded auth mode is enabled. Use the configured admin username and password.</p>
      </AuthPanel>
    </div>
  );
}
