import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { ArrowLeft, Plus, Pencil, Trash2, Database } from 'lucide-react';
import { orgs as orgsApi } from '@/lib/api';
import type { StaticValue } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
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

export default function OrgStaticValuesPage() {
  const { orgId } = useParams<{ orgId: string }>();
  const navigate = useNavigate();
  const [values, setValues] = useState<StaticValue[]>([]);
  const [loading, setLoading] = useState(true);

  // Form state for add/edit
  const [editing, setEditing] = useState<StaticValue | null>(null);
  const [formKey, setFormKey] = useState('');
  const [formLabel, setFormLabel] = useState('');
  const [formValue, setFormValue] = useState('');
  const [saving, setSaving] = useState(false);
  const [showForm, setShowForm] = useState(false);

  // Delete
  const [deleteTarget, setDeleteTarget] = useState<StaticValue | null>(null);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    if (!orgId) return;
    orgsApi.listStaticValues(orgId)
      .then(setValues)
      .catch(() => toast.error('Failed to load static values'))
      .finally(() => setLoading(false));
  }, [orgId]);

  function openAdd() {
    setEditing(null);
    setFormKey('');
    setFormLabel('');
    setFormValue('');
    setShowForm(true);
  }

  function openEdit(sv: StaticValue) {
    setEditing(sv);
    setFormKey(sv.key);
    setFormLabel(sv.label);
    setFormValue(sv.value);
    setShowForm(true);
  }

  function cancelForm() {
    setShowForm(false);
    setEditing(null);
  }

  async function handleSave() {
    if (!orgId || !formKey.trim() || !formLabel.trim()) {
      toast.error('Key and label are required');
      return;
    }
    setSaving(true);
    try {
      if (editing) {
        const updated = await orgsApi.updateStaticValue(orgId, editing.id, {
          key: formKey.trim(),
          label: formLabel.trim(),
          value: formValue,
        });
        setValues((prev) => prev.map((v) => (v.id === updated.id ? updated : v)));
        toast.success('Static value updated');
      } else {
        const created = await orgsApi.createStaticValue(orgId, {
          key: formKey.trim(),
          label: formLabel.trim(),
          value: formValue,
        });
        setValues((prev) => [...prev, created]);
        toast.success('Static value created');
      }
      cancelForm();
    } catch (err: unknown) {
      const error = err as { response?: { data?: { error?: string } } };
      toast.error(error.response?.data?.error ?? 'Failed to save');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!orgId || !deleteTarget) return;
    setDeleting(true);
    try {
      await orgsApi.deleteStaticValue(orgId, deleteTarget.id);
      setValues((prev) => prev.filter((v) => v.id !== deleteTarget.id));
      toast.success('Static value deleted');
    } catch {
      toast.error('Failed to delete');
    } finally {
      setDeleting(false);
      setDeleteTarget(null);
    }
  }

  if (loading) {
    return <div className="p-6"><div className="h-8 w-64 bg-gray-200 animate-pulse rounded" /></div>;
  }

  return (
    <div className="p-4 sm:p-6 space-y-6 max-w-2xl">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate(`/orgs/${orgId}/settings`)}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div>
          <h1 className="text-xl font-bold text-gray-900">Static Values</h1>
          <p className="text-sm text-gray-500">
            Constants shared across all forms in this organization
          </p>
        </div>
        <div className="ml-auto">
          <Button size="sm" onClick={openAdd}>
            <Plus className="h-4 w-4" /> Add Value
          </Button>
        </div>
      </div>

      {/* Add/Edit form */}
      {showForm && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{editing ? 'Edit Static Value' : 'New Static Value'}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label required>Key</Label>
                <Input
                  value={formKey}
                  onChange={(e) => setFormKey(e.target.value)}
                  placeholder="e.g. Company Name"
                />
                <p className="text-[10px] text-gray-400">
                  Used in formulas as {'{{static:Key}}'}
                </p>
              </div>
              <div className="space-y-1.5">
                <Label required>Label</Label>
                <Input
                  value={formLabel}
                  onChange={(e) => setFormLabel(e.target.value)}
                  placeholder="e.g. Company Name"
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Value</Label>
              <Input
                value={formValue}
                onChange={(e) => setFormValue(e.target.value)}
                placeholder="e.g. Acme Corp"
              />
            </div>
            <div className="flex gap-2 justify-end">
              <Button variant="outline" size="sm" onClick={cancelForm}>Cancel</Button>
              <Button size="sm" onClick={handleSave} loading={saving}>
                {editing ? 'Update' : 'Create'}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* List */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Values</CardTitle>
          <CardDescription>
            Reference these in calculated or hidden field formulas using <code className="font-mono text-xs bg-gray-100 px-1 rounded">{'{{static:Key}}'}</code>
          </CardDescription>
        </CardHeader>
        <CardContent>
          {values.length === 0 ? (
            <div className="text-center py-8">
              <Database className="mx-auto h-8 w-8 text-gray-300 mb-2" />
              <p className="text-sm text-gray-500">No static values yet</p>
              <p className="text-xs text-gray-400 mt-1">
                Add constants like company name, tax rates, or addresses
              </p>
            </div>
          ) : (
            <div className="divide-y divide-gray-100">
              {values.map((sv) => (
                <div key={sv.id} className="flex items-center justify-between py-3 gap-4">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="font-medium text-sm text-gray-900">{sv.label}</p>
                      <code className="text-[10px] bg-gray-100 text-gray-500 px-1 rounded font-mono">
                        {`{{static:${sv.key}}}`}
                      </code>
                    </div>
                    <p className="text-sm text-gray-600 truncate">{sv.value || '(empty)'}</p>
                  </div>
                  <div className="flex gap-1">
                    <Button variant="ghost" size="icon" onClick={() => openEdit(sv)}>
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button variant="ghost" size="icon" onClick={() => setDeleteTarget(sv)}>
                      <Trash2 className="h-3.5 w-3.5 text-red-500" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Delete confirmation */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete static value?</AlertDialogTitle>
            <AlertDialogDescription>
              This will remove <strong>{deleteTarget?.label}</strong> ({`{{static:${deleteTarget?.key}}}`}).
              Any forms referencing this value will show empty results for this placeholder.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={handleDelete} disabled={deleting}>
              {deleting ? 'Deleting...' : 'Delete'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
