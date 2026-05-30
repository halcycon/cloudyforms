import { useState, useEffect, useCallback } from 'react';
import { z } from 'zod';
import toast from 'react-hot-toast';
import type { Form, FormField } from '@/lib/types';
import { responses } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { TurnstileWidget } from './TurnstileWidget';
import { getFormSurfaceStyle, getFormPrimaryColor } from '@/lib/formBranding';
import { FormFieldLayout } from './FormFieldLayout';
import {
  expandFields,
  getRepeatableGroups,
  shouldShowField,
  isEffectivelyOfficeUse,
} from './formFieldUtils';

export type FormRendererMode = 'public' | 'edit' | 'prefill';

interface FormRendererProps {
  form: Form;
  onSubmitSuccess?: (responseId?: string) => void;
  /** Rendering mode: public (default), edit (office-use completion), prefill (editor pre-fills) */
  mode?: FormRendererMode;
  /** Pre-populated field values for edit/prefill modes */
  initialValues?: Record<string, unknown>;
  /** Response ID when editing an existing response */
  responseId?: string;
  /** Whether the current user can edit all fields (not just office-use). Governed by ACL. */
  canEditAllFields?: boolean;
  /** Custom submit button text override */
  submitLabel?: string;
  /** Draft token for pre-fill submission */
  draftToken?: string;
}

