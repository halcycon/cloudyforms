import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { responses as responsesApi } from '@/lib/api';
import type { Form } from '@/lib/types';
import { FormRenderer } from '@/components/FormRenderer/FormRenderer';

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

  return (
    <FormRenderer
      form={form}
      mode="public"
      initialValues={initialData}
      draftToken={token}
    />
  );
}
