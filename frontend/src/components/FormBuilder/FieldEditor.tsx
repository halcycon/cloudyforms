import { useState, useEffect } from 'react';
import type { FormField, OptionList, WorkflowStage, OrgGroup, FieldPermission } from '@/lib/types';
import { optionLists as optionListsApi, workflow as workflowApi, orgs as orgsApi } from '@/lib/api';
import { useStore } from '@/lib/store';
import { parseJsonOptions, detectJsonFields, optionsToJson } from '@/lib/utils';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { Checkbox } from '@/components/ui/checkbox';
import { Plus, Trash2, FileJson, Star, EyeOff, Lock, Briefcase, Shield } from 'lucide-react';

interface FieldEditorProps {
  field: FormField;
  allFields: FormField[];
  onChange: (updates: Partial<FormField>) => void;
  formId?: string;
  orgId?: string;
  workflowEnabled?: boolean;
}

export function FieldEditor({ field, allFields, onChange, formId, orgId, workflowEnabled }: FieldEditorProps) {
  const [newOptionLabel, setNewOptionLabel] = useState('');
  const [newOptionValue, setNewOptionValue] = useState('');
  const { currentOrg } = useStore();
  const [availableLists, setAvailableLists] = useState<OptionList[]>([]);
  const [showJsonPaste, setShowJsonPaste] = useState(false);
  const [jsonText, setJsonText] = useState('');
  const [jsonError, setJsonError] = useState<string | null>(null);
  const [detectedFields, setDetectedFields] = useState<string[] | null>(null);
  const [labelField, setLabelField] = useState('');
  const [valueField, setValueField] = useState('');
  const [workflowStages, setWorkflowStages] = useState<WorkflowStage[]>([]);
  const [orgGroups, setOrgGroups] = useState<OrgGroup[]>([]);

  useEffect(() => {
    if (!currentOrg?.id) return;
    optionListsApi.list(currentOrg.id).then(setAvailableLists).catch(() => {});
  }, [currentOrg?.id]);

  useEffect(() => {
    const resolvedOrgId = orgId ?? currentOrg?.id;
    if (formId && workflowEnabled) {
      workflowApi.listStages(formId).then(setWorkflowStages).catch(() => {});
    }
    if (resolvedOrgId) {
      orgsApi.listGroups(resolvedOrgId).then(setOrgGroups).catch(() => {});
    }
  }, [formId, orgId, currentOrg?.id, workflowEnabled]);

  function addOption() {
    if (!newOptionLabel.trim()) return;
    const label = newOptionLabel.trim();
    const value = newOptionValue.trim() || label.toLowerCase().replace(/\s+/g, '_');
    onChange({ options: [...(field.options ?? []), { label, value }] });
    setNewOptionLabel('');
    setNewOptionValue('');
  }

  function removeOption(index: number) {
    onChange({ options: field.options?.filter((_, i) => i !== index) });
  }

  function updateOption(index: number, key: 'label' | 'value', val: string) {
    const opts = [...(field.options ?? [])];
    opts[index] = { ...opts[index], [key]: val };
    onChange({ options: opts });
  }

  function toggleDefault(index: number) {
    const opts = (field.options ?? []).map((opt, i) => {
      if (i === index) {
        return opt.default ? { label: opt.label, value: opt.value } : { ...opt, default: true as const };
      }
      // Remove default from all others
      const { default: _, ...rest } = opt;
      return rest;
    });
    onChange({ options: opts });
  }

  function openJsonPaste() {
    // Pre-populate with existing options
    if (field.options && field.options.length > 0) {
      setJsonText(optionsToJson(field.options));
    } else {
      setJsonText('');
    }
    setDetectedFields(null);
    setLabelField('');
    setValueField('');
    setJsonError(null);
    setShowJsonPaste(true);
  }

  function handleJsonChange(text: string) {
    setJsonText(text);
    setJsonError(null);
    // Detect fields for mapping
    const fields = detectJsonFields(text);
    setDetectedFields(fields);
    if (fields && fields.length >= 2) {
      setLabelField((prev) => (prev && fields.includes(prev) ? prev : fields[0]));
      setValueField((prev) => (prev && fields.includes(prev) ? prev : fields[1]));
    }
  }

  function handleImportJson() {
    try {
      const mapping = detectedFields ? { label: labelField, value: valueField } : undefined;
      const imported = parseJsonOptions(jsonText, mapping?.label, mapping?.value);
      if (imported.length === 0) {
        setJsonError('No valid options found in JSON');
        return;
      }
      onChange({ options: imported });
      setJsonText('');
      setJsonError(null);
      setDetectedFields(null);
      setShowJsonPaste(false);
    } catch {
      setJsonError('Invalid JSON. Expected an array of strings, array of {label, value} objects, or key→value object.');
    }
  }

  const hasOptions = ['select', 'multiselect', 'radio', 'checkbox'].includes(field.type);
  const hasPlaceholder = !['heading', 'paragraph', 'divider', 'rating', 'scale', 'checkbox', 'file', 'signature', 'hidden'].includes(field.type);
  const hasContent = field.type === 'heading' || field.type === 'paragraph';
  const isLayout = ['heading', 'paragraph', 'divider'].includes(field.type);
  const isHidden = field.type === 'hidden';

  return (
    <div className="h-full overflow-y-auto border-l border-gray-200 bg-white">
      <div className="p-4 space-y-5">
        <div>
          <h3 className="text-sm font-semibold text-gray-900 mb-1">
            {field.type.charAt(0).toUpperCase() + field.type.slice(1)} Field
          </h3>
          <p className="text-xs text-gray-400 font-mono">{field.id.slice(0, 8)}...</p>
        </div>

        <Separator />

        {/* Label */}
        <div className="space-y-1.5">
          <Label>Label</Label>
          <Input
            value={field.label}
            onChange={(e) => onChange({ label: e.target.value })}
            placeholder="Field label"
          />
        </div>

        {/* Field Name */}
        {!isLayout && (
          <div className="space-y-1.5">
            <Label>Field Name</Label>
            <Input
              value={field.name ?? ''}
              onChange={(e) => onChange({ name: e.target.value || undefined })}
              placeholder={field.id}
            />
            <p className="text-[10px] text-gray-400">
              Identifier used in API responses &amp; exports. Leave blank to use auto-generated ID.
            </p>
          </div>
        )}

        {/* Content (heading/paragraph) */}
        {hasContent && (
          <div className="space-y-1.5">
            <Label>Content</Label>
            <Textarea
              value={field.content ?? ''}
              onChange={(e) => onChange({ content: e.target.value })}
              placeholder={field.type === 'heading' ? 'Heading text' : 'Paragraph text'}
              rows={3}
            />
          </div>
        )}

        {/* Heading level */}
        {field.type === 'heading' && (
          <div className="space-y-1.5">
            <Label>Heading Level</Label>
            <Select
              value={String(field.level ?? 2)}
              onValueChange={(v) => onChange({ level: Number(v) as 1 | 2 | 3 })}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="1">H1 - Large</SelectItem>
                <SelectItem value="2">H2 - Medium</SelectItem>
                <SelectItem value="3">H3 - Small</SelectItem>
              </SelectContent>
            </Select>
          </div>
        )}

        {/* Placeholder */}
        {hasPlaceholder && (
          <div className="space-y-1.5">
            <Label>Placeholder</Label>
            <Input
              value={field.placeholder ?? ''}
              onChange={(e) => onChange({ placeholder: e.target.value })}
              placeholder="Placeholder text"
            />
          </div>
        )}

        {/* Description */}
        {!isLayout && (
          <div className="space-y-1.5">
            <Label>Description</Label>
            <Input
              value={field.description ?? ''}
              onChange={(e) => onChange({ description: e.target.value })}
              placeholder="Help text for this field"
            />
          </div>
        )}

        {/* Required toggle */}
        {!isLayout && !isHidden && (
          <div className="flex items-center justify-between">
            <Label>Required</Label>
            <Switch
              checked={field.required}
              onCheckedChange={(v) => onChange({ required: v })}
            />
          </div>
        )}

        {/* Read-only toggle */}
        {!isLayout && !isHidden && (
          <div className="flex items-center justify-between">
            <div>
              <div className="flex items-center gap-1.5">
                <Lock className="h-3.5 w-3.5 text-gray-500" />
                <Label>Read only</Label>
              </div>
              <p className="text-[10px] text-gray-400">Display value but prevent editing</p>
            </div>
            <Switch
              checked={field.readOnly ?? false}
              onCheckedChange={(v) => onChange({ readOnly: v })}
            />
          </div>
        )}

        {/* Office use only toggle */}
        {!isLayout && (
          <div className="flex items-center justify-between">
            <div>
              <div className="flex items-center gap-1.5">
                <Briefcase className="h-3.5 w-3.5 text-gray-500" />
                <Label>Office use only</Label>
              </div>
              <p className="text-[10px] text-gray-400">Hidden from public form, only visible to editors</p>
            </div>
            <Switch
              checked={field.officeUse ?? false}
              onCheckedChange={(v) => onChange({ officeUse: v })}
            />
          </div>
        )}

        {/* Field Permissions */}
        {!isLayout && (field.officeUse || (workflowEnabled && workflowStages.length > 0)) && (
          <>
            <Separator />
            <div className="space-y-3">
              <div className="flex items-center gap-1.5">
                <Shield className="h-4 w-4 text-gray-500" />
                <Label className="text-sm font-semibold">Field Permissions</Label>
              </div>
              <p className="text-[10px] text-gray-400">
                {field.officeUse
                  ? 'Control which roles or groups can edit this field.'
                  : 'Control when this field becomes editable.'}
              </p>

              {/* Allowed roles — only for office-use fields */}
              {field.officeUse && (
                <div className="space-y-1.5">
                  <Label className="text-xs text-gray-500">Allowed Roles</Label>
                  <p className="text-[10px] text-gray-400">Leave unchecked for all roles.</p>
                  <div className="space-y-1">
                    {(['owner', 'admin', 'editor', 'creator', 'viewer'] as const).map((role) => (
                      <div key={role} className="flex items-center gap-2">
                        <Checkbox
                          id={`perm-role-${field.id}-${role}`}
                          checked={field.fieldPermission?.allowedRoles?.includes(role) ?? false}
                          onCheckedChange={(checked) => {
                            const perm: FieldPermission = { ...field.fieldPermission };
                            const current = perm.allowedRoles ?? [];
                            if (checked) {
                              perm.allowedRoles = [...current, role];
                            } else {
                              perm.allowedRoles = current.filter((r) => r !== role);
                            }
                            if (perm.allowedRoles.length === 0) perm.allowedRoles = undefined;
                            onChange({ fieldPermission: perm });
                          }}
                        />
                        <Label htmlFor={`perm-role-${field.id}-${role}`} className="text-xs capitalize cursor-pointer">
                          {role}
                        </Label>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Allowed groups — only for office-use fields */}
              {field.officeUse && orgGroups.length > 0 && (
                <div className="space-y-1.5">
                  <Label className="text-xs text-gray-500">Allowed Groups</Label>
                  <p className="text-[10px] text-gray-400">Leave unchecked for all groups.</p>
                  <div className="space-y-1">
                    {orgGroups.map((g) => (
                      <div key={g.id} className="flex items-center gap-2">
                        <Checkbox
                          id={`perm-group-${field.id}-${g.id}`}
                          checked={field.fieldPermission?.allowedGroups?.includes(g.id) ?? false}
                          onCheckedChange={(checked) => {
                            const perm: FieldPermission = { ...field.fieldPermission };
                            const current = perm.allowedGroups ?? [];
                            if (checked) {
                              perm.allowedGroups = [...current, g.id];
                            } else {
                              perm.allowedGroups = current.filter((id) => id !== g.id);
                            }
                            if (perm.allowedGroups.length === 0) perm.allowedGroups = undefined;
                            onChange({ fieldPermission: perm });
                          }}
                        />
                        <Label htmlFor={`perm-group-${field.id}-${g.id}`} className="text-xs cursor-pointer">
                          {g.name}
                        </Label>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Workflow stage */}
              {workflowEnabled && workflowStages.length > 0 && (
                <div className="space-y-1.5">
                  <Label className="text-xs text-gray-500">Editable at Stage</Label>
                  <Select
                    value={field.fieldPermission?.editableAtStage ?? '_always'}
                    onValueChange={(v) => {
                      const perm: FieldPermission = { ...field.fieldPermission };
                      perm.editableAtStage = v === '_always' ? undefined : v;
                      onChange({ fieldPermission: perm });
                    }}
                  >
                    <SelectTrigger className="h-8 text-xs">
                      <SelectValue placeholder="Always editable" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="_always">Always Editable</SelectItem>
                      {workflowStages.map((s) => (
                        <SelectItem key={s.id} value={s.id}>
                          Stage {s.stageOrder}: {s.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-[10px] text-gray-400">
                    This field will only be editable when the response is at this stage.
                  </p>
                </div>
              )}
            </div>
          </>
        )}

        {/* Default value for read-only fields */}
        {field.readOnly && !isHidden && !hasOptions && !['rating', 'scale', 'file', 'signature'].includes(field.type) && (
          <div className="space-y-1.5">
            <Label className="text-xs text-gray-500">Default Value</Label>
            <Input
              value={field.defaultValue ?? ''}
              onChange={(e) => onChange({ defaultValue: e.target.value })}
              placeholder="Value shown to user"
            />
            <p className="text-[10px] text-gray-400">
              The pre-filled value displayed in read-only mode.
            </p>
          </div>
        )}

        {/* Hidden field settings */}
        {isHidden && (
          <>
            <Separator />
            <div className="space-y-3">
              <div className="flex items-center gap-1.5">
                <EyeOff className="h-4 w-4 text-gray-500" />
                <Label>Hidden Field Settings</Label>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs text-gray-500">Default Value</Label>
                <Input
                  value={field.defaultValue ?? ''}
                  onChange={(e) => onChange({ defaultValue: e.target.value })}
                  placeholder="Static value for this field"
                />
                <p className="text-[10px] text-gray-400">
                  A fixed value included in every submission.
                </p>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs text-gray-500">Formula</Label>
                <Textarea
                  value={field.formula ?? ''}
                  onChange={(e) => onChange({ formula: e.target.value })}
                  placeholder={'e.g. {{First Name}} {{Last Name}}'}
                  rows={2}
                  className="text-xs font-mono"
                />
                <p className="text-[10px] text-gray-400">
                  Computed from other fields using {'{{Field Label}}'} placeholders.
                  If set, overrides the default value.
                </p>
              </div>

              <div className="flex items-center justify-between">
                <div>
                  <Label>Visible to user</Label>
                  <p className="text-[10px] text-gray-400">Show as read-only</p>
                </div>
                <Switch
                  checked={field.visibleToUser ?? false}
                  onCheckedChange={(v) => onChange({ visibleToUser: v })}
                />
              </div>
            </div>
          </>
        )}

        {/* Field Width */}
        <div className="space-y-1.5">
          <Label>Width</Label>
          {(() => {
            const presets = [100, 75, 66, 50, 33, 25];
            const currentWidth = field.width ?? 100;
            const isPreset = presets.includes(currentWidth);
            const selectValue = isPreset ? String(currentWidth) : 'custom';
            return (
              <>
                <Select
                  value={selectValue}
                  onValueChange={(v) => {
                    if (v === 'custom') {
                      // Switch to custom mode — pick a non-preset value so the
                      // custom number input becomes visible immediately.
                      if (isPreset) {
                        const custom = currentWidth === 100 ? 50 : currentWidth;
                        // Nudge by 1 so it's no longer a preset and input shows
                        onChange({ width: presets.includes(custom) ? custom + 1 : custom });
                      }
                    } else {
                      onChange({ width: Number(v) });
                    }
                  }}
                >
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="100">Full width (100%)</SelectItem>
                    <SelectItem value="75">Three quarters (75%)</SelectItem>
                    <SelectItem value="66">Two thirds (66%)</SelectItem>
                    <SelectItem value="50">Half (50%)</SelectItem>
                    <SelectItem value="33">One third (33%)</SelectItem>
                    <SelectItem value="25">Quarter (25%)</SelectItem>
                    <SelectItem value="custom">Custom{!isPreset ? ` (${currentWidth}%)` : ''}</SelectItem>
                  </SelectContent>
                </Select>
                {!isPreset && (
                  <div className="flex items-center gap-2">
                    <Input
                      type="number"
                      min={10}
                      max={100}
                      value={currentWidth}
                      onChange={(e) => {
                        const v = Math.max(10, Math.min(100, Number(e.target.value) || 10));
                        onChange({ width: v });
                      }}
                      className="h-7 text-xs flex-1"
                    />
                    <span className="text-xs text-gray-400">%</span>
                  </div>
                )}
              </>
            );
          })()}
          <p className="text-[10px] text-gray-400">
            Set to less than 100% to place fields side-by-side
          </p>
        </div>

        {/* Options */}
        {hasOptions && (
          <>
            <Separator />
            <div className="space-y-2">
              {availableLists.length > 0 && (
                <div className="space-y-1.5">
                  <Label>Use Option List</Label>
                  <Select
                    value={field.optionListId ?? '_none'}
                    onValueChange={(v) => {
                      if (v === '_none') {
                        onChange({ optionListId: undefined });
                      } else {
                        const list = availableLists.find((l) => l.id === v);
                        if (list) {
                          onChange({ optionListId: v, options: list.options });
                        }
                      }
                    }}
                  >
                    <SelectTrigger className="h-8 text-xs">
                      <SelectValue placeholder="None (custom options)" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="_none">None (custom options)</SelectItem>
                      {availableLists.map((list) => (
                        <SelectItem key={list.id} value={list.id}>
                          {list.name} ({list.options.length} options)
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              {field.optionListId ? (
                <p className="text-xs text-gray-400">
                  Published forms will always use the latest options from this list.
                </p>
              ) : (
                <>
                  <div className="flex items-center justify-between">
                    <Label>Options</Label>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-6 text-xs gap-1"
                      onClick={() => showJsonPaste ? setShowJsonPaste(false) : openJsonPaste()}
                    >
                      <FileJson className="h-3.5 w-3.5" />
                      {showJsonPaste ? 'Manual' : 'Paste JSON'}
                    </Button>
                  </div>

                  {showJsonPaste ? (
                    <div className="space-y-2">
                      <Textarea
                        value={jsonText}
                        onChange={(e) => handleJsonChange(e.target.value)}
                        placeholder={'[\n  {"label": "Option A", "value": "a"},\n  {"label": "Option B", "value": "b", "default": true}\n]'}
                        rows={5}
                        className="text-xs font-mono"
                      />
                      {jsonError && <p className="text-xs text-red-500">{jsonError}</p>}

                      {detectedFields && detectedFields.length >= 2 && (
                        <div className="space-y-1.5 p-2 border rounded bg-gray-50">
                          <p className="text-[10px] font-medium text-gray-600">Map JSON fields:</p>
                          <div className="flex gap-2">
                            <div className="flex-1 space-y-0.5">
                              <label className="text-[10px] text-gray-500">Label</label>
                              <select
                                value={labelField}
                                onChange={(e) => setLabelField(e.target.value)}
                                className="w-full h-7 rounded border border-gray-300 text-xs px-1"
                              >
                                {detectedFields.map((f) => (
                                  <option key={f} value={f}>{f}</option>
                                ))}
                              </select>
                            </div>
                            <div className="flex-1 space-y-0.5">
                              <label className="text-[10px] text-gray-500">Value</label>
                              <select
                                value={valueField}
                                onChange={(e) => setValueField(e.target.value)}
                                className="w-full h-7 rounded border border-gray-300 text-xs px-1"
                              >
                                {detectedFields.map((f) => (
                                  <option key={f} value={f}>{f}</option>
                                ))}
                              </select>
                            </div>
                          </div>
                        </div>
                      )}

                      <p className="text-[10px] text-gray-400">
                        Accepts: array of strings, {'{label, value}'} objects, or objects with custom fields.
                        Add {'"default": true'} to set a default option.
                      </p>
                      <Button size="sm" variant="outline" onClick={handleImportJson} className="w-full">
                        Import Options
                      </Button>
                    </div>
                  ) : (
                    <>
                      {field.options?.map((opt, i) => (
                        <div key={i} className="flex items-center gap-1.5">
                          <Input
                            value={opt.label}
                            onChange={(e) => updateOption(i, 'label', e.target.value)}
                            placeholder="Label"
                            className="flex-1 h-7 text-xs"
                          />
                          <Input
                            value={opt.value}
                            onChange={(e) => updateOption(i, 'value', e.target.value)}
                            placeholder="Value"
                            className="flex-1 h-7 text-xs"
                          />
                          <button
                            type="button"
                            onClick={() => toggleDefault(i)}
                            title={opt.default ? 'Remove default' : 'Set as default'}
                            className={`flex-shrink-0 p-0.5 rounded ${opt.default ? 'text-amber-500' : 'text-gray-300 hover:text-amber-400'}`}
                          >
                            <Star className="h-3.5 w-3.5" fill={opt.default ? 'currentColor' : 'none'} />
                          </button>
                          <button
                            type="button"
                            onClick={() => removeOption(i)}
                            className="text-gray-400 hover:text-red-500 flex-shrink-0"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      ))}
                      <div className="flex gap-1.5">
                        <Input
                          value={newOptionLabel}
                          onChange={(e) => setNewOptionLabel(e.target.value)}
                          placeholder="Label"
                          onKeyDown={(e) => e.key === 'Enter' && addOption()}
                          className="flex-1"
                        />
                        <Input
                          value={newOptionValue}
                          onChange={(e) => setNewOptionValue(e.target.value)}
                          placeholder="Value (auto)"
                          onKeyDown={(e) => e.key === 'Enter' && addOption()}
                          className="flex-1"
                        />
                        <Button size="sm" variant="outline" onClick={addOption}>
                          <Plus className="h-4 w-4" />
                        </Button>
                      </div>
                    </>
                  )}
                </>
              )}
            </div>
          </>
        )}

        {/* Rating / Scale settings */}
        {(field.type === 'rating' || field.type === 'scale') && (
          <>
            <Separator />
            <div className="space-y-3">
              <Label>Range</Label>
              <div className="flex items-center gap-2">
                <div className="flex-1 space-y-1">
                  <Label className="text-xs text-gray-500">Min</Label>
                  <Input
                    type="number"
                    value={field.min ?? 1}
                    onChange={(e) => onChange({ min: Number(e.target.value) })}
                  />
                </div>
                <div className="flex-1 space-y-1">
                  <Label className="text-xs text-gray-500">Max</Label>
                  <Input
                    type="number"
                    value={field.max ?? (field.type === 'rating' ? 5 : 10)}
                    onChange={(e) => onChange({ max: Number(e.target.value) })}
                  />
                </div>
                {field.type === 'scale' && (
                  <div className="flex-1 space-y-1">
                    <Label className="text-xs text-gray-500">Step</Label>
                    <Input
                      type="number"
                      value={field.step ?? 1}
                      onChange={(e) => onChange({ step: Number(e.target.value) })}
                    />
                  </div>
                )}
              </div>
            </div>
          </>
        )}

        {/* File upload settings */}
        {field.type === 'file' && (
          <>
            <Separator />
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label>Accepted File Types</Label>
                <Input
                  value={field.accept ?? ''}
                  onChange={(e) => onChange({ accept: e.target.value })}
                  placeholder="e.g. .pdf,.doc,image/*"
                />
              </div>
              <div className="space-y-1.5">
                <Label>Max File Size (MB)</Label>
                <Input
                  type="number"
                  value={field.maxSize ?? ''}
                  onChange={(e) => onChange({ maxSize: e.target.value ? Number(e.target.value) : undefined })}
                  placeholder="e.g. 10"
                />
              </div>
              <div className="flex items-center justify-between">
                <Label>Allow Multiple Files</Label>
                <Switch
                  checked={field.multiple ?? false}
                  onCheckedChange={(v) => onChange({ multiple: v })}
                />
              </div>
            </div>
          </>
        )}

        {/* Validation */}
        {['text', 'textarea', 'email', 'phone'].includes(field.type) && (
          <>
            <Separator />
            <div className="space-y-3">
              <Label>Validation</Label>
              <div className="flex gap-2">
                <div className="flex-1 space-y-1">
                  <Label className="text-xs text-gray-500">Min Length</Label>
                  <Input
                    type="number"
                    value={field.validation?.minLength ?? ''}
                    onChange={(e) =>
                      onChange({
                        validation: {
                          ...field.validation,
                          minLength: e.target.value ? Number(e.target.value) : undefined,
                        },
                      })
                    }
                  />
                </div>
                <div className="flex-1 space-y-1">
                  <Label className="text-xs text-gray-500">Max Length</Label>
                  <Input
                    type="number"
                    value={field.validation?.maxLength ?? ''}
                    onChange={(e) =>
                      onChange({
                        validation: {
                          ...field.validation,
                          maxLength: e.target.value ? Number(e.target.value) : undefined,
                        },
                      })
                    }
                  />
                </div>
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-gray-500">Pattern (regex)</Label>
                <Input
                  value={field.validation?.pattern ?? ''}
                  onChange={(e) =>
                    onChange({
                      validation: {
                        ...field.validation,
                        pattern: e.target.value || undefined,
                      },
                    })
                  }
                  placeholder="e.g. ^[A-Z]+"
                />
              </div>
            </div>
          </>
        )}

        {/* Conditional Logic */}
        {allFields.filter((f) => f.id !== field.id && !['heading', 'paragraph', 'divider'].includes(f.type)).length > 0 && (
          <>
            <Separator />
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label>Conditional Logic</Label>
                {!field.conditionalLogic ? (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() =>
                      onChange({
                        conditionalLogic: {
                          action: 'show',
                          logicType: 'all',
                          conditions: [],
                        },
                      })
                    }
                  >
                    <Plus className="h-3.5 w-3.5" />
                    Add
                  </Button>
                ) : (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => onChange({ conditionalLogic: undefined })}
                    className="text-red-500 hover:text-red-600"
                  >
                    Remove
                  </Button>
                )}
              </div>

              {field.conditionalLogic && (
                <div className="space-y-2 rounded-md bg-gray-50 p-3 text-sm">
                  <div className="flex items-center gap-2">
                    <Select
                      value={field.conditionalLogic.action}
                      onValueChange={(v) =>
                        onChange({
                          conditionalLogic: {
                            ...field.conditionalLogic!,
                            action: v as 'show' | 'hide',
                          },
                        })
                      }
                    >
                      <SelectTrigger className="h-7 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="show">Show</SelectItem>
                        <SelectItem value="hide">Hide</SelectItem>
                      </SelectContent>
                    </Select>
                    <span className="text-xs text-gray-500">this field when</span>
                    <Select
                      value={field.conditionalLogic.logicType}
                      onValueChange={(v) =>
                        onChange({
                          conditionalLogic: {
                            ...field.conditionalLogic!,
                            logicType: v as 'all' | 'any',
                          },
                        })
                      }
                    >
                      <SelectTrigger className="h-7 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">ALL</SelectItem>
                        <SelectItem value="any">ANY</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  {field.conditionalLogic.conditions.map((cond, i) => (
                    <div key={i} className="flex items-center gap-1.5 flex-wrap">
                      <Select
                        value={cond.fieldId}
                        onValueChange={(v) => {
                          const conditions = [...field.conditionalLogic!.conditions];
                          conditions[i] = { ...cond, fieldId: v };
                          onChange({ conditionalLogic: { ...field.conditionalLogic!, conditions } });
                        }}
                      >
                        <SelectTrigger className="h-7 text-xs flex-1 min-w-[80px]">
                          <SelectValue placeholder="Field" />
                        </SelectTrigger>
                        <SelectContent>
                          {allFields
                            .filter((f) => f.id !== field.id && !['heading', 'paragraph', 'divider'].includes(f.type))
                            .map((f) => (
                              <SelectItem key={f.id} value={f.id}>{f.label}</SelectItem>
                            ))}
                        </SelectContent>
                      </Select>
                      <Select
                        value={cond.operator}
                        onValueChange={(v) => {
                          const conditions = [...field.conditionalLogic!.conditions];
                          conditions[i] = { ...cond, operator: v as typeof cond.operator };
                          onChange({ conditionalLogic: { ...field.conditionalLogic!, conditions } });
                        }}
                      >
                        <SelectTrigger className="h-7 text-xs w-[90px]">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="equals">equals</SelectItem>
                          <SelectItem value="not_equals">≠</SelectItem>
                          <SelectItem value="contains">contains</SelectItem>
                          <SelectItem value="not_contains">not contains</SelectItem>
                          <SelectItem value="greater_than">&gt;</SelectItem>
                          <SelectItem value="less_than">&lt;</SelectItem>
                        </SelectContent>
                      </Select>
                      <Input
                        className="h-7 text-xs flex-1 min-w-[60px]"
                        value={cond.value}
                        onChange={(e) => {
                          const conditions = [...field.conditionalLogic!.conditions];
                          conditions[i] = { ...cond, value: e.target.value };
                          onChange({ conditionalLogic: { ...field.conditionalLogic!, conditions } });
                        }}
                        placeholder="Value"
                      />
                      <button
                        type="button"
                        onClick={() => {
                          const conditions = field.conditionalLogic!.conditions.filter((_, ci) => ci !== i);
                          onChange({ conditionalLogic: { ...field.conditionalLogic!, conditions } });
                        }}
                        className="text-gray-400 hover:text-red-500"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ))}

                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 text-xs"
                    onClick={() => {
                      const otherField = allFields.find(
                        (f) => f.id !== field.id && !['heading', 'paragraph', 'divider'].includes(f.type),
                      );
                      if (!otherField) return;
                      onChange({
                        conditionalLogic: {
                          ...field.conditionalLogic!,
                          conditions: [
                            ...field.conditionalLogic!.conditions,
                            { fieldId: otherField.id, operator: 'equals', value: '' },
                          ],
                        },
                      });
                    }}
                  >
                    <Plus className="h-3 w-3" /> Add Condition
                  </Button>
                </div>
              )}
            </div>
          </>
        )}
        {/* Conditional Group (show/hide a set of fields together) */}
        <>
          <Separator />
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label className="text-sm">Conditional Group</Label>
              <Switch
                checked={!!field.conditionalGroup}
                onCheckedChange={(checked) => {
                  if (checked) {
                    onChange({
                      conditionalGroup: {
                        isGroupStart: true,
                        groupId: `cg_${crypto.randomUUID().slice(0, 8)}`,
                      },
                    });
                  } else {
                    onChange({ conditionalGroup: undefined });
                  }
                }}
              />
            </div>
            <p className="text-xs text-gray-400">
              Group fields together so they can be shown/hidden as a unit.
              Set the conditional on the group start field.
            </p>

            {field.conditionalGroup && (
              <div className="space-y-3 rounded-lg border border-teal-200 bg-teal-50 p-3">
                <div className="space-y-1.5">
                  <Label className="text-xs text-teal-700">Group ID</Label>
                  <Input
                    value={field.conditionalGroup.groupId}
                    onChange={(e) =>
                      onChange({
                        conditionalGroup: {
                          ...field.conditionalGroup!,
                          groupId: e.target.value,
                        },
                      })
                    }
                    className="h-7 text-xs"
                    placeholder="Shared group identifier"
                  />
                  <p className="text-[10px] text-teal-500">
                    Fields sharing this Group ID will show/hide together
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  <Switch
                    checked={field.conditionalGroup.isGroupStart}
                    onCheckedChange={(isGroupStart) =>
                      onChange({
                        conditionalGroup: {
                          ...field.conditionalGroup!,
                          isGroupStart,
                        },
                      })
                    }
                  />
                  <Label className="text-xs text-teal-700">
                    First field in group
                  </Label>
                </div>
                {field.conditionalGroup.isGroupStart && (
                  <p className="text-[10px] text-teal-500">
                    The conditional logic on this field will control visibility of the entire group
                  </p>
                )}
              </div>
            )}
          </div>
        </>

        {/* Repeatable Group */}
        {!isLayout && (
          <>
            <Separator />
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label className="text-sm">Repeatable Group</Label>
                <Switch
                  checked={!!field.repeatableGroup}
                  onCheckedChange={(checked) => {
                    if (checked) {
                      onChange({
                        repeatableGroup: {
                          isGroupStart: true,
                          groupId: `group_${crypto.randomUUID().slice(0, 8)}`,
                          maxRepetitions: 9,
                          minRepetitions: 1,
                        },
                      });
                    } else {
                      onChange({ repeatableGroup: undefined });
                    }
                  }}
                />
              </div>
              <p className="text-xs text-gray-400">
                Allow users to repeat a set of fields (e.g. multiple addresses)
              </p>

              {field.repeatableGroup && (
                <div className="space-y-3 rounded-lg border border-indigo-200 bg-indigo-50 p-3">
                  <div className="space-y-1.5">
                    <Label className="text-xs text-indigo-700">Group ID</Label>
                    <Input
                      value={field.repeatableGroup.groupId}
                      onChange={(e) =>
                        onChange({
                          repeatableGroup: {
                            ...field.repeatableGroup!,
                            groupId: e.target.value,
                          },
                        })
                      }
                      className="h-7 text-xs"
                      placeholder="Shared group identifier"
                    />
                    <p className="text-[10px] text-indigo-400">
                      Fields sharing this Group ID will repeat together
                    </p>
                  </div>

                  <div className="flex items-center gap-2">
                    <Switch
                      checked={field.repeatableGroup.isGroupStart}
                      onCheckedChange={(isGroupStart) =>
                        onChange({
                          repeatableGroup: {
                            ...field.repeatableGroup!,
                            isGroupStart,
                          },
                        })
                      }
                    />
                    <Label className="text-xs text-indigo-700">
                      First field in group
                    </Label>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-1.5">
                      <Label className="text-xs text-indigo-700">
                        Max repetitions
                      </Label>
                      <Input
                        type="number"
                        min={1}
                        max={99}
                        value={field.repeatableGroup.maxRepetitions}
                        onChange={(e) =>
                          onChange({
                            repeatableGroup: {
                              ...field.repeatableGroup!,
                              maxRepetitions: Number(e.target.value),
                            },
                          })
                        }
                        className="h-7 text-xs"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs text-indigo-700">
                        Min repetitions
                      </Label>
                      <Input
                        type="number"
                        min={1}
                        max={99}
                        value={field.repeatableGroup.minRepetitions ?? 1}
                        onChange={(e) =>
                          onChange({
                            repeatableGroup: {
                              ...field.repeatableGroup!,
                              minRepetitions: Number(e.target.value),
                            },
                          })
                        }
                        className="h-7 text-xs"
                      />
                    </div>
                  </div>
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
