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
6. [Deploying via Cloudflare Dashboard (recommended)](#deploying-via-cloudflare-dashboard-recommended)
7. [Alternative: GitHub Actions Deployment](#alternative-github-actions-deployment)
8. [Environment Variables](#environment-variables)
9. [Custom Domains](#custom-domains)
10. [Embedding Forms](#embedding-forms)
11. [Self-Hosting on Your Own Account](#self-hosting-on-your-own-cloudflare-account)
12. [Free vs Paid Tier](#free-vs-paid-tier)
13. [Development](#development)

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

> **⚠️ Security note:** Never commit secrets (API keys, JWT secrets, Turnstile keys) into
> `wrangler.toml`, `.env` files, or any other file that is pushed to a public repository.
> Use `wrangler secret put` for worker secrets and the Cloudflare Dashboard environment
> variables UI for Pages build-time variables.

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

# 7. Set secrets (these are stored securely by Cloudflare, NOT in your repo)
wrangler secret put JWT_SECRET            # random 32+ char string
wrangler secret put TURNSTILE_SECRET_KEY  # from Cloudflare dashboard
wrangler secret put MAILCHANNELS_API_KEY  # optional

# 8. Deploy the worker
cd worker && wrangler deploy

# 9. Deploy the frontend via Cloudflare Dashboard (recommended)
#    See "Deploying via Cloudflare Dashboard" below.
#    Or deploy manually with Wrangler:
cd ../frontend
VITE_API_URL="https://cloudyforms-worker.<your-account>.workers.dev/api" npm run build
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
4. Copy **Site Key** → you will add this as an environment variable in the Cloudflare Pages dashboard (see [Deploying via Cloudflare Dashboard](#deploying-via-cloudflare-dashboard-recommended)) or pass it at build time as `VITE_TURNSTILE_SITE_KEY`
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

The recommended approach is to deploy the frontend via the **Cloudflare Dashboard** so that Cloudflare builds and deploys automatically whenever you push to your repository. See [Deploying via Cloudflare Dashboard](#deploying-via-cloudflare-dashboard-recommended) for full instructions.

Alternatively, deploy manually with Wrangler:

```bash
cd frontend
VITE_API_URL="https://cloudyforms-worker.<account>.workers.dev/api" \
VITE_TURNSTILE_SITE_KEY="your-turnstile-site-key" \
npm run build
wrangler pages deploy dist --project-name cloudyforms
```

> **Tip:** Pass environment variables inline or export them in your shell session rather
> than writing them to a `.env` file that could accidentally be committed to a public
> repository.

---

## Deploying via Cloudflare Dashboard (recommended)

Linking your repository directly in the Cloudflare Dashboard is the simplest way to deploy the frontend. Cloudflare will automatically build and publish your site whenever you push changes — no GitHub Actions or API tokens required.

### Step 1 – Deploy the Worker

The Worker (backend API) must be deployed first because the frontend needs its URL.

```bash
cd worker
wrangler deploy
```

Note your Worker URL — it will look like `https://cloudyforms-worker.<your-account>.workers.dev`.

> **Note:** There is no built-in Cloudflare Dashboard integration for Workers tied to a
> Git repo. You can deploy the Worker manually with `wrangler deploy`, or use the
> [GitHub Actions workflow](#alternative-github-actions-deployment) described below if you
> want automated Worker deployments on push.

### Step 2 – Create a Pages project linked to your repo

1. Log in to the [Cloudflare Dashboard](https://dash.cloudflare.com/)
2. Navigate to **Workers & Pages** in the left sidebar
3. Click **Create** → **Pages** → **Connect to Git**
4. Authorise Cloudflare to access your GitHub account (if not already done)
5. Select your **cloudyforms** repository (or your fork of it)
6. Click **Begin setup**

### Step 3 – Configure build settings

| Setting | Value |
|---|---|
| **Production branch** | `main` |
| **Framework preset** | None |
| **Root directory** | `frontend` |
| **Build command** | `npm run build` |
| **Build output directory** | `dist` |

> **Why set Root directory to `frontend`?** This tells Cloudflare Pages to run the build
> command from inside the `frontend/` folder, so paths resolve correctly and only frontend
> changes trigger rebuilds.

### Step 4 – Add environment variables

Still on the same setup page, expand **Environment variables** and add:

| Variable name | Value | Notes |
|---|---|---|
| `VITE_API_URL` | `https://cloudyforms-worker.<your-account>.workers.dev/api` | Replace with your actual Worker URL from Step 1 |
| `VITE_TURNSTILE_SITE_KEY` | *(your Turnstile site key)* | From Cloudflare Dashboard → Turnstile |
| `NODE_VERSION` | `20` | Ensures Cloudflare uses Node 20 for the build |

> **Security:** These variables are stored securely in Cloudflare's build environment.
> They are **not** committed to your repository and are not publicly visible.

### Step 5 – Save and deploy

Click **Save and Deploy**. Cloudflare will clone your repo, install dependencies, run the build, and publish the site. You'll see a deployment URL like `https://cloudyforms.pages.dev`.

### Step 6 – Verify

Open your Pages URL in a browser. You should see the CloudyForms login/signup page. Confirm that the frontend can reach the Worker API by signing up or logging in.

### Automatic deployments

From now on, every push to your `main` branch that changes files under `frontend/` will trigger a new production deployment automatically. Pull requests will generate **preview deployments** with unique URLs so you can test changes before merging.

You can review deployment history and preview URLs under **Workers & Pages → cloudyforms → Deployments** in the Cloudflare Dashboard.

### Adding a custom domain (optional)

1. In the Cloudflare Dashboard, go to **Workers & Pages → cloudyforms → Custom domains**
2. Click **Set up a custom domain**
3. Enter your domain (e.g. `forms.yourdomain.com`) and follow the DNS prompts

---

## Alternative: GitHub Actions Deployment

CloudyForms also ships with two GitHub Actions workflows in `.github/workflows/` that automate deployment whenever you push to `main` (or open a pull request). This approach is useful if you want CI-driven deployments for **both** the Worker and the frontend, or if you need to run additional checks before deploying.

> **Note:** If you are already using the Cloudflare Dashboard to deploy the frontend
> (see above), you do not need the `deploy-pages.yml` workflow. You may still use
> `deploy-worker.yml` to automate Worker deployments.

| Workflow | File | Trigger |
|---|---|---|
| Deploy Worker | `deploy-worker.yml` | Push/PR touching `worker/**` |
| Deploy Pages | `deploy-pages.yml` | Push/PR touching `frontend/**` |

### Required GitHub Secrets

Add these in **GitHub → Repository → Settings → Secrets and variables → Actions**:

| Secret | Description |
|---|---|
| `CLOUDFLARE_API_TOKEN` | API token with *Cloudflare Workers Scripts:Edit* and *Cloudflare Pages:Edit* permissions |
| `CLOUDFLARE_ACCOUNT_ID` | Your Cloudflare Account ID (found in the dashboard right-hand panel) |
| `VITE_API_URL` | Full URL of your deployed worker, e.g. `https://cloudyforms-worker.<account>.workers.dev/api` |
| `VITE_TURNSTILE_SITE_KEY` | Cloudflare Turnstile site key (optional but recommended) |

### Creating a scoped API Token

1. Cloudflare Dashboard → **My Profile → API Tokens → Create Token**
2. Use the **Edit Cloudflare Workers** template and add **Cloudflare Pages:Edit** permission
3. Scope the token to your account
4. Copy the token value into the `CLOUDFLARE_API_TOKEN` GitHub Secret

### What the workflows do

**`deploy-worker.yml`**

- Runs `npm ci` in the `worker/` directory
- On push to `main`: runs `wrangler deploy` to publish the Worker to production
- Pull requests only trigger the install step (no deployment) so your CI still catches build errors

**`deploy-pages.yml`**

- Runs `npm ci` + `npm run build` in the `frontend/` directory (using `VITE_API_URL` and `VITE_TURNSTILE_SITE_KEY` from secrets)
- On push to `main`: deploys `frontend/dist` to the `cloudyforms` Pages project on the `main` branch
- On pull request: deploys a **preview** to a `pr-<number>` branch and posts the preview URL as a PR comment

The Worker must still be deployed via `wrangler deploy` (or the `deploy-worker.yml` GitHub Action) because Cloudflare Pages' built-in Git integration only covers the Pages frontend.

---

## Environment Variables

> **⚠️ Important:** Secrets must **never** be added to `wrangler.toml` or committed to
> your repository. Use `wrangler secret put <NAME>` for worker secrets and the Cloudflare
> Dashboard for Pages build variables.

### Worker

**Non-sensitive config** (safe to keep in `wrangler.toml` under `[vars]`):

| Variable | Required | Description |
|---|---|---|
| `FROM_EMAIL` | Yes | Sender address for emails |
| `ALLOWED_ORIGINS` | Optional | Comma-separated CORS origins (default `*`) |
| `ENVIRONMENT` | Optional | `development` enables verbose errors |

**Secrets** (set via `wrangler secret put <NAME>`):

| Secret | Required | Description |
|---|---|---|
| `JWT_SECRET` | Yes | JWT signing secret (32+ chars) |
| `TURNSTILE_SECRET_KEY` | Yes | Cloudflare Turnstile secret key |
| `MAILCHANNELS_API_KEY` | Optional | Mailchannels authenticated sending |

### Frontend

Set these as **environment variables in the Cloudflare Pages dashboard** (or pass them inline when building locally). Do not commit them to the repository.

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
