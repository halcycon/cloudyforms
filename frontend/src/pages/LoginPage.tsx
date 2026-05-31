import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import toast from 'react-hot-toast';
import { auth } from '@/lib/api';
import { useStore } from '@/lib/store';
import { AuthBrandingHeader, type SiteBranding } from '@/components/auth/AuthBrandingHeader';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

const schema = z.object({
  email: z.string().email('Invalid email'),
  password: z.string().min(1, 'Password is required'),
});

type LoginForm = z.infer<typeof schema>;

export default function LoginPage() {
  const navigate = useNavigate();
  const { setUser, setToken } = useStore();
  const [loading, setLoading] = useState(false);
  const [signupsEnabled, setSignupsEnabled] = useState(true);
  const [siteBranding, setSiteBranding] = useState<SiteBranding | null>(null);

  useEffect(() => {
    auth.signupStatus()
      .then((status) => {
        setSignupsEnabled(status.signupsEnabled);
        setSiteBranding({
          scope: status.scope ?? 'platform',
          orgName: status.orgName,
          orgLogoUrl: status.orgLogoUrl,
          orgPrimaryColor: status.orgPrimaryColor,
        });
      })
      .catch(() => {});
  }, []);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginForm>({ resolver: zodResolver(schema) });

  async function onSubmit(data: LoginForm) {
    setLoading(true);
    try {
      const res = await auth.login(data.email, data.password);
      setToken(res.token);
      setUser(res.user);
      toast.success(`Welcome back, ${res.user.name}!`);
      navigate('/dashboard');
    } catch (err: unknown) {
      const error = err as { response?: { data?: { error?: string } } };
      toast.error(error.response?.data?.error ?? 'Login failed. Check your credentials.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <div className="w-full max-w-md">
        <AuthBrandingHeader branding={siteBranding} />

        <Card>
          <CardHeader>
            <CardTitle>Sign in</CardTitle>
            <CardDescription>Enter your email and password to continue</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
              <div className="space-y-1.5">
                <Label required>Email</Label>
                <Input
                  {...register('email')}
                  type="email"
                  placeholder="you@example.com"
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
                  autoComplete="current-password"
                />
              </div>

              <Button type="submit" loading={loading} className="w-full">
                Sign in
              </Button>
            </form>

            {signupsEnabled && (
              <p className="mt-4 text-center text-sm text-gray-500">
                Don't have an account?{' '}
                <Link to="/register" className="text-primary-600 hover:underline font-medium">
                  Create one
                </Link>
              </p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
