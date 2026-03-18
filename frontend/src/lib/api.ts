import axios from 'axios';
import type {
  User,
  Organization,
  OrgMember,
  Form,
  FormField,
  FormSettings,
  BrandingConfig,
  DocumentTemplate,
  FormResponse,
  FieldGroup,
  OptionList,
  Kiosk,
  CustomDomain,
} from './types';

const apiClient = axios.create({
  baseURL: import.meta.env.VITE_API_URL ?? '/api',
  headers: { 'Content-Type': 'application/json' },
});

apiClient.interceptors.request.use((config) => {
  const token = localStorage.getItem('cf_token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('cf_token');
      window.location.href = '/login';
    }
    return Promise.reject(error);
  },
);

async function get<T>(url: string, params?: Record<string, unknown>): Promise<T> {
  const res = await apiClient.get<T>(url, { params });
  return res.data;
}

async function post<T>(url: string, data?: unknown): Promise<T> {
  const res = await apiClient.post<T>(url, data);
  return res.data;
}

async function patch<T>(url: string, data?: unknown): Promise<T> {
  const res = await apiClient.patch<T>(url, data);
  return res.data;
}

async function del<T>(url: string): Promise<T> {
  const res = await apiClient.delete<T>(url);
  return res.data;
}

// Auth
export const auth = {
  login: (email: string, password: string) =>
    post<{ token: string; user: User }>('/auth/login', { email, password }),

  register: (name: string, email: string, password: string) =>
    post<{ token: string; user: User }>('/auth/register', { name, email, password }),

  me: () => get<User>('/auth/me'),

  updateProfile: (data: Partial<User>) => patch<User>('/auth/me', data),

  changePassword: (currentPassword: string, newPassword: string) =>
    post<{ message: string }>('/auth/change-password', { currentPassword, newPassword }),

  signupStatus: () =>
    get<{ signupsEnabled: boolean; allowedDomains: string[] }>('/auth/signup-status'),
};

// Organizations
export const orgs = {
  list: () => get<Organization[]>('/orgs'),

  create: (data: { name: string; slug?: string; primaryColor?: string; secondaryColor?: string }) =>
    post<Organization>('/orgs', data),

  get: (id: string) => get<Organization>(`/orgs/${id}`),

  update: (
    id: string,
    data: Partial<Pick<Organization, 'name' | 'slug' | 'logoUrl' | 'primaryColor' | 'secondaryColor' | 'customDomain'>>,
  ) => patch<Organization>(`/orgs/${id}`, data),

  delete: (id: string) => del<{ message: string }>(`/orgs/${id}`),

  listMembers: (id: string) => get<OrgMember[]>(`/orgs/${id}/members`),

  addMember: (id: string, email: string, role: string) =>
    post<OrgMember>(`/orgs/${id}/members`, { email, role }),

  updateMember: (id: string, userId: string, role: string) =>
    patch<OrgMember>(`/orgs/${id}/members/${userId}`, { role }),

  removeMember: (id: string, userId: string) =>
    del<{ message: string }>(`/orgs/${id}/members/${userId}`),
};

// Forms
export const forms = {
  list: (orgId?: string) =>
    get<Form[]>('/forms', orgId ? { orgId } : undefined),

  create: (data: {
    orgId: string;
    title: string;
    description?: string;
    fields?: FormField[];
    settings?: Partial<FormSettings>;
    branding?: BrandingConfig;
    documentTemplate?: DocumentTemplate | null;
  }) => post<Form>('/forms', data),

  get: (id: string) => get<Form>(`/forms/${id}`),

  update: (
    id: string,
    data: Partial<Pick<Form, 'title' | 'description' | 'fields' | 'settings' | 'branding' | 'documentTemplate' | 'accessType' | 'accessCode'>>,
  ) => patch<Form>(`/forms/${id}`, data),

  delete: (id: string) => del<{ message: string }>(`/forms/${id}`),

  publish: (id: string) => post<Form>(`/forms/${id}/publish`),

  unpublish: (id: string) => post<Form>(`/forms/${id}/unpublish`),

  getPublic: (slug: string) => get<Form>(`/forms/public/${slug}`),

  duplicate: (id: string) => post<Form>(`/forms/${id}/duplicate`),
};

// Responses
export const responses = {
  submit: (slug: string, data: Record<string, unknown>, turnstileToken?: string) =>
    post<{ message: string; id: string }>(`/responses/submit/${slug}`, {
      data,
      turnstileToken,
    }),

  list: (formId: string, params?: { page?: number; limit?: number; search?: string; startDate?: string; endDate?: string; includeSpam?: boolean }) =>
    get<{ responses: FormResponse[]; total: number; page: number; limit: number }>(
      `/responses/form/${formId}`,
      params as Record<string, unknown>,
    ),

  get: (id: string) => get<FormResponse>(`/responses/${id}`),

  delete: (id: string) => del<{ message: string }>(`/responses/${id}`),

  bulkDelete: (formId: string, ids: string[]) => post<{ message: string }>(`/responses/form/${formId}/bulk-delete`, { ids }),
};

