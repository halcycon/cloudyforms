import { useEffect, useState, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Download, Trash2, Search, ChevronDown, ChevronUp, Filter, FileText, Pencil, Link2, QrCode, Copy, Check, Mail, Share2, Briefcase } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import toast from 'react-hot-toast';
import { forms as formsApi, responses as responsesApi, exportData } from '@/lib/api';
import { downloadFile, formatDate, cn } from '@/lib/utils';
import type { Form, FormResponse } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

export default function ResponsesPage() {
  const { formId } = useParams<{ formId: string }>();
  const navigate = useNavigate();
  const [form, setForm] = useState<Form | null>(null);
  const [responsesList, setResponsesList] = useState<FormResponse[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [showSpam, setShowSpam] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [deletingSelected, setDeletingSelected] = useState(false);
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [shareResponseId, setShareResponseId] = useState<string | null>(null);
  const [shareCopied, setShareCopied] = useState(false);
  const [shareEmailTo, setShareEmailTo] = useState('');

  const LIMIT = 20;

  const load = useCallback(async () => {
    if (!formId) return;
    setLoading(true);
    try {
      const [formData, respData] = await Promise.all([
        formsApi.get(formId),
        responsesApi.list(formId, {
          page,
          limit: LIMIT,
          search: search || undefined,
          includeSpam: showSpam,
          startDate: startDate || undefined,
          endDate: endDate || undefined,
        }),
      ]);
      setForm(formData);
      setResponsesList(respData.responses);
      setTotal(respData.total);
    } catch {
      toast.error('Failed to load responses');
    } finally {
      setLoading(false);
    }
  }, [formId, page, search, showSpam, startDate, endDate]);

  useEffect(() => { load(); }, [load]);

  async function handleDeleteSelected() {
    if (selected.size === 0) return;
    setDeletingSelected(true);
    try {
      await responsesApi.bulkDelete(formId!, Array.from(selected));
      setResponsesList((prev) => prev.filter((r) => !selected.has(r.id)));
      setTotal((t) => t - selected.size);
      setSelected(new Set());
      toast.success(`${selected.size} responses deleted`);
    } catch {
      toast.error('Failed to delete responses');
    } finally {
      setDeletingSelected(false);
    }
  }

  async function handleExportCSV() {
    if (!formId) return;
    try {
      const csv = await exportData.formCSV(formId);
      downloadFile(csv, `${form?.slug ?? formId}-responses.csv`, 'text/csv');
    } catch {
      toast.error('Export failed');
    }
  }

  async function handleExportJSON() {
    if (!formId) return;
    try {
      const json = await exportData.formJSON(formId);
      downloadFile(json, `${form?.slug ?? formId}-responses.json`, 'application/json');
    } catch {
      toast.error('Export failed');
    }
  }

  async function handleDownloadPdf(responseId: string) {
    try {
      const blob = await exportData.responsePdf(responseId);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${form?.slug ?? formId}-response-${responseId}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast.success('PDF downloaded');
    } catch {
      toast.error('Failed to generate PDF');
    }
  }

  function toggleSelect(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleSelectAll() {
    if (selected.size === responsesList.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(responsesList.map((r) => r.id)));
    }
  }

  const expandedResponse = responsesList.find((r) => r.id === expandedId);

  const totalPages = Math.ceil(total / LIMIT);

  const hasOfficeUseFields = form?.fields.some((f) => f.officeUse) ?? false;

  function getShareUrl(responseId: string) {
    return `${window.location.origin}/forms/${formId}/responses/${responseId}/edit`;
  }

  function handleShareCopy() {
    if (!shareResponseId) return;
    navigator.clipboard.writeText(getShareUrl(shareResponseId));
    setShareCopied(true);
    toast.success('Link copied!');
    setTimeout(() => setShareCopied(false), 2000);
  }

  function handleShareEmail() {
    if (!shareEmailTo.trim() || !shareResponseId) return;
    const subject = encodeURIComponent(`Office approval needed: ${form?.title ?? 'Form'}`);
    const body = encodeURIComponent(
      `You have been asked to complete the office-use fields for a form response.\n\nPlease click the following link to review and complete:\n${getShareUrl(shareResponseId)}\n\nYou will need to log in to access this response.\n\nThank you.`
    );
    window.open(`mailto:${shareEmailTo}?subject=${subject}&body=${body}`, '_blank');
    toast.success('Email client opened');
  }

  return (
    <div className="p-4 sm:p-6 space-y-5">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate('/forms')}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="flex-1 min-w-0">
          <h1 className="text-xl font-bold text-gray-900 truncate">{form?.title ?? 'Loading...'} — Responses</h1>
          <p className="text-sm text-gray-500">{total} total responses</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => navigate(`/forms/${formId}/prefill`)}>
            <Link2 className="h-4 w-4" /> Pre-fill
          </Button>
          <Button variant="outline" size="sm" onClick={handleExportCSV}>
            <Download className="h-4 w-4" /> CSV
          </Button>
          <Button variant="outline" size="sm" onClick={handleExportJSON}>
            <Download className="h-4 w-4" /> JSON
          </Button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <Input
            placeholder="Search by email..."
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            className="pl-9"
          />
        </div>
        <Input
          type="date"
          value={startDate}
          onChange={(e) => { setStartDate(e.target.value); setPage(1); }}
          className="w-full sm:w-36"
          placeholder="Start date"
        />
        <Input
          type="date"
          value={endDate}
          onChange={(e) => { setEndDate(e.target.value); setPage(1); }}
          className="w-full sm:w-36"
          placeholder="End date"
        />
        <div className="flex items-center gap-2">
          <Switch checked={showSpam} onCheckedChange={(v) => { setShowSpam(v); setPage(1); }} />
          <Label className="text-sm whitespace-nowrap">Show Spam</Label>
        </div>
      </div>

      {/* Bulk actions */}
      {selected.size > 0 && (
        <div className="flex items-center gap-3 rounded-lg bg-primary-50 border border-primary-200 px-4 py-2">
          <span className="text-sm font-medium text-primary-700">{selected.size} selected</span>
          <Button
            size="sm"
            variant="destructive"
            loading={deletingSelected}
            onClick={handleDeleteSelected}
          >
            <Trash2 className="h-4 w-4" /> Delete
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())}>
            Clear
          </Button>
        </div>
      )}

      {/* Table */}
      <div className="rounded-lg border border-gray-200 overflow-hidden bg-white">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="w-10 px-4 py-3">
                  <Checkbox
                    checked={selected.size === responsesList.length && responsesList.length > 0}
                    onCheckedChange={toggleSelectAll}
                  />
                </th>
                <th className="px-4 py-3 text-left font-medium text-gray-600">Submitted</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600">Email</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600">Preview</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600">Workflow</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600">Status</th>
                <th className="w-20 px-4 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {loading ? (
                Array.from({ length: 5 }, (_, i) => (
                  <tr key={i}>
                    {Array.from({ length: 7 }, (_, j) => (
                      <td key={j} className="px-4 py-3">
                        <div className="h-4 bg-gray-200 animate-pulse rounded" />
                      </td>
                    ))}
                  </tr>
                ))
              ) : responsesList.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-12 text-center text-gray-400">
                    <Filter className="mx-auto h-8 w-8 mb-2" />
                    <p>No responses found</p>
                  </td>
                </tr>
              ) : (
                responsesList.map((resp) => {
                  const preview = Object.entries(resp.data)
                    .slice(0, 2)
                    .map(([, v]) => String(v))
                    .join(' · ');

                  return (
                    <tr
                      key={resp.id}
                      className={cn(
                        'hover:bg-gray-50 transition-colors',
                        selected.has(resp.id) && 'bg-primary-50',
                      )}
                    >
                      <td className="px-4 py-3">
                        <Checkbox
                          checked={selected.has(resp.id)}
                          onCheckedChange={() => toggleSelect(resp.id)}
                        />
                      </td>
                      <td className="px-4 py-3 text-gray-600 whitespace-nowrap">
                        {formatDate(resp.createdAt)}
                      </td>
                      <td className="px-4 py-3 text-gray-900">
                        {resp.submitterEmail ?? <span className="text-gray-400 italic">anonymous</span>}
                      </td>
                      <td className="px-4 py-3 text-gray-500 max-w-xs truncate">
                        {preview || '—'}
                      </td>
                      <td className="px-4 py-3">
                        {resp.status === 'draft' ? (
                          <Badge variant="outline" className="text-blue-600 border-blue-200 bg-blue-50">Draft</Badge>
                        ) : resp.status === 'completed' ? (
                          <Badge variant="outline" className="text-green-600 border-green-200 bg-green-50">Completed</Badge>
                        ) : (
                          <Badge variant="outline" className="text-amber-600 border-amber-200 bg-amber-50">Submitted</Badge>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {resp.isSpam ? <Badge variant="destructive">Spam</Badge> : <Badge variant="success">Ok</Badge>}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1">
                          {resp.status !== 'draft' && (
                            <button
                              onClick={() => navigate(`/forms/${formId}/responses/${resp.id}/edit`)}
                              className="text-gray-400 hover:text-primary-600 p-1"
                              title={hasOfficeUseFields ? 'Complete office-use fields' : 'Edit in form view'}
                            >
                              {hasOfficeUseFields ? <Briefcase className="h-4 w-4" /> : <Pencil className="h-4 w-4" />}
                            </button>
                          )}
                          {resp.status !== 'draft' && hasOfficeUseFields && (
                            <button
                              onClick={() => {
                                setShareResponseId(resp.id);
                                setShareCopied(false);
                                setShareEmailTo('');
                              }}
                              className="text-gray-400 hover:text-primary-600 p-1"
                              title="Share for office approval"
                            >
                              <Share2 className="h-4 w-4" />
                            </button>
                          )}
                          <button
                            onClick={() => setExpandedId(resp.id === expandedId ? null : resp.id)}
                            className="text-gray-400 hover:text-gray-600 p-1"
                          >
                            {expandedId === resp.id ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-gray-500">
            Page {page} of {totalPages} · {total} total
          </p>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={page <= 1}
              onClick={() => setPage((p) => p - 1)}
            >
              Previous
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={page >= totalPages}
              onClick={() => setPage((p) => p + 1)}
            >
              Next
            </Button>
          </div>
        </div>
      )}

      {/* Response detail modal */}
      <Dialog open={!!expandedResponse} onOpenChange={(o) => !o && setExpandedId(null)}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Response Details</DialogTitle>
          </DialogHeader>
          {expandedResponse && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div className="rounded-lg bg-gray-50 p-3">
                  <p className="text-xs text-gray-500 mb-0.5">Submitted</p>
                  <p className="font-medium">{formatDate(expandedResponse.createdAt)}</p>
                </div>
                <div className="rounded-lg bg-gray-50 p-3">
                  <p className="text-xs text-gray-500 mb-0.5">Email</p>
                  <p className="font-medium">{expandedResponse.submitterEmail ?? 'Anonymous'}</p>
                </div>
                <div className="rounded-lg bg-gray-50 p-3">
                  <p className="text-xs text-gray-500 mb-0.5">Fingerprint</p>
                  <p className="font-mono text-xs">{expandedResponse.metadata?.fingerprint?.slice(0, 16) ?? '—'}</p>
                </div>
                <div className="rounded-lg bg-gray-50 p-3">
                  <p className="text-xs text-gray-500 mb-0.5">Status</p>
                  {expandedResponse.isSpam ? <Badge variant="destructive">Spam</Badge> : <Badge variant="success">OK</Badge>}
                </div>
              </div>

              <div className="space-y-3">
                <h3 className="font-semibold text-gray-900">Field Responses</h3>
                {form?.fields
                  .filter((f) => !['heading', 'paragraph', 'divider'].includes(f.type))
                  .map((field) => {
                    const val = expandedResponse.data[field.id];
                    if (val === undefined || val === null || val === '') return null;
                    return (
                      <div key={field.id} className="border-b border-gray-100 pb-3 last:border-0">
                        <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">
                          {field.label}
                        </p>
                        <p className="text-sm text-gray-900">
                          {Array.isArray(val) ? val.join(', ') : String(val)}
                        </p>
                      </div>
                    );
                  })}
              </div>

              {/* Office-use field actions */}
              {expandedResponse.status !== 'draft' && hasOfficeUseFields && (
                <div className="pt-2 border-t border-gray-200 space-y-2">
                  <p className="text-xs text-amber-600 font-medium flex items-center gap-1">
                    <Briefcase className="h-3.5 w-3.5" />
                    This form has office-use fields
                  </p>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      className="flex-1"
                      onClick={() => {
                        setExpandedId(null);
                        navigate(`/forms/${formId}/responses/${expandedResponse.id}/edit`);
                      }}
                    >
                      <Briefcase className="h-4 w-4 mr-1.5" />
                      Complete Office Fields
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="flex-1"
                      onClick={() => {
                        setExpandedId(null);
                        setShareResponseId(expandedResponse.id);
                        setShareCopied(false);
                        setShareEmailTo('');
                      }}
                    >
                      <Share2 className="h-4 w-4 mr-1.5" />
                      Share for Approval
                    </Button>
                  </div>
                </div>
              )}

              {/* Edit button for non-office-use forms */}
              {expandedResponse.status !== 'draft' && !hasOfficeUseFields && (
                <div className="pt-2 border-t border-gray-200">
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full"
                    onClick={() => {
                      setExpandedId(null);
                      navigate(`/forms/${formId}/responses/${expandedResponse.id}/edit`);
                    }}
                  >
                    <Pencil className="h-4 w-4 mr-1.5" />
                    Edit Response
                  </Button>
                </div>
              )}

              {/* Download PDF button - shown when form has a document template */}
              {form?.documentTemplate?.enabled && (
                <div className="pt-2 border-t border-gray-200">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleDownloadPdf(expandedResponse.id)}
                    className="w-full"
                  >
                    <FileText className="h-4 w-4 mr-1.5" />
                    Download Filled PDF
                  </Button>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Share for Office Approval Dialog */}
      <Dialog open={!!shareResponseId} onOpenChange={(o) => { if (!o) setShareResponseId(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Share2 className="h-5 w-5" />
              Share for Office Approval
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-5">
            <p className="text-sm text-gray-600">
              Share this link with other editors or users so they can complete the office-use fields. They will need to be logged in.
            </p>

            {/* URL */}
            <div className="space-y-2">
              <Label className="text-xs text-gray-500 uppercase tracking-wide">Share Link</Label>
              <div className="flex gap-2">
                <Input value={shareResponseId ? getShareUrl(shareResponseId) : ''} readOnly className="text-sm font-mono" />
                <Button variant="outline" size="icon" onClick={handleShareCopy}>
                  {shareCopied ? <Check className="h-4 w-4 text-green-500" /> : <Copy className="h-4 w-4" />}
                </Button>
              </div>
            </div>

            {/* QR Code */}
            <div className="space-y-2">
              <Label className="text-xs text-gray-500 uppercase tracking-wide flex items-center gap-1">
                <QrCode className="h-3.5 w-3.5" /> QR Code
              </Label>
              <div className="flex justify-center p-4 bg-white border border-gray-200 rounded-lg">
                {shareResponseId && (
                  <QRCodeSVG value={getShareUrl(shareResponseId)} size={180} level="M" />
                )}
              </div>
            </div>

            {/* Email */}
            <div className="space-y-2">
              <Label className="text-xs text-gray-500 uppercase tracking-wide flex items-center gap-1">
                <Mail className="h-3.5 w-3.5" /> Send via Email
              </Label>
              <div className="flex gap-2">
                <Input
                  type="email"
                  placeholder="editor@example.com"
                  value={shareEmailTo}
                  onChange={(e) => setShareEmailTo(e.target.value)}
                />
                <Button
                  variant="outline"
                  onClick={handleShareEmail}
                  disabled={!shareEmailTo.trim()}
                >
                  Send
                </Button>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setShareResponseId(null)}>
                Done
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
