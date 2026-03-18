import { useEffect, useState, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Search, MoreHorizontal, Pencil, Eye, Copy, Trash2, Share2, BarChart2, Download, Upload, Package } from 'lucide-react';
import toast from 'react-hot-toast';
import { forms as formsApi, exportData } from '@/lib/api';
import { useStore } from '@/lib/store';
import { cn, formatDateShort, downloadFile } from '@/lib/utils';
import type { Form } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
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
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

export default function FormsPage() {
  const navigate = useNavigate();
  const { currentOrg } = useStore();
  const [formsList, setFormsList] = useState<Form[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [sortBy, setSortBy] = useState<'updatedAt' | 'createdAt' | 'responseCount'>('updatedAt');
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [showImport, setShowImport] = useState(false);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importData, setImportData] = useState<Record<string, unknown> | null>(null);
  const [importIncludeResponses, setImportIncludeResponses] = useState(false);
  const [importing, setImporting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const loadForms = useCallback(async () => {
    setLoading(true);
    try {
      const data = await formsApi.list(currentOrg?.id);
      setFormsList(data);
    } catch {
      toast.error('Failed to load forms');
    } finally {
      setLoading(false);
    }
  }, [currentOrg?.id]);

  useEffect(() => { loadForms(); }, [loadForms]);

  async function handleDelete() {
    if (!deleteId) return;
    try {
      await formsApi.delete(deleteId);
      setFormsList((f) => f.filter((x) => x.id !== deleteId));
      toast.success('Form deleted');
    } catch {
      toast.error('Failed to delete form');
    } finally {
      setDeleteId(null);
    }
  }

  async function handleDuplicate(id: string) {
    try {
      const copy = await formsApi.duplicate(id);
      setFormsList((prev) => [copy, ...prev]);
      toast.success('Form duplicated');
    } catch {
      toast.error('Failed to duplicate form');
    }
  }

  async function handleExportConfig(id: string) {
    try {
      const json = await exportData.formConfig(id);
      const form = formsList.find((f) => f.id === id);
      downloadFile(json, `${form?.slug ?? id}-config.json`, 'application/json');
      toast.success('Form configuration exported');
    } catch {
      toast.error('Export failed');
    }
  }

  async function handleExportBundle(id: string) {
    try {
      const json = await exportData.formBundle(id);
      const form = formsList.find((f) => f.id === id);
      downloadFile(json, `${form?.slug ?? id}-bundle.json`, 'application/json');
      toast.success('Form bundle exported (config + responses)');
    } catch {
      toast.error('Export failed');
    }
  }

  async function handleImport() {
    if (!importData || !currentOrg?.id) return;
    setImporting(true);
    try {
      if (!importData._cloudyforms || !['form-config', 'form-bundle'].includes(importData._cloudyforms as string)) {
        toast.error('Invalid CloudyForms export file');
        return;
      }
      const hasResponses = importData._cloudyforms === 'form-bundle' &&
        Array.isArray(importData.responses) && (importData.responses as unknown[]).length > 0;
      const result = await exportData.importForm(
        currentOrg.id,
        importData,
        importIncludeResponses && hasResponses,
      );
      setFormsList((prev) => [result.form, ...prev]);
      toast.success(
        `Form "${result.title}" imported${result.importedResponses > 0 ? ` with ${result.importedResponses} responses` : ''}`,
      );
      setShowImport(false);
      setImportFile(null);
      setImportData(null);
      setImportIncludeResponses(false);
    } catch (err: unknown) {
      const error = err as { response?: { data?: { error?: string } } };
      toast.error(error.response?.data?.error ?? 'Import failed. Check the file format.');
    } finally {
      setImporting(false);
    }
  }

  function copyShareLink(slug: string) {
    navigator.clipboard.writeText(`${window.location.origin}/f/${slug}`);
    toast.success('Link copied!');
  }

  const filtered = formsList
    .filter((f) => f.title.toLowerCase().includes(search.toLowerCase()))
    .sort((a, b) => {
      if (sortBy === 'responseCount') return (b.responseCount ?? 0) - (a.responseCount ?? 0);
      return new Date(b[sortBy]).getTime() - new Date(a[sortBy]).getTime();
    });

  const statusColor = {
    published: 'success' as const,
    draft: 'secondary' as const,
    closed: 'destructive' as const,
  };

  return (
    <div className="p-4 sm:p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-3 justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Forms</h1>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setShowImport(true)}>
            <Upload className="h-4 w-4" />
            Import
          </Button>
          <Button onClick={() => navigate('/forms/new')}>
            <Plus className="h-4 w-4" />
            New Form
          </Button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <Input
            placeholder="Search forms..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select value={sortBy} onValueChange={(v) => setSortBy(v as typeof sortBy)}>
          <SelectTrigger className="w-full sm:w-44">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="updatedAt">Last Updated</SelectItem>
            <SelectItem value="createdAt">Date Created</SelectItem>
            <SelectItem value="responseCount">Response Count</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Forms list */}
      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-36 bg-gray-200 animate-pulse rounded-lg" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <div className="rounded-full bg-gray-100 p-6 mb-4">
            <BarChart2 className="h-10 w-10 text-gray-400" />
          </div>
          <h3 className="text-lg font-semibold text-gray-900">
            {search ? 'No matching forms' : 'No forms yet'}
          </h3>
          <p className="text-gray-500 mt-2 max-w-sm">
            {search
              ? `No forms match "${search}". Try a different search.`
              : 'Create your first form to start collecting responses.'}
          </p>
          {!search && (
            <Button className="mt-4" onClick={() => navigate('/forms/new')}>
              <Plus className="h-4 w-4" /> Create Form
            </Button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((form) => (
            <Card
              key={form.id}
              className={cn(
                'hover:shadow-md transition-shadow cursor-pointer group',
                form.status === 'closed' && 'opacity-60',
              )}
              onClick={() => navigate(`/forms/${form.id}/edit`)}
            >
              <CardContent className="pt-5 pb-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-gray-900 truncate">{form.title}</p>
                    {form.description && (
                      <p className="text-xs text-gray-500 mt-0.5 truncate">{form.description}</p>
                    )}
                  </div>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                      <button className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600 opacity-0 group-hover:opacity-100 transition-opacity">
                        <MoreHorizontal className="h-4 w-4" />
                      </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
                      <DropdownMenuItem onClick={() => navigate(`/forms/${form.id}/edit`)}>
                        <Pencil className="h-4 w-4" /> Edit
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => navigate(`/forms/${form.id}/responses`)}>
                        <Eye className="h-4 w-4" /> Responses
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => copyShareLink(form.slug)}>
                        <Share2 className="h-4 w-4" /> Copy Share Link
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => handleDuplicate(form.id)}>
                        <Copy className="h-4 w-4" /> Duplicate
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem onClick={() => handleExportConfig(form.id)}>
                        <Download className="h-4 w-4" /> Export Config
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => handleExportBundle(form.id)}>
                        <Package className="h-4 w-4" /> Export with Responses
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        onClick={() => setDeleteId(form.id)}
                        className="text-red-600 focus:text-red-600"
                      >
                        <Trash2 className="h-4 w-4" /> Delete
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>

                <div className="mt-3 flex items-center justify-between">
                  <div className="flex items-center gap-3 text-xs text-gray-400">
                    <span>{form.responseCount ?? 0} responses</span>
                    <span>·</span>
                    <span>{formatDateShort(form.updatedAt)}</span>
                  </div>
                  <Badge variant={statusColor[form.status]}>{form.status}</Badge>
                </div>

                <div className="mt-3 flex gap-1.5">
                  <button
                    className="flex-1 rounded-md bg-gray-100 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-200 transition-colors"
                    onClick={(e) => { e.stopPropagation(); navigate(`/forms/${form.id}/edit`); }}
                  >
                    Edit
                  </button>
                  <button
                    className="flex-1 rounded-md bg-primary-50 py-1.5 text-xs font-medium text-primary-700 hover:bg-primary-100 transition-colors"
                    onClick={(e) => { e.stopPropagation(); navigate(`/forms/${form.id}/responses`); }}
                  >
                    Responses
                  </button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Delete confirmation */}
      <AlertDialog open={!!deleteId} onOpenChange={(o) => !o && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete form?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete the form and all its responses. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={handleDelete}>
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Import dialog */}
      <Dialog open={showImport} onOpenChange={(o) => { if (!o) { setShowImport(false); setImportFile(null); setImportData(null); setImportIncludeResponses(false); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Import Form</DialogTitle>
            <DialogDescription>
              Import a form from a CloudyForms export file (.json). You can import form configuration only or include responses.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label>Export File</Label>
              <input
                ref={fileInputRef}
                type="file"
                accept=".json,application/json"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0] ?? null;
                  setImportFile(file);
                  setImportData(null);
                  if (file) {
                    file.text().then((text) => {
                      try {
                        const data = JSON.parse(text) as Record<string, unknown>;
                        setImportData(data);
                        if (data._cloudyforms === 'form-bundle' &&
                          Array.isArray(data.responses) && (data.responses as unknown[]).length > 0) {
                          setImportIncludeResponses(true);
                        }
                      } catch { /* ignore invalid JSON */ }
                    });
                  }
                }}
              />
              <div
                className={cn(
                  'border-2 border-dashed rounded-lg p-6 text-center cursor-pointer transition-colors',
                  importFile ? 'border-primary-300 bg-primary-50' : 'border-gray-300 hover:border-gray-400',
                )}
                onClick={() => fileInputRef.current?.click()}
              >
                {importFile ? (
                  <div>
                    <p className="text-sm font-medium text-gray-900">{importFile.name}</p>
                    <p className="text-xs text-gray-500 mt-1">
                      {(importFile.size / 1024).toFixed(1)} KB · Click to change
                    </p>
                  </div>
                ) : (
                  <div>
                    <Upload className="h-8 w-8 text-gray-400 mx-auto mb-2" />
                    <p className="text-sm text-gray-600">Click to select a .json export file</p>
                  </div>
                )}
              </div>
            </div>

            {importFile && (
              <div className="flex items-center justify-between">
                <div>
                  <Label className="text-sm">Include Responses</Label>
                  <p className="text-xs text-gray-500">Import submission data if the file contains responses</p>
                </div>
                <Switch
                  checked={importIncludeResponses}
                  onCheckedChange={setImportIncludeResponses}
                />
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setShowImport(false); setImportFile(null); setImportData(null); }}>
              Cancel
            </Button>
            <Button
              onClick={handleImport}
              disabled={!importData}
              loading={importing}
            >
              <Upload className="h-4 w-4" />
              Import Form
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
