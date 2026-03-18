import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import toast from 'react-hot-toast';
import { ArrowLeft, UserPlus, Trash2 } from 'lucide-react';
import { orgs as orgsApi } from '@/lib/api';
import type { OrgMember } from '@/lib/types';
import { useStore } from '@/lib/store';
import { getInitials } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

const inviteSchema = z.object({
  email: z.string().email('Invalid email'),
  role: z.enum(['admin', 'editor', 'viewer']),
});
type InviteForm = z.infer<typeof inviteSchema>;

export default function OrgMembersPage() {
  const { orgId } = useParams<{ orgId: string }>();
  const navigate = useNavigate();
  const { user } = useStore();
  const [members, setMembers] = useState<OrgMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [inviting, setInviting] = useState(false);

  const { register, handleSubmit, reset, setValue, watch, formState: { errors } } = useForm<InviteForm>({
    resolver: zodResolver(inviteSchema),
    defaultValues: { role: 'editor' },
  });

  useEffect(() => {
    if (!orgId) return;
    orgsApi.listMembers(orgId)
      .then(setMembers)
      .catch(() => toast.error('Failed to load members'))
      .finally(() => setLoading(false));
  }, [orgId]);

  async function onInvite(data: InviteForm) {
    if (!orgId) return;
    setInviting(true);
    try {
      const member = await orgsApi.addMember(orgId, data.email, data.role);
      setMembers((prev) => [...prev, member]);
      reset();
      toast.success(`${data.email} added!`);
    } catch (err: unknown) {
      const error = err as { response?: { data?: { error?: string } } };
      toast.error(error.response?.data?.error ?? 'Failed to add member');
    } finally {
      setInviting(false);
    }
  }

  async function handleRemove() {
    if (!orgId || !removingId) return;
    try {
      await orgsApi.removeMember(orgId, removingId);
      setMembers((prev) => prev.filter((m) => m.userId !== removingId));
      toast.success('Member removed');
    } catch {
      toast.error('Failed to remove member');
    } finally {
      setRemovingId(null);
    }
  }

  async function handleRoleChange(userId: string, role: string) {
    if (!orgId) return;
    try {
      await orgsApi.updateMember(orgId, userId, role);
      setMembers((prev) => prev.map((m) => m.userId === userId ? { ...m, role: role as OrgMember['role'] } : m));
      toast.success('Role updated');
    } catch {
      toast.error('Failed to update role');
    }
  }

  const ROLE_LABELS = { owner: 'Owner', admin: 'Admin', editor: 'Editor', viewer: 'Viewer' };

  return (
    <div className="p-4 sm:p-6 space-y-6 max-w-2xl">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate(`/orgs/${orgId}`)}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <h1 className="text-xl font-bold text-gray-900">Team Members</h1>
      </div>

      {/* Invite form */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <UserPlus className="h-4 w-4" /> Invite Member
          </CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit(onInvite)} className="flex flex-col sm:flex-row gap-3">
            <div className="flex-1 space-y-1">
              <Label>Email</Label>
              <Input
                {...register('email')}
                type="email"
                placeholder="colleague@example.com"
                error={errors.email?.message}
              />
            </div>
            <div className="w-full sm:w-32 space-y-1">
              <Label>Role</Label>
              <Select
                value={watch('role')}
                onValueChange={(v) => setValue('role', v as InviteForm['role'])}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="admin">Admin</SelectItem>
                  <SelectItem value="editor">Editor</SelectItem>
                  <SelectItem value="viewer">Viewer</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-end">
              <Button type="submit" loading={inviting}>
                Invite
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      {/* Members list */}
      <Card>
        <CardContent className="pt-6">
          {loading ? (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-12 bg-gray-200 animate-pulse rounded" />
              ))}
            </div>
          ) : (
            <div className="divide-y divide-gray-100">
              {members.map((member) => (
                <div key={member.userId} className="flex items-center gap-3 py-3">
                  <Avatar className="h-9 w-9">
                    <AvatarFallback className="bg-primary-100 text-primary-700 text-sm">
                      {getInitials(member.user.name)}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">{member.user.name}</p>
                    <p className="text-xs text-gray-400 truncate">{member.user.email}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    {member.role === 'owner' ? (
                      <span className="text-xs font-medium text-gray-500">{ROLE_LABELS[member.role]}</span>
                    ) : (
                      <Select
                        value={member.role}
                        onValueChange={(v) => handleRoleChange(member.userId, v)}
                        disabled={member.userId === user?.id}
                      >
                        <SelectTrigger className="h-7 text-xs w-24">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="admin">Admin</SelectItem>
                          <SelectItem value="editor">Editor</SelectItem>
                          <SelectItem value="viewer">Viewer</SelectItem>
                        </SelectContent>
                      </Select>
                    )}
                    {member.role !== 'owner' && member.userId !== user?.id && (
                      <button
                        onClick={() => setRemovingId(member.userId)}
                        className="text-gray-400 hover:text-red-500 p-1 rounded"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <AlertDialog open={!!removingId} onOpenChange={(o) => !o && setRemovingId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove member?</AlertDialogTitle>
            <AlertDialogDescription>
              This member will lose access to this organization.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={handleRemove}>Remove</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
