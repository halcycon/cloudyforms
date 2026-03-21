export type UserRole = 'owner' | 'admin' | 'editor' | 'creator' | 'viewer';
export type FormStatus = 'draft' | 'published' | 'closed';
export type FormAccessType = 'public' | 'unlisted' | 'code' | 'kiosk_only';
export type FieldType =
  | 'text'
  | 'textarea'
  | 'number'
  | 'email'
  | 'phone'
  | 'date'
  | 'select'
  | 'multiselect'
  | 'radio'
  | 'checkbox'
  | 'file'
  | 'rating'
  | 'scale'
  | 'heading'
  | 'paragraph'
  | 'divider'
  | 'signature'
  | 'hidden';

export interface User {
  id: string;
  email: string;
  name: string;
  isSuperAdmin: boolean;
  createdAt: string;
}

export interface Organization {
  id: string;
  name: string;
  slug: string;
  logoUrl?: string;
  primaryColor: string;
  secondaryColor: string;
  customDomain?: string;
  createdAt: string;
}

export interface OrgMember {
  userId: string;
  orgId: string;
  role: UserRole;
  user: User;
}

export interface OrgGroup {
  id: string;
  orgId: string;
  name: string;
  description?: string;
  members?: OrgGroupMember[];
  createdAt: string;
  updatedAt: string;
}

export interface OrgGroupMember {
  userId: string;
  user: User;
  joinedAt: string;
}

export interface WorkflowStage {
  id: string;
  formId: string;
  name: string;
  stageOrder: number;
  allowedRoles: string[];
  allowedGroups: string[];
  allowedUsers: string[];
  notifyOnReady: boolean;
}

export interface FieldPermission {
  /** Roles allowed to edit this field (empty = all roles with form access) */
  allowedRoles?: string[];
  /** Group IDs allowed to edit this field */
  allowedGroups?: string[];
  /** User IDs allowed to edit this field */
  allowedUsers?: string[];
  /** Workflow stage ID when this field becomes editable (null = always editable) */
  editableAtStage?: string;
}

export interface FormField {
  id: string;
  type: FieldType;
  label: string;
  /** Optional user-defined field name for API/export purposes. Defaults to auto-generated id. */
  name?: string;
  placeholder?: string;
  description?: string;
  required: boolean;
  options?: { label: string; value: string; default?: boolean }[];
  validation?: {
    min?: number;
    max?: number;
    pattern?: string;
    minLength?: number;
    maxLength?: number;
  };
  min?: number;
  max?: number;
  step?: number;
  accept?: string;
  multiple?: boolean;
  maxSize?: number;
  content?: string;
  level?: 1 | 2 | 3;
  conditionalLogic?: {
    action: 'show' | 'hide';
    conditions: {
      fieldId: string;
      operator:
        | 'equals'
        | 'not_equals'
        | 'contains'
        | 'not_contains'
        | 'greater_than'
        | 'less_than';
      value: string;
    }[];
    logicType: 'all' | 'any';
  };
  optionListId?: string;
  /** Width of the field as a percentage (10–100). Defaults to 100. */
  width?: number;
  /** Static default value for the field (used by hidden fields) */
  defaultValue?: string;
  /** Expression to compute value from other fields, e.g. "{{First Name}} {{Last Name}}" */
  formula?: string;
  /** When true, hidden fields are shown to the user but cannot be edited */
  visibleToUser?: boolean;
  /** When true, the field is rendered but cannot be edited by the user */
  readOnly?: boolean;
  /** When true, the field is only visible to authenticated users (office/internal use) */
  officeUse?: boolean;
  /** Configuration for conditional field groups (show/hide a set of fields together) */
  conditionalGroup?: {
    /** Unique group identifier shared by all fields in the group */
    groupId: string;
    /** Whether this field is the first (anchor) field in the conditional group.
     *  The group start field's conditionalLogic applies to every field in the group. */
    isGroupStart: boolean;
  };
  /** Configuration for repeatable field groups */
  repeatableGroup?: {
    /** Whether this field is the first (anchor) field in a repeatable group */
    isGroupStart: boolean;
    /** Unique group identifier shared by all fields in the group */
    groupId: string;
    /** Maximum number of repetitions allowed */
    maxRepetitions: number;
    /** Minimum number of repetitions required (defaults to 1) */
    minRepetitions?: number;
  };
  /** Granular permission settings for this field (roles, groups, users, workflow stage) */
  fieldPermission?: FieldPermission;
}

export interface FormSettings {
  submitButtonText: string;
  successMessage: string;
  redirectUrl?: string;
  allowMultipleSubmissions: boolean;
  requireAuth: boolean;
  sendReceiptEmail: boolean;
  receiptEmailField?: string;
  notificationEmails: string[];
  webhookUrl?: string;
  webhookSecret?: string;
  enableTurnstile: boolean;
  maxResponses?: number;
  expiresAt?: string;
  kioskOnly: boolean;
  /** Enable multi-level sign-off workflow for this form */
  workflowEnabled?: boolean;
}

export interface BrandingConfig {
  logoUrl?: string;
  primaryColor?: string;
  backgroundColor?: string;
  textColor?: string;
  fontFamily?: string;
}

