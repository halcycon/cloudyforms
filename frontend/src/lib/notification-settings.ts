import type { FormSettings, UserRole } from './types';

export const NOTIFY_ROLE_OPTIONS: { value: UserRole; label: string }[] = [
  { value: 'owner', label: 'Owners' },
  { value: 'admin', label: 'Admins' },
  { value: 'editor', label: 'Editors' },
  { value: 'creator', label: 'Creators' },
  { value: 'viewer', label: 'Viewers' },
];

export function hasEmailNotificationTargets(settings: FormSettings): boolean {
  if (settings.notificationEmails.length > 0) return true;
  const n = settings.emailNotify;
  if (!n) return false;
  if (n.formCreator) return true;
  if (n.allMembers) return true;
  if (n.groupIds?.length) return true;
  if (n.roles && Object.values(n.roles).some(Boolean)) return true;
  return false;
}

export function effectiveNotifyByEmail(settings: FormSettings): boolean {
  if (settings.notifyByEmail !== undefined) return settings.notifyByEmail;
  return hasEmailNotificationTargets(settings);
}
