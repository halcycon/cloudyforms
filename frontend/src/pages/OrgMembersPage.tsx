import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import toast from 'react-hot-toast';
import {
  ArrowLeft,
  UserPlus,
  Trash2,
  Users,
  FolderPlus,
  ChevronRight,
  Pencil,
  X,
  Check,
} from 'lucide-react';
import { orgs as orgsApi } from '@/lib/api';
import type { OrgMember, OrgGroup, OrgGroupMember } from '@/lib/types';
import { useStore } from '@/lib/store';
import { getInitials } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
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

/* ─── Invite schema ─── */
const inviteSchema = z.object({
  email: z.string().email('Invalid email'),
  role: z.enum(['admin', 'editor', 'creator', 'viewer']),
});
type InviteForm = z.infer<typeof inviteSchema>;

/* ─── Group schema ─── */
const groupSchema = z.object({
  name: z.string().min(1, 'Name is required').max(100),
  description: z.string().max(500).optional(),
});
type GroupForm = z.infer<typeof groupSchema>;

const ROLE_LABELS: Record<string, string> = {
  owner: 'Owner',
  admin: 'Admin',
  editor: 'Editor',
  creator: 'Creator',
  viewer: 'Viewer',
};

/* ══════════════════════════════════════════════════════════ */
export default function OrgMembersPage() {
  const { orgId } = useParams<{ orgId: string }>();
  const navigate = useNavigate();
  const { user } = useStore();

  /* ─── Members state ─── */
  const [members, setMembers] = useState<OrgMember[]>([]);
  const [loadingMembers, setLoadingMembers] = useState(true);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [inviting, setInviting] = useState(false);

  /* ─── Groups state ─── */
  const [groups, setGroups] = useState<(OrgGroup & { memberCount?: number })[]>([]);
  const [loadingGroups, setLoadingGroups] = useState(true);
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);
  const [groupMembers, setGroupMembers] = useState<OrgGroupMember[]>([]);
  const [loadingGroupMembers, setLoadingGroupMembers] = useState(false);
  const [creatingGroup, setCreatingGroup] = useState(false);
  const [editingGroupId, setEditingGroupId] = useState<string | null>(null);
  const [deletingGroupId, setDeletingGroupId] = useState<string | null>(null);
  const [addingToGroup, setAddingToGroup] = useState(false);
  const [selectedMemberForGroup, setSelectedMemberForGroup] = useState('');

  /* ─── Forms ─── */
  const inviteFormHook = useForm<InviteForm>({
    resolver: zodResolver(inviteSchema),
    defaultValues: { role: 'editor' },
  });
  const groupFormHook = useForm<GroupForm>({
    resolver: zodResolver(groupSchema),
  });
  const editGroupFormHook = useForm<GroupForm>({
    resolver: zodResolver(groupSchema),
  });

  /* ─── Load data ─── */
  useEffect(() => {
    if (!orgId) return;
    orgsApi
      .listMembers(orgId)
      .then(setMembers)
      .catch(() => toast.error('Failed to load members'))
      .finally(() => setLoadingMembers(false));

    orgsApi
      .listGroups(orgId)
      .then(setGroups)
      .catch(() => toast.error('Failed to load groups'))
      .finally(() => setLoadingGroups(false));
  }, [orgId]);

  /* ─── Load group members when a group is selected ─── */
  useEffect(() => {
    if (!orgId || !selectedGroupId) {
      setGroupMembers([]);
      return;
    }
    setLoadingGroupMembers(true);
    orgsApi
      .listGroupMembers(orgId, selectedGroupId)
      .then(setGroupMembers)
      .catch(() => toast.error('Failed to load group members'))
      .finally(() => setLoadingGroupMembers(false));
  }, [orgId, selectedGroupId]);

  /* ═══════ Member handlers ═══════ */
  async function onInvite(data: InviteForm) {
    if (!orgId) return;
    setInviting(true);
    try {
      const member = await orgsApi.addMember(orgId, data.email, data.role);
      setMembers((prev) => [...prev, member]);
      inviteFormHook.reset();
      toast.success(`${data.email} added!`);
    } catch (err: unknown) {
      const error = err as { response?: { data?: { error?: string } } };
      toast.error(error.response?.data?.error ?? 'Failed to add member');
    } finally {
      setInviting(false);
    }
  }

  async function handleRemoveMember() {
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
      setMembers((prev) =>
        prev.map((m) => (m.userId === userId ? { ...m, role: role as OrgMember['role'] } : m)),
      );
      toast.success('Role updated');
    } catch {
      toast.error('Failed to update role');
    }
  }

  /* ═══════ Group handlers ═══════ */
  async function onCreateGroup(data: GroupForm) {
    if (!orgId) return;
    setCreatingGroup(true);
    try {
      const group = await orgsApi.createGroup(orgId, data);
      setGroups((prev) => [...prev, { ...group, memberCount: 0 }]);
      groupFormHook.reset();
      toast.success(`Group "${data.name}" created`);
    } catch (err: unknown) {
      const error = err as { response?: { data?: { error?: string } } };
      toast.error(error.response?.data?.error ?? 'Failed to create group');
    } finally {
      setCreatingGroup(false);
    }
  }

  async function handleUpdateGroup(groupId: string) {
    if (!orgId) return;
    const data = editGroupFormHook.getValues();
    try {
      const updated = await orgsApi.updateGroup(orgId, groupId, data);
      setGroups((prev) => prev.map((g) => (g.id === groupId ? { ...g, ...updated } : g)));
      setEditingGroupId(null);
      toast.success('Group updated');
    } catch (err: unknown) {
      const error = err as { response?: { data?: { error?: string } } };
      toast.error(error.response?.data?.error ?? 'Failed to update group');
    }
  }

  async function handleDeleteGroup() {
    if (!orgId || !deletingGroupId) return;
    try {
      await orgsApi.deleteGroup(orgId, deletingGroupId);
      setGroups((prev) => prev.filter((g) => g.id !== deletingGroupId));
      if (selectedGroupId === deletingGroupId) {
        setSelectedGroupId(null);
      }
      toast.success('Group deleted');
    } catch {
      toast.error('Failed to delete group');
    } finally {
      setDeletingGroupId(null);
    }
  }

  async function handleAddToGroup() {
    if (!orgId || !selectedGroupId || !selectedMemberForGroup) return;
    setAddingToGroup(true);
    try {
      const gm = await orgsApi.addGroupMember(orgId, selectedGroupId, selectedMemberForGroup);
      setGroupMembers((prev) => [...prev, gm]);
      setSelectedMemberForGroup('');
      setGroups((prev) =>
        prev.map((g) =>
          g.id === selectedGroupId ? { ...g, memberCount: (g.memberCount ?? 0) + 1 } : g,
        ),
      );
      toast.success('Member added to group');
    } catch (err: unknown) {
      const error = err as { response?: { data?: { error?: string } } };
      toast.error(error.response?.data?.error ?? 'Failed to add member to group');
    } finally {
      setAddingToGroup(false);
    }
  }

  async function handleRemoveFromGroup(userId: string) {
    if (!orgId || !selectedGroupId) return;
    try {
      await orgsApi.removeGroupMember(orgId, selectedGroupId, userId);
      setGroupMembers((prev) => prev.filter((gm) => gm.userId !== userId));
      setGroups((prev) =>
        prev.map((g) =>
          g.id === selectedGroupId ? { ...g, memberCount: Math.max(0, (g.memberCount ?? 1) - 1) } : g,
        ),
      );
      toast.success('Member removed from group');
    } catch {
      toast.error('Failed to remove member from group');
    }
  }

  // Members NOT already in the selected group
  const availableForGroup = members.filter(
    (m) => !groupMembers.some((gm) => gm.userId === m.userId),
  );

  const selectedGroup = groups.find((g) => g.id === selectedGroupId);

  /* ═══════════════════════════ RENDER ═══════════════════════════ */
  return (
    <div className="p-4 sm:p-6 space-y-6 max-w-3xl">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate(`/orgs/${orgId}`)}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <h1 className="text-xl font-bold text-gray-900">Team Members &amp; Groups</h1>
      </div>

      <Tabs defaultValue="members">
        <TabsList>
          <TabsTrigger value="members">Members</TabsTrigger>
          <TabsTrigger value="groups">Groups</TabsTrigger>
        </TabsList>

        {/* ═══════ MEMBERS TAB ═══════ */}
        <TabsContent value="members" className="space-y-4">
          {/* Invite form */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <UserPlus className="h-4 w-4" /> Invite Member
              </CardTitle>
            </CardHeader>
            <CardContent>
              <form
                onSubmit={inviteFormHook.handleSubmit(onInvite)}
                className="flex flex-col sm:flex-row gap-3"
              >
                <div className="flex-1 space-y-1">
                  <Label>Email</Label>
                  <Input
                    {...inviteFormHook.register('email')}
                    type="email"
                    placeholder="colleague@example.com"
                    error={inviteFormHook.formState.errors.email?.message}
                  />
                </div>
                <div className="w-full sm:w-32 space-y-1">
                  <Label>Role</Label>
                  <Select
                    value={inviteFormHook.watch('role')}
                    onValueChange={(v) => inviteFormHook.setValue('role', v as InviteForm['role'])}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="admin">Admin</SelectItem>
                      <SelectItem value="editor">Editor</SelectItem>
                      <SelectItem value="creator">Creator</SelectItem>
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
              {loadingMembers ? (
                <div className="space-y-3">
                  {[1, 2, 3].map((i) => (
                    <div key={i} className="h-12 bg-gray-200 animate-pulse rounded" />
                  ))}
                </div>
              ) : members.length === 0 ? (
                <p className="text-sm text-gray-500 text-center py-6">No members yet.</p>
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
                        <p className="text-sm font-medium text-gray-900 truncate">
                          {member.user.name}
                        </p>
                        <p className="text-xs text-gray-400 truncate">{member.user.email}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        {member.role === 'owner' ? (
                          <span className="text-xs font-medium text-gray-500">
                            {ROLE_LABELS[member.role]}
                          </span>
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
                              <SelectItem value="creator">Creator</SelectItem>
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
        </TabsContent>

        {/* ═══════ GROUPS TAB ═══════ */}
        <TabsContent value="groups" className="space-y-4">
          {/* Create group form */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <FolderPlus className="h-4 w-4" /> Create Group
              </CardTitle>
            </CardHeader>
            <CardContent>
              <form
                onSubmit={groupFormHook.handleSubmit(onCreateGroup)}
                className="flex flex-col sm:flex-row gap-3"
              >
                <div className="flex-1 space-y-1">
                  <Label>Group Name</Label>
                  <Input
                    {...groupFormHook.register('name')}
                    placeholder="e.g. Secretaries, Masters"
                    error={groupFormHook.formState.errors.name?.message}
                  />
                </div>
                <div className="flex-1 space-y-1">
                  <Label>Description</Label>
                  <Input
                    {...groupFormHook.register('description')}
                    placeholder="Optional description"
                  />
                </div>
                <div className="flex items-end">
                  <Button type="submit" loading={creatingGroup}>
                    Create
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Group list */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <Users className="h-4 w-4" /> Groups
                </CardTitle>
              </CardHeader>
              <CardContent>
                {loadingGroups ? (
                  <div className="space-y-3">
                    {[1, 2].map((i) => (
                      <div key={i} className="h-10 bg-gray-200 animate-pulse rounded" />
                    ))}
                  </div>
                ) : groups.length === 0 ? (
                  <p className="text-sm text-gray-500 text-center py-6">No groups yet.</p>
                ) : (
                  <div className="divide-y divide-gray-100">
                    {groups.map((group) => (
                      <div key={group.id} className="py-2">
                        {editingGroupId === group.id ? (
                          <div className="flex items-center gap-2">
                            <Input
                              {...editGroupFormHook.register('name')}
                              className="h-7 text-sm"
                              defaultValue={group.name}
                            />
                            <button
                              onClick={() => handleUpdateGroup(group.id)}
                              className="text-green-600 hover:text-green-700 p-1"
                            >
                              <Check className="h-4 w-4" />
                            </button>
                            <button
                              onClick={() => setEditingGroupId(null)}
                              className="text-gray-400 hover:text-gray-600 p-1"
                            >
                              <X className="h-4 w-4" />
                            </button>
                          </div>
                        ) : (
                          <button
                            onClick={() => setSelectedGroupId(group.id)}
                            className={`flex items-center justify-between w-full text-left rounded-md px-2 py-1.5 hover:bg-gray-50 transition-colors ${
                              selectedGroupId === group.id ? 'bg-primary-50 ring-1 ring-primary-200' : ''
                            }`}
                          >
                            <div className="flex items-center gap-2 min-w-0">
                              <span className="text-sm font-medium text-gray-900 truncate">
                                {group.name}
                              </span>
                              <Badge variant="secondary" className="text-[10px]">
                                {group.memberCount ?? 0}
                              </Badge>
                            </div>
                            <div className="flex items-center gap-1 shrink-0">
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setEditingGroupId(group.id);
                                  editGroupFormHook.setValue('name', group.name);
                                  editGroupFormHook.setValue('description', group.description ?? '');
                                }}
                                className="text-gray-400 hover:text-gray-600 p-0.5 rounded"
                              >
                                <Pencil className="h-3.5 w-3.5" />
                              </button>
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setDeletingGroupId(group.id);
                                }}
                                className="text-gray-400 hover:text-red-500 p-0.5 rounded"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                              <ChevronRight className="h-4 w-4 text-gray-400" />
                            </div>
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Group members panel */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base">
                  {selectedGroup ? (
                    <span className="flex items-center gap-2">
                      <Users className="h-4 w-4" />
                      {selectedGroup.name} — Members
                    </span>
                  ) : (
                    <span className="text-gray-400">Select a group</span>
                  )}
                </CardTitle>
              </CardHeader>
              <CardContent>
                {!selectedGroupId ? (
                  <p className="text-sm text-gray-400 text-center py-6">
                    Select a group to manage its members.
                  </p>
                ) : (
                  <div className="space-y-3">
                    {/* Add member to group */}
                    <div className="flex gap-2">
                      <Select
                        value={selectedMemberForGroup}
                        onValueChange={setSelectedMemberForGroup}
                      >
                        <SelectTrigger className="flex-1 h-8 text-sm">
                          <SelectValue placeholder="Select member to add…" />
                        </SelectTrigger>
                        <SelectContent>
                          {availableForGroup.map((m) => (
                            <SelectItem key={m.userId} value={m.userId}>
                              {m.user.name} ({m.user.email})
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Button
                        size="sm"
                        onClick={handleAddToGroup}
                        loading={addingToGroup}
                        disabled={!selectedMemberForGroup}
                      >
                        Add
                      </Button>
                    </div>

                    {/* Group member list */}
                    {loadingGroupMembers ? (
                      <div className="space-y-2">
                        {[1, 2].map((i) => (
                          <div key={i} className="h-9 bg-gray-200 animate-pulse rounded" />
                        ))}
                      </div>
                    ) : groupMembers.length === 0 ? (
                      <p className="text-xs text-gray-400 text-center py-4">
                        No members in this group yet.
                      </p>
                    ) : (
                      <div className="divide-y divide-gray-100">
                        {groupMembers.map((gm) => (
                          <div key={gm.userId} className="flex items-center gap-2 py-2">
                            <Avatar className="h-7 w-7">
                              <AvatarFallback className="bg-primary-100 text-primary-700 text-[10px]">
                                {getInitials(gm.user.name)}
                              </AvatarFallback>
                            </Avatar>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium text-gray-900 truncate">
                                {gm.user.name}
                              </p>
                              <p className="text-[11px] text-gray-400 truncate">
                                {gm.user.email}
                              </p>
                            </div>
                            <button
                              onClick={() => handleRemoveFromGroup(gm.userId)}
                              className="text-gray-400 hover:text-red-500 p-1 rounded"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>

      {/* ─── Remove member dialog ─── */}
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
            <AlertDialogAction variant="destructive" onClick={handleRemoveMember}>
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ─── Delete group dialog ─── */}
      <AlertDialog open={!!deletingGroupId} onOpenChange={(o) => !o && setDeletingGroupId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete group?</AlertDialogTitle>
            <AlertDialogDescription>
              This group and all its member assignments will be permanently deleted.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={handleDeleteGroup}>
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
