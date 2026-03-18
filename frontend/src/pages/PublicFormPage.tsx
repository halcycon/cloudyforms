import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { CloudLightning, Lock } from 'lucide-react';
import { forms as formsApi } from '@/lib/api';
import type { Form } from '@/lib/types';
import { FormRenderer } from '@/components/FormRenderer/FormRenderer';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

type PageState = 'loading' | 'error' | 'code_required' | 'ready' | 'closed';

export default function PublicFormPage() {
  const { slug } = useParams<{ slug: string }>();
  const [form, setForm] = useState<Form | null>(null);
  const [state, setState] = useState<PageState>('loading');
  const [accessCode, setAccessCode] = useState('');
  const [codeError, setCodeError] = useState('');
  const [checkingCode, setCheckingCode] = useState(false);

  useEffect(() => {
    if (!slug) return;
    formsApi.getPublic(slug)
      .then((data) => {
        setForm(data);
        if (data.status === 'closed') {
          setState('closed');
        } else if (data.accessType === 'code') {
          setState('code_required');
        } else {
          setState('ready');
        }
      })
      .catch((err) => {
        if (err.response?.status === 404) {
          setState('error');
        } else {
          setState('error');
        }
      });
  }, [slug]);

  async function handleCodeSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form) return;
    setCheckingCode(true);
    setCodeError('');
    try {
      // If access code is embedded in form (from API), compare locally
      if (form.accessCode === accessCode) {
        setState('ready');
      } else {
        setCodeError('Incorrect access code. Please try again.');
      }
    } finally {
      setCheckingCode(false);
    }
  }

  if (state === 'loading') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="flex items-center gap-3 text-gray-500">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary-600 border-t-transparent" />
          Loading form...
        </div>
      </div>
    );
  }

  if (state === 'error') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
        <div className="text-center max-w-sm">
          <CloudLightning className="mx-auto h-12 w-12 text-gray-300 mb-4" />
          <h1 className="text-xl font-bold text-gray-900">Form Not Found</h1>
          <p className="text-gray-500 mt-2">
            This form doesn't exist or has been removed.
          </p>
        </div>
      </div>
    );
  }

  if (state === 'closed') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
        <div className="text-center max-w-sm">
          <div className="mx-auto h-12 w-12 rounded-full bg-gray-100 flex items-center justify-center mb-4 text-2xl">
            🔒
          </div>
          <h1 className="text-xl font-bold text-gray-900">Form Closed</h1>
          <p className="text-gray-500 mt-2">
            This form is no longer accepting responses.
          </p>
        </div>
      </div>
    );
  }

  if (state === 'code_required') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
        <div className="w-full max-w-sm">
          <div className="text-center mb-6">
            <div className="mx-auto h-12 w-12 rounded-full bg-primary-100 flex items-center justify-center mb-3">
              <Lock className="h-6 w-6 text-primary-600" />
            </div>
            <h1 className="text-xl font-bold text-gray-900">{form?.title}</h1>
            <p className="text-gray-500 mt-2">This form requires an access code</p>
          </div>

          <form onSubmit={handleCodeSubmit} className="bg-white rounded-xl border border-gray-200 shadow-sm p-6 space-y-4">
            <div className="space-y-1.5">
              <Label required>Access Code</Label>
              <Input
                value={accessCode}
                onChange={(e) => setAccessCode(e.target.value)}
                placeholder="Enter access code"
                error={codeError}
                autoFocus
              />
            </div>
            <Button type="submit" loading={checkingCode} className="w-full">
              Continue
            </Button>
          </form>
        </div>
      </div>
    );
  }

  if (state === 'ready' && form) {
    return <FormRenderer form={form} />;
  }

  return null;
}
