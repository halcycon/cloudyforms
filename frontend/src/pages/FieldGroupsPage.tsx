import { useEffect, useState } from 'react';
import { Plus, Trash2, Pencil, Layers } from 'lucide-react';
import toast from 'react-hot-toast';
import { fieldGroups as fieldGroupsApi } from '@/lib/api';
import { useStore } from '@/lib/store';
import { formatDateShort } from '@/lib/utils';
import type { FieldGroup, FormField, FieldType } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
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

function generateId() {
  return `field_${Math.random().toString(36).slice(2, 9)}`;
}

const QUICK_FIELD_TYPES: FieldType[] = ['text', 'email', 'phone', 'textarea', 'select', 'radio', 'checkbox', 'date', 'number'];

export default function FieldGroupsPage() {
  const { currentOrg } = useStore();
  const [groups, setGroups] = useState<FieldGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [editGroup, setEditGroup] = useState<FieldGroup | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [fields, setFields] = useState<FormField[]>([]);

  useEffect(() => {
    if (!currentOrg?.id) return;
    fieldGroupsApi.list(currentOrg.id)
      .then(setGroups)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [currentOrg?.id]);

  function openCreate() {
    setEditGroup(null);
    setName('');
    setDescription('');
    setFields([]);
    setIsOpen(true);
  }

  function openEdit(group: FieldGroup) {
    setEditGroup(group);
    setName(group.name);
    setDescription(group.description ?? '');
    setFields(group.fields);
    setIsOpen(true);
  }

  function addField(type: FieldType) {
    setFields((prev) => [
      ...prev,
      { id: generateId(), type, label: type.charAt(0).toUpperCase() + type.slice(1), required: false },
    ]);
  }

  function removeField(id: string) {
    setFields((prev) => prev.filter((f) => f.id !== id));
  }

  function updateFieldLabel(id: string, label: string) {
    setFields((prev) => prev.map((f) => f.id === id ? { ...f, label } : f));
  }

  async function handleSave() {
    if (!name.trim()) { toast.error('Name is required'); return; }
    setSaving(true);
    try {
      if (editGroup) {
        const updated = await fieldGroupsApi.update(editGroup.id, { name, description, fields });
        setGroups((prev) => prev.map((g) => g.id === editGroup.id ? updated : g));
        toast.success('Group updated');
      } else {
        const created = await fieldGroupsApi.create({ orgId: currentOrg?.id, name, description, fields });
        setGroups((prev) => [created, ...prev]);
        toast.success('Group created');
      }
      setIsOpen(false);
    } catch {
      toast.error('Failed to save group');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!deleteId) return;
    try {
      await fieldGroupsApi.delete(deleteId);
      setGroups((prev) => prev.filter((g) => g.id !== deleteId));
      toast.success('Group deleted');
    } catch {
      toast.error('Failed to delete group');
    } finally {
      setDeleteId(null);
    }
  }

  return (
    <div className="p-4 sm:p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Field Groups</h1>
          <p className="text-sm text-gray-500 mt-1">Reusable field templates for your forms</p>
        </div>
        <Button onClick={openCreate}>
          <Plus className="h-4 w-4" /> New Group
        </Button>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {[1, 2].map((i) => <div key={i} className="h-32 bg-gray-200 animate-pulse rounded-lg" />)}
        </div>
      ) : groups.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <div className="rounded-full bg-gray-100 p-6 mb-4">
            <Layers className="h-10 w-10 text-gray-400" />
          </div>
          <h3 className="text-lg font-semibold text-gray-900">No field groups yet</h3>
          <p className="text-gray-500 mt-2 max-w-sm">
            Create reusable field templates to speed up form building.
          </p>
          <Button className="mt-4" onClick={openCreate}>
            <Plus className="h-4 w-4" /> Create Group
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {groups.map((group) => (
            <Card key={group.id} className="hover:shadow-md transition-shadow">
              <CardContent className="pt-5">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-gray-900">{group.name}</p>
                    {group.description && (
                      <p className="text-xs text-gray-500 mt-0.5 truncate">{group.description}</p>
                    )}
                    <p className="text-xs text-gray-400 mt-1">
                      {group.fields.length} fields · {formatDateShort(group.createdAt)}
                    </p>
                  </div>
                  <div className="flex gap-1">
                    <button onClick={() => openEdit(group)} className="p-1 rounded text-gray-400 hover:text-gray-600 hover:bg-gray-100">
                      <Pencil className="h-4 w-4" />
                    </button>
                    <button onClick={() => setDeleteId(group.id)} className="p-1 rounded text-gray-400 hover:text-red-500 hover:bg-red-50">
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
                <div className="mt-3 flex flex-wrap gap-1">
                  {group.fields.slice(0, 4).map((f) => (
                    <Badge key={f.id} variant="secondary" className="text-xs">{f.label}</Badge>
                  ))}
                  {group.fields.length > 4 && (
                    <Badge variant="outline" className="text-xs">+{group.fields.length - 4} more</Badge>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Create/Edit Dialog */}
      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editGroup ? 'Edit Field Group' : 'Create Field Group'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label required>Name</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Contact Info" />
            </div>
            <div className="space-y-1.5">
              <Label>Description</Label>
              <Textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Optional description" rows={2} />
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Fields</Label>
                <span className="text-xs text-gray-400">{fields.length} fields</span>
              </div>

              {fields.length === 0 ? (
                <p className="text-xs text-gray-400 text-center py-4 border-2 border-dashed rounded-lg">
                  Add fields below
                </p>
              ) : (
                <div className="space-y-2">
                  {fields.map((f) => (
                    <div key={f.id} className="flex items-center gap-2">
                      <Badge variant="secondary" className="text-xs shrink-0">{f.type}</Badge>
                      <Input
                        value={f.label}
                        onChange={(e) => updateFieldLabel(f.id, e.target.value)}
                        className="flex-1 h-7 text-sm"
                      />
                      <button onClick={() => removeField(f.id)} className="text-gray-400 hover:text-red-500 shrink-0">
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  ))}
                </div>
              )}

              <div className="flex flex-wrap gap-1 pt-1">
                {QUICK_FIELD_TYPES.map((type) => (
                  <button
                    key={type}
                    onClick={() => addField(type)}
                    className="rounded px-2 py-0.5 text-xs border border-gray-200 bg-white text-gray-600 hover:border-primary-300 hover:bg-primary-50 hover:text-primary-700 transition-colors"
                  >
                    + {type}
                  </button>
                ))}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsOpen(false)}>Cancel</Button>
            <Button loading={saving} onClick={handleSave}>
              {editGroup ? 'Save Changes' : 'Create Group'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteId} onOpenChange={(o) => !o && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete field group?</AlertDialogTitle>
            <AlertDialogDescription>This action cannot be undone.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={handleDelete}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
