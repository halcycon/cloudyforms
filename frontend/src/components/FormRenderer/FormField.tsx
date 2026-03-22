import { useState, useRef } from 'react';
import type { FormField as FormFieldType } from '@/lib/types';
import { cn } from '@/lib/utils';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Slider } from '@/components/ui/slider';
import { Star, Upload, X } from 'lucide-react';

interface FormFieldProps {
  field: FormFieldType;
  value: unknown;
  onChange: (value: unknown) => void;
  error?: string;
  /** When true, reserve vertical space for the description area even if no description exists */
  reserveDescriptionSpace?: boolean;
}

export function FormFieldRenderer({ field, value, onChange, error, reserveDescriptionSpace }: FormFieldProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [lastPos, setLastPos] = useState<{ x: number; y: number } | null>(null);

  // Signature drawing
  function getPos(e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>, canvas: HTMLCanvasElement) {
    const rect = canvas.getBoundingClientRect();
    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;
    return { x: clientX - rect.left, y: clientY - rect.top };
  }

  function startDraw(e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) {
    if (!canvasRef.current) return;
    e.preventDefault();
    setIsDrawing(true);
    setLastPos(getPos(e, canvasRef.current));
  }

  function draw(e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) {
    if (!isDrawing || !canvasRef.current || !lastPos) return;
    e.preventDefault();
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const pos = getPos(e, canvas);
    ctx.beginPath();
    ctx.moveTo(lastPos.x, lastPos.y);
    ctx.lineTo(pos.x, pos.y);
    ctx.strokeStyle = '#1e293b';
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    ctx.stroke();
    setLastPos(pos);
  }

  function endDraw() {
    if (!canvasRef.current) return;
    setIsDrawing(false);
    setLastPos(null);
    onChange(canvasRef.current.toDataURL());
  }

  function clearSignature() {
    if (!canvasRef.current) return;
    const ctx = canvasRef.current.getContext('2d');
    if (ctx) ctx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
    onChange('');
  }

  const labelEl = (
    <Label className="mb-1.5 block" required={field.required}>
      {field.label}
    </Label>
  );
  const descEl = field.description ? (
    <p className="mt-0.5 mb-1.5 text-xs text-gray-500">{field.description}</p>
  ) : reserveDescriptionSpace ? (
    <p className="mt-0.5 mb-1.5 text-xs text-transparent" aria-hidden="true">&nbsp;</p>
  ) : null;

  if (field.type === 'heading') {
    const Tag = `h${field.level ?? 2}` as 'h1' | 'h2' | 'h3';
    const sizeMap = { 1: 'text-2xl', 2: 'text-xl', 3: 'text-lg' };
    return (
      <Tag className={cn('font-bold text-gray-900', sizeMap[field.level ?? 2])}>
        {field.content ?? field.label}
      </Tag>
    );
  }

  if (field.type === 'paragraph') {
    return <p className="text-gray-700 leading-relaxed">{field.content ?? field.label}</p>;
  }

  if (field.type === 'divider') {
    return <hr className="border-gray-200" />;
  }

  // Hidden fields: render nothing if not visible, or read-only display if visibleToUser
  if (field.type === 'hidden') {
    if (!field.visibleToUser) return null;
    return (
      <div className="space-y-1">
        {labelEl}
        {descEl}
        <div className="flex h-9 w-full items-center rounded-md border border-gray-200 bg-gray-50 px-3 text-sm text-gray-600">
          {(value as string) ?? field.defaultValue ?? ''}
        </div>
      </div>
    );
  }

  // Calculated fields: always read-only display
  if (field.type === 'calculated') {
    return (
      <div className="space-y-1">
        {labelEl}
        {descEl}
        <div className="flex h-9 w-full items-center rounded-md border border-gray-200 bg-gray-50 px-3 text-sm text-gray-600">
          {(value as string) ?? ''}
        </div>
      </div>
    );
  }

  const isReadOnly = field.readOnly ?? false;

  return (
    <div className="space-y-1">
      {labelEl}
      {descEl}

      {(field.type === 'text' || field.type === 'email' || field.type === 'phone') && (
        <Input
          type={field.type === 'phone' ? 'tel' : field.type}
          placeholder={field.placeholder}
          value={(value as string) ?? ''}
          onChange={(e) => onChange(e.target.value)}
          error={error}
          minLength={field.validation?.minLength}
          maxLength={field.validation?.maxLength}
          pattern={field.validation?.pattern}
          readOnly={isReadOnly}
          className={isReadOnly ? 'bg-gray-50 text-gray-600 cursor-not-allowed' : undefined}
        />
      )}

      {field.type === 'number' && (
        <Input
          type="number"
          placeholder={field.placeholder}
          value={(value as string) ?? ''}
          onChange={(e) => onChange(e.target.value)}
          error={error}
          min={field.validation?.min}
          max={field.validation?.max}
          readOnly={isReadOnly}
          className={isReadOnly ? 'bg-gray-50 text-gray-600 cursor-not-allowed' : undefined}
        />
      )}

      {field.type === 'date' && (
        <Input
          type="date"
          value={(value as string) ?? ''}
          onChange={(e) => onChange(e.target.value)}
          error={error}
          readOnly={isReadOnly}
          className={isReadOnly ? 'bg-gray-50 text-gray-600 cursor-not-allowed' : undefined}
        />
      )}

      {field.type === 'textarea' && (
        <Textarea
          placeholder={field.placeholder}
          value={(value as string) ?? ''}
          onChange={(e) => onChange(e.target.value)}
          error={error}
          rows={4}
          minLength={field.validation?.minLength}
          maxLength={field.validation?.maxLength}
          readOnly={isReadOnly}
          className={isReadOnly ? 'bg-gray-50 text-gray-600 cursor-not-allowed' : undefined}
        />
      )}

      {field.type === 'select' && (() => {
        const defaultOpt = field.options?.find((o) => o.default);
        return (
          <select
            className={cn(
              'flex h-9 w-full rounded-md border border-gray-300 bg-white px-3 py-1 text-sm shadow-sm',
              'focus:outline-none focus:ring-2 focus:ring-primary-600 focus:border-transparent',
              error && 'border-red-500',
              isReadOnly && 'bg-gray-50 text-gray-600 cursor-not-allowed',
            )}
            value={(value as string) ?? (defaultOpt?.value ?? '')}
            onChange={(e) => onChange(e.target.value)}
            disabled={isReadOnly}
          >
            {defaultOpt ? (
              <>
                <option value={defaultOpt.value}>{defaultOpt.label}</option>
                <option disabled>{'─'.repeat(20)}</option>
              </>
            ) : (
              <option value="">{field.placeholder ?? 'Select an option...'}</option>
            )}
            {field.options?.map((opt) => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
        );
      })()}

      {field.type === 'multiselect' && (
        <div className={cn('space-y-2', isReadOnly && 'pointer-events-none opacity-75')}>
          {field.options?.map((opt) => {
            const selected = (value as string[] | undefined) ?? [];
            const checked = selected.includes(opt.value);
            return (
              <label key={opt.value} className="flex items-center gap-2 cursor-pointer">
                <Checkbox
                  checked={checked}
                  disabled={isReadOnly}
                  onCheckedChange={(c) => {
                    if (c) onChange([...selected, opt.value]);
                    else onChange(selected.filter((v) => v !== opt.value));
                  }}
                />
                <span className="text-sm text-gray-700">{opt.label}</span>
              </label>
            );
          })}
        </div>
      )}

      {field.type === 'radio' && (
        <RadioGroup
          value={(value as string) ?? ''}
          onValueChange={(v) => onChange(v)}
          disabled={isReadOnly}
          className={isReadOnly ? 'pointer-events-none opacity-75' : undefined}
        >
          {field.options?.map((opt) => (
            <div key={opt.value} className="flex items-center gap-2">
              <RadioGroupItem value={opt.value} id={`${field.id}-${opt.value}`} />
              <label htmlFor={`${field.id}-${opt.value}`} className="text-sm text-gray-700 cursor-pointer">
                {opt.label}
              </label>
            </div>
          ))}
        </RadioGroup>
      )}

      {field.type === 'checkbox' && field.options && field.options.length > 0 && (
        <div className={cn('space-y-2', isReadOnly && 'pointer-events-none opacity-75')}>
          {field.options.map((opt) => {
            const selected = (value as string[] | undefined) ?? [];
            const checked = selected.includes(opt.value);
            return (
              <label key={opt.value} className="flex items-center gap-2 cursor-pointer">
                <Checkbox
                  checked={checked}
                  disabled={isReadOnly}
                  onCheckedChange={(c) => {
                    if (c) onChange([...selected, opt.value]);
                    else onChange(selected.filter((v) => v !== opt.value));
                  }}
                />
                <span className="text-sm text-gray-700">{opt.label}</span>
              </label>
            );
          })}
        </div>
      )}

      {field.type === 'checkbox' && (!field.options || field.options.length === 0) && (
        <label className="flex items-center gap-2 cursor-pointer">
          <Checkbox
            checked={Boolean(value)}
            onCheckedChange={(c) => onChange(Boolean(c))}
            disabled={isReadOnly}
          />
          <span className="text-sm text-gray-700">{field.placeholder ?? field.label}</span>
        </label>
      )}

      {field.type === 'rating' && (
        <div className={cn('star-rating flex gap-1', isReadOnly && 'pointer-events-none')}>
          {Array.from({ length: field.max ?? 5 }, (_, i) => i + 1).map((star) => (
            <button
              key={star}
              type="button"
              className="star focus:outline-none"
              onClick={() => onChange(star)}
              disabled={isReadOnly}
            >
              <Star
                className={cn(
                  'h-7 w-7 transition-colors',
                  star <= ((value as number) ?? 0)
                    ? 'fill-yellow-400 text-yellow-400'
                    : 'text-gray-300',
                )}
              />
            </button>
          ))}
        </div>
      )}

      {field.type === 'scale' && (
        <div className="space-y-2">
          <Slider
            min={field.min ?? 1}
            max={field.max ?? 10}
            step={field.step ?? 1}
            value={[((value as number) ?? field.min ?? 1)]}
            onValueChange={([v]) => onChange(v)}
            disabled={isReadOnly}
          />
          <div className="flex justify-between text-xs text-gray-500">
            <span>{field.min ?? 1}</span>
            <span className="font-medium text-gray-900">{(value as number) ?? field.min ?? 1}</span>
            <span>{field.max ?? 10}</span>
          </div>
        </div>
      )}

      {field.type === 'file' && (
        <div
          className={cn(
            'border-2 border-dashed rounded-lg p-6 text-center transition-colors',
            isReadOnly
              ? 'border-gray-200 bg-gray-50 cursor-not-allowed'
              : 'cursor-pointer',
            !isReadOnly && (dragOver ? 'border-primary-400 bg-primary-50' : 'border-gray-300 hover:border-gray-400'),
            error && 'border-red-400',
          )}
          onClick={() => !isReadOnly && fileInputRef.current?.click()}
          onDragOver={(e) => { if (!isReadOnly) { e.preventDefault(); setDragOver(true); } }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => {
            if (isReadOnly) return;
            e.preventDefault();
            setDragOver(false);
            const files = Array.from(e.dataTransfer.files);
            onChange(field.multiple ? files : files[0]);
          }}
        >
          <Upload className="mx-auto h-8 w-8 text-gray-400 mb-2" />
          <p className="text-sm text-gray-600">
            Drag & drop or <span className="text-primary-600 font-medium">browse</span>
          </p>
          {field.accept && (
            <p className="text-xs text-gray-400 mt-1">Accepted: {field.accept}</p>
          )}
          {field.maxSize && (
            <p className="text-xs text-gray-400">Max size: {field.maxSize}MB</p>
          )}
          <input
            ref={fileInputRef}
            type="file"
            className="hidden"
            accept={field.accept}
            multiple={field.multiple}
            onChange={(e) => {
              const files = Array.from(e.target.files ?? []);
              onChange(field.multiple ? files : files[0]);
            }}
          />
          {value instanceof File && (
            <p className="mt-2 text-xs text-green-600 font-medium">{value.name}</p>
          )}
          {Array.isArray(value) && value.length > 0 && (
            <p className="mt-2 text-xs text-green-600 font-medium">{value.length} file(s) selected</p>
          )}
        </div>
      )}

      {field.type === 'signature' && (
        <div className="space-y-2">
          <div className={cn('border border-gray-300 rounded-md overflow-hidden bg-white', isReadOnly && 'pointer-events-none opacity-75')}>
            <canvas
              ref={canvasRef}
              width={600}
              height={150}
              className="signature-canvas w-full h-[150px] touch-none"
              onMouseDown={startDraw}
              onMouseMove={draw}
              onMouseUp={endDraw}
              onMouseLeave={endDraw}
              onTouchStart={startDraw}
              onTouchMove={draw}
              onTouchEnd={endDraw}
            />
          </div>
          <div className="flex justify-between items-center">
            <p className="text-xs text-gray-400">Draw your signature above</p>
            <button
              type="button"
              onClick={clearSignature}
              className="flex items-center gap-1 text-xs text-gray-500 hover:text-red-500"
            >
              <X className="h-3 w-3" /> Clear
            </button>
          </div>
        </div>
      )}

      {error && !['text', 'email', 'phone', 'number', 'date', 'textarea'].includes(field.type) && (
        <p className="text-xs text-red-600">{error}</p>
      )}
    </div>
  );
}
