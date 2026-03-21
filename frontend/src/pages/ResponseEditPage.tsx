import { useEffect, useState, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Loader2, Share2, QrCode, Copy, Check, Mail } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import toast from 'react-hot-toast';
import { forms as formsApi, responses as responsesApi, orgs as orgsApi } from '@/lib/api';
import { useStore } from '@/lib/store';
import type { Form, FormResponse } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { FormRenderer } from '@/components/FormRenderer/FormRenderer';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

export default function ResponseEditPage() {
  const { formId, responseId } = useParams<{ formId: string; responseId: string }>();
  const navigate = useNavigate();
  const { user } = useStore();
  const [form, setForm] = useState<Form | null>(null);
  const [response, setResponse] = useState<FormResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [canEditAll, setCanEditAll] = useState(false);
  const [shareDialog, setShareDialog] = useState(false);
  const [copied, setCopied] = useState(false);
  const [emailTo, setEmailTo] = useState('');

  useEffect(() => {
    if (!formId || !responseId) return;
    setLoading(true);
    Promise.all([
      formsApi.get(formId),
      responsesApi.get(responseId),
    ])
      .then(async ([formData, respData]) => {
        setForm(formData);
        setResponse(respData);
        // Determine user's actual org role for ACL
        if (user?.isSuperAdmin) {
          setCanEditAll(true);
        } else if (user && formData.orgId) {
          try {
            const members = await orgsApi.listMembers(formData.orgId);
            const me = members.find((m) => m.userId === user.id);
            if (me && (me.role === 'owner' || me.role === 'admin')) {
              setCanEditAll(true);
            }
          } catch {
            // If we can't fetch members, fall back to editor-level (office-use only)
          }
        }
      })
      .catch(() => {
        setError('Failed to load form or response');
      })
      .finally(() => setLoading(false));
  }, [formId, responseId, user]);

  const shareUrl = `${window.location.origin}/forms/${formId}/responses/${responseId}/edit`;
  const hasOfficeUseFields = useMemo(() => form?.fields.some((f) => f.officeUse) ?? false, [form]);

  function handleCopy() {
    navigator.clipboard.writeText(shareUrl);
    setCopied(true);
    toast.success('Link copied!');
    setTimeout(() => setCopied(false), 2000);
  }

  function handleSendEmail() {
    if (!emailTo.trim()) return;
    const subject = encodeURIComponent(`Office approval needed: ${form?.title ?? 'Form'}`);
    const body = encodeURIComponent(
      `You have been asked to complete the office-use fields for a form response.\n\nPlease click the following link to review and complete:\n${shareUrl}\n\nYou will need to log in to access this response.\n\nThank you.`
    );
    window.open(`mailto:${emailTo}?subject=${subject}&body=${body}`, '_blank');
    toast.success('Email client opened');
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
      </div>
    );
  }

  if (error || !form || !response) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center space-y-3">
          <p className="text-red-600">{error ?? 'Response not found'}</p>
          <Button variant="outline" onClick={() => navigate(-1)}>
            <ArrowLeft className="h-4 w-4 mr-1" /> Go Back
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="relative">
      {/* Top bar */}
      <div className="sticky top-0 z-50 bg-white border-b border-gray-200 px-4 py-2 flex items-center gap-3">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => navigate(`/forms/${formId}/responses`)}
        >
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="flex-1 min-w-0">
          <h1 className="text-sm font-semibold text-gray-900 truncate">
            {hasOfficeUseFields ? 'Complete Office Fields' : 'Edit Response'} — {form.title}
          </h1>
          <p className="text-xs text-gray-500">
            Response from {response.submitterEmail ?? 'anonymous'} · {new Date(response.createdAt).toLocaleString()}
          </p>
        </div>
        {hasOfficeUseFields && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setShareDialog(true);
              setCopied(false);
              setEmailTo('');
            }}
          >
            <Share2 className="h-4 w-4" /> Share
          </Button>
        )}
      </div>

      <FormRenderer
        form={form}
        mode="edit"
        initialValues={response.data}
        responseId={responseId}
        canEditAllFields={canEditAll}
        onSubmitSuccess={() => {
          toast.success('Response saved');
          navigate(`/forms/${formId}/responses`);
        }}
      />

      {/* Share for Office Approval Dialog */}
      <Dialog open={shareDialog} onOpenChange={setShareDialog}>
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
                <Input value={shareUrl} readOnly className="text-sm font-mono" />
                <Button variant="outline" size="icon" onClick={handleCopy}>
                  {copied ? <Check className="h-4 w-4 text-green-500" /> : <Copy className="h-4 w-4" />}
                </Button>
              </div>
            </div>

            {/* QR Code */}
            <div className="space-y-2">
              <Label className="text-xs text-gray-500 uppercase tracking-wide flex items-center gap-1">
                <QrCode className="h-3.5 w-3.5" /> QR Code
              </Label>
              <div className="flex justify-center p-4 bg-white border border-gray-200 rounded-lg">
                <QRCodeSVG value={shareUrl} size={180} level="M" />
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
                  value={emailTo}
                  onChange={(e) => setEmailTo(e.target.value)}
                />
                <Button
                  variant="outline"
                  onClick={handleSendEmail}
                  disabled={!emailTo.trim()}
                >
                  Send
                </Button>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setShareDialog(false)}>
                Done
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
