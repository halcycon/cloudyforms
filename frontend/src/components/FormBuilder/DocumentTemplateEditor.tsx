import { useState, useRef, useCallback, useEffect } from 'react';
import { Document, Page, pdfjs } from 'react-pdf';
import 'react-pdf/dist/Page/AnnotationLayer.css';
import 'react-pdf/dist/Page/TextLayer.css';
import toast from 'react-hot-toast';
import {
  FileUp,
  FileText,
  Trash2,
  Plus,
  ChevronLeft,
  ChevronRight,
  GripVertical,
  X,
  Type,
} from 'lucide-react';
import type { FormField, DocumentTemplate, FieldMapping } from '@/lib/types';
import { files as filesApi } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { cn } from '@/lib/utils';

// Configure PDF.js worker
pdfjs.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;

// A4 page dimensions in PDF points (1 point = 1/72 inch)
const A4_WIDTH_POINTS = 595.28;
const A4_HEIGHT_POINTS = 841.89;

interface DocumentTemplateEditorProps {
  template: DocumentTemplate | null;
  fields: FormField[];
  onChange: (template: DocumentTemplate | null) => void;
}

const DEFAULT_TEMPLATE: DocumentTemplate = {
  enabled: false,
  type: 'pdf',
  fieldMappings: [],
};

