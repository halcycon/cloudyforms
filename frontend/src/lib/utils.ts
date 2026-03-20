import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { format, parseISO } from 'date-fns';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatDate(date: string): string {
  try {
    return format(parseISO(date), 'MMM d, yyyy h:mm a');
  } catch {
    return date;
  }
}

export function formatDateShort(date: string): string {
  try {
    return format(parseISO(date), 'MMM d, yyyy');
  } catch {
    return date;
  }
}

export function generateSlug(title: string): string {
  return title
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '')
    .replace(/[\s_-]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export function downloadFile(content: string, filename: string, type: string): void {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

export function truncate(str: string, maxLength: number): string {
  if (str.length <= maxLength) return str;
  return `${str.substring(0, maxLength)}...`;
}

export function getInitials(name: string): string {
  return name
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .substring(0, 2);
}

/** Sanitise a single string value: strip HTML tags and trim whitespace. */
export function sanitizeOptionString(value: unknown): string {
  if (typeof value !== 'string') return String(value ?? '');
  // Apply repeatedly to handle nested/split tags like "<<script>script>"
  let result = value;
  let prev: string;
  do {
    prev = result;
    result = result.replace(/<[^>]*>/g, '');
  } while (result !== prev);
  return result.trim();
}

/**
 * Detect non-trivial field names in a JSON string so the user can choose
 * which field maps to label and which to value.
 * Returns an array of field names found in the first object, or null if
 * the data is a simple string array or already uses {label, value}.
 */
export function detectJsonFields(raw: string): string[] | null {
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed) || parsed.length === 0) return null;

    const first = parsed[0];
    if (!first || typeof first !== 'object') return null;

    const keys = Object.keys(first as Record<string, unknown>);
    // If the object already uses standard label/value naming, no mapping needed
    if (keys.length <= 2 && keys.includes('label')) return null;

    // Filter out 'default' since it's a reserved field
    const fieldKeys = keys.filter((k) => k !== 'default');
    if (fieldKeys.length < 2) return null;

    return fieldKeys;
  } catch {
    return null;
  }
}

/**
 * Parse a JSON string into an array of {label, value, default?} options.
 * Accepts:
 *   - An array of strings, e.g. ["Red","Green","Blue"]
 *   - An array of {label, value} objects, e.g. [{"label":"Red","value":"red"}]
 *   - An array of objects with custom fields + optional labelField/valueField mapping
 *   - An object of key→label pairs, e.g. {"us":"United States","uk":"United Kingdom"}
 * Supports an optional "default": true field on any object entry.
 * Sanitises all values to prevent injection.
 */
export function parseJsonOptions(
  raw: string,
  labelField?: string,
  valueField?: string,
): { label: string; value: string; default?: boolean }[] {
  const parsed: unknown = JSON.parse(raw);

  if (Array.isArray(parsed)) {
    return parsed.map((item) => {
      if (typeof item === 'string') {
        const label = sanitizeOptionString(item);
        return { label, value: label.toLowerCase().replace(/\s+/g, '_') };
      }
      if (item && typeof item === 'object') {
        const obj = item as Record<string, unknown>;
        const isDefault = obj.default === true;

        // Use explicit field mapping if provided
        if (labelField && valueField) {
          const label = sanitizeOptionString(obj[labelField]);
          const value = sanitizeOptionString(obj[valueField]);
          const opt: { label: string; value: string; default?: boolean } = { label, value };
          if (isDefault) opt.default = true;
          return opt;
        }

        // Standard {label, value} format
        if ('label' in obj) {
          const label = sanitizeOptionString(obj.label);
          const value = obj.value ? sanitizeOptionString(obj.value) : label.toLowerCase().replace(/\s+/g, '_');
          const opt: { label: string; value: string; default?: boolean } = { label, value };
          if (isDefault) opt.default = true;
          return opt;
        }

        // Auto-detect: use first two string-valued fields
        const stringKeys = Object.keys(obj).filter((k) => k !== 'default' && typeof obj[k] === 'string');
        if (stringKeys.length >= 2) {
          const label = sanitizeOptionString(obj[stringKeys[0]]);
          const value = sanitizeOptionString(obj[stringKeys[1]]);
          const opt: { label: string; value: string; default?: boolean } = { label, value };
          if (isDefault) opt.default = true;
          return opt;
        }
      }
      const label = sanitizeOptionString(item);
      return { label, value: label.toLowerCase().replace(/\s+/g, '_') };
    }).filter((o) => o.label.length > 0);
  }

  if (parsed && typeof parsed === 'object') {
    return Object.entries(parsed as Record<string, unknown>)
      .map(([key, val]) => ({
        value: sanitizeOptionString(key),
        label: sanitizeOptionString(val),
      }))
      .filter((o) => o.label.length > 0);
  }

  throw new Error('JSON must be an array or object');
}

/**
 * Serialize options into a JSON string suitable for the JSON paste textarea.
 */
export function optionsToJson(
  options: { label: string; value: string; default?: boolean }[],
): string {
  const arr = options.map((o) => {
    const obj: { label: string; value: string; default?: boolean } = { label: o.label, value: o.value };
    if (o.default) obj.default = true;
    return obj;
  });
  return JSON.stringify(arr, null, 2);
}
