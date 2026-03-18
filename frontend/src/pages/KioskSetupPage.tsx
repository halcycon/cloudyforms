import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Monitor, Trash2, Pencil, Copy, ExternalLink } from 'lucide-react';
import toast from 'react-hot-toast';
import { kiosk as kioskApi, forms as formsApi } from '@/lib/api';
import { useStore } from '@/lib/store';
import type { Kiosk, Form } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
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

export default function KioskSetupPage() {
  const navigate = useNavigate();
  const { currentOrg } = useStore();
  const [kiosks, setKiosks] = useState<Kiosk[]>([]);
  const [availableForms, setAvailableForms] = useState<Form[]>([]);
  const [loading, setLoading] = useState(true);
  const [isOpen, setIsOpen] = useState(false);
  const [editKiosk, setEditKiosk] = useState<Kiosk | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [showToken, setShowToken] = useState<Kiosk | null>(null);

  const [kioskName, setKioskName] = useState('');
  const [selectedForms, setSelectedForms] = useState<string[]>([]);
  const [allowMultiple, setAllowMultiple] = useState(true);

  useEffect(() => {
    if (!currentOrg) return;
    Promise.all([
      kioskApi.list(currentOrg.id),
      formsApi.list(currentOrg.id),
    ])
      .then(([kioskData, formsData]) => {
        setKiosks(kioskData);
        setAvailableForms(formsData.filter((f) => f.status === 'published'));
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [currentOrg]);

  function openCreate() {
    setEditKiosk(null);
    setKioskName('');
    setSelectedForms([]);
    setAllowMultiple(true);
    setIsOpen(true);
  }

  function openEdit(k: Kiosk) {
    setEditKiosk(k);
    setKioskName(k.name);
    setSelectedForms(k.formIds);
    setAllowMultiple(k.allowMultipleResponses);
    setIsOpen(true);
  }

  function toggleForm(formId: string) {
    setSelectedForms((prev) =>
      prev.includes(formId) ? prev.filter((id) => id !== formId) : [...prev, formId],
    );
  }

  async function handleSave() {
    if (!currentOrg) return;
    if (!kioskName.trim()) { toast.error('Name is required'); return; }
    setSaving(true);
    try {
      if (editKiosk) {
        const updated = await kioskApi.update(editKiosk.id, {
          name: kioskName,
          formIds: selectedForms,
          allowMultipleResponses: allowMultiple,
        });
        setKiosks((prev) => prev.map((k) => k.id === editKiosk.id ? updated : k));
        toast.success('Kiosk updated');
      } else {
        const created = await kioskApi.create({
          orgId: currentOrg.id,
          name: kioskName,
          formIds: selectedForms,
          allowMultipleResponses: allowMultiple,
        });
        setKiosks((prev) => [created, ...prev]);
        setShowToken(created);
        toast.success('Kiosk created!');
      }
      setIsOpen(false);
    } catch {
      toast.error('Failed to save kiosk');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!deleteId) return;
    try {
      await kioskApi.delete(deleteId);
      setKiosks((prev) => prev.filter((k) => k.id !== deleteId));
      toast.success('Kiosk deleted');
    } catch {
      toast.error('Failed to delete kiosk');
    } finally {
      setDeleteId(null);
    }
  }

  if (!currentOrg) {
    return (
      <div className="p-6 text-center text-gray-500">
        <p>Select an organization to manage kiosks.</p>
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Kiosk Setup</h1>
          <p className="text-sm text-gray-500 mt-1">Create kiosks for public-facing form stations</p>
        </div>
        <Button onClick={openCreate}>
          <Plus className="h-4 w-4" /> New Kiosk
        </Button>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {[1, 2].map((i) => <div key={i} className="h-32 bg-gray-200 animate-pulse rounded-lg" />)}
        </div>
      ) : kiosks.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <div className="rounded-full bg-gray-100 p-6 mb-4">
            <Monitor className="h-10 w-10 text-gray-400" />
          </div>
          <h3 className="text-lg font-semibold text-gray-900">No kiosks yet</h3>
          <p className="text-gray-500 mt-2 max-w-sm">
            Set up a kiosk to let people submit forms from a shared device.
          </p>
          <Button className="mt-4" onClick={openCreate}>
            <Plus className="h-4 w-4" /> Create Kiosk
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {kiosks.map((k) => (
            <Card key={k.id} className="hover:shadow-md transition-shadow">
              <CardContent className="pt-5">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-gray-900">{k.name}</p>
                    <p className="text-xs text-gray-400 mt-0.5">{k.formIds.length} forms</p>
                  </div>
                  <div className="flex gap-1">
                    <button onClick={() => setShowToken(k)} className="p-1 rounded text-gray-400 hover:text-primary-600 hover:bg-primary-50" title="View token">
                      <Copy className="h-4 w-4" />
                    </button>
                    <button onClick={() => openEdit(k)} className="p-1 rounded text-gray-400 hover:text-gray-600 hover:bg-gray-100">
                      <Pencil className="h-4 w-4" />
                    </button>
                    <button onClick={() => setDeleteId(k.id)} className="p-1 rounded text-gray-400 hover:text-red-500 hover:bg-red-50">
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
                <div className="mt-3 flex items-center justify-between">
                  <Badge variant={k.allowMultipleResponses ? 'success' : 'secondary'} className="text-xs">
                    {k.allowMultipleResponses ? 'Multi-response' : 'Single response'}
                  </Badge>
                  <button
                    onClick={() => navigate(`/kiosk/${k.token}`)}
                    className="text-xs text-primary-600 hover:underline flex items-center gap-1"
                  >
                    Open <ExternalLink className="h-3 w-3" />
                  </button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Create/Edit Dialog */}
      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editKiosk ? 'Edit Kiosk' : 'Create Kiosk'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label required>Kiosk Name</Label>
              <Input value={kioskName} onChange={(e) => setKioskName(e.target.value)} placeholder="Reception Kiosk" />
            </div>

            <div className="space-y-2">
              <Label>Forms to Include</Label>
              {availableForms.length === 0 ? (
                <p className="text-xs text-gray-400">No published forms available</p>
              ) : (
                <div className="space-y-2 max-h-40 overflow-y-auto border border-gray-200 rounded-md p-2">
                  {availableForms.map((form) => (
                    <label key={form.id} className="flex items-center gap-2 cursor-pointer">
                      <Checkbox
                        checked={selectedForms.includes(form.id)}
                        onCheckedChange={() => toggleForm(form.id)}
                      />
                      <span className="text-sm text-gray-700">{form.title}</span>
                    </label>
                  ))}
                </div>
              )}
            </div>

            <div className="flex items-center justify-between">
              <div>
                <Label>Allow Multiple Responses</Label>
                <p className="text-xs text-gray-400 mt-0.5">User can submit again without resetting</p>
              </div>
              <Switch checked={allowMultiple} onCheckedChange={setAllowMultiple} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsOpen(false)}>Cancel</Button>
            <Button loading={saving} onClick={handleSave}>
              {editKiosk ? 'Save Changes' : 'Create Kiosk'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Token Dialog */}
      <Dialog open={!!showToken} onOpenChange={(o) => !o && setShowToken(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Kiosk Token</DialogTitle>
          </DialogHeader>
          {showToken && (
            <div className="space-y-4">
              <p className="text-sm text-gray-600">
                Use this token to access the kiosk page. Keep it secret.
              </p>
              <div className="flex items-center gap-2">
                <Input value={showToken.token} readOnly className="font-mono text-sm" />
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    navigator.clipboard.writeText(showToken.token);
                    toast.success('Token copied!');
                  }}
                >
                  <Copy className="h-4 w-4" />
                </Button>
              </div>
              <div className="rounded-lg bg-gray-50 p-3">
                <p className="text-xs text-gray-500 mb-1">Kiosk URL:</p>
                <p className="text-xs font-mono text-primary-600 break-all">
                  {window.location.origin}/kiosk/{showToken.token}
                </p>
              </div>
              <Button
                className="w-full"
                onClick={() => { navigate(`/kiosk/${showToken.token}`); setShowToken(null); }}
              >
                Open Kiosk <ExternalLink className="h-4 w-4" />
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteId} onOpenChange={(o) => !o && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete kiosk?</AlertDialogTitle>
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
