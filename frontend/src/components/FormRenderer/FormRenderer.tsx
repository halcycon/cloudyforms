import { useState, useEffect, useCallback } from 'react';
import { z } from 'zod';
import toast from 'react-hot-toast';
import type { Form, FormField } from '@/lib/types';
import { responses } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { FormFieldRenderer } from './FormField';
import { TurnstileWidget } from './TurnstileWidget';

interface FormRendererProps {
  form: Form;
  onSubmitSuccess?: () => void;
}

function buildValidationSchema(fields: FormField[]) {
  const shape: Record<string, z.ZodTypeAny> = {};
  for (const field of fields) {
    if (['heading', 'paragraph', 'divider'].includes(field.type)) continue;

    let schema: z.ZodTypeAny = z.unknown();

    if (field.type === 'email') {
      schema = z.string().email('Invalid email address');
    } else if (field.type === 'number') {
      let num = z.coerce.number();
      if (field.validation?.min !== undefined) num = num.min(field.validation.min);
      if (field.validation?.max !== undefined) num = num.max(field.validation.max);
      schema = num;
    } else if (field.type === 'checkbox') {
      schema = z.boolean();
    } else if (field.type === 'multiselect') {
      schema = z.array(z.string());
    } else if (field.type === 'rating' || field.type === 'scale') {
      schema = z.number().min(field.min ?? 1);
    } else if (field.type === 'file') {
      schema = z.unknown();
    } else {
      let str = z.string();
      if (field.validation?.minLength) str = str.min(field.validation.minLength);
      if (field.validation?.maxLength) str = str.max(field.validation.maxLength);
      schema = str;
    }

    if (field.required) {
      if (['text', 'textarea', 'email', 'phone'].includes(field.type)) {
        schema = field.type === 'email'
          ? z.string().email('Invalid email').min(1, `${field.label} is required`)
          : z.string().min(1, `${field.label} is required`);
      }
    } else {
      schema = schema.optional();
    }

    shape[field.id] = schema;
  }
  return z.object(shape);
}

function shouldShowField(field: FormField, formValues: Record<string, unknown>): boolean {
  if (!field.conditionalLogic) return true;
  const { action, conditions, logicType } = field.conditionalLogic;

  const results = conditions.map((cond) => {
    const fieldValue = String(formValues[cond.fieldId] ?? '');
    switch (cond.operator) {
      case 'equals': return fieldValue === cond.value;
      case 'not_equals': return fieldValue !== cond.value;
      case 'contains': return fieldValue.includes(cond.value);
      case 'not_contains': return !fieldValue.includes(cond.value);
      case 'greater_than': return parseFloat(fieldValue) > parseFloat(cond.value);
      case 'less_than': return parseFloat(fieldValue) < parseFloat(cond.value);
      default: return true;
    }
  });

  const conditionMet = logicType === 'all' ? results.every(Boolean) : results.some(Boolean);
  return action === 'show' ? conditionMet : !conditionMet;
}

export function FormRenderer({ form, onSubmitSuccess }: FormRendererProps) {
  const [submitted, setSubmitted] = useState(false);
  const [turnstileToken, setTurnstileToken] = useState<string | undefined>();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [fieldValues, setFieldValues] = useState<Record<string, unknown>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});

  const bgColor = form.branding.backgroundColor ?? '#f9fafb';
  const primaryColor = form.branding.primaryColor ?? '#4f46e5';
  const textColor = form.branding.textColor ?? '#0f172a';

  function setFieldValue(id: string, value: unknown) {
    setFieldValues((prev) => ({ ...prev, [id]: value }));
    setErrors((prev) => { const next = { ...prev }; delete next[id]; return next; });
  }

  const onSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (form.settings.enableTurnstile && !turnstileToken) {
        toast.error('Please complete the security check');
        return;
      }

      const schema = buildValidationSchema(form.fields);
      const result = schema.safeParse(fieldValues);
      if (!result.success) {
        const newErrors: Record<string, string> = {};
        result.error.errors.forEach((err) => {
          const key = err.path[0];
          if (key) newErrors[String(key)] = err.message;
        });
        setErrors(newErrors);
        toast.error('Please fix the errors below');
        return;
      }

      setIsSubmitting(true);
      try {
        await responses.submit(form.slug, fieldValues, turnstileToken);
        setSubmitted(true);
        onSubmitSuccess?.();
        if (form.settings.redirectUrl) {
          window.location.href = form.settings.redirectUrl;
        }
      } catch (err: unknown) {
        const error = err as { response?: { data?: { error?: string } } };
        toast.error(error.response?.data?.error ?? 'Failed to submit form. Please try again.');
      } finally {
        setIsSubmitting(false);
      }
    },
    [form, turnstileToken, onSubmitSuccess, fieldValues],
  );

  useEffect(() => {
    if (form.branding.fontFamily) {
      document.body.style.fontFamily = form.branding.fontFamily;
    }
    return () => { document.body.style.fontFamily = ''; };
  }, [form.branding.fontFamily]);

  if (submitted) {
    return (
      <div
        className="min-h-screen flex items-center justify-center p-4"
        style={{ backgroundColor: bgColor }}
      >
        <div className="max-w-md w-full text-center space-y-4">
          <div
            className="mx-auto h-16 w-16 rounded-full flex items-center justify-center text-3xl"
            style={{ backgroundColor: `${primaryColor}20` }}
          >
            ✓
          </div>
          <h2 className="text-2xl font-bold" style={{ color: textColor }}>
            {form.settings.successMessage || 'Thank you!'}
          </h2>
          <p className="text-gray-500">Your response has been recorded.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen py-8 px-4" style={{ backgroundColor: bgColor, color: textColor }}>
      <div className="max-w-2xl mx-auto">
        <div className="mb-8 text-center">
          {form.branding.logoUrl && (
            <img
              src={form.branding.logoUrl}
              alt="Logo"
              className="mx-auto mb-4 h-12 object-contain"
            />
          )}
          <h1 className="text-3xl font-bold" style={{ color: textColor }}>{form.title}</h1>
          {form.description && (
            <p className="mt-2 text-gray-600">{form.description}</p>
          )}
        </div>

        <form onSubmit={onSubmit} className="space-y-6 bg-white rounded-xl shadow-sm border border-gray-200 p-6 sm:p-8">
          {form.fields.map((field) => {
            if (!shouldShowField(field, fieldValues)) return null;
            return (
              <FormFieldRenderer
                key={field.id}
                field={field}
                value={fieldValues[field.id]}
                onChange={(val) => setFieldValue(field.id, val)}
                error={errors[field.id]}
              />
            );
          })}

          {form.settings.enableTurnstile && (
            <TurnstileWidget
              onSuccess={setTurnstileToken}
              onError={() => setTurnstileToken(undefined)}
            />
          )}

          <Button
            type="submit"
            loading={isSubmitting}
            className="w-full"
            style={{ backgroundColor: primaryColor }}
          >
            {form.settings.submitButtonText || 'Submit'}
          </Button>
        </form>

        <p className="mt-4 text-center text-xs text-gray-400">
          Powered by CloudyForms
        </p>
      </div>
    </div>
  );
}
