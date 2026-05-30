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
import { resolveFormAppearance, getFormPrimaryColor } from '@/lib/formBranding';
import { FormFieldLayout } from '@/components/FormRenderer/FormFieldLayout';
import {
  expandFields,
  getRepeatableGroups,
  isEffectivelyOfficeUse,
  shouldShowField,
} from '@/components/FormRenderer/formFieldUtils';
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
  const [groupRowCounts, setGroupRowCounts] = useState<Record<string, number>>({});

  const forceTransparent = searchParams.get('bg') === 'transparent';
  const themeParam = searchParams.get('theme');

  // Initialise repeatable group row counts when form loads
  useEffect(() => {
    if (!form) return;
    const groups = getRepeatableGroups(form.fields);
    const initial: Record<string, number> = {};
    for (const [gid, def] of groups) {
      initial[gid] = def.minRepetitions;
    }
    setGroupRowCounts(initial);
  }, [form]);

  // Report iframe height to parent — re-run when content changes
  useEffect(() => {
    if (!slug || state !== 'ready') return;
    const el = containerRef.current;
    if (!el) return;

    const report = () => notifyParentResize(slug, el.scrollHeight);
    report();

    const observer = new ResizeObserver(report);
    observer.observe(el);
    observer.observe(document.body);

    return () => observer.disconnect();
  }, [slug, state, formData, groupRowCounts, form?.fields.length]);

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
    const surface = resolveFormAppearance(form.branding, themeParam);
    const primaryColor = getFormPrimaryColor(form.branding);
    const root = document.documentElement;
    if (primaryColor) {
      const hex = primaryColor.replace('#', '');
      const r = parseInt(hex.slice(0, 2), 16);
      const g = parseInt(hex.slice(2, 4), 16);
      const b = parseInt(hex.slice(4, 6), 16);
      root.style.setProperty('--primary', `${r} ${g} ${b}`);
    }
    if (!forceTransparent) {
      document.body.style.backgroundColor = surface.pageBackground;
    }
    root.style.setProperty('--foreground', surface.textColor);
  }, [form, forceTransparent, themeParam]);

  const surface = form ? resolveFormAppearance(form.branding, themeParam) : null;

  const bgClass = forceTransparent
    ? 'bg-transparent'
    : surface?.isDark
      ? 'text-white'
      : 'bg-white';

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
    const expanded = expandFields(form.fields, groupRowCounts);
    for (const field of expanded) {
      if (['heading', 'paragraph', 'divider', 'hidden', 'calculated'].includes(field.type)) continue;
      if (isEffectivelyOfficeUse(field, form.fields)) continue;
      if (!shouldShowField(field, formData, form.fields)) continue;
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

  function addGroupRow(groupId: string, max: number) {
    setGroupRowCounts((prev) => ({
      ...prev,
      [groupId]: Math.min((prev[groupId] ?? 1) + 1, max),
    }));
  }

  function removeGroupRow(groupId: string, min: number) {
    setGroupRowCounts((prev) => ({
      ...prev,
      [groupId]: Math.max((prev[groupId] ?? 1) - 1, min),
    }));
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
  if (!form || !surface) return null;

  const expandedFields = expandFields(form.fields, groupRowCounts);

  return (
    <div
      ref={containerRef}
      className={cn('p-4 sm:p-6', bgClass)}
      style={forceTransparent ? undefined : { backgroundColor: surface.pageBackground, color: surface.textColor }}
    >
      {/* Form header */}
      <div className="mb-6">
        {form.branding.logoUrl && (
          <img
            src={form.branding.logoUrl}
            alt="Logo"
            className="h-8 object-contain mb-4"
          />
        )}
        <h1 className="text-xl font-bold" style={{ color: surface.textColor }}>
          {form.title}
        </h1>
        {form.description && (
          <p className="mt-1 text-sm" style={{ color: surface.mutedTextColor }}>
            {form.description}
          </p>
        )}
      </div>

      <form
        onSubmit={handleSubmit}
        className="cf-form-surface space-y-4"
        data-theme={surface.isDark ? 'dark' : 'light'}
        style={{ color: surface.textColor }}
        noValidate
      >
        <FormFieldLayout
          allFields={form.fields}
          expandedFields={expandedFields}
          formValues={formData}
          errors={errors}
          onFieldChange={(id, value) => {
            setFormData((prev) => ({ ...prev, [id]: value }));
            if (errors[id]) {
              setErrors((prev) => {
                const next = { ...prev };
                delete next[id];
                return next;
              });
            }
          }}
          groupRowCounts={groupRowCounts}
          onAddGroupRow={addGroupRow}
          onRemoveGroupRow={removeGroupRow}
          includeField={(field) => !isEffectivelyOfficeUse(field, form.fields)}
        />

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
