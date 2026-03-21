import type { FormField } from '@/lib/types';
import { cn } from '@/lib/utils';
import { Star, Minus, EyeOff } from 'lucide-react';

interface FieldPreviewProps {
  field: FormField;
}

export function FieldPreview({ field }: FieldPreviewProps) {
  const inputClass = 'w-full px-3 py-1.5 text-sm border border-gray-200 rounded-md bg-gray-50 text-gray-400 pointer-events-none';

  if (field.type === 'heading') {
    const sizeMap = { 1: 'text-2xl', 2: 'text-xl', 3: 'text-lg' };
    const Tag = `h${field.level ?? 2}` as 'h1' | 'h2' | 'h3';
    return <Tag className={cn('font-bold text-gray-800', sizeMap[field.level ?? 2])}>{field.content ?? field.label}</Tag>;
  }
  if (field.type === 'paragraph') {
    return <p className="text-sm text-gray-600">{field.content ?? field.label}</p>;
  }
  if (field.type === 'divider') {
    return (
      <div className="flex items-center gap-2">
        <Minus className="h-4 w-4 text-gray-400" />
        <hr className="flex-1 border-gray-200" />
      </div>
    );
  }

  if (field.type === 'hidden') {
    return (
      <div className="space-y-1">
        <div className="flex items-center gap-1.5">
          <EyeOff className="h-3.5 w-3.5 text-gray-400" />
          <span className="text-sm font-medium text-gray-700">{field.label}</span>
          {field.visibleToUser && <span className="text-[10px] text-amber-600 bg-amber-50 px-1 rounded">read-only</span>}
        </div>
        <div className={cn(inputClass, 'flex items-center gap-2 text-xs italic')} style={{ height: 36 }}>
          {field.formula ? (
            <span className="text-indigo-400">ƒ {field.formula}</span>
          ) : (
            <span>{field.defaultValue || 'No value set'}</span>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-1">
      <div className="flex items-center gap-1">
        <span className="text-sm font-medium text-gray-700">{field.label}</span>
        {field.required && <span className="text-red-500 text-xs">*</span>}
        {field.readOnly && <span className="text-[10px] text-amber-600 bg-amber-50 px-1 rounded">read-only</span>}
      </div>
      {field.description && <p className="text-xs text-gray-400">{field.description}</p>}

      {(field.type === 'text' || field.type === 'email' || field.type === 'phone' || field.type === 'number' || field.type === 'date') && (
        <div className={inputClass} style={{ height: 36 }}>
          {field.placeholder && <span>{field.placeholder}</span>}
        </div>
      )}

      {field.type === 'textarea' && (
        <div className={inputClass} style={{ height: 72 }}>
          {field.placeholder && <span>{field.placeholder}</span>}
        </div>
      )}

      {(field.type === 'select' || field.type === 'multiselect') && (
        <div className={cn(inputClass, 'flex items-center justify-between')} style={{ height: 36 }}>
          <span>{field.placeholder ?? 'Select...'}</span>
          <span>▾</span>
        </div>
      )}

      {field.type === 'radio' && (
        <div className="space-y-1">
          {(field.options ?? [{ label: 'Option 1', value: '1' }, { label: 'Option 2', value: '2' }]).slice(0, 3).map((opt) => (
            <div key={opt.value} className="flex items-center gap-2">
              <div className="h-3.5 w-3.5 rounded-full border border-gray-300 flex-shrink-0" />
              <span className="text-xs text-gray-500">{opt.label}</span>
            </div>
          ))}
        </div>
      )}

      {field.type === 'checkbox' && field.options && field.options.length > 0 && (
        <div className="space-y-1">
          {field.options.slice(0, 3).map((opt) => (
            <div key={opt.value} className="flex items-center gap-2">
              <div className="h-3.5 w-3.5 rounded-sm border border-gray-300 flex-shrink-0" />
              <span className="text-xs text-gray-500">{opt.label}</span>
            </div>
          ))}
          {field.options.length > 3 && (
            <span className="text-[10px] text-gray-400">+{field.options.length - 3} more</span>
          )}
        </div>
      )}

      {field.type === 'checkbox' && (!field.options || field.options.length === 0) && (
        <div className="flex items-center gap-2">
          <div className="h-3.5 w-3.5 rounded-sm border border-gray-300 flex-shrink-0" />
          <span className="text-xs text-gray-500">{field.placeholder ?? field.label}</span>
        </div>
      )}

      {field.type === 'rating' && (
        <div className="flex gap-1">
          {Array.from({ length: field.max ?? 5 }, (_, i) => (
            <Star key={i} className="h-5 w-5 text-gray-200" />
          ))}
        </div>
      )}

      {field.type === 'scale' && (
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-400">{field.min ?? 1}</span>
          <div className="flex-1 h-1.5 bg-gray-200 rounded-full" />
          <span className="text-xs text-gray-400">{field.max ?? 10}</span>
        </div>
      )}

      {field.type === 'file' && (
        <div className="border-2 border-dashed border-gray-200 rounded-lg p-4 text-center">
          <span className="text-xs text-gray-400">Click or drag to upload</span>
        </div>
      )}

      {field.type === 'signature' && (
        <div className="border border-gray-200 rounded-md h-16 flex items-center justify-center">
          <span className="text-xs text-gray-400 italic">Signature area</span>
        </div>
      )}
    </div>
  );
}
