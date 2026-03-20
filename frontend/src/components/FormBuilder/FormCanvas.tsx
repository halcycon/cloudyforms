import { useCallback, useRef } from 'react';
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useDroppable } from '@dnd-kit/core';
import { GripVertical, Trash2, Copy } from 'lucide-react';
import type { FormField } from '@/lib/types';
import { cn } from '@/lib/utils';
import { FieldPreview } from './FieldPreview';

const PRESET_WIDTHS = [25, 33, 50, 66, 75, 100];

/** Snap a raw percentage to the nearest allowed column width */
function snapWidth(pct: number): number {
  let closest = 100;
  let minDist = Infinity;
  for (const s of PRESET_WIDTHS) {
    const d = Math.abs(pct - s);
    if (d < minDist) { minDist = d; closest = s; }
  }
  return closest;
}

/** Group a flat field list into rows where widths sum to ≤ 100 */
export function groupFieldsIntoRows(fields: FormField[]): FormField[][] {
  const rows: FormField[][] = [];
  let currentRow: FormField[] = [];
  let rowWidth = 0;

  for (const field of fields) {
    const w = field.width ?? 100;
    if (currentRow.length > 0 && rowWidth + w > 100) {
      rows.push(currentRow);
      currentRow = [field];
      rowWidth = w;
    } else {
      currentRow.push(field);
      rowWidth += w;
    }
  }
  if (currentRow.length > 0) rows.push(currentRow);
  return rows;
}

interface SortableFieldProps {
  field: FormField;
  isSelected: boolean;
  onSelect: () => void;
  onDelete: () => void;
  onDuplicate: () => void;
  onWidthChange?: (width: number) => void;
  showResize?: boolean;
  /** Number of fields in this row, used for gap-aware width calculation */
  rowLength: number;
}

function SortableField({
  field,
  isSelected,
  onSelect,
  onDelete,
  onDuplicate,
  onWidthChange,
  showResize,
  rowLength,
}: SortableFieldProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: field.id, data: { type: 'canvas-field', field } });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  const resizing = useRef(false);
  const rafId = useRef(0);

  const handleResizeStart = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      e.stopPropagation();
      e.preventDefault();
      if (!onWidthChange) return;
      resizing.current = true;
      const startX = e.clientX;
      const el = (e.target as HTMLElement).closest('[data-field-wrapper]') as HTMLElement | null;
      if (!el) return;
      const rowEl = el.parentElement;
      if (!rowEl) return;
      const rowWidth = rowEl.getBoundingClientRect().width;
      const startPct = field.width ?? 100;
      // If the field already has a non-preset (custom) width, allow free-form dragging
      const useSnap = PRESET_WIDTHS.includes(startPct);
      let lastValue = startPct;

      function onMove(ev: PointerEvent) {
        if (!resizing.current) return;
        cancelAnimationFrame(rafId.current);
        rafId.current = requestAnimationFrame(() => {
          const dx = ev.clientX - startX;
          const deltaPct = (dx / rowWidth) * 100;
          const raw = startPct + deltaPct;
          const clamped = Math.max(10, Math.min(100, raw));
          const value = useSnap ? snapWidth(clamped) : Math.round(clamped);
          if (value !== lastValue) {
            lastValue = value;
            onWidthChange!(value);
          }
        });
      }

      function onUp() {
        resizing.current = false;
        cancelAnimationFrame(rafId.current);
        document.removeEventListener('pointermove', onMove);
        document.removeEventListener('pointerup', onUp);
      }

      document.addEventListener('pointermove', onMove);
      document.addEventListener('pointerup', onUp);
    },
    [field.width, onWidthChange],
  );

  const width = field.width ?? 100;
  // Account for flex gap (gap-2 = 0.5rem) to prevent overflow
  const gapRem = (rowLength - 1) * 0.5;
  const widthStyle = gapRem > 0
    ? `calc(${width}% - ${(width / 100) * gapRem}rem)`
    : `${width}%`;

  return (
    <div
      ref={setNodeRef}
      style={{ ...style, width: widthStyle }}
      data-field-wrapper=""
      onClick={onSelect}
      className={cn(
        'group relative rounded-lg border-2 bg-white p-4 cursor-pointer transition-colors',
        isSelected
          ? 'border-primary-500 shadow-sm'
          : 'border-transparent hover:border-gray-200',
      )}
    >
      {/* Drag handle */}
      <div
        {...attributes}
        {...listeners}
        className="absolute left-1 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 cursor-grab active:cursor-grabbing text-gray-400 hover:text-gray-600 p-1"
        onClick={(e) => e.stopPropagation()}
      >
        <GripVertical className="h-4 w-4" />
      </div>

      {/* Actions */}
      <div
        className="absolute right-2 top-2 hidden group-hover:flex items-center gap-1"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={onDuplicate}
          className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
          title="Duplicate"
        >
          <Copy className="h-3.5 w-3.5" />
        </button>
        <button
          onClick={onDelete}
          className="rounded p-1 text-gray-400 hover:bg-red-50 hover:text-red-500"
          title="Delete"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>

      <div className="pl-4">
        <FieldPreview field={field} />
      </div>

      {/* Width badge */}
      {width < 100 && (
        <span className="absolute bottom-1 right-2 text-[10px] text-gray-400">
          {width}%
        </span>
      )}

      {/* Resize handle on right edge */}
      {showResize && (
        <div
          onPointerDown={handleResizeStart}
          onClick={(e) => e.stopPropagation()}
          className="absolute right-0 top-0 bottom-0 w-1.5 cursor-col-resize opacity-0 group-hover:opacity-100 bg-primary-400 hover:bg-primary-600 rounded-r-lg transition-opacity"
          title="Drag to resize width"
        />
      )}
    </div>
  );
}

