/**
 * Minimal form page optimised for embedding inside iframes.
 *
 * Differences from PublicFormPage:
 *  - No navigation chrome (header / footer)
 *  - Transparent background so the host page shows through
 *  - Sends `postMessage` events to the parent window so the embed widget can
 *    auto-resize the iframe height.
 *
 * The route is `/embed/:slug`.
 *
 * Supported query params:
 *   ?theme=light|dark     – override colour scheme
 *   ?bg=transparent       – force transparent background
 */

import { useEffect, useState, useRef } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { Lock, AlertCircle } from 'lucide-react';
import { forms as formsApi, responses as responsesApi } from '@/lib/api';
import type { Form } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { FormFieldRenderer } from '@/components/FormRenderer/FormField';
import { TurnstileWidget } from '@/components/FormRenderer/TurnstileWidget';
import { cn } from '@/lib/utils';

type PageState = 'loading' | 'error' | 'code_required' | 'ready' | 'closed' | 'submitted';

/** Send a resize postMessage to the parent window. */
function notifyParentResize(slug: string, height: number) {
  try {
    window.parent.postMessage(
      { type: 'cloudyforms:resize', slug, height },
      '*'
    );
  } catch {
    // noop – may be in a same-origin context with no parent
  }
}

/** Notify the parent that the form was successfully submitted. */
function notifyParentSubmitted(slug: string, responseId: string) {
  try {
    window.parent.postMessage(
      { type: 'cloudyforms:submitted', slug, responseId },
      '*'
    );
  } catch {
    // noop
  }
}

