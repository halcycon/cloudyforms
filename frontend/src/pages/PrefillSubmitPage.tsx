import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Loader2, FileText } from 'lucide-react';
import toast from 'react-hot-toast';
import { responses as responsesApi, exportData } from '@/lib/api';
import type { Form } from '@/lib/types';
import { FormRenderer } from '@/components/FormRenderer/FormRenderer';
import { Button } from '@/components/ui/button';

export default function PrefillSubmitPage() {
  const { token } = useParams<{ token: string }>();
  const [form, setForm] = useState<Form | null>(null);
  const [initialData, setInitialData] = useState<Record<string, unknown>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;
    responsesApi.getDraft(token)
      .then(({ form: formData, data }) => {
        setForm(formData);
        setInitialData(data);
      })
      .catch(() => {
        setError('This form link is invalid or has already been submitted.');
      })
      .finally(() => setLoading(false));
  }, [token]);

  async function handlePreviewPdf() {
    if (!token) return;
    try {
      const blob = await exportData.draftPdf(token);
      const url = URL.createObjectURL(blob);
      window.open(url, '_blank');
      // Revoke after a short delay to allow the browser tab to load
      setTimeout(() => URL.revokeObjectURL(url), 10000);
    } catch {
      toast.error('Failed to generate PDF preview');
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
      </div>
    );
  }

  if (error || !form) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="max-w-md w-full text-center space-y-4 p-6">
          <div className="mx-auto h-16 w-16 rounded-full bg-red-50 flex items-center justify-center text-3xl">
            ✕
          </div>
          <h2 className="text-xl font-bold text-gray-900">Form Not Available</h2>
          <p className="text-gray-500">{error ?? 'Form not found'}</p>
        </div>
      </div>
    );
  }

  const hasDocumentTemplate = form.documentTemplate?.enabled;

  return (
    <>
      {hasDocumentTemplate && (
        <div className="mx-auto max-w-2xl px-4 pt-4">
          <Button
            variant="outline"
            size="sm"
            onClick={handlePreviewPdf}
            className="w-full"
          >
            <FileText className="h-4 w-4 mr-1.5" />
            Preview PDF
          </Button>
        </div>
      )}
      <FormRenderer
        form={form}
        mode="public"
        initialValues={initialData}
        draftToken={token}
      />
    </>
  );
}
