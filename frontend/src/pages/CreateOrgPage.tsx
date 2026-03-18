import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import toast from 'react-hot-toast';
import { ArrowLeft } from 'lucide-react';
import { orgs as orgsApi } from '@/lib/api';
import { useStore } from '@/lib/store';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { generateSlug } from '@/lib/utils';

const schema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters'),
  slug: z.string().regex(/^[a-z0-9-]+$/, 'Only lowercase letters, numbers, and hyphens').optional(),
  primaryColor: z.string().default('#4f46e5'),
  secondaryColor: z.string().default('#64748b'),
});

type CreateOrgForm = z.infer<typeof schema>;

export default function CreateOrgPage() {
  const navigate = useNavigate();
  const { setCurrentOrg } = useStore();
  const [loading, setLoading] = useState(false);

  const { register, handleSubmit, setValue, watch, formState: { errors } } = useForm<CreateOrgForm>({
    resolver: zodResolver(schema),
    defaultValues: { primaryColor: '#4f46e5', secondaryColor: '#64748b' },
  });

  const name = watch('name');

  async function onSubmit(data: CreateOrgForm) {
    setLoading(true);
    try {
      const org = await orgsApi.create({
        ...data,
        slug: data.slug || generateSlug(data.name),
      });
      setCurrentOrg(org);
      toast.success('Organization created!');
      navigate(`/orgs/${org.id}`);
    } catch (err: unknown) {
      const error = err as { response?: { data?: { error?: string } } };
      toast.error(error.response?.data?.error ?? 'Failed to create organization');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="p-4 sm:p-6 max-w-xl">
      <div className="flex items-center gap-3 mb-6">
        <Button variant="ghost" size="icon" onClick={() => navigate('/orgs')}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <h1 className="text-xl font-bold text-gray-900">New Organization</h1>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Organization Details</CardTitle>
          <CardDescription>Create a shared space for your team</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div className="space-y-1.5">
              <Label required>Organization Name</Label>
              <Input
                {...register('name')}
                placeholder="Acme Inc."
                error={errors.name?.message}
                onChange={(e) => {
                  register('name').onChange(e);
                  if (!watch('slug')) {
                    setValue('slug', generateSlug(e.target.value));
                  }
                }}
              />
            </div>

            <div className="space-y-1.5">
              <Label>Slug (URL identifier)</Label>
              <div className="flex items-center">
                <span className="text-sm text-gray-400 border border-r-0 border-gray-300 rounded-l-md px-3 py-1.5 h-9 flex items-center bg-gray-50">
                  /orgs/
                </span>
                <Input
                  {...register('slug')}
                  placeholder={generateSlug(name ?? 'my-org')}
                  error={errors.slug?.message}
                  className="rounded-l-none"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Primary Color</Label>
                <div className="flex gap-2 items-center">
                  <input
                    type="color"
                    {...register('primaryColor')}
                    className="h-9 w-12 rounded border border-gray-300 cursor-pointer"
                  />
                  <Input
                    {...register('primaryColor')}
                    placeholder="#4f46e5"
                    className="flex-1 font-mono text-sm"
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>Secondary Color</Label>
                <div className="flex gap-2 items-center">
                  <input
                    type="color"
                    {...register('secondaryColor')}
                    className="h-9 w-12 rounded border border-gray-300 cursor-pointer"
                  />
                  <Input
                    {...register('secondaryColor')}
                    placeholder="#64748b"
                    className="flex-1 font-mono text-sm"
                  />
                </div>
              </div>
            </div>

            <div className="flex gap-3 pt-2">
              <Button type="button" variant="outline" onClick={() => navigate('/orgs')}>
                Cancel
              </Button>
              <Button type="submit" loading={loading}>
                Create Organization
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
