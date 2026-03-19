import { useState, useEffect, useCallback } from 'react';
import { z } from 'zod';
import toast from 'react-hot-toast';
import type { Form, FormField } from '@/lib/types';
import { responses } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { FormFieldRenderer } from './FormField';
import { TurnstileWidget } from './TurnstileWidget';
import { Plus, Minus } from 'lucide-react';

interface FormRendererProps {
  form: Form;
  onSubmitSuccess?: () => void;
}

/** Collect all distinct repeatable group definitions from the form fields. */
function getRepeatableGroups(fields: FormField[]): Map<string, { fields: FormField[]; maxRepetitions: number; minRepetitions: number }> {
  const groups = new Map<string, { fields: FormField[]; maxRepetitions: number; minRepetitions: number }>();
  for (const field of fields) {
    if (!field.repeatableGroup) continue;
    const gid = field.repeatableGroup.groupId;
    if (!groups.has(gid)) {
      groups.set(gid, {
        fields: [],
        maxRepetitions: field.repeatableGroup.maxRepetitions,
        minRepetitions: field.repeatableGroup.minRepetitions ?? 1,
      });
    }
    groups.get(gid)!.fields.push(field);
  }
  return groups;
}

/**
 * Expand form fields to include repeatable-group row instances.
 * Row 1 uses the original field IDs; rows 2+ use `{fieldId}_row_{n}`.
 * Only expand up to `visibleRows` for each group.
 */
function expandFields(
  fields: FormField[],
  groupRowCounts: Record<string, number>,
): FormField[] {
  const groups = getRepeatableGroups(fields);
  const processed = new Set<string>(); // group IDs already expanded
  const result: FormField[] = [];

  for (const field of fields) {
    if (!field.repeatableGroup) {
      result.push(field);
      continue;
    }

    const gid = field.repeatableGroup.groupId;
    if (processed.has(gid)) continue;
    if (!field.repeatableGroup.isGroupStart) {
      // Non-anchor field of a group – skip, will be handled by anchor
      continue;
    }

    processed.add(gid);
    const groupDef = groups.get(gid);
    if (!groupDef) { result.push(field); continue; }

    const rowCount = groupRowCounts[gid] ?? 1;
    for (let row = 1; row <= rowCount; row++) {
      for (const gField of groupDef.fields) {
        if (row === 1) {
          result.push(gField);
        } else {
          result.push({
            ...gField,
            id: `${gField.id}_row_${row}`,
            label: `${gField.label} (${row})`,
            // Only require the field if the original is required
            required: gField.required,
          });
        }
      }
    }
  }

  return result;
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
    if (['heading', 'paragraph', 'divider'].includes(field.type)) continue;

    // Don't validate fields hidden by conditional logic
    if (!shouldShowField(field, formValues)) continue;

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

  const bgColor = form.branding.backgroundColor ?? '#f9fafb';
  const primaryColor = form.branding.primaryColor ?? '#4f46e5';
  const textColor = form.branding.textColor ?? '#0f172a';

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

  const onSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (form.settings.enableTurnstile && !turnstileToken) {
        toast.error('Please complete the security check');
        return;
      }

      const schema = buildValidationSchema(form.fields, fieldValues, groupRowCounts);
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
    [form, turnstileToken, onSubmitSuccess, fieldValues, groupRowCounts],
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

  // Expand fields to include repeatable group rows
  const expandedFields = expandFields(form.fields, groupRowCounts);
  const groups = getRepeatableGroups(form.fields);
  // Track which group IDs have already rendered their "add more" button
  const renderedGroupButtons = new Set<string>();

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
          {expandedFields.map((field, idx) => {
            if (!shouldShowField(field, fieldValues)) return null;

            // Determine if this is the last field of a repeatable group row
            const baseId = field.id.replace(/_row_\d+$/, '');
            const origField = form.fields.find((f) => f.id === baseId);
            const groupId = origField?.repeatableGroup?.groupId;
            const groupDef = groupId ? groups.get(groupId) : undefined;

            // Check if next field belongs to a different group or row
            let showGroupControls = false;
            if (groupDef && groupId && !renderedGroupButtons.has(`${groupId}:${field.id}`)) {
              const lastFieldInGroup = groupDef.fields[groupDef.fields.length - 1];
              const rowMatch = field.id.match(/_row_(\d+)$/);
              const rowNum = rowMatch ? parseInt(rowMatch[1], 10) : 1;
              const currentRowCount = groupRowCounts[groupId] ?? 1;

              // Show controls after the last field of the last visible row
              if (baseId === lastFieldInGroup.id && rowNum === currentRowCount) {
                showGroupControls = true;
                renderedGroupButtons.add(`${groupId}:${field.id}`);
              }
            }

            const isNewGroupRow =
              !!groupDef &&
              field.id.includes('_row_') &&
              idx > 0 &&
              !!origField?.repeatableGroup?.isGroupStart &&
              baseId === groupDef.fields[0].id;

            return (
              <div key={field.id}>
                {/* Row separator for repeatable groups (rows 2+) */}
                {isNewGroupRow && (
                  <hr className="border-gray-200 mb-4" />
                )}
                <FormFieldRenderer
                  field={field}
                  value={fieldValues[field.id]}
                  onChange={(val) => setFieldValue(field.id, val)}
                  error={errors[field.id]}
                />
                {showGroupControls && groupId && groupDef && (
                  <div className="flex items-center gap-2 mt-3">
                    {(groupRowCounts[groupId] ?? 1) < groupDef.maxRepetitions && (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="text-xs"
                        onClick={() => addGroupRow(groupId, groupDef.maxRepetitions)}
                      >
                        <Plus className="h-3 w-3 mr-1" />
                        Add more
                      </Button>
                    )}
                    {(groupRowCounts[groupId] ?? 1) > groupDef.minRepetitions && (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="text-xs text-red-500 hover:text-red-600"
                        onClick={() => removeGroupRow(groupId, groupDef.minRepetitions)}
                      >
                        <Minus className="h-3 w-3 mr-1" />
                        Remove last
                      </Button>
                    )}
                    <span className="text-xs text-gray-400">
                      {groupRowCounts[groupId] ?? 1} / {groupDef.maxRepetitions}
                    </span>
                  </div>
                )}
              </div>
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
