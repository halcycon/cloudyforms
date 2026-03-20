import { useState, useEffect, useCallback, useRef } from 'react';
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  type DragStartEvent,
  type DragEndEvent,
  type DragOverEvent,
} from '@dnd-kit/core';
import { arrayMove } from '@dnd-kit/sortable';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { Save, Eye, Globe, ArrowLeft, Settings, Paintbrush, Code2, FileText } from 'lucide-react';
import type { Form, FormField, FieldType, FormSettings, BrandingConfig } from '@/lib/types';
import { forms as formsApi } from '@/lib/api';
import { useStore } from '@/lib/store';
import { cn, generateSlug as _generateSlug } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { FieldPalette } from './FieldPalette';
import { FormCanvas } from './FormCanvas';
import { FieldEditor } from './FieldEditor';
import { FormSettings as FormSettingsPanel } from './FormSettings';
import { BrandingSettings } from './BrandingSettings';
import { FieldPreview } from './FieldPreview';
import { EmbedCode } from './EmbedCode';
import { DocumentTemplateEditor } from './DocumentTemplateEditor';

interface FormBuilderProps {
  formId?: string;
}

const DEFAULT_SETTINGS: FormSettings = {
  submitButtonText: 'Submit',
  successMessage: 'Thank you for your submission!',
  allowMultipleSubmissions: true,
  requireAuth: false,
  sendReceiptEmail: false,
  notificationEmails: [],
  enableTurnstile: false,
  kioskOnly: false,
};

const DEFAULT_BRANDING: BrandingConfig = {
  primaryColor: '#4f46e5',
  backgroundColor: '#f9fafb',
  textColor: '#0f172a',
};

function generateId(): string {
  return `field_${Math.random().toString(36).slice(2, 9)}`;
}

function createField(type: FieldType): FormField {
  const base: FormField = {
    id: generateId(),
    type,
    label: type.charAt(0).toUpperCase() + type.slice(1),
    required: false,
  };

  if (['select', 'multiselect', 'radio'].includes(type)) {
    base.options = [
      { label: 'Option 1', value: 'option_1' },
      { label: 'Option 2', value: 'option_2' },
    ];
  }
  if (type === 'rating') { base.min = 1; base.max = 5; }
  if (type === 'scale') { base.min = 1; base.max = 10; base.step = 1; }
  if (type === 'heading') { base.level = 2; base.content = 'Section Heading'; }
  if (type === 'paragraph') { base.content = 'Add your paragraph text here.'; }

  return base;
}