function buildValidationSchema(
  fields: FormField[],
  formValues: Record<string, unknown>,
  groupRowCounts: Record<string, number>,
) {
  const groups = getRepeatableGroups(fields);
  const shape: Record<string, z.ZodTypeAny> = {};

  // Build the expanded field list for validation
  const expanded = expandFields(fields, groupRowCounts);

  for (const field of expanded) {
    if (['heading', 'paragraph', 'divider', 'hidden', 'calculated'].includes(field.type)) continue;

    // Don't validate fields hidden by conditional logic
    if (!shouldShowField(field, formValues, fields)) continue;

    let schema: z.ZodTypeAny = z.unknown();

    if (field.type === 'email') {
      schema = z.string().email('Invalid email address');
    } else if (field.type === 'number') {
      let num = z.coerce.number();
      if (field.validation?.min !== undefined) num = num.min(field.validation.min);
      if (field.validation?.max !== undefined) num = num.max(field.validation.max);
      schema = num;
    } else if (field.type === 'checkbox' && field.options && field.options.length > 0) {
      schema = z.array(z.string());
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

    // For repeatable group rows beyond the minimum, required fields become optional
    const baseId = field.id.replace(/_row_\d+$/, '');
    const rowMatch = field.id.match(/_row_(\d+)$/);
    const rowNum = rowMatch ? parseInt(rowMatch[1], 10) : 1;

    // Find the group this field belongs to (if any)
    let isOptionalRow = false;
    for (const [, groupDef] of groups) {
      const inGroup = groupDef.fields.some((gf) => gf.id === baseId);
      if (inGroup) {
        // Required fields are only required for rows within minRepetitions
        if (rowNum > groupDef.minRepetitions) {
          isOptionalRow = true;
        }
        break;
      }
    }

    if (field.required && !isOptionalRow) {
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

/** Replace {{Label}} and {{static:Key}} placeholders in a formula with their values. */
function substituteFieldPlaceholders(
  formula: string,
  allFields: FormField[],
  formValues: Record<string, unknown>,
  staticValues?: { key: string; value: string }[],
): string {
  return formula.replace(/\{\{(.+?)\}\}/g, (_match, label: string) => {
    const trimmed = label.trim();

    // Handle {{static:Key}} placeholders for org-level static values
    const STATIC_PREFIX = 'static:';
    if (trimmed.toLowerCase().startsWith(STATIC_PREFIX)) {
      const staticKey = trimmed.slice(STATIC_PREFIX.length).trim();
      const sv = staticValues?.find(
        (s) => s.key.toLowerCase() === staticKey.toLowerCase(),
      );
      return sv?.value ?? '';
    }

    const lower = trimmed.toLowerCase();
    const field = allFields.find(
      (f) => f.label.toLowerCase() === lower || f.id === lower || (f.name && f.name.toLowerCase() === lower),
    );
    if (!field) return '';
    const val = formValues[field.id];
    return val != null ? String(val) : '';
  });
}

/** Evaluate a hidden field formula by replacing {{Label}} placeholders with field values. */
function evaluateFormula(
  formula: string,
  allFields: FormField[],
  formValues: Record<string, unknown>,
  staticValues?: { key: string; value: string }[],
): string {
  return substituteFieldPlaceholders(formula, allFields, formValues, staticValues);
}

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];
const DAY_NAMES = [
  'Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday',
];

/**
 * Safely evaluate an arithmetic expression containing only numbers and operators.
 * Supports: +, -, *, /, parentheses, decimal points.
 * Returns NaN if the expression is invalid or contains non-arithmetic content.
 */
function safeEvaluateArithmetic(expr: string): number {
  const trimmed = expr.trim();
  // Strict allowlist: only digits, whitespace, arithmetic operators, decimal points, and parentheses
  if (!/^[\d\s+\-*/.()]+$/.test(trimmed) || trimmed === '') return NaN;
  // Reject patterns that could be problematic (e.g. consecutive operators, empty parens)
  if (/[+\-*/]{2,}/.test(trimmed.replace(/\s/g, '').replace(/\*-/g, '*').replace(/\/-/g, '/').replace(/\+-/g, '+').replace(/--/g, '-'))) return NaN;

  // Tokenize and evaluate using a simple recursive descent parser
  let pos = 0;

  function skipWhitespace() {
    while (pos < trimmed.length && trimmed[pos] === ' ') pos++;
  }

  function parseNumber(): number {
    skipWhitespace();
    const start = pos;
    if (pos < trimmed.length && (trimmed[pos] === '+' || trimmed[pos] === '-')) pos++;
    while (pos < trimmed.length && (trimmed[pos] >= '0' && trimmed[pos] <= '9' || trimmed[pos] === '.')) pos++;
    if (pos === start) return NaN;
    return parseFloat(trimmed.slice(start, pos));
  }

  function parsePrimary(): number {
    skipWhitespace();
    if (pos < trimmed.length && trimmed[pos] === '(') {
      pos++; // skip '('
      const val = parseExpression();
      skipWhitespace();
      if (pos < trimmed.length && trimmed[pos] === ')') pos++; // skip ')'
      return val;
    }
    return parseNumber();
  }

  function parseTerm(): number {
    let left = parsePrimary();
    skipWhitespace();
    while (pos < trimmed.length && (trimmed[pos] === '*' || trimmed[pos] === '/')) {
      const op = trimmed[pos];
      pos++;
      const right = parsePrimary();
      left = op === '*' ? left * right : left / right;
      skipWhitespace();
    }
    return left;
  }

  function parseExpression(): number {
    let left = parseTerm();
    skipWhitespace();
    while (pos < trimmed.length && (trimmed[pos] === '+' || trimmed[pos] === '-')) {
      const op = trimmed[pos];
      pos++;
      const right = parseTerm();
      left = op === '+' ? left + right : left - right;
      skipWhitespace();
    }
    return left;
  }

  const result = parseExpression();
  skipWhitespace();
  // If we haven't consumed the entire string, the expression is malformed
  if (pos !== trimmed.length) return NaN;
  return result;
}

/**
 * Evaluate a calculated field formula. Supports:
 * - {{Field Label}} placeholders (replaced with field values)
 * - {{static:Key}} placeholders (replaced with org-level static values)
 * - Math operators: + - * / ( )
 * - Functions: round, floor, ceil, abs, min, max, upper, lower, month, year, day
 */
function evaluateCalculatedFormula(
  formula: string,
  allFields: FormField[],
  formValues: Record<string, unknown>,
  staticValues?: { key: string; value: string }[],
): string {
  // Step 1: Replace {{Label}} and {{static:Key}} placeholders with values
  const substituted = substituteFieldPlaceholders(formula, allFields, formValues, staticValues);

  // Step 2: Apply named functions from innermost to outermost.
  // The [^()]* pattern matches content without parentheses, so the regex naturally
  // matches the innermost function call first. The while loop repeats until all
  // nested function calls are resolved (e.g. round(abs(-5)) → round(5) → 5).
  let result = substituted;
  const funcPattern = /\b(round|floor|ceil|abs|min|max|upper|lower|month|year|day)\(([^()]*)\)/i;
  const MAX_ITERATIONS = 50; // Guard against pathological inputs
  let iterations = MAX_ITERATIONS;
  while (funcPattern.test(result) && iterations-- > 0) {
    result = result.replace(funcPattern, (_m, fn: string, args: string) => {
      const name = fn.toLowerCase();
      switch (name) {
        case 'round': { const n = parseFloat(args); return isNaN(n) ? '' : String(Math.round(n)); }
        case 'floor': { const n = parseFloat(args); return isNaN(n) ? '' : String(Math.floor(n)); }
        case 'ceil': { const n = parseFloat(args); return isNaN(n) ? '' : String(Math.ceil(n)); }
        case 'abs': { const n = parseFloat(args); return isNaN(n) ? '' : String(Math.abs(n)); }
        case 'min': {
          const parts = args.split(',').map((s) => parseFloat(s.trim()));
          return parts.some(isNaN) ? '' : String(Math.min(...parts));
        }
        case 'max': {
          const parts = args.split(',').map((s) => parseFloat(s.trim()));
          return parts.some(isNaN) ? '' : String(Math.max(...parts));
        }
        case 'upper': return args.toUpperCase();
        case 'lower': return args.toLowerCase();
        case 'month': {
          const d = new Date(args.trim());
          return isNaN(d.getTime()) ? '' : MONTH_NAMES[d.getMonth()];
        }
        case 'year': {
          const d = new Date(args.trim());
          return isNaN(d.getTime()) ? '' : String(d.getFullYear());
        }
        case 'day': {
          const d = new Date(args.trim());
          return isNaN(d.getTime()) ? '' : DAY_NAMES[d.getDay()];
        }
        default: return args;
      }
    });
  }

  // Step 3: Try to evaluate as an arithmetic expression using a safe parser
  const numResult = safeEvaluateArithmetic(result);
  if (!isNaN(numResult) && isFinite(numResult)) {
    return String(numResult);
  }

  return result;
}

export function FormRenderer({
  form,
  onSubmitSuccess,
  mode = 'public',
  initialValues,
  responseId,
  canEditAllFields = false,
  submitLabel,
  draftToken,
}: FormRendererProps) {
  const [submitted, setSubmitted] = useState(false);
  const [turnstileToken, setTurnstileToken] = useState<string | undefined>();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [fieldValues, setFieldValues] = useState<Record<string, unknown>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [groupRowCounts, setGroupRowCounts] = useState<Record<string, number>>({});

  // Initialize group row counts from form definition
  useEffect(() => {
    const groups = getRepeatableGroups(form.fields);
    const initial: Record<string, number> = {};
    for (const [gid, def] of groups) {
      initial[gid] = def.minRepetitions;
    }
    setGroupRowCounts(initial);
  }, [form.fields]);

  // Initialize default values from options with default: true and hidden field defaults
  useEffect(() => {
    const defaults: Record<string, unknown> = {};
    for (const f of form.fields) {
      if (f.options) {
        const defaultOpt = f.options.find((o) => o.default);
        if (defaultOpt) {
          if (f.type === 'multiselect' || (f.type === 'checkbox' && f.options && f.options.length > 0)) {
            defaults[f.id] = [defaultOpt.value];
          } else {
            defaults[f.id] = defaultOpt.value;
          }
        }
      }
      // Initialize hidden fields with defaultValue when there is no formula
      if (f.type === 'hidden' && f.defaultValue != null && !f.formula) {
        defaults[f.id] = f.defaultValue;
      }
      // Initialize read-only fields with defaultValue
      if (f.readOnly && f.defaultValue != null && f.type !== 'hidden' && f.type !== 'calculated') {
        defaults[f.id] = f.defaultValue;
      }
    }
    // In edit/prefill modes, merge in the initial values (overriding defaults)
    if (initialValues) {
      Object.assign(defaults, initialValues);
    }
    if (Object.keys(defaults).length > 0) {
      setFieldValues((prev) => ({ ...defaults, ...prev }));
    }
  }, [form.fields, initialValues]);

  // Recompute hidden and calculated formula field values whenever field values change
  useEffect(() => {
    const hiddenFormulaFields = form.fields.filter((f) => f.type === 'hidden' && f.formula);
    const calculatedFields = form.fields.filter((f) => f.type === 'calculated' && f.formula);
    if (hiddenFormulaFields.length === 0 && calculatedFields.length === 0) return;
    const updates: Record<string, unknown> = {};
    for (const f of hiddenFormulaFields) {
      updates[f.id] = evaluateFormula(f.formula!, form.fields, fieldValues, form.staticValues);
    }
    for (const f of calculatedFields) {
      updates[f.id] = evaluateCalculatedFormula(f.formula!, form.fields, fieldValues, form.staticValues);
    }
    // Only update if computed values actually changed to avoid infinite loops
    setFieldValues((prev) => {
      let changed = false;
      for (const [k, v] of Object.entries(updates)) {
        if (prev[k] !== v) { changed = true; break; }
      }
      return changed ? { ...prev, ...updates } : prev;
    });
  }, [form.fields, form.staticValues, fieldValues]);

  const surface = getFormSurfaceStyle(form.branding);
  const primaryColor = getFormPrimaryColor(form.branding);

  function setFieldValue(id: string, value: unknown) {
    setFieldValues((prev) => ({ ...prev, [id]: value }));
    setErrors((prev) => { const next = { ...prev }; delete next[id]; return next; });
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

  /** Check if a field inherits office-use status from its conditional group's start field */
  function isFieldOfficeUse(field: FormField): boolean {
    return isEffectivelyOfficeUse(field, form.fields);
  }

  /** Determine if a field should be editable based on mode and role */
  function isFieldEditable(field: FormField): boolean {
    // In public mode, all visible fields are editable (office-use fields are hidden)
    if (mode === 'public') return !field.readOnly;
    // In prefill mode, editor can edit non-office-use fields
    if (mode === 'prefill') return !isFieldOfficeUse(field) && !field.readOnly;
    // In edit mode, office-use fields are always editable.
    // Non-office-use fields are only editable if the user has permission.
    if (mode === 'edit') {
      if (isFieldOfficeUse(field)) return true;
      return canEditAllFields && !field.readOnly;
    }
    return !field.readOnly;
  }

  /** Filter fields based on mode — office-use fields are hidden in public mode */
  function shouldIncludeField(field: FormField): boolean {
    if (mode === 'public' && isFieldOfficeUse(field)) return false;
    // In prefill mode for the pre-fill editor, show all fields but office-use ones are disabled
    return true;
  }

  const onSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();

      // Turnstile only required for public submissions (not edit/prefill)
      if (mode === 'public' && form.settings.enableTurnstile && !turnstileToken) {
        toast.error('Please complete the security check');
        return;
      }

      // Filter fields for validation based on mode
      const fieldsToValidate = form.fields.filter((f) => shouldIncludeField(f));
      const schema = buildValidationSchema(fieldsToValidate, fieldValues, groupRowCounts);
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
        if (mode === 'edit' && responseId) {
          // Update existing response (office-use completion or amending)
          await responses.update(responseId, { data: fieldValues });
          toast.success('Response updated successfully');
          onSubmitSuccess?.(responseId);
        } else if (mode === 'prefill') {
          // Create a pre-fill draft
          const res = await responses.createPrefill(form.id, fieldValues);
          toast.success('Pre-fill created');
          onSubmitSuccess?.(res.id);
        } else if (draftToken) {
          // Submit a draft/pre-fill form
          await responses.submitDraft(draftToken, fieldValues, turnstileToken);
          setSubmitted(true);
          onSubmitSuccess?.();
          if (form.settings.redirectUrl) {
            window.location.href = form.settings.redirectUrl;
          }
        } else {
          // Standard public submission
          const res = await responses.submit(form.slug, fieldValues, turnstileToken);
          setSubmitted(true);
          onSubmitSuccess?.(res.id);
          if (form.settings.redirectUrl) {
            window.location.href = form.settings.redirectUrl;
          }
        }
      } catch (err: unknown) {
        const error = err as { response?: { data?: { error?: string } } };
        toast.error(error.response?.data?.error ?? 'Failed to submit form. Please try again.');
      } finally {
        setIsSubmitting(false);
      }
    },
    // shouldIncludeField uses mode and canEditAllFields which are stable across renders
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [form, turnstileToken, onSubmitSuccess, fieldValues, groupRowCounts, mode, responseId, draftToken, canEditAllFields],
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
        style={{ backgroundColor: surface.pageBackground }}
      >
        <div className="max-w-md w-full text-center space-y-4">
          <div
            className="mx-auto h-16 w-16 rounded-full flex items-center justify-center text-3xl"
            style={{ backgroundColor: `${primaryColor}20` }}
          >
            ✓
          </div>
          <h2 className="text-2xl font-bold" style={{ color: surface.textColor }}>
            {form.settings.successMessage || 'Thank you!'}
          </h2>
          <p style={{ color: surface.mutedTextColor }}>Your response has been recorded.</p>
        </div>
      </div>
    );
  }

  // Expand fields to include repeatable group rows
  const expandedFields = expandFields(form.fields, groupRowCounts);

  return (
    <div
      className="min-h-screen py-8 px-4"
      style={{ backgroundColor: surface.pageBackground, color: surface.textColor }}
    >
      <div className="max-w-2xl mx-auto">
        <div className="mb-8 text-center">
          {form.branding.logoUrl && (
            <img
              src={form.branding.logoUrl}
              alt="Logo"
              className="mx-auto mb-4 h-12 object-contain"
            />
          )}
          <h1 className="text-3xl font-bold" style={{ color: surface.textColor }}>{form.title}</h1>
          {form.description && (
            <p className="mt-2" style={{ color: surface.mutedTextColor }}>{form.description}</p>
          )}
        </div>

        <form
          onSubmit={onSubmit}
          className="cf-form-surface space-y-6 rounded-xl shadow-sm border p-6 sm:p-8"
          data-theme={surface.isDark ? 'dark' : 'light'}
          style={{
            backgroundColor: surface.cardBackground,
            color: surface.textColor,
            borderColor: surface.borderColor,
          }}
        >
          <FormFieldLayout
            allFields={form.fields}
            expandedFields={expandedFields}
            formValues={fieldValues}
            errors={errors}
            onFieldChange={setFieldValue}
            groupRowCounts={groupRowCounts}
            onAddGroupRow={addGroupRow}
            onRemoveGroupRow={removeGroupRow}
            includeField={shouldIncludeField}
            mapField={(field) => (isFieldEditable(field) ? field : { ...field, readOnly: true })}
          />

          {form.settings.enableTurnstile && mode === 'public' && !draftToken && (
            <TurnstileWidget
              onSuccess={setTurnstileToken}
              onError={() => setTurnstileToken(undefined)}
            />
          )}

          {/* Office-use indicator in edit mode */}
          {mode === 'edit' && (
            <div className="text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
              Office-use fields are editable. {canEditAllFields ? 'All other fields are also editable.' : 'Other fields are read-only.'}
            </div>
          )}

          <Button
            type="submit"
            loading={isSubmitting}
            className="w-full"
            style={{ backgroundColor: primaryColor }}
          >
            {submitLabel ?? (mode === 'edit' ? 'Save Changes' : mode === 'prefill' ? 'Create Pre-fill Link' : (form.settings.submitButtonText || 'Submit'))}
          </Button>
        </form>

        <p className="mt-4 text-center text-xs" style={{ color: surface.mutedTextColor }}>
          Powered by CloudyForms
        </p>
      </div>
    </div>
  );
}
