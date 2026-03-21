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
import type { FormField, DocumentTemplate, FieldMapping, ComputedFieldMapping } from '@/lib/types';
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

/** Matches repeatable group row-variant field IDs, e.g. "address_row_2". */
const ROW_SUFFIX_RE = /_row_\d+$/;

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
  const [detectedPdfFields, setDetectedPdfFields] = useState<string[]>(
    config.detectedPdfFields ?? [],
  );
  /** Local-only map of detected PDF field name → position info (not persisted) */
  const detectedFieldPositions = useRef<
    Record<string, { page: number; x: number; y: number; width: number; height: number }>
  >({});
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

  // Build an expanded list of mappable fields that includes repeatable group
  // row variants (row 2 … maxRepetitions). Row 1 uses the original field;
  // row N entries use a synthetic `{id}_row_{N}` id matching the runtime keys
  // produced by FormRenderer.
  const mappableFields: { id: string; label: string; baseFieldId: string }[] = [];
  {
    const processedGroups = new Set<string>();
    for (const field of dataFields) {
      mappableFields.push({ id: field.id, label: field.label, baseFieldId: field.id });
      if (field.repeatableGroup?.isGroupStart) {
        const gid = field.repeatableGroup.groupId;
        if (!processedGroups.has(gid)) {
          processedGroups.add(gid);
          const max = field.repeatableGroup.maxRepetitions;
          // Collect all fields in this group
          const groupFields = dataFields.filter(
            (f) => f.repeatableGroup?.groupId === gid,
          );
          for (let row = 2; row <= max; row++) {
            for (const gf of groupFields) {
              mappableFields.push({
                id: `${gf.id}_row_${row}`,
                label: `${gf.label} (Row ${row})`,
                baseFieldId: gf.id,
              });
            }
          }
        }
      }
    }
  }

  /** Resolve a (possibly row-suffixed) field ID to the base FormField definition. */
  function findBaseField(fieldId: string): FormField | undefined {
    const direct = fields.find((f) => f.id === fieldId);
    if (direct) return direct;
    const baseId = fieldId.replace(ROW_SUFFIX_RE, '');
    return fields.find((f) => f.id === baseId);
  }

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
    // Detect fillable PDF form fields using pdf.js
    if (pdfUrl) {
      detectPdfFormFields(pdfUrl);
    }
  }

  async function detectPdfFormFields(url: string) {
    try {
      const loadingTask = pdfjs.getDocument(url);
      const pdf = await loadingTask.promise;
      const fieldNames: string[] = [];
      const positions: Record<string, { page: number; x: number; y: number; width: number; height: number }> = {};
      for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const viewport = page.getViewport({ scale: 1 });
        const pageHeight = viewport.height;
        const annotations = await page.getAnnotations();
        for (const annot of annotations) {
          if (annot.fieldName && annot.subtype === 'Widget') {
            fieldNames.push(annot.fieldName);
            // Extract position from annotation rect [x1, y1, x2, y2] (PDF bottom-left origin)
            if (annot.rect) {
              const [x1, y1, x2, y2] = annot.rect;
              positions[annot.fieldName] = {
                page: i,
                x: x1,
                y: pageHeight - y2, // Convert from bottom-left to top-left origin
                width: x2 - x1,
                height: y2 - y1,
              };
            }
          }
        }
      }
      detectedFieldPositions.current = positions;
      if (fieldNames.length > 0) {
        setDetectedPdfFields(fieldNames);
        update({ detectedPdfFields: fieldNames });
        toast.success(`Detected ${fieldNames.length} fillable field(s) in PDF`);
      }
    } catch {
      // Not a fillable PDF or detection failed – that's fine
    }
  }

  /** Return the stable key used to identify a single mapping instance. */
  function mappingKey(m: FieldMapping): string {
    return m.mappingId ?? m.fieldId;
  }

  /** Check whether a field type supports per-option mapping. */
  function hasOptions(field: FormField | undefined): boolean {
    return !!field && (field.type === 'radio' || field.type === 'checkbox') && Array.isArray(field.options) && field.options.length > 0;
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
        mappingKey(m) === selectedMappingId && m.page === currentPage
          ? { ...m, x: Math.max(0, x), y: Math.max(0, y) }
          : m,
      );
      update({ fieldMappings: mappings });
      setSelectedMappingId(null);
      return;
    }
  }

  function addFieldMapping(fieldId: string) {
    // For radio/checkbox fields with options, always allow adding another mapping
    const baseField = findBaseField(fieldId);
    const multiOption = hasOptions(baseField);

    if (!multiOption) {
      // For non-option fields, check if already mapped (existing behaviour)
      const existing = config.fieldMappings.find((m) => m.fieldId === fieldId);
      if (existing) {
        setSelectedMappingId(mappingKey(existing));
        setCurrentPage(existing.page);
        toast('Click on the PDF to reposition this field', { icon: '👆' });
        return;
      }
    }

    const newMappingId = `${fieldId}_${crypto.randomUUID()}`;
    const newMapping: FieldMapping = {
      fieldId,
      mappingId: newMappingId,
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

    setSelectedMappingId(newMappingId);
    toast('Click on the PDF to position this field', { icon: '👆' });
  }

  function removeFieldMapping(key: string) {
    update({
      fieldMappings: config.fieldMappings.filter((m) => mappingKey(m) !== key),
    });
    if (selectedMappingId === key) setSelectedMappingId(null);
  }

  function updateFieldMapping(key: string, updates: Partial<FieldMapping>) {
    update({
      fieldMappings: config.fieldMappings.map((m) =>
        mappingKey(m) === key ? { ...m, ...updates } : m,
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
        const baseField = findBaseField(mapping.fieldId);
        if (!baseField) return null;
        const mKey = mappingKey(mapping);
        let displayLabel =
          mappableFields.find((mf) => mf.id === mapping.fieldId)?.label ??
          baseField.label;
        // Append option value to label for multi-option mappings
        if (mapping.optionValue) {
          const opt = baseField.options?.find((o) => o.value === mapping.optionValue);
          displayLabel += ` [${opt?.label ?? mapping.optionValue}]`;
        }

        return (
          <div
            key={mKey}
            className={cn(
              'absolute border-2 rounded px-1 text-xs flex items-center gap-1 cursor-pointer select-none',
              selectedMappingId === mKey
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
                selectedMappingId === mKey ? null : mKey,
              );
            }}
            title={`${displayLabel} (click to select, then click PDF to reposition)`}
          >
            <GripVertical className="h-3 w-3 flex-shrink-0" />
            <span className="truncate">{displayLabel}</span>
          </div>
        );
      });
  }

  // Render computed mapping position indicators on the PDF
  function renderComputedOverlays() {
    if (!pdfContainerRef.current) return null;
    const canvas = pdfContainerRef.current.querySelector('canvas');
    if (!canvas) return null;
    const computedMappings = config.computedMappings ?? [];
    if (computedMappings.length === 0) return null;

    const canvasRect = canvas.getBoundingClientRect();
    const containerRect = pdfContainerRef.current.getBoundingClientRect();
    const scaleX = canvasRect.width / A4_WIDTH_POINTS;
    const scaleY = canvasRect.height / A4_HEIGHT_POINTS;
    const offsetX = canvasRect.left - containerRect.left;
    const offsetY = canvasRect.top - containerRect.top;

    return computedMappings
      .filter((cm) => {
        // Use detected PDF field position when pdfFieldName is set
        if (cm.pdfFieldName) {
          const pos = detectedFieldPositions.current[cm.pdfFieldName];
          return pos ? pos.page === currentPage : cm.page === currentPage;
        }
        return cm.page === currentPage;
      })
      .map((cm) => {
        // If a PDF field is selected, use its detected position (takes precedence)
        const pdfPos = cm.pdfFieldName
          ? detectedFieldPositions.current[cm.pdfFieldName]
          : undefined;
        const x = pdfPos?.x ?? cm.x;
        const y = pdfPos?.y ?? cm.y;
        const width = pdfPos?.width ?? cm.width;
        const height = pdfPos?.height ?? cm.height;

        return (
          <div
            key={cm.id}
            className="absolute border-2 border-dashed rounded px-1 text-xs flex items-center gap-1 select-none border-teal-400 bg-teal-100/80 text-teal-800"
            style={{
              left: offsetX + x * scaleX,
              top: offsetY + y * scaleY,
              width: width * scaleX,
              height: Math.max(height * scaleY, 18),
              fontSize: 10,
            }}
            title={`${cm.label}${cm.pdfFieldName ? ` → ${cm.pdfFieldName}` : ''}`}
          >
            <Type className="h-3 w-3 flex-shrink-0" />
            <span className="truncate">{cm.label}</span>
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
                        {renderComputedOverlays()}
                      </div>

                      {/* Field list for placement */}
                      <div className="space-y-1">
                        <p className="text-xs font-medium text-gray-600">
                          Map form fields to PDF positions:
                        </p>
                        <div className="max-h-48 overflow-y-auto space-y-1">
                          {mappableFields.map((mf) => {
                            const fieldMappings = config.fieldMappings.filter(
                              (m) => m.fieldId === mf.id,
                            );
                            const hasMappings = fieldMappings.length > 0;
                            const baseField = findBaseField(mf.id);
                            const multiOption = hasOptions(baseField);
                            const isRowVariant = mf.id !== mf.baseFieldId;
                            return (
                              <div key={mf.id}>
                                <div
                                  className={cn(
                                    'flex items-center justify-between rounded px-2 py-1.5 text-xs',
                                    hasMappings
                                      ? 'bg-green-50 border border-green-200'
                                      : 'bg-gray-50 border border-gray-200',
                                    isRowVariant && 'ml-3',
                                  )}
                                >
                                  <span className="truncate font-medium text-gray-700">
                                    {mf.label}
                                  </span>
                                  <div className="flex items-center gap-1 flex-shrink-0">
                                    {hasMappings && !multiOption ? (
                                      <>
                                        <span className="text-green-600 text-[10px]">
                                          p{fieldMappings[0].page}
                                        </span>
                                        <Button
                                          variant="ghost"
                                          size="sm"
                                          className="h-5 w-5 p-0 text-gray-400 hover:text-blue-500"
                                          onClick={() => addFieldMapping(mf.id)}
                                          title="Reposition"
                                        >
                                          <GripVertical className="h-3 w-3" />
                                        </Button>
                                        <Button
                                          variant="ghost"
                                          size="sm"
                                          className="h-5 w-5 p-0 text-gray-400 hover:text-red-500"
                                          onClick={() => removeFieldMapping(mappingKey(fieldMappings[0]))}
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
                                        onClick={() => addFieldMapping(mf.id)}
                                      >
                                        <Plus className="h-3 w-3 mr-0.5" />
                                        {multiOption && hasMappings ? 'Add' : 'Place'}
                                      </Button>
                                    )}
                                  </div>
                                </div>
                                {/* Show individual option mappings for multi-option fields */}
                                {multiOption && fieldMappings.length > 0 && (
                                  <div className="ml-4 mt-0.5 space-y-0.5">
                                    {fieldMappings.map((fm) => {
                                      const fmKey = mappingKey(fm);
                                      const opt = baseField?.options?.find((o) => o.value === fm.optionValue);
                                      const optLabel = fm.optionValue
                                        ? (opt?.label ?? fm.optionValue)
                                        : 'All options (text)';
                                      return (
                                        <div
                                          key={fmKey}
                                          className={cn(
                                            'flex items-center justify-between rounded px-2 py-1 text-[10px]',
                                            selectedMappingId === fmKey
                                              ? 'bg-blue-50 border border-blue-300 ring-1 ring-blue-400'
                                              : 'bg-green-50/50 border border-green-200',
                                          )}
                                        >
                                          <span
                                            className="truncate text-gray-600 cursor-pointer"
                                            onClick={() => {
                                              setSelectedMappingId(fmKey);
                                              setCurrentPage(fm.page);
                                            }}
                                          >
                                            {optLabel}
                                            {fm.optionRenderMode && fm.optionRenderMode !== 'text' && (
                                              <span className="ml-1 text-gray-400">
                                                ({fm.optionRenderMode === 'checkmark' ? '✓' : '✕'})
                                              </span>
                                            )}
                                          </span>
                                          <div className="flex items-center gap-0.5 flex-shrink-0">
                                            <span className="text-green-600">p{fm.page}</span>
                                            <Button
                                              variant="ghost"
                                              size="sm"
                                              className="h-4 w-4 p-0 text-gray-400 hover:text-blue-500"
                                              onClick={() => {
                                                setSelectedMappingId(fmKey);
                                                setCurrentPage(fm.page);
                                                toast('Click on the PDF to reposition', { icon: '👆' });
                                              }}
                                              title="Reposition"
                                            >
                                              <GripVertical className="h-2.5 w-2.5" />
                                            </Button>
                                            <Button
                                              variant="ghost"
                                              size="sm"
                                              className="h-4 w-4 p-0 text-gray-400 hover:text-red-500"
                                              onClick={() => removeFieldMapping(fmKey)}
                                              title="Remove"
                                            >
                                              <X className="h-2.5 w-2.5" />
                                            </Button>
                                          </div>
                                        </div>
                                      );
                                    })}
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      </div>

                      {/* Detected fillable PDF fields */}
                      {detectedPdfFields.length > 0 && (
                        <div className="space-y-1">
                          <p className="text-xs font-medium text-purple-600">
                            Detected fillable PDF fields (click to map):
                          </p>
                          <div className="max-h-32 overflow-y-auto space-y-1">
                            {detectedPdfFields.map((pdfFieldName) => {
                              const alreadyMapped = config.fieldMappings.some(
                                (m) => m.pdfFieldName === pdfFieldName,
                              ) || (config.computedMappings ?? []).some(
                                (m) => m.pdfFieldName === pdfFieldName,
                              );
                              return (
                                <div
                                  key={pdfFieldName}
                                  className={cn(
                                    'flex items-center justify-between rounded px-2 py-1.5 text-xs',
                                    alreadyMapped
                                      ? 'bg-purple-50 border border-purple-200'
                                      : 'bg-gray-50 border border-gray-200',
                                  )}
                                >
                                  <span className="truncate font-mono text-gray-700">
                                    {pdfFieldName}
                                  </span>
                                  {alreadyMapped ? (
                                    <span className="text-purple-600 text-[10px]">Mapped</span>
                                  ) : (
                                    <select
                                      className="h-5 max-w-[180px] text-[10px] rounded border border-gray-300 bg-white px-1"
                                      value=""
                                      onChange={(e) => {
                                        if (!e.target.value) return;
                                        const fieldId = e.target.value;
                                        const existing = config.fieldMappings.find(
                                          (m) => m.fieldId === fieldId,
                                        );
                                        if (existing) {
                                          updateFieldMapping(mappingKey(existing), { pdfFieldName });
                                        } else {
                                          const pos = detectedFieldPositions.current[pdfFieldName];
                                          const newMapping: FieldMapping = {
                                            fieldId,
                                            mappingId: `${fieldId}_${crypto.randomUUID()}`,
                                            page: pos?.page ?? currentPage,
                                            x: pos?.x ?? 50,
                                            y: pos?.y ?? 50,
                                            width: pos?.width ?? 200,
                                            height: pos?.height ?? 20,
                                            fontSize: 12,
                                            fontColor: '#000000',
                                            pdfFieldName,
                                          };
                                          update({
                                            fieldMappings: [
                                              ...config.fieldMappings,
                                              newMapping,
                                            ],
                                          });
                                        }
                                        toast.success(
                                          `Mapped "${pdfFieldName}" to form field`,
                                        );
                                      }}
                                    >
                                      <option value="">Map to field…</option>
                                      {mappableFields.map((mf) => (
                                        <option key={mf.id} value={mf.id} title={mf.label}>
                                          {mf.label}
                                        </option>
                                      ))}
                                    </select>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}

                      {/* Computed / static data mappings */}
                      <ComputedFieldsPanel
                        computedMappings={config.computedMappings ?? []}
                        fields={dataFields}
                        currentPage={currentPage}
                        onChange={(computedMappings) => update({ computedMappings })}
                        detectedPdfFields={detectedPdfFields}
                        detectedFieldPositions={detectedFieldPositions.current}
                      />

                      {/* Selected mapping properties */}
                      {selectedMappingId && (() => {
                        const selMapping = config.fieldMappings.find(
                          (m) => mappingKey(m) === selectedMappingId,
                        );
                        const selField = selMapping ? findBaseField(selMapping.fieldId) : undefined;
                        return (
                          <FieldMappingEditor
                            mapping={selMapping}
                            field={selField}
                            onChange={(updates) =>
                              updateFieldMapping(selectedMappingId, updates)
                            }
                            detectedPdfFields={detectedPdfFields}
                          />
                        );
                      })()}
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
                  {mappableFields.map((mf) => (
                    <button
                      key={mf.id}
                      type="button"
                      className="inline-flex items-center rounded bg-primary-50 border border-primary-200 px-1.5 py-0.5 text-[10px] font-medium text-primary-700 hover:bg-primary-100 transition-colors"
                      onClick={() => insertFieldPlaceholder(mf.label)}
                      title={`Insert {{${mf.label}}}`}
                    >
                      {mf.label}
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
  detectedPdfFields,
}: {
  mapping?: FieldMapping;
  field?: FormField;
  onChange: (updates: Partial<FieldMapping>) => void;
  detectedPdfFields: string[];
}) {
  if (!mapping || !field) return null;

  const isBoolean = field.type === 'checkbox' && (!field.options || field.options.length === 0);
  const isMultiOption =
    (field.type === 'radio' || field.type === 'checkbox') &&
    Array.isArray(field.options) &&
    field.options.length > 0;

  return (
    <div className="rounded-lg border border-blue-200 bg-blue-50 p-2 space-y-2">
      <p className="text-xs font-medium text-blue-800">
        {field.label}
        {mapping.optionValue && (
          <span className="ml-1 font-normal text-blue-600">
            [{field.options?.find((o) => o.value === mapping.optionValue)?.label ?? mapping.optionValue}]
          </span>
        )}
        {' '}— Position Settings
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
        {detectedPdfFields.length > 0 ? (
          <select
            className="h-6 w-full text-xs rounded border border-blue-300 bg-white px-1"
            value={mapping.pdfFieldName ?? ''}
            onChange={(e) => onChange({ pdfFieldName: e.target.value || undefined })}
          >
            <option value="">None (text overlay)</option>
            {detectedPdfFields.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>
        ) : (
          <Input
            type="text"
            value={mapping.pdfFieldName ?? ''}
            onChange={(e) => onChange({ pdfFieldName: e.target.value || undefined })}
            className="h-6 text-xs"
            placeholder="Leave empty for text overlay"
          />
        )}
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

      {/* Shrinkable toggle */}
      <div className="flex items-center justify-between pt-1">
        <div>
          <Label className="text-[10px] text-blue-600">Shrinkable</Label>
          <p className="text-[9px] text-blue-400">
            Shrink width to fit text so the next field shifts left
          </p>
        </div>
        <Switch
          checked={mapping.shrinkable ?? false}
          onCheckedChange={(shrinkable) => onChange({ shrinkable })}
        />
      </div>

      {/* Option mapping for radio/checkbox fields with options */}
      {isMultiOption && (
        <div className="space-y-2 pt-1 border-t border-blue-200">
          <div>
            <Label className="text-[10px] text-blue-600">
              Option to Render
            </Label>
            <p className="text-[9px] text-blue-400">
              Choose which option value this mapping represents
            </p>
            <select
              className="h-6 w-full text-xs rounded border border-blue-300 bg-white px-1 mt-0.5"
              value={mapping.optionValue ?? ''}
              onChange={(e) => {
                const optVal = e.target.value || undefined;
                onChange({
                  optionValue: optVal,
                  // Default to checkmark when an option is selected
                  optionRenderMode: optVal ? (mapping.optionRenderMode ?? 'checkmark') : undefined,
                });
              }}
            >
              <option value="">All options (render as text)</option>
              {(field.options ?? []).map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>

          {mapping.optionValue && (
            <div>
              <Label className="text-[10px] text-blue-600">
                Render Mode
              </Label>
              <p className="text-[9px] text-blue-400">
                How to display when this option is selected
              </p>
              <select
                className="h-6 w-full text-xs rounded border border-blue-300 bg-white px-1 mt-0.5"
                value={mapping.optionRenderMode ?? 'checkmark'}
                onChange={(e) =>
                  onChange({
                    optionRenderMode: e.target.value as FieldMapping['optionRenderMode'],
                  })
                }
              >
                <option value="text">Text (option label)</option>
                <option value="checkmark">Checkmark (✓)</option>
                <option value="cross">Cross (✕)</option>
              </select>
            </div>
          )}
        </div>
      )}

      {/* Boolean display mode (for simple checkbox fields without options) */}
      {isBoolean && (
        <div className="space-y-2 pt-1 border-t border-blue-200">
          <Label className="text-[10px] text-blue-600">
            Boolean Display Mode
          </Label>
          <select
            className="h-6 w-full text-xs rounded border border-blue-300 bg-white px-1"
            value={mapping.booleanDisplay ?? 'text'}
            onChange={(e) =>
              onChange({
                booleanDisplay: e.target.value as FieldMapping['booleanDisplay'],
              })
            }
          >
            <option value="text">Text (Yes/No)</option>
            <option value="checkmark">Checkmark (✓)</option>
            <option value="cross">Cross (✕)</option>
          </select>

          {(mapping.booleanDisplay === 'checkmark' ||
            mapping.booleanDisplay === 'cross') && (
            <div className="space-y-2">
              <div>
                <Label className="text-[10px] text-blue-600">
                  &quot;True&quot; position (page, x, y)
                </Label>
                <div className="grid grid-cols-3 gap-1">
                  <Input
                    type="number"
                    value={mapping.booleanTrueMapping?.page ?? mapping.page}
                    onChange={(e) =>
                      onChange({
                        booleanTrueMapping: {
                          page: Number(e.target.value),
                          x: mapping.booleanTrueMapping?.x ?? mapping.x,
                          y: mapping.booleanTrueMapping?.y ?? mapping.y,
                        },
                      })
                    }
                    className="h-5 text-[10px]"
                    placeholder="Page"
                  />
                  <Input
                    type="number"
                    value={Math.round(
                      mapping.booleanTrueMapping?.x ?? mapping.x,
                    )}
                    onChange={(e) =>
                      onChange({
                        booleanTrueMapping: {
                          page:
                            mapping.booleanTrueMapping?.page ?? mapping.page,
                          x: Number(e.target.value),
                          y: mapping.booleanTrueMapping?.y ?? mapping.y,
                        },
                      })
                    }
                    className="h-5 text-[10px]"
                    placeholder="X"
                  />
                  <Input
                    type="number"
                    value={Math.round(
                      mapping.booleanTrueMapping?.y ?? mapping.y,
                    )}
                    onChange={(e) =>
                      onChange({
                        booleanTrueMapping: {
                          page:
                            mapping.booleanTrueMapping?.page ?? mapping.page,
                          x: mapping.booleanTrueMapping?.x ?? mapping.x,
                          y: Number(e.target.value),
                        },
                      })
                    }
                    className="h-5 text-[10px]"
                    placeholder="Y"
                  />
                </div>
              </div>
              <div>
                <Label className="text-[10px] text-blue-600">
                  &quot;False&quot; position (page, x, y)
                </Label>
                <div className="grid grid-cols-3 gap-1">
                  <Input
                    type="number"
                    value={mapping.booleanFalseMapping?.page ?? mapping.page}
                    onChange={(e) =>
                      onChange({
                        booleanFalseMapping: {
                          page: Number(e.target.value),
                          x: mapping.booleanFalseMapping?.x ?? mapping.x,
                          y: mapping.booleanFalseMapping?.y ?? mapping.y,
                        },
                      })
                    }
                    className="h-5 text-[10px]"
                    placeholder="Page"
                  />
                  <Input
                    type="number"
                    value={Math.round(
                      mapping.booleanFalseMapping?.x ?? mapping.x,
                    )}
                    onChange={(e) =>
                      onChange({
                        booleanFalseMapping: {
                          page:
                            mapping.booleanFalseMapping?.page ?? mapping.page,
                          x: Number(e.target.value),
                          y: mapping.booleanFalseMapping?.y ?? mapping.y,
                        },
                      })
                    }
                    className="h-5 text-[10px]"
                    placeholder="X"
                  />
                  <Input
                    type="number"
                    value={Math.round(
                      mapping.booleanFalseMapping?.y ?? mapping.y,
                    )}
                    onChange={(e) =>
                      onChange({
                        booleanFalseMapping: {
                          page:
                            mapping.booleanFalseMapping?.page ?? mapping.page,
                          x: mapping.booleanFalseMapping?.x ?? mapping.x,
                          y: Number(e.target.value),
                        },
                      })
                    }
                    className="h-5 text-[10px]"
                    placeholder="Y"
                  />
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// Sub-component for managing computed/static data mappings
function ComputedFieldsPanel({
  computedMappings,
  fields,
  currentPage,
  onChange,
  detectedPdfFields,
  detectedFieldPositions,
}: {
  computedMappings: ComputedFieldMapping[];
  fields: FormField[];
  currentPage: number;
  onChange: (mappings: ComputedFieldMapping[]) => void;
  detectedPdfFields: string[];
  detectedFieldPositions: Record<string, { page: number; x: number; y: number; width: number; height: number }>;
}) {
  const [expanded, setExpanded] = useState<string | null>(null);

  function addComputed(type: ComputedFieldMapping['type']) {
    const id = `computed_${Math.random().toString(36).slice(2, 9)}`;
    const labels: Record<string, string> = {
      static: 'Static Text',
      date: "Today's Date",
      calculated: 'Calculated Value',
      conditional: 'Conditional Value',
    };
    const defaultValues: Record<string, string | undefined> = {
      date: 'DD/MM/YYYY',
      static: '',
    };
    const newMapping: ComputedFieldMapping = {
      id,
      label: labels[type] ?? 'Computed',
      type,
      value: defaultValues[type],
      page: currentPage,
      x: 50,
      y: 50,
      width: 200,
      height: 20,
      fontSize: 12,
      fontColor: '#000000',
      conditions: type === 'conditional' ? [] : undefined,
      calculationType: type === 'calculated' ? 'count_non_empty' : undefined,
      calculationFieldIds: type === 'calculated' ? [] : undefined,
      fallback: '',
    };
    onChange([...computedMappings, newMapping]);
    setExpanded(id);
  }

  function updateComputed(
    id: string,
    updates: Partial<ComputedFieldMapping>,
  ) {
    onChange(
      computedMappings.map((m) => (m.id === id ? { ...m, ...updates } : m)),
    );
  }

  function removeComputed(id: string) {
    onChange(computedMappings.filter((m) => m.id !== id));
    if (expanded === id) setExpanded(null);
  }

  return (
    <div className="space-y-1">
      <p className="text-xs font-medium text-gray-600">
        Computed / Static Data:
      </p>
      <div className="flex flex-wrap gap-1">
        <Button
          variant="ghost"
          size="sm"
          className="h-5 px-1.5 text-[10px] text-teal-600 hover:text-teal-700"
          onClick={() => addComputed('static')}
        >
          <Plus className="h-2.5 w-2.5 mr-0.5" />
          Static
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="h-5 px-1.5 text-[10px] text-teal-600 hover:text-teal-700"
          onClick={() => addComputed('date')}
        >
          <Plus className="h-2.5 w-2.5 mr-0.5" />
          Date
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="h-5 px-1.5 text-[10px] text-teal-600 hover:text-teal-700"
          onClick={() => addComputed('calculated')}
        >
          <Plus className="h-2.5 w-2.5 mr-0.5" />
          Calculated
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="h-5 px-1.5 text-[10px] text-teal-600 hover:text-teal-700"
          onClick={() => addComputed('conditional')}
        >
          <Plus className="h-2.5 w-2.5 mr-0.5" />
          Conditional
        </Button>
      </div>

      {computedMappings.map((cm) => (
        <div
          key={cm.id}
          className="rounded border border-teal-200 bg-teal-50 p-1.5 space-y-1"
        >
          <div className="flex items-center justify-between">
            <button
              type="button"
              className="text-[10px] font-medium text-teal-800 truncate text-left"
              onClick={() =>
                setExpanded(expanded === cm.id ? null : cm.id)
              }
            >
              {{ date: '📅', calculated: '🔢', conditional: '❓', static: '📝' }[cm.type] ?? '📝'}{' '}
              {cm.label}
            </button>
            <Button
              variant="ghost"
              size="sm"
              className="h-4 w-4 p-0 text-gray-400 hover:text-red-500"
              onClick={() => removeComputed(cm.id)}
            >
              <X className="h-2.5 w-2.5" />
            </Button>
          </div>

          {expanded === cm.id && (
            <div className="space-y-1.5 pt-1 border-t border-teal-200">
              <div>
                <Label className="text-[10px] text-teal-600">Label</Label>
                <Input
                  value={cm.label}
                  onChange={(e) =>
                    updateComputed(cm.id, { label: e.target.value })
                  }
                  className="h-5 text-[10px]"
                />
              </div>

              {cm.type === 'static' && (
                <div>
                  <Label className="text-[10px] text-teal-600">
                    Static Text
                  </Label>
                  <Input
                    value={cm.value ?? ''}
                    onChange={(e) =>
                      updateComputed(cm.id, { value: e.target.value })
                    }
                    className="h-5 text-[10px]"
                    placeholder="Enter static text…"
                  />
                </div>
              )}

              {cm.type === 'date' && (
                <div>
                  <Label className="text-[10px] text-teal-600">
                    Date Format
                  </Label>
                  <select
                    className="h-5 w-full text-[10px] rounded border border-teal-300 bg-white px-1"
                    value={cm.value ?? 'DD/MM/YYYY'}
                    onChange={(e) =>
                      updateComputed(cm.id, { value: e.target.value })
                    }
                  >
                    <option value="DD/MM/YYYY">DD/MM/YYYY</option>
                    <option value="MM/DD/YYYY">MM/DD/YYYY</option>
                    <option value="YYYY-MM-DD">YYYY-MM-DD</option>
                    <option value="D MMMM YYYY">D MMMM YYYY</option>
                  </select>
                </div>
              )}

              {cm.type === 'calculated' && (
                <>
                  <div>
                    <Label className="text-[10px] text-teal-600">
                      Calculation Type
                    </Label>
                    <select
                      className="h-5 w-full text-[10px] rounded border border-teal-300 bg-white px-1"
                      value={cm.calculationType ?? 'count_non_empty'}
                      onChange={(e) =>
                        updateComputed(cm.id, {
                          calculationType: e.target.value as ComputedFieldMapping['calculationType'],
                        })
                      }
                    >
                      <option value="count_non_empty">
                        Count non-empty fields
                      </option>
                      <option value="sum">Sum of numeric fields</option>
                      <option value="expression">
                        Expression (combine fields)
                      </option>
                    </select>
                  </div>
                  {cm.calculationType === 'expression' ? (
                    <div>
                      <Label className="text-[10px] text-teal-600">
                        Expression template
                      </Label>
                      <div className="flex flex-wrap gap-0.5 mb-1">
                        {fields.map((f) => (
                          <button
                            key={f.id}
                            type="button"
                            className="inline-flex items-center rounded bg-teal-100 border border-teal-300 px-1 py-0 text-[9px] font-medium text-teal-700 hover:bg-teal-200 transition-colors"
                            onClick={() =>
                              updateComputed(cm.id, {
                                value: `${cm.value ?? ''}{{${f.label}}}`,
                              })
                            }
                            title={`Insert {{${f.label}}}`}
                          >
                            {f.label}
                          </button>
                        ))}
                      </div>
                      <Input
                        value={cm.value ?? ''}
                        onChange={(e) =>
                          updateComputed(cm.id, { value: e.target.value })
                        }
                        className="h-5 text-[10px] font-mono"
                        placeholder="e.g. {{First Name}} {{Last Name}}"
                      />
                      <p className="text-[9px] text-teal-500 mt-0.5">
                        Use {'{{Field Label}}'} to insert field values. Text
                        between placeholders is kept as-is.
                      </p>
                    </div>
                  ) : (
                    <div>
                      <Label className="text-[10px] text-teal-600">
                        Fields to include
                      </Label>
                      <div className="max-h-20 overflow-y-auto space-y-0.5">
                        {fields.map((f) => (
                          <label
                            key={f.id}
                            className="flex items-center gap-1 text-[10px]"
                          >
                            <input
                              type="checkbox"
                              checked={
                                cm.calculationFieldIds?.includes(f.id) ?? false
                              }
                              onChange={(e) => {
                                const ids = cm.calculationFieldIds ?? [];
                                updateComputed(cm.id, {
                                  calculationFieldIds: e.target.checked
                                    ? [...ids, f.id]
                                    : ids.filter((i) => i !== f.id),
                                });
                              }}
                              className="h-2.5 w-2.5"
                            />
                            {f.label}
                          </label>
                        ))}
                      </div>
                    </div>
                  )}
                </>
              )}

              {cm.type === 'conditional' && (
                <div className="space-y-1">
                  <Label className="text-[10px] text-teal-600">
                    Conditions
                  </Label>
                  {(cm.conditions ?? []).map((cond, idx) => (
                    <div
                      key={idx}
                      className="grid grid-cols-[1fr_auto_1fr_1fr_auto] gap-0.5 items-center"
                    >
                      <select
                        className="h-5 text-[10px] rounded border border-gray-300 bg-white px-0.5"
                        value={cond.fieldId}
                        onChange={(e) => {
                          const conds = [...(cm.conditions ?? [])];
                          conds[idx] = { ...conds[idx], fieldId: e.target.value };
                          updateComputed(cm.id, { conditions: conds });
                        }}
                      >
                        <option value="">Field…</option>
                        {fields.map((f) => (
                          <option key={f.id} value={f.id}>
                            {f.label}
                          </option>
                        ))}
                      </select>
                      <select
                        className="h-5 text-[10px] rounded border border-gray-300 bg-white px-0.5"
                        value={cond.operator}
                        onChange={(e) => {
                          const conds = [...(cm.conditions ?? [])];
                          conds[idx] = {
                            ...conds[idx],
                            operator: e.target.value as typeof cond.operator,
                          };
                          updateComputed(cm.id, { conditions: conds });
                        }}
                      >
                        <option value="equals">=</option>
                        <option value="not_equals">≠</option>
                        <option value="contains">∋</option>
                        <option value="not_empty">≠∅</option>
                        <option value="empty">∅</option>
                        <option value="greater_than">&gt;</option>
                        <option value="less_than">&lt;</option>
                      </select>
                      <Input
                        value={cond.compareValue}
                        onChange={(e) => {
                          const conds = [...(cm.conditions ?? [])];
                          conds[idx] = {
                            ...conds[idx],
                            compareValue: e.target.value,
                          };
                          updateComputed(cm.id, { conditions: conds });
                        }}
                        className="h-5 text-[10px]"
                        placeholder="Value"
                      />
                      <Input
                        value={cond.output}
                        onChange={(e) => {
                          const conds = [...(cm.conditions ?? [])];
                          conds[idx] = { ...conds[idx], output: e.target.value };
                          updateComputed(cm.id, { conditions: conds });
                        }}
                        className="h-5 text-[10px]"
                        placeholder="Output"
                      />
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-4 w-4 p-0 text-gray-400 hover:text-red-500"
                        onClick={() => {
                          const conds = (cm.conditions ?? []).filter(
                            (_, i) => i !== idx,
                          );
                          updateComputed(cm.id, { conditions: conds });
                        }}
                      >
                        <X className="h-2.5 w-2.5" />
                      </Button>
                    </div>
                  ))}
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-5 text-[10px] text-teal-600"
                    onClick={() =>
                      updateComputed(cm.id, {
                        conditions: [
                          ...(cm.conditions ?? []),
                          {
                            fieldId: '',
                            operator: 'equals',
                            compareValue: '',
                            output: '',
                          },
                        ],
                      })
                    }
                  >
                    <Plus className="h-2.5 w-2.5 mr-0.5" />
                    Add condition
                  </Button>
                  <div>
                    <Label className="text-[10px] text-teal-600">
                      Fallback value
                    </Label>
                    <Input
                      value={cm.fallback ?? ''}
                      onChange={(e) =>
                        updateComputed(cm.id, { fallback: e.target.value })
                      }
                      className="h-5 text-[10px]"
                      placeholder="Value when no conditions match"
                    />
                  </div>
                </div>
              )}

              {/* Position settings */}
              <div className="grid grid-cols-2 gap-1 pt-1 border-t border-teal-200">
                <div>
                  <Label className="text-[10px] text-teal-600">Page</Label>
                  <Input
                    type="number"
                    value={cm.page}
                    onChange={(e) =>
                      updateComputed(cm.id, { page: Number(e.target.value) })
                    }
                    className="h-5 text-[10px]"
                  />
                </div>
                <div>
                  <Label className="text-[10px] text-teal-600">X</Label>
                  <Input
                    type="number"
                    value={Math.round(cm.x)}
                    onChange={(e) =>
                      updateComputed(cm.id, { x: Number(e.target.value) })
                    }
                    className="h-5 text-[10px]"
                  />
                </div>
                <div>
                  <Label className="text-[10px] text-teal-600">Y</Label>
                  <Input
                    type="number"
                    value={Math.round(cm.y)}
                    onChange={(e) =>
                      updateComputed(cm.id, { y: Number(e.target.value) })
                    }
                    className="h-5 text-[10px]"
                  />
                </div>
                <div>
                  <Label className="text-[10px] text-teal-600">Width</Label>
                  <Input
                    type="number"
                    value={Math.round(cm.width)}
                    onChange={(e) =>
                      updateComputed(cm.id, { width: Number(e.target.value) })
                    }
                    className="h-5 text-[10px]"
                  />
                </div>
                <div>
                  <Label className="text-[10px] text-teal-600">
                    Font Size
                  </Label>
                  <Input
                    type="number"
                    value={cm.fontSize ?? 12}
                    onChange={(e) =>
                      updateComputed(cm.id, {
                        fontSize: Number(e.target.value),
                      })
                    }
                    className="h-5 text-[10px]"
                  />
                </div>
                <div>
                  <Label className="text-[10px] text-teal-600">
                    PDF Field Name
                  </Label>
                  {detectedPdfFields.length > 0 ? (
                    <select
                      className="h-5 w-full text-[10px] rounded border border-teal-300 bg-white px-1"
                      value={cm.pdfFieldName ?? ''}
                      onChange={(e) => {
                        const fieldName = e.target.value || undefined;
                        const pos = fieldName
                          ? detectedFieldPositions[fieldName]
                          : undefined;
                        updateComputed(cm.id, {
                          pdfFieldName: fieldName,
                          ...(pos && {
                            page: pos.page,
                            x: pos.x,
                            y: pos.y,
                            width: pos.width,
                            height: pos.height,
                          }),
                        });
                      }}
                    >
                      <option value="">None (text overlay)</option>
                      {detectedPdfFields.map((name) => (
                        <option key={name} value={name}>
                          {name}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <Input
                      value={cm.pdfFieldName ?? ''}
                      onChange={(e) =>
                        updateComputed(cm.id, {
                          pdfFieldName: e.target.value || undefined,
                        })
                      }
                      className="h-5 text-[10px]"
                      placeholder="For fillable PDF"
                    />
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
