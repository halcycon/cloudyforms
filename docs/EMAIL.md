# Email (Cloudflare Email Service & Mailchannels)

CloudyForms sends transactional email for:

- **Organisation invitations** — when an admin invites someone who has not registered yet
- **Form submission receipts** — optional confirmation to the person who submitted
- **Admin notifications** — optional alert to addresses configured on the form

## Provider choice

Each organisation can send via:

| Provider | When to use |
|----------|-------------|
| **Cloudflare Email Service** (default) | Sending domain is onboarded on Cloudflare (`wrangler email sending enable …`) |
| **Mailchannels** | Org uses a domain **not** on Cloudflare Email Service; requires SPF authorising Cloudflare/Workers |

**Platform default** (Super Admin → Email Settings) applies to all orgs unless overridden per org (Organisation Settings → Email Settings).

### Resolution order

For a given org email:

1. **Provider:** org setting → platform setting → `cloudflare`
2. **From address:** org `emailFrom` → platform `emailFrom` → worker `EMAIL_FROM` env var

The organisation **name** is used as the display name on the From header when the address does not already include one.

## Prerequisites

### Cloudflare Email Service

```bash
npx wrangler email sending enable thecuckoocamp.co.uk
```

Worker binding in `worker/wrangler.toml`:

```toml
[[send_email]]
name = "EMAIL"
```

Optional REST fallback secrets: `EMAIL_API_TOKEN`, `CF_ACCOUNT_ID`.

### Mailchannels

1. Set org (or platform) provider to **Mailchannels** in the admin UI.
2. Add SPF on the org's sending domain so Cloudflare Workers may send (see [Mailchannels docs](https://support.mailchannels.com/hc/en-us/articles/4565898358413-Sending-Email-from-Cloudflare-Workers)).
3. Optional authenticated sending:

   ```bash
   cd worker && npx wrangler secret put MAILCHANNELS_API_KEY
   ```

## Configuration

| Setting | Where | Purpose |
|---------|--------|---------|
| `EMAIL_FROM` | `worker/wrangler.toml` | Worker fallback sender |
| `EMAIL` binding | `wrangler.toml` | Cloudflare Email Service (primary path) |
| Platform **Email Settings** | Super Admin UI | Default provider + From address |
| Org **Email Settings** | Organisation Settings UI | Override provider + From for one org |

Example org From address: `Streatham Vale Baptist <forms@svbc.org.uk>`

## HTML templates

Templates in `worker/src/email-templates/`:

| File | Used for |
|------|----------|
| `invitation.html` | Org member invite |
| `form-receipt.html` | Submission confirmation |
| `form-notification.html` | Admin new-response alert |

Edit placeholders in HTML; rendering in `worker/src/lib/email-render.ts`.

Org **logo URL** and **primary colour** (Organisation Settings) are applied to all three.

## Form email settings

Per form (Settings tab):

- **Send receipt email** — needs `receiptEmailField` configured
- **Notification emails** — admin recipient list

Both use the org's configured provider and From address.

## Troubleshooting

| Symptom | Check |
|---------|--------|
| Cloudflare send fails | Domain onboarded? `wrangler email sending list` |
| Mailchannels send fails | SPF on org domain; optional `MAILCHANNELS_API_KEY` |
| Wrong sender | Org From override vs platform default in settings UI |
| Org still uses Cloudflare | Org provider set to Mailchannels? |
