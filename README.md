# CloudyForms

Open-source form-building platform that runs entirely on **Cloudflare Workers + Pages + D1 + R2**.  
Inspired by Formbricks. Multi-tenant, white-label, embeddable, kiosk-ready.

---

## Table of Contents

1. [Features](#features)
2. [Architecture](#architecture)
3. [Prerequisites](#prerequisites)
4. [Quick Start](#quick-start)
5. [Cloudflare Setup (step-by-step)](#cloudflare-setup)
6. [Environment Variables](#environment-variables)
7. [Custom Domains](#custom-domains)
8. [Embedding Forms](#embedding-forms)
9. [Self-Hosting on Your Own Account](#self-hosting-on-your-own-cloudflare-account)
10. [Free vs Paid Tier](#free-vs-paid-tier)
11. [Development](#development)

---

## Features

| Feature | Notes |
|---|---|
| Drag-and-drop form builder | @dnd-kit, 17 field types |
| Multi-tenant organisations | Owner / Admin / Editor / Viewer roles |
| Granular ACLs | Per-form, per-role field visibility |
| Custom domains | Multiple verified domains per org |
| Form embedding | iframe + JS widget, auto-resizing |
| Kiosk mode | Token-based device registration, multi-form |
| Cloudflare Turnstile | Anti-spam, no CAPTCHA |
| File uploads | R2 storage + D1 blob for small files |
| Email notifications | Mailchannels (free on Cloudflare Workers) |
| Webhooks | HMAC-signed payloads |
| CSV / JSON export | Per-form or per-response |
| Device fingerprinting | Duplicate submission detection |
| Reusable field groups | Global or org-scoped templates |
| Custom branding | Logo, colours, font per org/form |
| Mobile responsive | Tailwind CSS throughout |

---

## Architecture

```
┌─────────────────────────────────────────┐
│  Cloudflare Pages  (frontend)           │
│  React + Vite  →  /frontend             │
└───────────────┬─────────────────────────┘
                │  /api/*  (proxied)
┌───────────────▼─────────────────────────┐
│  Cloudflare Worker  (backend)           │
│  Hono router  →  /worker                │
│   • D1 database  (SQLite)               │
│   • R2 bucket    (file storage)         │
│   • Turnstile    (anti-spam)            │
│   • Mailchannels (email)                │
└─────────────────────────────────────────┘
```

---

## Prerequisites

- [Node.js](https://nodejs.org/) >= 18
- [Wrangler CLI](https://developers.cloudflare.com/workers/wrangler/) >= 3  
  `npm install -g wrangler`
- A Cloudflare account (free tier works for most features)

---

## Quick Start

```bash
# 1. Clone the repository
git clone https://github.com/halcycon/cloudyforms.git
cd cloudyforms

# 2. Install dependencies
cd worker && npm install && cd ../frontend && npm install && cd ..

# 3. Authenticate with Cloudflare
wrangler login

# 4. Create D1 database
wrangler d1 create cloudyforms
# Copy the database_id into worker/wrangler.toml

# 5. Apply the schema
wrangler d1 execute cloudyforms --file=worker/src/db/schema.sql

# 6. Create R2 bucket
wrangler r2 bucket create cloudyforms-files

# 7. Set secrets
wrangler secret put JWT_SECRET          # random 32+ char string
wrangler secret put TURNSTILE_SECRET_KEY  # from Cloudflare dashboard
wrangler secret put MAILCHANNELS_API_KEY  # optional

# 8. Deploy the worker
cd worker && wrangler deploy

# 9. Build & deploy the frontend
cd ../frontend
echo "VITE_API_URL=https://cloudyforms-worker.<your-account>.workers.dev/api" > .env
npm run build
wrangler pages deploy dist --project-name cloudyforms
```

---

## Cloudflare Setup

### Step 1 – Create D1 database

```bash
wrangler d1 create cloudyforms
```

Copy the `database_id` output into `worker/wrangler.toml`:

```toml
[[d1_databases]]
binding = "DB"
database_name = "cloudyforms"
database_id = "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
```

Apply schema:

```bash
wrangler d1 execute cloudyforms --file=worker/src/db/schema.sql
```

### Step 2 – Create R2 bucket

```bash
wrangler r2 bucket create cloudyforms-files
```

### Step 3 – Cloudflare Turnstile (anti-spam)

1. Cloudflare Dashboard → Turnstile → Add widget
2. Widget type: **Managed**
3. Add your frontend domain as an allowed hostname
4. Copy **Site Key** → `VITE_TURNSTILE_SITE_KEY` in `frontend/.env`
5. Copy **Secret Key** → `wrangler secret put TURNSTILE_SECRET_KEY`

### Step 4 – Mailchannels (email)

Mailchannels is free for Workers. No API key needed for basic use if your domain has a valid SPF record. For authenticated sending: `wrangler secret put MAILCHANNELS_API_KEY`

Also set in `wrangler.toml`:

```toml
[vars]
FROM_EMAIL = "noreply@yourdomain.com"
```

### Step 5 – Set JWT secret

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
wrangler secret put JWT_SECRET
```

### Step 6 – Deploy worker

```bash
cd worker && wrangler deploy
```

Note your workers.dev URL: `https://cloudyforms-worker.<account>.workers.dev`

### Step 7 – Deploy frontend (Cloudflare Pages)

```bash
cd frontend
cp .env.example .env   # or create .env manually
# Set VITE_API_URL to your worker URL
npm run build
wrangler pages deploy dist --project-name cloudyforms
```

Or connect the repository in Cloudflare Dashboard → Pages → Create project:

| Setting | Value |
|---|---|
| Build command | `cd frontend && npm run build` |
| Build output | `frontend/dist` |
| Environment variable | `VITE_API_URL` = your worker URL |

---

## Environment Variables

### Worker (`wrangler.toml` / Cloudflare secrets)

| Variable | Required | Description |
|---|---|---|
| `JWT_SECRET` | Yes | JWT signing secret (32+ chars) |
| `TURNSTILE_SECRET_KEY` | Yes | Cloudflare Turnstile secret key |
| `FROM_EMAIL` | Yes | Sender address for emails |
| `MAILCHANNELS_API_KEY` | Optional | Mailchannels authenticated sending |
| `ALLOWED_ORIGINS` | Optional | Comma-separated CORS origins (default `*`) |
| `ENVIRONMENT` | Optional | `development` enables verbose errors |

### Frontend (`frontend/.env`)

| Variable | Description |
|---|---|
| `VITE_API_URL` | Worker API base URL |
| `VITE_TURNSTILE_SITE_KEY` | Cloudflare Turnstile site key |

---

## Custom Domains

See **[docs/cloudflare-integration.md](docs/cloudflare-integration.md)** for full Cloudflare Tunnels, CNAME, and Page Rules setup.

**Quick summary:**

1. Org admin: Org Settings → Custom Domains → Add Domain
2. Add a DNS TXT record to verify ownership
3. Point a CNAME to the workers.dev URL
4. Configure a Cloudflare Custom Hostname or Tunnel
5. Mark domain as primary – all share links use it

Global admins can view and force-verify all domains at **Admin → Manage Custom Domains**.

---

## Embedding Forms

See **[docs/embedding.md](docs/embedding.md)** for full details.

**Quick iframe embed:**

```html
<iframe
  src="https://your-instance.pages.dev/embed/your-form-slug"
  style="width:100%;border:none;min-height:480px;"
  frameborder="0" scrolling="no"
></iframe>
<script>
  window.addEventListener('message', function(e) {
    if (e.data && e.data.type === 'cloudyforms:resize') {
      document.querySelectorAll('iframe[src*="your-form-slug"]')
        .forEach(function(f) { f.style.height = (e.data.height + 32) + 'px'; });
    }
  });
</script>
```

**JavaScript widget (auto-resizing):**

```html
<script src="https://your-instance.pages.dev/api/embed/script.js" defer></script>
<div data-cloudyforms="your-form-slug"></div>
```

The embed code is also available inside the **Form Builder → Embed tab**.

---

## Self-Hosting on Your Own Cloudflare Account

CloudyForms is designed to be self-hosted. Each deployment is completely independent.

```bash
git clone https://github.com/your-fork/cloudyforms.git
cd cloudyforms
# Follow the Quick Start above.
# All data stays in YOUR Cloudflare account.
```

**Key points:**

- No external SaaS – only Cloudflare primitives + optional Mailchannels
- One account can host multiple isolated deployments (different wrangler.toml / D1 databases)
- First registered user automatically becomes super admin

---

## Free vs Paid Tier

| Feature | Free | Paid |
|---|---|---|
| Worker requests | 100k/day | Unlimited |
| D1 storage | 5 GB | 50 GB+ |
| R2 storage | 10 GB | Pay as you go |
| Custom domains via CNAME + Tunnel | Free | Free |
| Custom Hostnames (SSL for SaaS) | No | Enterprise |
| Email (Mailchannels) | Free | Free |
| Turnstile | Free | Free |

**Recommendation:** Free tier is sufficient for small-medium deployments. Workers Paid ($5/mo) for > 100k form views/day.

---

## Development

```bash
# Worker (localhost:8787)
cd worker && wrangler dev

# Frontend (localhost:5173, proxies /api to :8787)
cd frontend && npm run dev
```

Local D1 – apply schema once:

```bash
cd worker
wrangler d1 execute cloudyforms --local --file=src/db/schema.sql
```

---

## Licence

MIT – see [LICENSE](LICENSE).
