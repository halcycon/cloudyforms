import { useEffect, useState } from 'react';
import { useStore } from '@/lib/store';
import { auth as authApi } from '@/lib/api';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import toast from 'react-hot-toast';
import { User, Lock, Save } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';

const profileSchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters'),
  email: z.string().email('Invalid email'),
});

const passwordSchema = z.object({
  currentPassword: z.string().min(1, 'Required'),
  newPassword: z.string().min(8, 'At least 8 characters'),
  confirmPassword: z.string(),
}).refine((d) => d.newPassword === d.confirmPassword, {
  message: 'Passwords do not match',
  path: ['confirmPassword'],
});

type ProfileForm = z.infer<typeof profileSchema>;
type PasswordForm = z.infer<typeof passwordSchema>;

export default function SettingsPage() {
  const { user, setUser } = useStore();
  const [profileLoading, setProfileLoading] = useState(false);
  const [passwordLoading, setPasswordLoading] = useState(false);

  const profileForm = useForm<ProfileForm>({
    resolver: zodResolver(profileSchema),
    defaultValues: { name: user?.name ?? '', email: user?.email ?? '' },
  });

  const passwordForm = useForm<PasswordForm>({ resolver: zodResolver(passwordSchema) });

  useEffect(() => {
    if (user) {
      profileForm.reset({ name: user.name, email: user.email });
    }
  }, [user, profileForm]);

  async function onProfileSubmit(data: ProfileForm) {
    setProfileLoading(true);
    try {
      const updated = await authApi.updateProfile(data);
      setUser(updated);
      toast.success('Profile updated');
    } catch {
      toast.error('Failed to update profile');
    } finally {
      setProfileLoading(false);
    }
  }

  async function onPasswordSubmit(data: PasswordForm) {
    setPasswordLoading(true);
    try {
      await authApi.changePassword(data.currentPassword, data.newPassword);
      passwordForm.reset();
      toast.success('Password changed');
    } catch (err: unknown) {
      const error = err as { response?: { data?: { error?: string } } };
      toast.error(error.response?.data?.error ?? 'Failed to change password');
    } finally {
      setPasswordLoading(false);
    }
  }

  return (
    <div className="p-4 sm:p-6 max-w-2xl space-y-6">
      <h1 className="text-2xl font-bold text-gray-900">Settings</h1>

      <Tabs defaultValue="profile">
        <TabsList>
          <TabsTrigger value="profile">
            <User className="h-3.5 w-3.5 mr-1.5" /> Profile
          </TabsTrigger>
          <TabsTrigger value="security">
            <Lock className="h-3.5 w-3.5 mr-1.5" /> Security
          </TabsTrigger>
        </TabsList>

        <TabsContent value="profile" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Profile Information</CardTitle>
              <CardDescription>Update your name and email address</CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={profileForm.handleSubmit(onProfileSubmit)} className="space-y-4">
                <div className="space-y-1.5">
                  <Label required>Full Name</Label>
                  <Input
                    {...profileForm.register('name')}
                    error={profileForm.formState.errors.name?.message}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label required>Email</Label>
                  <Input
                    {...profileForm.register('email')}
                    type="email"
                    error={profileForm.formState.errors.email?.message}
                  />
                </div>

                <Separator />

                <div className="rounded-lg bg-gray-50 p-3">
                  <p className="text-xs text-gray-500">Member since: {user?.createdAt ? new Date(user.createdAt).toLocaleDateString() : '—'}</p>
                  {user?.isSuperAdmin && (
                    <p className="text-xs font-medium text-primary-600 mt-0.5">Super Admin</p>
                  )}
                </div>

                <Button type="submit" loading={profileLoading}>
                  <Save className="h-4 w-4" /> Save Profile
                </Button>
              </form>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="security" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Change Password</CardTitle>
              <CardDescription>Choose a strong password</CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={passwordForm.handleSubmit(onPasswordSubmit)} className="space-y-4">
                <div className="space-y-1.5">
                  <Label required>Current Password</Label>
                  <Input
                    {...passwordForm.register('currentPassword')}
                    type="password"
                    error={passwordForm.formState.errors.currentPassword?.message}
                    autoComplete="current-password"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label required>New Password</Label>
                  <Input
                    {...passwordForm.register('newPassword')}
                    type="password"
                    error={passwordForm.formState.errors.newPassword?.message}
                    autoComplete="new-password"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label required>Confirm New Password</Label>
                  <Input
                    {...passwordForm.register('confirmPassword')}
                    type="password"
                    error={passwordForm.formState.errors.confirmPassword?.message}
                    autoComplete="new-password"
                  />
                </div>
                <Button type="submit" loading={passwordLoading}>
                  Change Password
                </Button>
              </form>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
