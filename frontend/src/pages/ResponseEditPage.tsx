import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Loader2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { forms as formsApi, responses as responsesApi, orgs as orgsApi } from '@/lib/api';
import { useStore } from '@/lib/store';
import type { Form, FormResponse } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { FormRenderer } from '@/components/FormRenderer/FormRenderer';

export default function ResponseEditPage() {
  const { formId, responseId } = useParams<{ formId: string; responseId: string }>();
  const navigate = useNavigate();
  const { user } = useStore();
  const [form, setForm] = useState<Form | null>(null);
  const [response, setResponse] = useState<FormResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [canEditAll, setCanEditAll] = useState(false);

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
            Edit Response — {form.title}
          </h1>
          <p className="text-xs text-gray-500">
            Response from {response.submitterEmail ?? 'anonymous'} · {new Date(response.createdAt).toLocaleString()}
          </p>
        </div>
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
    </div>
  );
}