export function FormBuilder({ formId }: FormBuilderProps) {
  const navigate = useNavigate();
  const { currentOrg } = useStore();

  const [form, setForm] = useState<Partial<Form>>({
    title: 'Untitled Form',
    fields: [],
    settings: DEFAULT_SETTINGS,
    branding: DEFAULT_BRANDING,
  });
  const [selectedFieldId, setSelectedFieldId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'fields' | 'settings' | 'branding' | 'document' | 'embed'>('fields');
  const [dragOverlayField, setDragOverlayField] = useState<FormField | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
  );

  // Load form if editing
  useEffect(() => {
    if (!formId) return;
    setIsLoading(true);
    formsApi.get(formId)
      .then((data) => setForm(data))
      .catch(() => toast.error('Failed to load form'))
      .finally(() => setIsLoading(false));
  }, [formId]);

  const saveForm = useCallback(async (formData: Partial<Form>) => {
    if (!formData.title?.trim()) return;
    setIsSaving(true);
    try {
      if (formId || formData.id) {
        const id = formId ?? formData.id!;
        const updated = await formsApi.update(id, {
          title: formData.title,
          description: formData.description,
          slug: formData.slug,
          fields: formData.fields,
          settings: formData.settings,
          branding: formData.branding,
          documentTemplate: formData.documentTemplate,
        });
        setForm(updated);
      } else {
        if (!currentOrg) {
          toast.error('Please select an organization first');
          return;
        }
        const created = await formsApi.create({
          orgId: currentOrg.id,
          title: formData.title!,
          description: formData.description,
          fields: formData.fields ?? [],
          settings: formData.settings,
          branding: formData.branding,
          documentTemplate: formData.documentTemplate,
        });
        setForm(created);
        navigate(`/forms/${created.id}/edit`, { replace: true });
        toast.success('Form created!');
        return;
      }
      toast.success('Saved', { duration: 1500 });
    } catch {
      toast.error('Failed to save form');
    } finally {
      setIsSaving(false);
    }
  }, [formId, currentOrg, navigate]);

  function scheduleAutoSave(updated: Partial<Form>) {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      if (updated.id ?? formId) saveForm(updated);
    }, 1500);
  }

  function updateForm(updates: Partial<Form>) {
    setForm((prev) => {
      const updated = { ...prev, ...updates };
      scheduleAutoSave(updated);
      return updated;
    });
  }

  function updateFields(fields: FormField[]) {
    updateForm({ fields });
  }

  function addField(type: FieldType, insertIndex?: number) {
    const newField = createField(type);
    setForm((prev) => {
      const fields = [...(prev.fields ?? [])];
      if (insertIndex !== undefined) {
        fields.splice(insertIndex, 0, newField);
      } else {
        fields.push(newField);
      }
      const updated = { ...prev, fields };
      scheduleAutoSave(updated);
      return updated;
    });
    setSelectedFieldId(newField.id);
  }

  function deleteField(id: string) {
    setForm((prev) => {
      const fields = prev.fields?.filter((f) => f.id !== id) ?? [];
      const updated = { ...prev, fields };
      scheduleAutoSave(updated);
      return updated;
    });
    if (selectedFieldId === id) setSelectedFieldId(null);
  }

  function duplicateField(id: string) {
    setForm((prev) => {
      const idx = prev.fields?.findIndex((f) => f.id === id) ?? -1;
      if (idx === -1) return prev;
      const original = prev.fields![idx];
      const copy = { ...original, id: generateId(), label: `${original.label} (copy)` };
      const fields = [...(prev.fields ?? [])];
      fields.splice(idx + 1, 0, copy);
      const updated = { ...prev, fields };
      scheduleAutoSave(updated);
      return updated;
    });
  }

  function updateField(id: string, updates: Partial<FormField>) {
    setForm((prev) => {
      const fields = prev.fields?.map((f) => f.id === id ? { ...f, ...updates } : f) ?? [];
      const updated = { ...prev, fields };
      scheduleAutoSave(updated);
      return updated;
    });
  }

  function handleDragStart(event: DragStartEvent) {
    const { data } = event.active;
    if (data.current?.type === 'palette') {
      setDragOverlayField(createField(data.current.fieldType as FieldType));
    } else if (data.current?.type === 'canvas-field') {
      setDragOverlayField(data.current.field as FormField);
    }
  }

  function handleDragOver(_event: DragOverEvent) {
    // hover feedback handled by droppable
  }

  function handleDragEnd(event: DragEndEvent) {
    setDragOverlayField(null);
    const { active, over } = event;
    if (!over) return;

    const activeData = active.data.current;

    if (activeData?.type === 'palette') {
      // Dropping from palette
      const type = activeData.fieldType as FieldType;
      if (over.id === 'form-canvas') {
        addField(type);
      } else {
        // dropped on a specific field -> insert before it
        const idx = form.fields?.findIndex((f) => f.id === over.id) ?? -1;
        addField(type, idx >= 0 ? idx : undefined);
      }
      return;
    }

    if (activeData?.type === 'canvas-field') {
      const oldIndex = form.fields?.findIndex((f) => f.id === active.id) ?? -1;
      const newIndex = form.fields?.findIndex((f) => f.id === over.id) ?? -1;
      if (oldIndex !== -1 && newIndex !== -1 && oldIndex !== newIndex) {
        updateFields(arrayMove(form.fields ?? [], oldIndex, newIndex));
      }
    }
  }

  async function handlePublishToggle() {
    if (!form.id) {
      toast.error('Save the form first');
      return;
    }
    try {
      if (form.status === 'published') {
        const updated = await formsApi.unpublish(form.id);
        setForm(updated);
        toast.success('Form unpublished');
      } else {
        const updated = await formsApi.publish(form.id);
        setForm(updated);
        toast.success('Form published!');
      }
    } catch {
      toast.error('Failed to update status');
    }
  }

  const selectedField = form.fields?.find((f) => f.id === selectedFieldId) ?? null;
  const isPublished = form.status === 'published';

  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary-600 border-t-transparent" />
      </div>
    );
  }

  return (
    <DndContext
      sensors={sensors}
      onDragStart={handleDragStart}
      onDragOver={handleDragOver}
      onDragEnd={handleDragEnd}
    >
      <div className="flex h-screen flex-col bg-gray-100">
        {/* Top bar */}
        <div className="flex h-14 items-center gap-3 border-b border-gray-200 bg-white px-4 shadow-sm">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => navigate('/forms')}
            title="Back to forms"
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>

          <Input
            value={form.title ?? ''}
            onChange={(e) => {
              const title = e.target.value;
              updateForm({ title });
            }}
            className="w-64 border-0 bg-transparent text-base font-semibold shadow-none focus:ring-0 focus:bg-gray-50 rounded-md"
            placeholder="Form title"
          />

          <div className="ml-auto flex items-center gap-2">
            {form.id && (
              <a
                href={`/f/${form.slug}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-900"
              >
                <Eye className="h-4 w-4" />
                Preview
              </a>
            )}

            <Button
              variant="outline"
              size="sm"
              onClick={handlePublishToggle}
              disabled={!form.id}
              className={cn(isPublished && 'text-green-600 border-green-300 hover:bg-green-50')}
            >
              {isPublished ? (
                <>
                  <Globe className="h-4 w-4" />
                  Published
                </>
              ) : (
                <>
                  <Eye className="h-4 w-4" />
                  Publish
                </>
              )}
            </Button>

            <Button
              size="sm"
              loading={isSaving}
              onClick={() => saveForm(form)}
            >
              <Save className="h-4 w-4" />
              Save
            </Button>
          </div>
        </div>

        {/* Builder body */}
        <div className="flex flex-1 overflow-hidden">
          {/* Left: palette + tabs */}
          <div className={cn(
            "flex-shrink-0 flex flex-col border-r border-gray-200 bg-white transition-all",
            activeTab === 'document' ? 'w-[540px]' : 'w-56'
          )}>
            <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as typeof activeTab)} className="flex flex-col h-full">
              <TabsList className="m-2 grid w-auto grid-cols-5">
                <TabsTrigger value="fields" title="Fields">
                  <Settings className="h-3.5 w-3.5" />
                </TabsTrigger>
                <TabsTrigger value="settings" title="Settings">
                  <Settings className="h-3.5 w-3.5" />
                </TabsTrigger>
                <TabsTrigger value="branding" title="Branding">
                  <Paintbrush className="h-3.5 w-3.5" />
                </TabsTrigger>
                <TabsTrigger value="document" title="Document Template">
                  <FileText className="h-3.5 w-3.5" />
                </TabsTrigger>
                <TabsTrigger value="embed" title="Embed" disabled={!form.id}>
                  <Code2 className="h-3.5 w-3.5" />
                </TabsTrigger>
              </TabsList>

              <TabsContent value="fields" className="flex-1 overflow-hidden mt-0">
                <FieldPalette onAddField={addField} />
              </TabsContent>

              <TabsContent value="settings" className="flex-1 overflow-auto mt-0">
                <FormSettingsPanel
                  settings={form.settings ?? DEFAULT_SETTINGS}
                  fields={form.fields ?? []}
                  slug={form.slug}
                  onChange={(settings) => updateForm({ settings })}
                  onSlugChange={(slug) => updateForm({ slug })}
                />
              </TabsContent>

              <TabsContent value="branding" className="flex-1 overflow-auto mt-0">
                <BrandingSettings
                  branding={form.branding ?? DEFAULT_BRANDING}
                  onChange={(branding) => updateForm({ branding })}
                />
              </TabsContent>

              <TabsContent value="document" className="flex-1 overflow-auto mt-0">
                <DocumentTemplateEditor
                  template={form.documentTemplate ?? null}
                  fields={form.fields ?? []}
                  onChange={(documentTemplate) => updateForm({ documentTemplate })}
                />
              </TabsContent>

              <TabsContent value="embed" className="flex-1 overflow-auto mt-0 p-3">
                {form.id && form.slug ? (
                  <EmbedCode formSlug={form.slug} formTitle={form.title} />
                ) : (
                  <div className="flex items-center justify-center h-32 text-center p-4">
                    <p className="text-xs text-gray-400">Save the form first to get embed code.</p>
                  </div>
                )}
              </TabsContent>
            </Tabs>
          </div>

          {/* Center: canvas */}
          <div className="flex flex-1 flex-col overflow-hidden">
            <div className="flex-1 overflow-hidden flex flex-col">
              <div className="bg-gray-100 px-4 py-2 text-xs text-gray-400 border-b border-gray-200">
                {form.fields?.length ?? 0} fields · {form.slug ? `slug: ${form.slug}` : 'not saved yet'}
              </div>
              <FormCanvas
                fields={form.fields ?? []}
                selectedFieldId={selectedFieldId}
                onSelectField={setSelectedFieldId}
                onDeleteField={deleteField}
                onDuplicateField={duplicateField}
                onFieldWidthChange={(id, width) => updateField(id, { width })}
              />
            </div>
          </div>

          {/* Right: field editor */}
          <div className="w-72 flex-shrink-0">
            {selectedField ? (
              <FieldEditor
                field={selectedField}
                allFields={form.fields ?? []}
                onChange={(updates) => updateField(selectedField.id, updates)}
              />
            ) : (
              <div className="flex h-full items-center justify-center p-8 text-center text-gray-400 border-l border-gray-200">
                <div>
                  <Settings className="mx-auto h-8 w-8 mb-2 opacity-30" />
                  <p className="text-sm">Select a field to edit its properties</p>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      <DragOverlay>
        {dragOverlayField && (
          <div className="drag-overlay w-64 rounded-lg border-2 border-primary-400 bg-white p-4 shadow-xl">
            <FieldPreview field={dragOverlayField} />
          </div>
        )}
      </DragOverlay>
    </DndContext>
  );
}
