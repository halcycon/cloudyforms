import type { FormField } from '@/lib/types';

/** Collect all distinct repeatable group definitions from the form fields. */
export function getRepeatableGroups(
  fields: FormField[],
): Map<string, { fields: FormField[]; maxRepetitions: number; minRepetitions: number }> {
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

/** Expand repeatable groups into row instances ({id}_row_{n}). */
export function expandFields(
  fields: FormField[],
  groupRowCounts: Record<string, number>,
): FormField[] {
  const groups = getRepeatableGroups(fields);
  const processed = new Set<string>();
  const result: FormField[] = [];

  for (const field of fields) {
    if (!field.repeatableGroup) {
      result.push(field);
      continue;
    }

    const gid = field.repeatableGroup.groupId;
    if (processed.has(gid)) continue;
    if (!field.repeatableGroup.isGroupStart) continue;

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
            required: gField.required,
          });
        }
      }
    }
  }

  return result;
}

export function evaluateConditional(
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

export function shouldShowField(
  field: FormField,
  formValues: Record<string, unknown>,
  allFields: FormField[],
): boolean {
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

  if (field.conditionalLogic && !field.conditionalGroup?.isGroupStart) {
    if (!evaluateConditional(field.conditionalLogic, formValues)) return false;
  }

  return true;
}

/** Group visible fields into layout rows based on field.width (percent, sums to 100 per row). */
export function buildLayoutRows(fields: FormField[]): FormField[][] {
  const layoutRows: FormField[][] = [];
  let currentRow: FormField[] = [];
  let rowWidth = 0;

  for (const field of fields) {
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
  return layoutRows;
}

/** True when field is marked office-use (or in an office-use conditional group). */
export function isEffectivelyOfficeUse(field: FormField, allFields: FormField[]): boolean {
  if (field.officeUse) return true;
  if (field.conditionalGroup) {
    const groupStart = allFields.find(
      (f) =>
        f.conditionalGroup?.groupId === field.conditionalGroup!.groupId &&
        f.conditionalGroup.isGroupStart,
    );
    if (groupStart?.officeUse) return true;
  }
  return false;
}
