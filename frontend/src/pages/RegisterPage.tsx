import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import toast from 'react-hot-toast';
import { CloudLightning, ShieldX } from 'lucide-react';
import { auth } from '@/lib/api';
import { useStore } from '@/lib/store';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

const schema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters'),
  email: z.string().email('Invalid email'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  confirmPassword: z.string(),
}).refine((d) => d.password === d.confirmPassword, {
  message: 'Passwords do not match',
  path: ['confirmPassword'],
});

type RegisterForm = z.infer<typeof schema>;

export default function RegisterPage() {
  const navigate = useNavigate();
  const { setUser, setToken } = useStore();
  const [loading, setLoading] = useState(false);
  const [signupsEnabled, setSignupsEnabled] = useState(true);
  const [allowedDomains, setAllowedDomains] = useState<string[]>([]);
  const [checkingStatus, setCheckingStatus] = useState(true);

  useEffect(() => {
    auth.signupStatus()
      .then((status) => {
        setSignupsEnabled(status.signupsEnabled);
        setAllowedDomains(status.allowedDomains);
      })
      .catch(() => {
        // If the endpoint fails, assume signups are enabled (backwards compat)
      })
      .finally(() => setCheckingStatus(false));
  }, []);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<RegisterForm>({ resolver: zodResolver(schema) });

  async function onSubmit(data: RegisterForm) {
    setLoading(true);
    try {
      const res = await auth.register(data.name, data.email, data.password);
      setToken(res.token);
      setUser(res.user);
      toast.success('Account created! Welcome to CloudyForms.');
      navigate('/dashboard');
    } catch (err: unknown) {
      const error = err as { response?: { data?: { error?: string } } };
      toast.error(error.response?.data?.error ?? 'Registration failed. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  if (checkingStatus) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary-600 border-t-transparent" />
      </div>
    );
  }

  if (!signupsEnabled) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
        <div className="w-full max-w-md">
          <div className="flex items-center justify-center gap-2 mb-8">
            <CloudLightning className="h-8 w-8 text-primary-600" />
            <span className="text-2xl font-bold text-gray-900">CloudyForms</span>
          </div>
          <Card>
            <CardContent className="pt-6">
              <div className="flex flex-col items-center text-center py-4">
                <ShieldX className="h-12 w-12 text-gray-400 mb-3" />
                <h2 className="text-lg font-semibold text-gray-900">Registration Disabled</h2>
                <p className="text-sm text-gray-500 mt-2">
                  New account registration is currently disabled. Please contact your administrator for access.
                </p>
                <Link
                  to="/login"
                  className="mt-4 text-primary-600 hover:underline font-medium text-sm"
                >
                  Back to sign in
                </Link>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <div className="w-full max-w-md">
        <div className="flex items-center justify-center gap-2 mb-8">
          <CloudLightning className="h-8 w-8 text-primary-600" />
          <span className="text-2xl font-bold text-gray-900">CloudyForms</span>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Create an account</CardTitle>
            <CardDescription>Start building forms for free</CardDescription>
          </CardHeader>
          <CardContent>
            {allowedDomains.length > 0 && (
              <div className="mb-4 rounded-md bg-blue-50 border border-blue-200 px-3 py-2 text-xs text-blue-700">
                Registration is limited to: {allowedDomains.join(', ')}
              </div>
            )}

            <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
              <div className="space-y-1.5">
                <Label required>Full Name</Label>
                <Input
                  {...register('name')}
                  placeholder="Jane Smith"
                  error={errors.name?.message}
                  autoComplete="name"
                />
              </div>

              <div className="space-y-1.5">
                <Label required>Email</Label>
                <Input
                  {...register('email')}
                  type="email"
                  placeholder="jane@example.com"
                  error={errors.email?.message}
                  autoComplete="email"
                />
              </div>

              <div className="space-y-1.5">
                <Label required>Password</Label>
                <Input
                  {...register('password')}
                  type="password"
                  placeholder="••••••••"
                  error={errors.password?.message}
                  autoComplete="new-password"
                />
              </div>

              <div className="space-y-1.5">
                <Label required>Confirm Password</Label>
                <Input
                  {...register('confirmPassword')}
                  type="password"
                  placeholder="••••••••"
                  error={errors.confirmPassword?.message}
                  autoComplete="new-password"
                />
              </div>

              <Button type="submit" loading={loading} className="w-full">
                Create account
              </Button>
            </form>

            <p className="mt-4 text-center text-sm text-gray-500">
              Already have an account?{' '}
              <Link to="/login" className="text-primary-600 hover:underline font-medium">
                Sign in
              </Link>
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
