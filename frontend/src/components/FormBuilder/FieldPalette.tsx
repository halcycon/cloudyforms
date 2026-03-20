import { useState, useEffect } from 'react';
import { useDraggable } from '@dnd-kit/core';
import {
  Type, AlignLeft, Hash, Mail, Phone, Calendar,
  ChevronDown, CheckSquare, Circle, List, Upload,
  Star, SlidersHorizontal, Heading, AlignCenter,
  Minus, PenTool, ToggleLeft, Layers,
} from 'lucide-react';
import type { FieldType, FieldGroup } from '@/lib/types';
import { fieldGroups as fieldGroupsApi } from '@/lib/api';
import { useStore } from '@/lib/store';
import { cn } from '@/lib/utils';

interface FieldTypeConfig {
  type: FieldType;
  label: string;
  icon: React.ReactNode;
  group: string;
}

const FIELD_TYPES: FieldTypeConfig[] = [
  // Basic
  { type: 'text', label: 'Text', icon: <Type className="h-4 w-4" />, group: 'Basic' },
  { type: 'textarea', label: 'Textarea', icon: <AlignLeft className="h-4 w-4" />, group: 'Basic' },
  { type: 'email', label: 'Email', icon: <Mail className="h-4 w-4" />, group: 'Basic' },
  { type: 'phone', label: 'Phone', icon: <Phone className="h-4 w-4" />, group: 'Basic' },
  { type: 'number', label: 'Number', icon: <Hash className="h-4 w-4" />, group: 'Basic' },
  { type: 'date', label: 'Date', icon: <Calendar className="h-4 w-4" />, group: 'Basic' },
  // Choice
  { type: 'select', label: 'Select', icon: <ChevronDown className="h-4 w-4" />, group: 'Choice' },
  { type: 'multiselect', label: 'Multi Select', icon: <List className="h-4 w-4" />, group: 'Choice' },
  { type: 'radio', label: 'Radio', icon: <Circle className="h-4 w-4" />, group: 'Choice' },
  { type: 'checkbox', label: 'Checkbox', icon: <CheckSquare className="h-4 w-4" />, group: 'Choice' },
  // Advanced
  { type: 'file', label: 'File Upload', icon: <Upload className="h-4 w-4" />, group: 'Advanced' },
  { type: 'rating', label: 'Rating', icon: <Star className="h-4 w-4" />, group: 'Advanced' },
  { type: 'scale', label: 'Scale', icon: <SlidersHorizontal className="h-4 w-4" />, group: 'Advanced' },
  { type: 'signature', label: 'Signature', icon: <PenTool className="h-4 w-4" />, group: 'Advanced' },
  // Layout
  { type: 'heading', label: 'Heading', icon: <Heading className="h-4 w-4" />, group: 'Layout' },
  { type: 'paragraph', label: 'Paragraph', icon: <AlignCenter className="h-4 w-4" />, group: 'Layout' },
  { type: 'divider', label: 'Divider', icon: <Minus className="h-4 w-4" />, group: 'Layout' },
];

export const FIELD_TYPE_CONFIGS = FIELD_TYPES;

interface DraggableFieldTypeProps {
  config: FieldTypeConfig;
  onAdd: (type: FieldType) => void;
}

function DraggableFieldType({ config, onAdd }: DraggableFieldTypeProps) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `palette-${config.type}`,
    data: { type: 'palette', fieldType: config.type },
  });

  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      onClick={() => onAdd(config.type)}
      className={cn(
        'flex items-center gap-2 rounded-md border border-gray-200 bg-white px-3 py-2',
        'cursor-grab active:cursor-grabbing select-none',
        'hover:border-primary-300 hover:bg-primary-50 hover:text-primary-700 transition-colors',
        'text-sm font-medium text-gray-700',
        isDragging && 'opacity-50',
      )}
    >
      {config.icon}
      {config.label}
    </div>
  );
}

interface FieldPaletteProps {
  onAddField: (type: FieldType) => void;
  onAddFieldGroup?: (group: FieldGroup) => void;
}

const GROUPS = ['Basic', 'Choice', 'Advanced', 'Layout'];

export function FieldPalette({ onAddField, onAddFieldGroup }: FieldPaletteProps) {
  const { currentOrg } = useStore();
  const [fieldGroupsList, setFieldGroupsList] = useState<FieldGroup[]>([]);

  useEffect(() => {
    if (!currentOrg?.id) return;
    fieldGroupsApi.list(currentOrg.id).then(setFieldGroupsList).catch(() => {});
  }, [currentOrg?.id]);

  return (
    <div className="h-full overflow-y-auto border-r border-gray-200 bg-gray-50">
      <div className="p-4">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-500 mb-3">
          Field Types
        </h3>
        <div className="space-y-4">
          {GROUPS.map((group) => (
            <div key={group}>
              <p className="text-xs font-medium text-gray-400 mb-1.5 flex items-center gap-1">
                <ToggleLeft className="h-3 w-3" />
                {group}
              </p>
              <div className="grid grid-cols-1 gap-1">
                {FIELD_TYPES.filter((f) => f.group === group).map((config) => (
                  <DraggableFieldType
                    key={config.type}
                    config={config}
                    onAdd={onAddField}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>

        {/* Field Groups (Templates) */}
        {fieldGroupsList.length > 0 && onAddFieldGroup && (
          <div className="mt-6">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-500 mb-3">
              Field Templates
            </h3>
            <div className="grid grid-cols-1 gap-1">
              {fieldGroupsList.map((group) => (
                <button
                  key={group.id}
                  onClick={() => onAddFieldGroup(group)}
                  className={cn(
                    'flex items-center gap-2 rounded-md border border-indigo-200 bg-indigo-50 px-3 py-2',
                    'cursor-pointer select-none text-left',
                    'hover:border-indigo-400 hover:bg-indigo-100 transition-colors',
                    'text-sm font-medium text-indigo-700',
                  )}
                >
                  <Layers className="h-4 w-4 shrink-0" />
                  <div className="min-w-0">
                    <span className="block truncate">{group.name}</span>
                    <span className="block text-[10px] text-indigo-400 font-normal">
                      {group.fields.length} field{group.fields.length !== 1 ? 's' : ''}
                    </span>
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