export default function EmbedFormPage() {
  const { slug } = useParams<{ slug: string }>();
  const [searchParams] = useSearchParams();
  const containerRef = useRef<HTMLDivElement>(null);

  const [form, setForm] = useState<Form | null>(null);
  const [state, setState] = useState<PageState>('loading');
  const [accessCode, setAccessCode] = useState('');
  const [codeError, setCodeError] = useState('');
  const [checkingCode, setCheckingCode] = useState(false);
  const [formData, setFormData] = useState<Record<string, unknown>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [turnstileToken, setTurnstileToken] = useState<string | undefined>();
  const [submitting, setSubmitting] = useState(false);

  const forceTransparent = searchParams.get('bg') === 'transparent';
  const theme = searchParams.get('theme') ?? 'light';

  // Report height to parent whenever content changes
  useEffect(() => {
    if (!slug) return;
    const el = containerRef.current;
    if (!el) return;
    const observer = new ResizeObserver(() => {
      notifyParentResize(slug, el.scrollHeight);
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [slug]);

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
      .catch(() => setState('error'));
  }, [slug]);

  // Apply branding colours as CSS variables
  useEffect(() => {
    if (!form?.branding) return;
    const { primaryColor, backgroundColor, textColor } = form.branding;
    const root = document.documentElement;
    if (primaryColor) {
      // Convert hex to RGB for Tailwind CSS variable format
      const hex = primaryColor.replace('#', '');
      const r = parseInt(hex.slice(0, 2), 16);
      const g = parseInt(hex.slice(2, 4), 16);
      const b = parseInt(hex.slice(4, 6), 16);
      root.style.setProperty('--primary', `${r} ${g} ${b}`);
    }
    if (backgroundColor && !forceTransparent) {
      document.body.style.backgroundColor = backgroundColor;
    }
    if (textColor) {
      root.style.setProperty('--foreground', textColor);
    }
  }, [form, forceTransparent]);

  async function handleCodeSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form) return;
    setCheckingCode(true);
    setCodeError('');
    try {
      if (form.accessCode === accessCode) {
        setState('ready');
      } else {
        setCodeError('Incorrect access code. Please try again.');
      }
    } finally {
      setCheckingCode(false);
    }
  }

  function validateFields(): boolean {
    if (!form) return false;
    const newErrors: Record<string, string> = {};
    for (const field of form.fields) {
      if (['heading', 'paragraph', 'divider'].includes(field.type)) continue;
      if (field.required) {
        const value = formData[field.id];
        if (value === undefined || value === null || value === '') {
          newErrors[field.id] = `${field.label} is required`;
        }
      }
    }
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form || !slug) return;
    if (!validateFields()) return;
    if (form.settings.enableTurnstile && !turnstileToken) {
      setErrors((prev) => ({ ...prev, _turnstile: 'Please complete the security check' }));
      return;
    }
    setSubmitting(true);
    try {
      const result = await responsesApi.submit(slug, formData, turnstileToken);
      notifyParentSubmitted(slug, result.id);
      setState('submitted');
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error
        ?? 'Submission failed. Please try again.';
      setErrors((prev) => ({ ...prev, _submit: msg }));
    } finally {
      setSubmitting(false);
    }
  }

  const bgClass = forceTransparent
    ? 'bg-transparent'
    : theme === 'dark'
      ? 'bg-gray-900 text-white'
      : 'bg-white';

  // ── Loading ──────────────────────────────────────────────────────────────
  if (state === 'loading') {
    return (
      <div className={cn('min-h-[200px] flex items-center justify-center p-8', bgClass)}>
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary-600 border-t-transparent" />
      </div>
    );
  }

  // ── Error ────────────────────────────────────────────────────────────────
  if (state === 'error') {
    return (
      <div className={cn('flex items-center justify-center p-8 text-center', bgClass)}>
        <div>
          <AlertCircle className="mx-auto h-10 w-10 text-red-400 mb-3" />
          <p className="text-sm font-medium text-gray-700">Form not found or unavailable.</p>
        </div>
      </div>
    );
  }

  // ── Closed ───────────────────────────────────────────────────────────────
  if (state === 'closed') {
    return (
      <div className={cn('flex items-center justify-center p-8 text-center', bgClass)}>
        <div>
          <span className="text-3xl">🔒</span>
          <p className="mt-3 text-sm font-medium text-gray-700">This form is no longer accepting responses.</p>
        </div>
      </div>
    );
  }

  // ── Access code ──────────────────────────────────────────────────────────
  if (state === 'code_required') {
    return (
      <div ref={containerRef} className={cn('p-6 max-w-sm mx-auto', bgClass)}>
        <div className="text-center mb-4">
          <Lock className="mx-auto h-8 w-8 text-primary-600 mb-2" />
          <p className="text-sm font-medium text-gray-700">This form requires an access code.</p>
        </div>
        <form onSubmit={handleCodeSubmit} className="space-y-3">
          <div className="space-y-1">
            <Label required>Access Code</Label>
            <Input
              value={accessCode}
              onChange={(e) => setAccessCode(e.target.value)}
              placeholder="Enter code"
              error={codeError}
              autoFocus
            />
          </div>
          <Button type="submit" loading={checkingCode} className="w-full">Continue</Button>
        </form>
      </div>
    );
  }

  // ── Submitted ────────────────────────────────────────────────────────────
  if (state === 'submitted') {
    return (
      <div ref={containerRef} className={cn('flex items-center justify-center p-8 text-center', bgClass)}>
        <div>
          <div className="mx-auto mb-3 h-12 w-12 rounded-full bg-green-100 flex items-center justify-center">
            <svg className="h-6 w-6 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <p className="font-medium text-gray-900">
            {form?.settings.successMessage ?? 'Thank you for your submission!'}
          </p>
        </div>
      </div>
    );
  }

  // ── Ready – render form ───────────────────────────────────────────────────
  if (!form) return null;

  return (
    <div ref={containerRef} className={cn('p-4 sm:p-6', bgClass)}>
      {/* Form header */}
      <div className="mb-6">
        {form.branding.logoUrl && (
          <img
            src={form.branding.logoUrl}
            alt="Logo"
            className="h-8 object-contain mb-4"
          />
        )}
        <h1 className={cn('text-xl font-bold', theme === 'dark' ? 'text-white' : 'text-gray-900')}>
          {form.title}
        </h1>
        {form.description && (
          <p className={cn('mt-1 text-sm', theme === 'dark' ? 'text-gray-300' : 'text-gray-500')}>
            {form.description}
          </p>
        )}
      </div>

      <form onSubmit={handleSubmit} className="space-y-4" noValidate>
        {form.fields.map((field) => (
          <FormFieldRenderer
            key={field.id}
            field={field}
            value={formData[field.id]}
            error={errors[field.id]}
            onChange={(value) => {
              setFormData((prev) => ({ ...prev, [field.id]: value }));
              if (errors[field.id]) setErrors((prev) => {
                const next = { ...prev };
                delete next[field.id];
                return next;
              });
            }}
          />
        ))}

        {form.settings.enableTurnstile && (
          <TurnstileWidget
            onSuccess={setTurnstileToken}
          />
        )}

        {errors._turnstile && (
          <p className="text-sm text-red-600">{errors._turnstile}</p>
        )}
        {errors._submit && (
          <p className="text-sm text-red-600">{errors._submit}</p>
        )}

        <Button
          type="submit"
          loading={submitting}
          className="w-full"
          style={{ backgroundColor: form.branding.primaryColor ?? undefined }}
        >
          {form.settings.submitButtonText || 'Submit'}
        </Button>
      </form>

      {/* Minimal powered-by badge */}
      <p className="mt-4 text-center text-xs text-gray-400">
        Powered by{' '}
        <a
          href={window.location.origin}
          target="_blank"
          rel="noopener noreferrer"
          className="hover:underline"
        >
          CloudyForms
        </a>
      </p>
    </div>
  );
}
