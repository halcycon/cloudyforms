import { useState, useEffect, useCallback } from 'react';
import { z } from 'zod';
import toast from 'react-hot-toast';
import type { Form, FormField } from '@/lib/types';
import { responses } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { FormFieldRenderer } from './FormField';
import { TurnstileWidget } from './TurnstileWidget';
import { Plus, Minus } from 'lucide-react';

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
    if (['heading', 'paragraph', 'divider', 'hidden'].includes(field.type)) continue;

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

function evaluateConditional(
  logic: NonNullable<FormField['conditionalLogic']>,
  formValues: Record<string, unknown>,
): boolean {
  const { action, conditions, logicType } = logic;

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

function shouldShowField(
  field: FormField,
  formValues: Record<string, unknown>,
  allFields: FormField[],
): boolean {
  // If the field belongs to a conditional group, apply the group-start field's
  // conditional logic to every member of the group.
  if (field.conditionalGroup) {
    const groupStart = allFields.find(
      (f) =>
        f.conditionalGroup?.groupId === field.conditionalGroup!.groupId &&
        f.conditionalGroup.isGroupStart,
    );
    if (groupStart?.conditionalLogic) {
      if (!evaluateConditional(groupStart.conditionalLogic, formValues)) return false;
    }
  }

  // Then apply the field's own conditional logic (if any).
  // For the group start field, skip — its conditional is already evaluated at
  // the group level above and would otherwise be applied twice.
  if (field.conditionalLogic && !field.conditionalGroup?.isGroupStart) {
    if (!evaluateConditional(field.conditionalLogic, formValues)) return false;
  }

  return true;
}

/** Evaluate a hidden field formula by replacing {{Label}} placeholders with field values. */
function evaluateFormula(
  formula: string,
  allFields: FormField[],
  formValues: Record<string, unknown>,
): string {
  return formula.replace(/\{\{(.+?)\}\}/g, (_match, label: string) => {
    const trimmed = label.trim().toLowerCase();
    const field = allFields.find(
      (f) => f.label.toLowerCase() === trimmed || f.id === trimmed || (f.name && f.name.toLowerCase() === trimmed),
    );
    if (!field) return '';
    const val = formValues[field.id];
    return val != null ? String(val) : '';
  });
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
      if (f.readOnly && f.defaultValue != null && f.type !== 'hidden') {
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

  // Recompute hidden formula field values whenever field values change
  useEffect(() => {
    const formulaFields = form.fields.filter((f) => f.type === 'hidden' && f.formula);
    if (formulaFields.length === 0) return;
    const updates: Record<string, unknown> = {};
    for (const f of formulaFields) {
      updates[f.id] = evaluateFormula(f.formula!, form.fields, fieldValues);
    }
    // Only update if computed values actually changed to avoid infinite loops
    setFieldValues((prev) => {
      let changed = false;
      for (const [k, v] of Object.entries(updates)) {
        if (prev[k] !== v) { changed = true; break; }
      }
      return changed ? { ...prev, ...updates } : prev;
    });
  }, [form.fields, fieldValues]);

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

  /** Check if a field inherits office-use status from its conditional group's start field */
  function isEffectivelyOfficeUse(field: FormField): boolean {
    if (field.officeUse) return true;
    if (field.conditionalGroup) {
      const groupStart = form.fields.find(
        (f) =>
          f.conditionalGroup?.groupId === field.conditionalGroup!.groupId &&
          f.conditionalGroup.isGroupStart,
      );
      if (groupStart?.officeUse) return true;
    }
    return false;
  }

  /** Determine if a field should be editable based on mode and role */
  function isFieldEditable(field: FormField): boolean {
    // In public mode, all visible fields are editable (office-use fields are hidden)
    if (mode === 'public') return !field.readOnly;
    // In prefill mode, editor can edit non-office-use fields
    if (mode === 'prefill') return !isEffectivelyOfficeUse(field) && !field.readOnly;
    // In edit mode, office-use fields are always editable.
    // Non-office-use fields are only editable if the user has permission.
    if (mode === 'edit') {
      if (isEffectivelyOfficeUse(field)) return true;
      return canEditAllFields && !field.readOnly;
    }
    return !field.readOnly;
  }

  /** Filter fields based on mode — office-use fields are hidden in public mode */
  function shouldIncludeField(field: FormField): boolean {
    if (mode === 'public' && isEffectivelyOfficeUse(field)) return false;
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
          {(() => {
            // Group visible fields into layout rows based on width
            const visibleFields = expandedFields.filter((f) =>
              shouldIncludeField(f) && shouldShowField(f, fieldValues, form.fields)
            );
            const layoutRows: FormField[][] = [];
            let currentRow: FormField[] = [];
            let rowWidth = 0;

            for (const field of visibleFields) {
              const w = field.width ?? 100;
              if (currentRow.length > 0 && rowWidth + w > 100) {
                layoutRows.push(currentRow);
                currentRow = [field];
                rowWidth = w;
              } else {
                currentRow.push(field);
                rowWidth += w;
              }
            }
            if (currentRow.length > 0) layoutRows.push(currentRow);

            return layoutRows.map((row) => {
              const isMultiCol = row.length > 1 || (row[0]?.width ?? 100) < 100;
              // When multiple fields are on the same row and some have descriptions,
              // reserve description space on all fields so inputs align horizontally
              const rowHasDescription = isMultiCol && row.some((f) =>
                f.description && !['heading', 'paragraph', 'divider'].includes(f.type)
              );
              return (
                <div key={row.map((f) => f.id).join('+')} className={isMultiCol ? 'flex flex-wrap gap-x-4 gap-y-6' : undefined}>
                  {row.map((field) => {
                    const idx = expandedFields.indexOf(field);
                    const baseId = field.id.replace(/_row_\d+$/, '');
                    const origField = form.fields.find((f) => f.id === baseId);
                    const groupId = origField?.repeatableGroup?.groupId;
                    const groupDef = groupId ? groups.get(groupId) : undefined;

                    let showGroupControls = false;
                    if (groupDef && groupId && !renderedGroupButtons.has(`${groupId}:${field.id}`)) {
                      const lastFieldInGroup = groupDef.fields[groupDef.fields.length - 1];
                      const rowMatch = field.id.match(/_row_(\d+)$/);
                      const rowNum = rowMatch ? parseInt(rowMatch[1], 10) : 1;
                      const currentRowCount = groupRowCounts[groupId] ?? 1;
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

                    const fieldWidth = field.width ?? 100;
                    // Account for flex gap (gap-x-4 = 1rem) to prevent row overflow
                    const gapRem = (row.length - 1) * 1;
                    const widthStyle = isMultiCol
                      ? { width: `calc(${fieldWidth}% - ${(fieldWidth / 100) * gapRem}rem)`, minWidth: 0 }
                      : undefined;

                    return (
                      <div key={field.id} style={widthStyle}>
                        {isNewGroupRow && (
                          <hr className="border-gray-200 mb-4" />
                        )}
                        <FormFieldRenderer
                          field={isFieldEditable(field) ? field : { ...field, readOnly: true }}
                          value={fieldValues[field.id]}
                          onChange={(val) => setFieldValue(field.id, val)}
                          error={errors[field.id]}
                          reserveDescriptionSpace={rowHasDescription}
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
                </div>
              );
            });
          })()}

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

        <p className="mt-4 text-center text-xs text-gray-400">
          Powered by CloudyForms
        </p>
      </div>
    </div>
  );
}
