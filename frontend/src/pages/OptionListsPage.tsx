import { useEffect, useState } from 'react';
import { Plus, Trash2, Pencil, ListOrdered, FileJson } from 'lucide-react';
import toast from 'react-hot-toast';
import { optionLists as optionListsApi } from '@/lib/api';
import { useStore } from '@/lib/store';
import { formatDateShort, parseJsonOptions } from '@/lib/utils';
import type { OptionList } from '@/lib/types';
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

export default function OptionListsPage() {
  const { currentOrg } = useStore();
  const [lists, setLists] = useState<OptionList[]>([]);
  const [loading, setLoading] = useState(true);
  const [editList, setEditList] = useState<OptionList | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [options, setOptions] = useState<{ label: string; value: string }[]>([]);
  const [newOptionLabel, setNewOptionLabel] = useState('');
  const [showJsonPaste, setShowJsonPaste] = useState(false);
  const [jsonText, setJsonText] = useState('');
  const [jsonError, setJsonError] = useState<string | null>(null);

  useEffect(() => {
    if (!currentOrg?.id) return;
    optionListsApi.list(currentOrg.id)
      .then(setLists)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [currentOrg?.id]);

  function openCreate() {
    setEditList(null);
    setName('');
    setDescription('');
    setOptions([]);
    setNewOptionLabel('');
    setShowJsonPaste(false);
    setJsonText('');
    setJsonError(null);
    setIsOpen(true);
  }

  function openEdit(list: OptionList) {
    setEditList(list);
    setName(list.name);
    setDescription(list.description ?? '');
    setOptions([...list.options]);
    setNewOptionLabel('');
    setShowJsonPaste(false);
    setJsonText('');
    setJsonError(null);
    setIsOpen(true);
  }

  function addOption() {
    if (!newOptionLabel.trim()) return;
    const label = newOptionLabel.trim();
    const value = label.toLowerCase().replace(/\s+/g, '_');
    setOptions((prev) => [...prev, { label, value }]);
    setNewOptionLabel('');
  }

  function removeOption(index: number) {
    setOptions((prev) => prev.filter((_, i) => i !== index));
  }

  function updateOptionLabel(index: number, label: string) {
    setOptions((prev) => prev.map((opt, i) => i === index ? { ...opt, label } : opt));
  }

  function handleImportJson() {
    try {
      const imported = parseJsonOptions(jsonText);

      if (imported.length === 0) {
        setJsonError('No valid options found in JSON');
        return;
      }

      setOptions((prev) => [...prev, ...imported]);
      setJsonText('');
      setJsonError(null);
      setShowJsonPaste(false);
    } catch {
      setJsonError('Invalid JSON. Expected an array of strings, array of {label, value} objects, or a key→value object.');
    }
  }

  async function handleSave() {
    if (!name.trim()) { toast.error('Name is required'); return; }
    setSaving(true);
    try {
      if (editList) {
        const updated = await optionListsApi.update(editList.id, { name, description, options });
        setLists((prev) => prev.map((l) => l.id === editList.id ? updated : l));
        toast.success('Option list updated');
      } else {
        const created = await optionListsApi.create({ orgId: currentOrg?.id, name, description, options });
        setLists((prev) => [created, ...prev]);
        toast.success('Option list created');
      }
      setIsOpen(false);
    } catch {
      toast.error('Failed to save option list');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!deleteId) return;
    try {
      await optionListsApi.delete(deleteId);
      setLists((prev) => prev.filter((l) => l.id !== deleteId));
      toast.success('Option list deleted');
    } catch {
      toast.error('Failed to delete option list');
    } finally {
      setDeleteId(null);
    }
  }

  return (
    <div className="p-4 sm:p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Option Lists</h1>
          <p className="text-sm text-gray-500 mt-1">Pre-configured lists of values for dropdown fields</p>
        </div>
        <Button onClick={openCreate}>
          <Plus className="h-4 w-4" /> New List
        </Button>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {[1, 2].map((i) => <div key={i} className="h-32 bg-gray-200 animate-pulse rounded-lg" />)}
        </div>
      ) : lists.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <div className="rounded-full bg-gray-100 p-6 mb-4">
            <ListOrdered className="h-10 w-10 text-gray-400" />
          </div>
          <h3 className="text-lg font-semibold text-gray-900">No option lists yet</h3>
          <p className="text-gray-500 mt-2 max-w-sm">
            Create reusable lists of options for dropdown, multi-select, and radio fields.
          </p>
          <Button className="mt-4" onClick={openCreate}>
            <Plus className="h-4 w-4" /> Create List
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {lists.map((list) => (
            <Card key={list.id} className="hover:shadow-md transition-shadow">
              <CardContent className="pt-5">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-gray-900">{list.name}</p>
                    {list.description && (
                      <p className="text-xs text-gray-500 mt-0.5 truncate">{list.description}</p>
                    )}
                    <p className="text-xs text-gray-400 mt-1">
                      {list.options.length} options · {formatDateShort(list.createdAt)}
                    </p>
                  </div>
                  <div className="flex gap-1">
                    <button onClick={() => openEdit(list)} className="p-1 rounded text-gray-400 hover:text-gray-600 hover:bg-gray-100">
                      <Pencil className="h-4 w-4" />
                    </button>
                    <button onClick={() => setDeleteId(list.id)} className="p-1 rounded text-gray-400 hover:text-red-500 hover:bg-red-50">
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
                <div className="mt-3 flex flex-wrap gap-1">
                  {list.options.slice(0, 5).map((opt) => (
                    <Badge key={opt.value} variant="secondary" className="text-xs">{opt.label}</Badge>
                  ))}
                  {list.options.length > 5 && (
                    <Badge variant="outline" className="text-xs">+{list.options.length - 5} more</Badge>
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
            <DialogTitle>{editList ? 'Edit Option List' : 'Create Option List'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label required>Name</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Countries, Departments, Priorities" />
            </div>
            <div className="space-y-1.5">
              <Label>Description</Label>
              <Textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Optional description" rows={2} />
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Options</Label>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => { setShowJsonPaste(!showJsonPaste); setJsonError(null); }}
                    className="inline-flex items-center gap-1 text-xs text-gray-500 hover:text-gray-700"
                  >
                    <FileJson className="h-3.5 w-3.5" />
                    {showJsonPaste ? 'Manual' : 'Paste JSON'}
                  </button>
                  <span className="text-xs text-gray-400">{options.length} options</span>
                </div>
              </div>

              {showJsonPaste ? (
                <div className="space-y-2">
                  <Textarea
                    value={jsonText}
                    onChange={(e) => { setJsonText(e.target.value); setJsonError(null); }}
                    placeholder={'[\n  "Option A",\n  "Option B"\n]'}
                    rows={6}
                    className="text-xs font-mono"
                  />
                  {jsonError && <p className="text-xs text-red-500">{jsonError}</p>}
                  <p className="text-[10px] text-gray-400">
                    Accepts: array of strings, array of {'{label, value}'} objects, or key→value object.
                  </p>
                  <Button size="sm" variant="outline" onClick={handleImportJson} className="w-full">
                    Import Options
                  </Button>
                </div>
              ) : (
                <>
                  {options.length === 0 ? (
                    <p className="text-xs text-gray-400 text-center py-4 border-2 border-dashed rounded-lg">
                      Add options below
                    </p>
                  ) : (
                    <div className="space-y-2 max-h-60 overflow-y-auto">
                      {options.map((opt, i) => (
                        <div key={i} className="flex items-center gap-2">
                          <Input
                            value={opt.label}
                            onChange={(e) => updateOptionLabel(i, e.target.value)}
                            className="flex-1 h-7 text-sm"
                          />
                          <button onClick={() => removeOption(i)} className="text-gray-400 hover:text-red-500 shrink-0">
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}

                  <div className="flex gap-2">
                    <Input
                      value={newOptionLabel}
                      onChange={(e) => setNewOptionLabel(e.target.value)}
                      placeholder="New option"
                      onKeyDown={(e) => e.key === 'Enter' && addOption()}
                      className="flex-1"
                    />
                    <Button size="sm" variant="outline" onClick={addOption}>
                      <Plus className="h-4 w-4" />
                    </Button>
                  </div>
                </>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsOpen(false)}>Cancel</Button>
            <Button loading={saving} onClick={handleSave}>
              {editList ? 'Save Changes' : 'Create List'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteId} onOpenChange={(o) => !o && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete option list?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. Forms using this list will fall back to their inline options.
            </AlertDialogDescription>
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
