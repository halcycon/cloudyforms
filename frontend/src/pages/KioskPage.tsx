import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { CloudLightning, ArrowLeft, FileText } from 'lucide-react';
import { kiosk as kioskApi } from '@/lib/api';
import type { Kiosk, Form } from '@/lib/types';
import { FormRenderer } from '@/components/FormRenderer/FormRenderer';
import { Button } from '@/components/ui/button';

type KioskWithForms = Kiosk & { forms: Form[] };

type KioskState = 'loading' | 'error' | 'selection' | 'form' | 'success';

export default function KioskPage() {
  const { token } = useParams<{ token: string }>();
  const navigate = useNavigate();
  const [kioskData, setKioskData] = useState<KioskWithForms | null>(null);
  const [state, setState] = useState<KioskState>('loading');
  const [selectedForm, setSelectedForm] = useState<Form | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!token) return;
    kioskApi.getByToken(token)
      .then((data) => {
        setKioskData(data);
        setState(data.forms.length === 1 ? 'form' : 'selection');
        if (data.forms.length === 1) setSelectedForm(data.forms[0]);
      })
      .catch(() => {
        setError('Kiosk not found or has been deactivated.');
        setState('error');
      });
  }, [token]);

  function selectForm(form: Form) {
    setSelectedForm(form);
    setState('form');
  }

  function handleSubmitSuccess() {
    setState('success');
    if (kioskData?.allowMultipleResponses) {
      setTimeout(() => {
        setSelectedForm(null);
        setState(kioskData.forms.length === 1 ? 'form' : 'selection');
      }, 3000);
    }
  }

  if (state === 'loading') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="flex items-center gap-3 text-gray-500">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary-600 border-t-transparent" />
          Loading kiosk...
        </div>
      </div>
    );
  }

  if (state === 'error') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
        <div className="text-center max-w-sm">
          <CloudLightning className="mx-auto h-12 w-12 text-gray-300 mb-4" />
          <h1 className="text-xl font-bold text-gray-900">Kiosk Not Found</h1>
          <p className="text-gray-500 mt-2">{error}</p>
          <Button className="mt-4" onClick={() => navigate('/')}>
            <ArrowLeft className="h-4 w-4" /> Go Home
          </Button>
        </div>
      </div>
    );
  }

  if (state === 'success') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="mx-auto h-16 w-16 rounded-full bg-green-100 flex items-center justify-center text-3xl mb-4">✓</div>
          <h2 className="text-2xl font-bold text-gray-900">Thank you!</h2>
          <p className="text-gray-500 mt-2">Your response has been recorded.</p>
          {kioskData?.allowMultipleResponses && (
            <p className="text-sm text-gray-400 mt-4">Returning to form selection in 3 seconds...</p>
          )}
          {!kioskData?.allowMultipleResponses && (
            <Button
              className="mt-4"
              onClick={() => { setState('selection'); setSelectedForm(null); }}
            >
              Submit Another
            </Button>
          )}
        </div>
      </div>
    );
  }

  if (state === 'selection' && kioskData) {
    return (
      <div className="min-h-screen bg-gray-50 flex flex-col">
        <div className="bg-white border-b border-gray-200 px-6 py-4 flex items-center gap-3">
          <CloudLightning className="h-6 w-6 text-primary-600" />
          <span className="font-bold text-lg text-gray-900">{kioskData.name}</span>
        </div>

        <div className="flex-1 flex flex-col items-center justify-center p-8">
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Choose a Form</h1>
          <p className="text-gray-500 mb-8">Select the form you'd like to fill out</p>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 w-full max-w-4xl">
            {kioskData.forms.map((form) => (
              <button
                key={form.id}
                onClick={() => selectForm(form)}
                className="flex flex-col items-center gap-4 rounded-xl border-2 border-gray-200 bg-white p-8 text-center hover:border-primary-400 hover:bg-primary-50 transition-all group"
              >
                <div className="rounded-full bg-primary-100 p-4 group-hover:bg-primary-200 transition-colors">
                  <FileText className="h-8 w-8 text-primary-600" />
                </div>
                <div>
                  <p className="font-semibold text-gray-900 text-lg">{form.title}</p>
                  {form.description && (
                    <p className="text-sm text-gray-500 mt-1">{form.description}</p>
                  )}
                </div>
              </button>
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (state === 'form' && selectedForm) {
    return (
      <div className="min-h-screen">
        {kioskData && kioskData.forms.length > 1 && (
          <div className="bg-white border-b border-gray-200 px-4 py-2 flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => { setSelectedForm(null); setState('selection'); }}
            >
              <ArrowLeft className="h-4 w-4" /> Back
            </Button>
            <span className="text-sm text-gray-500">{kioskData.name}</span>
          </div>
        )}
        <FormRenderer form={selectedForm} onSubmitSuccess={handleSubmitSuccess} />
      </div>
    );
  }

  return null;
}
