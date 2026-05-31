# Form response notifications

When someone submits a form, CloudyForms can notify administrators and integrators through **email**, **ntfy** push notifications, or **both**. Configuration is per form in the form builder **Settings** tab under **Notifications**.

Related docs:

- **[EMAIL.md](EMAIL.md)** — outbound mail providers, From addresses, HTML templates
- **[embedding.md](embedding.md)** — public form embeds (notification settings are never exposed to embed visitors)

---

## Overview

| Channel | Purpose | Requires |
|---------|---------|----------|
| **Receipt email** | Confirmation to the person who submitted | Org email provider configured; form has an email field |
| **Email alerts** | Notify team members and/or custom addresses | Org email provider configured |
| **ntfy** | Push notification to phones/desktop via [ntfy](https://ntfy.sh/) | Topic subscribed in the ntfy app (or self-hosted server) |

Receipt email and admin alerts are independent — you can enable either, neither, or both.

Admin alerts (email + ntfy) fire when a response is **submitted**, including when a pre-filled **draft** is finalised.

---

## Configuring in the UI

Open a form → **Settings** → **Notifications**.

### Receipt email

- **Send receipt email** — toggle on/off
- **Receipt email field** — which form field holds the submitter’s address (must be an email field)

Uses the org’s configured mail provider and From address. See [EMAIL.md](EMAIL.md).

### New response alerts — Email

1. Enable the **Email** master toggle.
2. Choose recipients in the panel:

**Organisation members**

| Toggle | Who is notified |
|--------|-----------------|
| **Form creator** | The user who created this form (`forms.created_by`) |
| **All members** | Every active org member (when on, role toggles are hidden) |
| **Owners / Admins / Editors / Creators / Viewers** | Active members with that role (combinations allowed) |

**Groups**

- One toggle per org group — all users in selected groups receive an alert.

**Additional addresses**

- Free-form email list for addresses outside the org (e.g. shared inbox, external contractor).

The worker resolves all selected targets, **deduplicates** addresses, and sends one email per unique recipient.

> If email is enabled but no recipients are selected, a warning is shown in the UI and no admin emails are sent.

### New response alerts — ntfy

1. Enable the **ntfy** master toggle.
2. Configure:

| Field | Required | Description |
|-------|----------|-------------|
| **Server URL** | No | Blank = `https://ntfy.sh`. Set base URL for a self-hosted instance, e.g. `https://ntfy.example.com` |
| **Topic** | Yes | Topic name — treat as a secret on the public ntfy.sh service |
| **Authentication** | No | Off by default. Enable for password-protected topics |
| **Access token** | When auth on | Bearer token sent as `Authorization: Bearer …` |

**Self-hosted example**

- Server URL: `https://ntfy.myserver.com`
- Topic: `svbc-form-alerts-x7k2`
- Subscribe to `https://ntfy.myserver.com/svbc-form-alerts-x7k2` in the ntfy app

**Public ntfy.sh example**

- Server URL: *(leave blank)*
- Topic: `horus-join-alerts-9m4p`
- Subscribe in the app to that topic

Push payload includes form title, submitter email (if known), response ID, and field labels/values (plain text).

---

## Backward compatibility

Existing forms that only had **Notification emails** (a plain list) continue to work:

- If `notifyByEmail` is not set, email alerts are considered **on** when the custom address list is non-empty.
- New forms default to email and ntfy **off** until explicitly enabled.

---

## Security

Sensitive values are **not** returned by the public form API (`GET /api/forms/public/:slug`):

- `webhookSecret`
- `ntfy.authToken`

Other notification config (custom emails, topic name, role toggles) is stored in form settings JSON. Avoid putting secrets in topic names on the public ntfy.sh service — use an unguessable topic and/or enable ntfy authentication.

The worker blocks ntfy requests to obvious private/localhost hostnames (basic SSRF guard).

---

## Data model (`FormSettings`)

Stored as JSON in `forms.settings`:

```typescript
{
  sendReceiptEmail: boolean;
  receiptEmailField?: string;

  notifyByEmail?: boolean;
  notificationEmails: string[];          // additional custom addresses
  emailNotify?: {
    formCreator?: boolean;
    allMembers?: boolean;
    roles?: {
      owner?: boolean;
      admin?: boolean;
      editor?: boolean;
      creator?: boolean;
      viewer?: boolean;
    };
    groupIds?: string[];               // org group IDs
  };

  notifyByNtfy?: boolean;
  ntfy?: {
    serverUrl?: string;                // optional; default https://ntfy.sh
    topic: string;
    authEnabled?: boolean;             // default false
    authToken?: string;                // Bearer token when authEnabled
  };
}
```

Only **active** org members (`org_members.status = 'active'`) are included in role/all-member resolution.

---

## Implementation reference

| Area | Path |
|------|------|
| UI | `frontend/src/components/FormBuilder/ResponseNotificationSettings.tsx` |
| Shared UI helpers | `frontend/src/lib/notification-settings.ts` |
| Send on submit | `worker/src/lib/form-notifications.ts` |
| Email recipient resolution | `worker/src/lib/notification-settings.ts` |
| ntfy HTTP client | `worker/src/lib/ntfy.ts` |
| Admin email template | `worker/src/email-templates/form-notification.html` |
| Public settings sanitisation | `sanitizePublicFormSettings()` in `worker/src/lib/notification-settings.ts` |

---

## Troubleshooting

| Symptom | Check |
|---------|--------|
| No admin email received | Email toggle on? At least one recipient selected? Org email provider working? ([EMAIL.md](EMAIL.md)) |
| Duplicate emails | Same person may match multiple rules (e.g. form creator + Admin role) — deduplication should prevent double sends; report if not |
| ntfy not arriving | Topic subscribed in app? Topic spelled correctly? For auth topics, token enabled and correct? |
| Self-hosted ntfy fails | Server URL is base only (no `/topic` suffix); instance reachable from Cloudflare Workers |
| Auth token missing after save | Token is stored in settings; re-open form settings to confirm it persisted |
