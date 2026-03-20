export type UserRole = 'owner' | 'admin' | 'editor' | 'viewer';
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
  | 'signature';

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
  /** Width of the field as a percentage (25, 33, 50, 66, 75, 100). Defaults to 100. */
  width?: number;
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
  createdAt: string;
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