export interface Form {
  id: string;
  orgId: string;
  title: string;
  description?: string;
  slug: string;
  status: FormStatus;
  accessType: FormAccessType;
  accessCode?: string;
  fields: FormField[];
  settings: FormSettings;
  branding: BrandingConfig;
  documentTemplate?: DocumentTemplate | null;
  workflowStages?: WorkflowStage[];
  createdAt: string;
  updatedAt: string;
  responseCount?: number;
}

export interface FormResponse {
  id: string;
  formId: string;
  data: Record<string, unknown>;
  metadata: {
    submittedAt: string;
    ip: string;
    fingerprint: string;
    userAgent: string;
  };
  submitterEmail?: string;
  isSpam: boolean;
  /** Workflow status: draft (pre-fill), submitted (awaiting office completion), completed */
  status?: 'draft' | 'submitted' | 'completed';
  /** Unique token for draft/pre-fill access */
  draftToken?: string;
  /** Current workflow stage ID (null = no workflow or completed) */
  currentStage?: string;
  /** User ID who last updated this response */
  updatedBy?: string;
  /** Timestamp of last update */
  updatedAt?: string;
  createdAt: string;
}

/** A response that is awaiting the current user's action in a workflow */
export interface WorkflowTask extends FormResponse {
  formTitle: string;
  formSlug: string;
  stageName: string;
  stageOrder: number;
  totalStages: number;
  allowedRoles: string[];
  allowedGroups: string[];
  allowedUsers: string[];
}

/** Detailed workflow status for a single response */
export interface WorkflowStatusStage {
  id: string;
  name: string;
  stageOrder: number;
  allowedRoles: string[];
  allowedGroups: { id: string; name: string }[];
  allowedUsers: string[];
  isCompleted: boolean;
  isCurrent: boolean;
}

export interface WorkflowStatusResponse {
  responseId: string;
  status: string;
  currentStage: string | null;
  stages: WorkflowStatusStage[];
}

export interface FieldGroup {
  id: string;
  orgId?: string;
  name: string;
  description?: string;
  fields: FormField[];
  createdAt: string;
}

export interface OptionList {
  id: string;
  orgId?: string;
  name: string;
  description?: string;
  options: { label: string; value: string; default?: boolean }[];
  createdAt: string;
  updatedAt: string;
}

export interface Kiosk {
  id: string;
  orgId: string;
  name: string;
  token: string;
  formIds: string[];
  allowMultipleResponses: boolean;
  createdAt: string;
}

export interface DnsInstructions {
  type: string;
  name: string;
  value: string;
}

export interface CustomDomain {
  id: string;
  /** Organisation this domain belongs to */
  orgId: string;
  /** Human-readable org name (returned by admin list endpoint) */
  orgName?: string;
  domain: string;
  verified: boolean;
  verificationToken?: string;
  isPrimary: boolean;
  dnsInstructions?: DnsInstructions;
  createdAt: string;
}

export type BooleanDisplayMode = 'text' | 'checkmark' | 'cross';

export interface FieldMapping {
  fieldId: string;
  page: number;
  x: number;
  y: number;
  width: number;
  height: number;
  fontSize?: number;
  fontColor?: string;
  pdfFieldName?: string;
  /** When true, the rendered width shrinks to fit text so the next field can shift left */
  shrinkable?: boolean;
  /** How to render boolean/checkbox values on the PDF */
  booleanDisplay?: BooleanDisplayMode;
  /** Separate mapping for the "true" value position (e.g. a checkmark at a specific location) */
  booleanTrueMapping?: { page: number; x: number; y: number };
  /** Separate mapping for the "false" value position (e.g. a cross at a different location) */
  booleanFalseMapping?: { page: number; x: number; y: number };
}

export interface ComputedFieldMapping {
  id: string;
  label: string;
  /** 'static' for fixed text, 'date' for today's date, 'calculated' for expressions, 'conditional' for logic-based values */
  type: 'static' | 'date' | 'calculated' | 'conditional';
  /** For static: the literal text. For date: a format string (e.g. 'DD/MM/YYYY'). For calculated: expression. */
  value?: string;
  /** For conditional: array of condition/output pairs */
  conditions?: {
    fieldId: string;
    operator: 'equals' | 'not_equals' | 'contains' | 'not_empty' | 'empty' | 'greater_than' | 'less_than';
    compareValue: string;
    output: string;
  }[];
  /** For calculated: 'count_non_empty' counts non-empty fields in a group */
  calculationType?: 'count_non_empty' | 'sum' | 'expression';
  /** Field IDs to use in calculation */
  calculationFieldIds?: string[];
  /** Fallback value when conditions don't match or calculation fails */
  fallback?: string;
  /** PDF placement */
  page: number;
  x: number;
  y: number;
  width: number;
  height: number;
  fontSize?: number;
  fontColor?: string;
  pdfFieldName?: string;
}

export interface DocumentTemplate {
  enabled: boolean;
  type: 'pdf' | 'markdown';
  fileKey?: string;
  fileName?: string;
  markdownContent?: string;
  fieldMappings: FieldMapping[];
  computedMappings?: ComputedFieldMapping[];
  /** Names of form fields detected in the uploaded fillable PDF */
  detectedPdfFields?: string[];
  pageCount?: number;
}