export function DocumentTemplateEditor({
  template,
  fields,
  onChange,
}: DocumentTemplateEditorProps) {
  const config = template ?? DEFAULT_TEMPLATE;
  const [currentPage, setCurrentPage] = useState(1);
  const [numPages, setNumPages] = useState(0);
  const [uploading, setUploading] = useState(false);
  const [selectedMappingId, setSelectedMappingId] = useState<string | null>(null);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const pdfContainerRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Resolve the PDF file URL from R2
  useEffect(() => {
    if (config.type === 'pdf' && config.fileKey) {
      const apiBase = import.meta.env.VITE_API_URL ?? '/api';
      setPdfUrl(`${apiBase}/files/${config.fileKey}`);
    } else {
      setPdfUrl(null);
    }
  }, [config.type, config.fileKey]);

  const update = useCallback(
    (updates: Partial<DocumentTemplate>) => {
      onChange({ ...config, ...updates });
    },
    [config, onChange],
  );

  const dataFields = fields.filter(
    (f) => !['heading', 'paragraph', 'divider'].includes(f.type),
  );

  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.type !== 'application/pdf') {
      toast.error('Please upload a PDF file');
      return;
    }

    if (file.size > 10 * 1024 * 1024) {
      toast.error('File must be under 10 MB');
      return;
    }

    setUploading(true);
    try {
      const result = await filesApi.upload(file);
      update({
        type: 'pdf',
        fileKey: result.key,
        fileName: result.name,
        fieldMappings: config.fieldMappings,
      });
      toast.success('PDF template uploaded');
    } catch {
      toast.error('Failed to upload file');
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }

  function handlePdfLoadSuccess({ numPages: pages }: { numPages: number }) {
    setNumPages(pages);
    update({ pageCount: pages });
  }

  function handlePdfClick(e: React.MouseEvent<HTMLDivElement>) {
    if (!pdfContainerRef.current) return;
    // Find the rendered page canvas to get exact coordinates
    const canvas = pdfContainerRef.current.querySelector('canvas');
    if (!canvas) return;

    const canvasRect = canvas.getBoundingClientRect();
    const scaleX = A4_WIDTH_POINTS / canvasRect.width;
    const scaleY = A4_HEIGHT_POINTS / canvasRect.height;

    const x = (e.clientX - canvasRect.left) * scaleX;
    const y = (e.clientY - canvasRect.top) * scaleY;

    // If there's a selected field to place, use it
    if (selectedMappingId) {
      const mappings = config.fieldMappings.map((m) =>
        m.fieldId === selectedMappingId && m.page === currentPage
          ? { ...m, x: Math.max(0, x), y: Math.max(0, y) }
          : m,
      );
      update({ fieldMappings: mappings });
      setSelectedMappingId(null);
      return;
    }
  }

  function addFieldMapping(fieldId: string) {
    // Check if already mapped
    const existing = config.fieldMappings.find((m) => m.fieldId === fieldId);
    if (existing) {
      setSelectedMappingId(fieldId);
      setCurrentPage(existing.page);
      toast('Click on the PDF to reposition this field', { icon: '👆' });
      return;
    }

    const newMapping: FieldMapping = {
      fieldId,
      page: currentPage,
      x: 50,
      y: 50,
      width: 200,
      height: 20,
      fontSize: 12,
      fontColor: '#000000',
    };

    update({
      fieldMappings: [...config.fieldMappings, newMapping],
    });

    setSelectedMappingId(fieldId);
    toast('Click on the PDF to position this field', { icon: '👆' });
  }

  function removeFieldMapping(fieldId: string) {
    update({
      fieldMappings: config.fieldMappings.filter((m) => m.fieldId !== fieldId),
    });
    if (selectedMappingId === fieldId) setSelectedMappingId(null);
  }

  function updateFieldMapping(fieldId: string, updates: Partial<FieldMapping>) {
    update({
      fieldMappings: config.fieldMappings.map((m) =>
        m.fieldId === fieldId ? { ...m, ...updates } : m,
      ),
    });
  }

  function insertFieldPlaceholder(fieldLabel: string) {
    const placeholder = `{{${fieldLabel}}}`;
    const textarea = document.getElementById('md-editor') as HTMLTextAreaElement | null;
    if (textarea) {
      const start = textarea.selectionStart;
      const end = textarea.selectionEnd;
      const text = config.markdownContent ?? '';
      const newText = text.substring(0, start) + placeholder + text.substring(end);
      update({ markdownContent: newText });
      // Restore cursor position after React re-render
      setTimeout(() => {
        textarea.focus();
        textarea.setSelectionRange(start + placeholder.length, start + placeholder.length);
      }, 0);
    } else {
      update({
        markdownContent: (config.markdownContent ?? '') + placeholder,
      });
    }
  }

  // Render field position indicators on the PDF
  function renderFieldOverlays() {
    if (!pdfContainerRef.current) return null;
    const canvas = pdfContainerRef.current.querySelector('canvas');
    if (!canvas) return null;

    const canvasRect = canvas.getBoundingClientRect();
    const containerRect = pdfContainerRef.current.getBoundingClientRect();
    const scaleX = canvasRect.width / A4_WIDTH_POINTS;
    const scaleY = canvasRect.height / A4_HEIGHT_POINTS;
    const offsetX = canvasRect.left - containerRect.left;
    const offsetY = canvasRect.top - containerRect.top;

    return config.fieldMappings
      .filter((m) => m.page === currentPage)
      .map((mapping) => {
        const field = fields.find((f) => f.id === mapping.fieldId);
        if (!field) return null;

        return (
          <div
            key={mapping.fieldId}
            className={cn(
              'absolute border-2 rounded px-1 text-xs flex items-center gap-1 cursor-pointer select-none',
              selectedMappingId === mapping.fieldId
                ? 'border-blue-500 bg-blue-100/80 text-blue-800'
                : 'border-orange-400 bg-orange-100/80 text-orange-800',
            )}
            style={{
              left: offsetX + mapping.x * scaleX,
              top: offsetY + mapping.y * scaleY,
              width: mapping.width * scaleX,
              height: Math.max(mapping.height * scaleY, 18),
              fontSize: 10,
            }}
            onClick={(e) => {
              e.stopPropagation();
              setSelectedMappingId(
                selectedMappingId === mapping.fieldId ? null : mapping.fieldId,
              );
            }}
            title={`${field.label} (click to select, then click PDF to reposition)`}
          >
            <GripVertical className="h-3 w-3 flex-shrink-0" />
            <span className="truncate">{field.label}</span>
          </div>
        );
      });
  }

  return (
    <div className="p-3 space-y-4">
      {/* Enable toggle */}
      <div className="flex items-center justify-between">
        <div>
          <Label className="text-sm font-medium">Document Template</Label>
          <p className="text-xs text-gray-500 mt-0.5">
            Generate filled PDFs from responses
          </p>
        </div>
        <Switch
          checked={config.enabled}
          onCheckedChange={(enabled) => update({ enabled })}
        />
      </div>

      {!config.enabled && (
        <div className="rounded-lg border border-dashed border-gray-300 p-6 text-center text-gray-400">
          <FileText className="mx-auto h-8 w-8 mb-2 opacity-50" />
          <p className="text-sm">Enable to attach a PDF or Markdown template</p>
          <p className="text-xs mt-1">
            Each form response can be exported as a filled PDF
          </p>
        </div>
      )}

      {config.enabled && (
        <>
          {/* Template type selector */}
          <div className="flex gap-2">
            <button
              type="button"
              className={cn(
                'flex-1 rounded-lg border-2 p-3 text-center text-sm transition-colors',
                config.type === 'pdf'
                  ? 'border-primary-500 bg-primary-50 text-primary-700'
                  : 'border-gray-200 hover:border-gray-300 text-gray-600',
              )}
              onClick={() => update({ type: 'pdf' })}
            >
              <FileUp className="mx-auto h-5 w-5 mb-1" />
              Upload PDF
            </button>
            <button
              type="button"
              className={cn(
                'flex-1 rounded-lg border-2 p-3 text-center text-sm transition-colors',
                config.type === 'markdown'
                  ? 'border-primary-500 bg-primary-50 text-primary-700'
                  : 'border-gray-200 hover:border-gray-300 text-gray-600',
              )}
              onClick={() => update({ type: 'markdown' })}
            >
              <Type className="mx-auto h-5 w-5 mb-1" />
              Markdown
            </button>
          </div>

          {/* PDF Template */}
          {config.type === 'pdf' && (
            <div className="space-y-3">
              {/* File upload */}
              {!config.fileKey ? (
                <div
                  className="rounded-lg border-2 border-dashed border-gray-300 p-8 text-center cursor-pointer hover:border-primary-400 transition-colors"
                  onClick={() => fileInputRef.current?.click()}
                >
                  <FileUp className="mx-auto h-10 w-10 text-gray-400 mb-2" />
                  <p className="text-sm text-gray-600 font-medium">
                    Click to upload a PDF template
                  </p>
                  <p className="text-xs text-gray-400 mt-1">
                    Max 10 MB · Fillable PDFs supported
                  </p>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="application/pdf"
                    className="hidden"
                    onChange={handleFileUpload}
                  />
                </div>
              ) : (
                <div className="space-y-3">
                  {/* File info */}
                  <div className="flex items-center justify-between rounded-lg bg-gray-50 border border-gray-200 px-3 py-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <FileText className="h-4 w-4 text-gray-500 flex-shrink-0" />
                      <span className="text-sm text-gray-700 truncate">
                        {config.fileName ?? 'template.pdf'}
                      </span>
                    </div>
                    <div className="flex items-center gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-gray-400 hover:text-red-500"
                        onClick={() => {
                          update({
                            fileKey: undefined,
                            fileName: undefined,
                            fieldMappings: [],
                            pageCount: undefined,
                          });
                          setPdfUrl(null);
                        }}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>

                  {/* PDF Preview with field placement */}
                  {pdfUrl && (
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <p className="text-xs font-medium text-gray-600">
                          Click the PDF to position fields
                        </p>
                        {numPages > 1 && (
                          <div className="flex items-center gap-2">
                            <Button
                              variant="ghost"
                              size="sm"
                              disabled={currentPage <= 1}
                              onClick={() => setCurrentPage((p) => p - 1)}
                              className="h-6 w-6 p-0"
                            >
                              <ChevronLeft className="h-3 w-3" />
                            </Button>
                            <span className="text-xs text-gray-500">
                              {currentPage} / {numPages}
                            </span>
                            <Button
                              variant="ghost"
                              size="sm"
                              disabled={currentPage >= numPages}
                              onClick={() => setCurrentPage((p) => p + 1)}
                              className="h-6 w-6 p-0"
                            >
                              <ChevronRight className="h-3 w-3" />
                            </Button>
                          </div>
                        )}
                      </div>

                      <div
                        ref={pdfContainerRef}
                        className="relative rounded-lg border border-gray-200 overflow-hidden bg-gray-100 cursor-crosshair"
                        onClick={handlePdfClick}
                      >
                        <Document
                          file={pdfUrl}
                          onLoadSuccess={handlePdfLoadSuccess}
                          loading={
                            <div className="flex items-center justify-center h-64">
                              <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary-500 border-t-transparent" />
                            </div>
                          }
                          error={
                            <div className="flex items-center justify-center h-64 text-red-500 text-sm">
                              Failed to load PDF
                            </div>
                          }
                        >
                          <Page
                            pageNumber={currentPage}
                            width={480}
                            renderTextLayer={false}
                            renderAnnotationLayer={false}
                          />
                        </Document>
                        {renderFieldOverlays()}
                      </div>

                      {/* Field list for placement */}
                      <div className="space-y-1">
                        <p className="text-xs font-medium text-gray-600">
                          Map form fields to PDF positions:
                        </p>
                        <div className="max-h-40 overflow-y-auto space-y-1">
                          {dataFields.map((field) => {
                            const mapped = config.fieldMappings.find(
                              (m) => m.fieldId === field.id,
                            );
                            return (
                              <div
                                key={field.id}
                                className={cn(
                                  'flex items-center justify-between rounded px-2 py-1.5 text-xs',
                                  mapped
                                    ? 'bg-green-50 border border-green-200'
                                    : 'bg-gray-50 border border-gray-200',
                                  selectedMappingId === field.id &&
                                    'ring-2 ring-blue-400',
                                )}
                              >
                                <span className="truncate font-medium text-gray-700">
                                  {field.label}
                                </span>
                                <div className="flex items-center gap-1 flex-shrink-0">
                                  {mapped ? (
                                    <>
                                      <span className="text-green-600 text-[10px]">
                                        p{mapped.page}
                                      </span>
                                      <Button
                                        variant="ghost"
                                        size="sm"
                                        className="h-5 w-5 p-0 text-gray-400 hover:text-blue-500"
                                        onClick={() => addFieldMapping(field.id)}
                                        title="Reposition"
                                      >
                                        <GripVertical className="h-3 w-3" />
                                      </Button>
                                      <Button
                                        variant="ghost"
                                        size="sm"
                                        className="h-5 w-5 p-0 text-gray-400 hover:text-red-500"
                                        onClick={() => removeFieldMapping(field.id)}
                                        title="Remove"
                                      >
                                        <X className="h-3 w-3" />
                                      </Button>
                                    </>
                                  ) : (
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      className="h-5 px-1 text-xs text-primary-600 hover:text-primary-700"
                                      onClick={() => addFieldMapping(field.id)}
                                    >
                                      <Plus className="h-3 w-3 mr-0.5" />
                                      Place
                                    </Button>
                                  )}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>

                      {/* Selected mapping properties */}
                      {selectedMappingId && (
                        <FieldMappingEditor
                          mapping={config.fieldMappings.find(
                            (m) => m.fieldId === selectedMappingId,
                          )}
                          field={fields.find((f) => f.id === selectedMappingId)}
                          onChange={(updates) =>
                            updateFieldMapping(selectedMappingId, updates)
                          }
                        />
                      )}
                    </div>
                  )}
                </div>
              )}

              {uploading && (
                <div className="flex items-center gap-2 text-sm text-gray-500">
                  <div className="h-4 w-4 animate-spin rounded-full border-2 border-primary-500 border-t-transparent" />
                  Uploading...
                </div>
              )}
            </div>
          )}

          {/* Markdown Template */}
          {config.type === 'markdown' && (
            <div className="space-y-3">
              <div>
                <Label className="text-xs text-gray-600">
                  Available fields (click to insert):
                </Label>
                <div className="flex flex-wrap gap-1 mt-1">
                  {dataFields.map((field) => (
                    <button
                      key={field.id}
                      type="button"
                      className="inline-flex items-center rounded bg-primary-50 border border-primary-200 px-1.5 py-0.5 text-[10px] font-medium text-primary-700 hover:bg-primary-100 transition-colors"
                      onClick={() => insertFieldPlaceholder(field.label)}
                      title={`Insert {{${field.label}}}`}
                    >
                      {field.label}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <Label htmlFor="md-editor" className="text-xs text-gray-600">
                  Markdown Content
                </Label>
                <textarea
                  id="md-editor"
                  value={config.markdownContent ?? ''}
                  onChange={(e) => update({ markdownContent: e.target.value })}
                  className="mt-1 w-full rounded-lg border border-gray-300 bg-white p-3 text-sm font-mono focus:border-primary-400 focus:ring-1 focus:ring-primary-400 outline-none resize-y"
                  rows={16}
                  placeholder={`# Invoice for {{Name}}

**Date:** {{Date}}
**Email:** {{Email}}

## Details

Thank you for your submission, {{Name}}.

Your response has been recorded.

---

*Generated by CloudyForms*`}
                />
                <p className="text-[10px] text-gray-400 mt-1">
                  Use {'{{Field Label}}'} to insert field values. Supports
                  Markdown formatting.
                </p>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

// Sub-component for editing individual field mapping properties
function FieldMappingEditor({
  mapping,
  field,
  onChange,
}: {
  mapping?: FieldMapping;
  field?: FormField;
  onChange: (updates: Partial<FieldMapping>) => void;
}) {
  if (!mapping || !field) return null;

  return (
    <div className="rounded-lg border border-blue-200 bg-blue-50 p-2 space-y-2">
      <p className="text-xs font-medium text-blue-800">
        {field.label} — Position Settings
      </p>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <Label className="text-[10px] text-blue-600">X Position</Label>
          <Input
            type="number"
            value={Math.round(mapping.x)}
            onChange={(e) => onChange({ x: Number(e.target.value) })}
            className="h-6 text-xs"
          />
        </div>
        <div>
          <Label className="text-[10px] text-blue-600">Y Position</Label>
          <Input
            type="number"
            value={Math.round(mapping.y)}
            onChange={(e) => onChange({ y: Number(e.target.value) })}
            className="h-6 text-xs"
          />
        </div>
        <div>
          <Label className="text-[10px] text-blue-600">Width</Label>
          <Input
            type="number"
            value={Math.round(mapping.width)}
            onChange={(e) => onChange({ width: Number(e.target.value) })}
            className="h-6 text-xs"
          />
        </div>
        <div>
          <Label className="text-[10px] text-blue-600">Font Size</Label>
          <Input
            type="number"
            value={mapping.fontSize ?? 12}
            onChange={(e) => onChange({ fontSize: Number(e.target.value) })}
            className="h-6 text-xs"
          />
        </div>
      </div>
      <div>
        <Label className="text-[10px] text-blue-600">
          PDF Form Field Name (for fillable PDFs)
        </Label>
        <Input
          type="text"
          value={mapping.pdfFieldName ?? ''}
          onChange={(e) => onChange({ pdfFieldName: e.target.value || undefined })}
          className="h-6 text-xs"
          placeholder="Leave empty for text overlay"
        />
      </div>
      <div>
        <Label className="text-[10px] text-blue-600">Font Color</Label>
        <div className="flex gap-1 items-center">
          <input
            type="color"
            value={mapping.fontColor ?? '#000000'}
            onChange={(e) => onChange({ fontColor: e.target.value })}
            className="h-6 w-8 rounded border border-gray-300 cursor-pointer"
          />
          <span className="text-[10px] text-gray-500">{mapping.fontColor ?? '#000000'}</span>
        </div>
      </div>
    </div>
  );
}
