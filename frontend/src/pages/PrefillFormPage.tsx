import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Loader2, Link2, Mail, QrCode, Copy, Check } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import toast from 'react-hot-toast';
import { forms as formsApi, responses as responsesApi } from '@/lib/api';
import type { Form } from '@/lib/types';
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

export default function PrefillFormPage() {
  const { formId } = useParams<{ formId: string }>();
  const navigate = useNavigate();
  const [form, setForm] = useState<Form | null>(null);
  const [loading, setLoading] = useState(true);
  const [shareDialog, setShareDialog] = useState(false);
  const [draftToken, setDraftToken] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [emailTo, setEmailTo] = useState('');
  const [sendingEmail, setSendingEmail] = useState(false);

  useEffect(() => {
    if (!formId) return;
    formsApi.get(formId)
      .then(setForm)
      .catch(() => toast.error('Failed to load form'))
      .finally(() => setLoading(false));
  }, [formId]);

  const prefillUrl = draftToken
    ? `${window.location.origin}/fill/${draftToken}`
    : '';

  function handleCopy() {
    navigator.clipboard.writeText(prefillUrl);
    setCopied(true);
    toast.success('Link copied!');
    setTimeout(() => setCopied(false), 2000);
  }

  async function handleSendEmail() {
    if (!emailTo.trim()) return;
    setSendingEmail(true);
    try {
      // For now, create a mailto link (server-side email would require a new endpoint)
      const subject = encodeURIComponent(`Please complete: ${form?.title ?? 'Form'}`);
      const body = encodeURIComponent(
        `You have been asked to complete a form.\n\nPlease click the following link to fill in the form:\n${prefillUrl}\n\nThank you.`
      );
      window.open(`mailto:${emailTo}?subject=${subject}&body=${body}`, '_blank');
      toast.success('Email client opened');
    } finally {
      setSendingEmail(false);
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
      </div>
    );
  }

  if (!form) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-red-600">Form not found</p>
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
            Pre-fill Form — {form.title}
          </h1>
          <p className="text-xs text-gray-500">
            Fill in fields and create a link for a recipient to complete
          </p>
        </div>
      </div>

      <FormRenderer
        form={form}
        mode="prefill"
        onSubmitSuccess={(_responseId) => {
          // After prefill creation, fetch the draft token from the response
          if (_responseId) {
            responsesApi.get(_responseId).then((resp) => {
              if (resp.draftToken) {
                setDraftToken(resp.draftToken);
                setShareDialog(true);
              }
            }).catch(() => {
              toast.error('Pre-fill created but failed to get share link');
            });
          }
        }}
      />

      {/* Share Dialog */}
      <Dialog open={shareDialog} onOpenChange={setShareDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Link2 className="h-5 w-5" />
              Share Pre-filled Form
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-5">
            {/* URL */}
            <div className="space-y-2">
              <Label className="text-xs text-gray-500 uppercase tracking-wide">Share Link</Label>
              <div className="flex gap-2">
                <Input value={prefillUrl} readOnly className="text-sm font-mono" />
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
                <QRCodeSVG value={prefillUrl} size={180} level="M" />
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
                  placeholder="recipient@example.com"
                  value={emailTo}
                  onChange={(e) => setEmailTo(e.target.value)}
                />
                <Button
                  variant="outline"
                  loading={sendingEmail}
                  onClick={handleSendEmail}
                  disabled={!emailTo.trim()}
                >
                  Send
                </Button>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button
                variant="outline"
                onClick={() => {
                  setShareDialog(false);
                  navigate(`/forms/${formId}/responses`);
                }}
              >
                Done
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
