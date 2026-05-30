import type { FormField } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { FormFieldRenderer } from './FormField';
import { Plus, Minus } from 'lucide-react';
import {
  buildLayoutRows,
  getRepeatableGroups,
  shouldShowField,
} from './formFieldUtils';

export interface FormFieldLayoutProps {
  allFields: FormField[];
  expandedFields: FormField[];
  formValues: Record<string, unknown>;
  errors: Record<string, string>;
  onFieldChange: (id: string, value: unknown) => void;
  groupRowCounts: Record<string, number>;
  onAddGroupRow: (groupId: string, max: number) => void;
  onRemoveGroupRow: (groupId: string, min: number) => void;
  /** Return false to omit a field entirely (e.g. office-use in public mode). */
  includeField?: (field: FormField) => boolean;
  /** Map field to render props; default passes through. */
  mapField?: (field: FormField) => FormField;
}

export function FormFieldLayout({
  allFields,
  expandedFields,
  formValues,
  errors,
  onFieldChange,
  groupRowCounts,
  onAddGroupRow,
  onRemoveGroupRow,
  includeField = () => true,
  mapField = (f) => f,
}: FormFieldLayoutProps) {
  const groups = getRepeatableGroups(allFields);
  const renderedGroupButtons = new Set<string>();

  const visibleFields = expandedFields.filter(
    (f) => includeField(f) && shouldShowField(f, formValues, allFields),
  );
  const layoutRows = buildLayoutRows(visibleFields);

  return (
    <>
      {layoutRows.map((row) => {
        const isMultiCol = row.length > 1 || (row[0]?.width ?? 100) < 100;
        const rowHasDescription = isMultiCol && row.some((f) =>
          f.description && !['heading', 'paragraph', 'divider'].includes(f.type),
        );

        let rowGroupControls: {
          groupId: string;
          groupDef: { maxRepetitions: number; minRepetitions: number };
        } | null = null;

        for (const field of row) {
          const baseId = field.id.replace(/_row_\d+$/, '');
          const origField = allFields.find((f) => f.id === baseId);
          const gId = origField?.repeatableGroup?.groupId;
          const gDef = gId ? groups.get(gId) : undefined;
          const btnKey = `${gId}:${field.id}`;
          if (gDef && gId && !renderedGroupButtons.has(btnKey)) {
            const lastFieldInGroup = gDef.fields[gDef.fields.length - 1];
            const rowMatch = field.id.match(/_row_(\d+)$/);
            const rowNum = rowMatch ? parseInt(rowMatch[1], 10) : 1;
            const currentRowCount = groupRowCounts[gId] ?? 1;
            if (baseId === lastFieldInGroup.id && rowNum === currentRowCount) {
              rowGroupControls = { groupId: gId, groupDef: gDef };
              renderedGroupButtons.add(btnKey);
            }
          }
        }

        const rowKey = row.map((f) => f.id).join('+');

        return (
          <div key={rowKey}>
            <div className={isMultiCol ? 'flex flex-wrap gap-x-4 gap-y-6' : undefined}>
              {row.map((field) => {
                const idx = expandedFields.indexOf(field);
                const baseId = field.id.replace(/_row_\d+$/, '');
                const origField = allFields.find((f) => f.id === baseId);
                const groupId = origField?.repeatableGroup?.groupId;
                const groupDef = groupId ? groups.get(groupId) : undefined;

                const isNewGroupRow =
                  !!groupDef &&
                  field.id.includes('_row_') &&
                  idx > 0 &&
                  !!origField?.repeatableGroup?.isGroupStart &&
                  baseId === groupDef.fields[0].id;

                const fieldWidth = field.width ?? 100;
                const gapRem = (row.length - 1) * 1;
                const widthStyle = isMultiCol
                  ? { width: `calc(${fieldWidth}% - ${(fieldWidth / 100) * gapRem}rem)`, minWidth: 0 }
                  : undefined;

                const renderField = mapField(field);

                return (
                  <div key={field.id} style={widthStyle} className={isMultiCol ? 'flex flex-col' : undefined}>
                    {isNewGroupRow && <hr className="border-gray-200 mb-4" />}
                    <FormFieldRenderer
                      field={renderField}
                      value={formValues[field.id]}
                      onChange={(val) => onFieldChange(field.id, val)}
                      error={errors[field.id]}
                      reserveDescriptionSpace={rowHasDescription}
                      multiColumn={isMultiCol}
                    />
                  </div>
                );
              })}
            </div>
            {rowGroupControls && (
              <div className="flex items-center gap-2 mt-3">
                {(groupRowCounts[rowGroupControls.groupId] ?? 1) < rowGroupControls.groupDef.maxRepetitions && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="text-xs"
                    onClick={() => onAddGroupRow(rowGroupControls!.groupId, rowGroupControls!.groupDef.maxRepetitions)}
                  >
                    <Plus className="h-3 w-3 mr-1" />
                    Add more
                  </Button>
                )}
                {(groupRowCounts[rowGroupControls.groupId] ?? 1) > rowGroupControls.groupDef.minRepetitions && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="text-xs text-red-500 hover:text-red-600"
                    onClick={() => onRemoveGroupRow(rowGroupControls!.groupId, rowGroupControls!.groupDef.minRepetitions)}
                  >
                    <Minus className="h-3 w-3 mr-1" />
                    Remove last
                  </Button>
                )}
                <span className="text-xs text-gray-400">
                  {groupRowCounts[rowGroupControls.groupId] ?? 1} / {rowGroupControls.groupDef.maxRepetitions}
                </span>
              </div>
            )}
          </div>
        );
      })}
    </>
  );
}
