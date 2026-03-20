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
 * Parse a JSON string into an array of {label, value} options.
 * Accepts:
 *   - An array of strings, e.g. ["Red","Green","Blue"]
 *   - An array of {label, value} objects, e.g. [{"label":"Red","value":"red"}]
 *   - An object of key→label pairs, e.g. {"us":"United States","uk":"United Kingdom"}
 * Sanitises all values to prevent injection.
 */
export function parseJsonOptions(raw: string): { label: string; value: string }[] {
  const parsed: unknown = JSON.parse(raw);

  if (Array.isArray(parsed)) {
    return parsed.map((item) => {
      if (typeof item === 'string') {
        const label = sanitizeOptionString(item);
        return { label, value: label.toLowerCase().replace(/\s+/g, '_') };
      }
      if (item && typeof item === 'object' && 'label' in item) {
        const obj = item as Record<string, unknown>;
        const label = sanitizeOptionString(obj.label);
        const value = obj.value ? sanitizeOptionString(obj.value) : label.toLowerCase().replace(/\s+/g, '_');
        return { label, value };
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