// Export
export const exportData = {
  formCSV: (formId: string) =>
    apiClient
      .get(`/export/form/${formId}/csv`, { responseType: 'text' })
      .then((r) => r.data as string),

  formJSON: (formId: string) =>
    apiClient
      .get(`/export/form/${formId}/json`, { responseType: 'text' })
      .then((r) => r.data as string),

  formConfig: (formId: string) =>
    apiClient
      .get(`/export/form/${formId}/config`, { responseType: 'text' })
      .then((r) => r.data as string),

  formBundle: (formId: string) =>
    apiClient
      .get(`/export/form/${formId}/bundle`, { responseType: 'text' })
      .then((r) => r.data as string),

  responsePdf: (responseId: string) =>
    apiClient
      .get(`/export/response/${responseId}/pdf`, { responseType: 'blob' })
      .then((r) => r.data as Blob),

  importForm: (orgId: string, data: Record<string, unknown>, includeResponses: boolean) =>
    post<{ id: string; title: string; slug: string; importedResponses: number; form: Form }>(
      '/export/import',
      { orgId, data, includeResponses },
    ),
};

// Files
export const files = {
  upload: (file: File) => {
    const formData = new FormData();
    formData.append('file', file);
    return apiClient
      .post<{ key: string; url: string; name: string; size: number; contentType: string }>(
        '/files/upload',
        formData,
        { headers: { 'Content-Type': 'multipart/form-data' } },
      )
      .then((r) => r.data);
  },
};

// Kiosk
export const kiosk = {
  list: (orgId: string) => get<Kiosk[]>('/kiosk', { orgId }),

  create: (data: { orgId: string; name: string; formIds: string[]; allowMultipleResponses?: boolean }) =>
    post<Kiosk>('/kiosk', data),

  get: (id: string) => get<Kiosk>(`/kiosk/${id}`),

  update: (id: string, data: Partial<Pick<Kiosk, 'name' | 'formIds' | 'allowMultipleResponses'>>) =>
    patch<Kiosk>(`/kiosk/${id}`, data),

  delete: (id: string) => del<{ message: string }>(`/kiosk/${id}`),

  getByToken: (token: string) => get<Kiosk & { forms: Form[] }>(`/kiosk/token/${token}`),
};

// Field Groups
export const fieldGroups = {
  list: (orgId?: string) =>
    get<FieldGroup[]>('/field-groups', orgId ? { orgId } : undefined),

  create: (data: { orgId?: string; name: string; description?: string; fields: FormField[] }) =>
    post<FieldGroup>('/field-groups', data),

  get: (id: string) => get<FieldGroup>(`/field-groups/${id}`),

  update: (
    id: string,
    data: Partial<Pick<FieldGroup, 'name' | 'description' | 'fields'>>,
  ) => patch<FieldGroup>(`/field-groups/${id}`, data),

  delete: (id: string) => del<{ message: string }>(`/field-groups/${id}`),
};

// Option Lists
export const optionLists = {
  list: (orgId?: string) =>
    get<OptionList[]>('/option-lists', orgId ? { orgId } : undefined),

  create: (data: { orgId?: string; name: string; description?: string; options: { label: string; value: string }[] }) =>
    post<OptionList>('/option-lists', data),

  get: (id: string) => get<OptionList>(`/option-lists/${id}`),

  update: (
    id: string,
    data: Partial<Pick<OptionList, 'name' | 'description' | 'options'>>,
  ) => patch<OptionList>(`/option-lists/${id}`, data),

  delete: (id: string) => del<{ message: string }>(`/option-lists/${id}`),
};

// Admin
export const admin = {
  listUsers: () => get<User[]>('/admin/users'),
  listOrgs: () => get<Organization[]>('/admin/orgs'),
  stats: () => get<{ users: number; orgs: number; forms: number; responses: number }>('/admin/stats'),
  listDomains: () => get<CustomDomain[]>('/admin/domains'),
  verifyDomain: (id: string) => patch<{ message: string }>(`/admin/domains/${id}/verify`),
  deleteDomain: (id: string) => del<{ message: string }>(`/admin/domains/${id}`),
  getSettings: () =>
    get<{ signupsEnabled: boolean; allowedSignupDomains: string[] }>('/users/admin/settings'),
  updateSettings: (data: { signupsEnabled?: boolean; allowedSignupDomains?: string[] }) =>
    apiClient.put('/users/admin/settings', data).then((r) => r.data as { message: string }),
};

// Custom domains (per-org)
export const domains = {
  list: (orgId: string) =>
    get<CustomDomain[]>(`/orgs/${orgId}/domains`),

  add: (orgId: string, domain: string) =>
    post<CustomDomain>(`/orgs/${orgId}/domains`, { domain }),

  verify: (orgId: string, domainId: string) =>
    post<{ verified: boolean; message: string }>(`/orgs/${orgId}/domains/${domainId}/verify`),

  setPrimary: (orgId: string, domainId: string) =>
    patch<{ message: string }>(`/orgs/${orgId}/domains/${domainId}/primary`),

  remove: (orgId: string, domainId: string) =>
    del<{ message: string }>(`/orgs/${orgId}/domains/${domainId}`),
};

export default apiClient;
