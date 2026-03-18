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
  placeholder?: string;
  description?: string;
  required: boolean;
  options?: { label: string; value: string }[];
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
  options: { label: string; value: string }[];
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
}

export interface DocumentTemplate {
  enabled: boolean;
  type: 'pdf' | 'markdown';
  fileKey?: string;
  fileName?: string;
  markdownContent?: string;
  fieldMappings: FieldMapping[];
  pageCount?: number;
}