interface FormCanvasProps {
  fields: FormField[];
  selectedFieldId: string | null;
  onSelectField: (id: string) => void;
  onDeleteField: (id: string) => void;
  onDuplicateField: (id: string) => void;
  onFieldWidthChange?: (id: string, width: number) => void;
}

export function FormCanvas({
  fields,
  selectedFieldId,
  onSelectField,
  onDeleteField,
  onDuplicateField,
  onFieldWidthChange,
}: FormCanvasProps) {
  const { setNodeRef, isOver } = useDroppable({
    id: 'form-canvas',
    data: { type: 'canvas' },
  });

  const rows = groupFieldsIntoRows(fields);

  return (
    <div
      ref={setNodeRef}
      className={cn(
        'flex-1 overflow-y-auto p-4',
        isOver && 'bg-primary-50',
      )}
    >
      {fields.length === 0 ? (
        <div
          className={cn(
            'flex h-full min-h-[300px] flex-col items-center justify-center rounded-xl border-2 border-dashed text-center p-8 transition-colors',
            isOver ? 'border-primary-400 bg-primary-50' : 'border-gray-200',
          )}
        >
          <div className="mb-3 rounded-full bg-gray-100 p-4">
            <svg className="h-8 w-8 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 4v16m8-8H4" />
            </svg>
          </div>
          <h3 className="text-base font-medium text-gray-700">Drop fields here</h3>
          <p className="mt-1 text-sm text-gray-400">
            Drag fields from the left panel or click them to add
          </p>
        </div>
      ) : (
        <SortableContext items={fields.map((f) => f.id)} strategy={verticalListSortingStrategy}>
          <div className="space-y-2">
            {rows.map((row) => (
              <div key={row.map((f) => f.id).join('+')} className="flex gap-2">
                {row.map((field) => (
                  <SortableField
                    key={field.id}
                    field={field}
                    isSelected={selectedFieldId === field.id}
                    onSelect={() => onSelectField(field.id)}
                    onDelete={() => onDeleteField(field.id)}
                    onDuplicate={() => onDuplicateField(field.id)}
                    onWidthChange={
                      onFieldWidthChange
                        ? (w) => onFieldWidthChange(field.id, w)
                        : undefined
                    }
                    showResize={(field.width ?? 100) < 100 || row.length > 1}
                    rowLength={row.length}
                  />
                ))}
              </div>
            ))}
          </div>
        </SortableContext>
      )}
    </div>
  );
}
