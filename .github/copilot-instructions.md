# CloudyForms — AI Agent Context

## Project Overview

CloudyForms is an open-source, self-hosted form-building platform running entirely
on Cloudflare's edge infrastructure (Workers, Pages, D1, R2). It is inspired by
Formbricks and supports multi-tenancy, white-labelling, embeddable forms, and
kiosk mode.

---

## Repository Layout

```
cloudyforms/
├── frontend/          # React + Vite SPA deployed to Cloudflare Pages
│   ├── src/
│   │   ├── App.tsx              # React Router routes
│   │   ├── main.tsx             # Entry point (BrowserRouter)
│   │   ├── index.css            # Global styles (Tailwind CSS)
│   │   ├── pages/               # Page-level components (20 pages)
│   │   ├── components/          # Reusable components
│   │   │   ├── FormBuilder/     # Drag-and-drop form designer
│   │   │   ├── FormRenderer/    # Renders forms for end-user submission
│   │   │   ├── ui/              # Radix-based primitives (Button, Input, etc.)
│   │   │   └── Layout/          # App shell (sidebar, nav)
│   │   └── lib/                 # Utilities
│   │       ├── api.ts           # Axios HTTP client (auth, forms, responses…)
│   │       ├── store.ts         # Zustand auth/state store
│   │       ├── types.ts         # Shared TypeScript types
│   │       └── utils.ts         # Helpers (cn, date formatting)
│   ├── package.json
│   ├── vite.config.ts           # Dev proxy /api → localhost:8787
│   └── tsconfig.app.json        # strict + noUnusedLocals/Parameters
│
├── worker/            # Hono API deployed as a Cloudflare Worker
│   ├── src/
│   │   ├── index.ts             # Hono app, CORS, route mounting
│   │   ├── routes/              # Route modules (auth, forms, responses, embed…)
│   │   ├── middleware/          # domain.ts (white-label), auth.ts
│   │   ├── db/
│   │   │   └── schema.sql       # D1 (SQLite) DDL
│   │   └── lib/                 # db.ts, auth.ts, email.ts, turnstile.ts
│   ├── wrangler.toml            # D1, R2 bindings; non-secret vars
│   ├── package.json
│   └── tsconfig.json            # strict (no noUnusedLocals)
│
├── docs/              # Additional documentation
│   └── embedding.md             # Embedding guide (iframe, JS widget, Hugo, SSGs)
├── README.md          # Setup, deployment, and usage guide
└── .github/
    └── workflows/
        ├── deploy-worker.yml    # CI: deploy worker on push to worker/
        └── deploy-pages.yml     # CI: deploy frontend on push to frontend/
```

---

## Tech Stack

| Layer       | Technology                                                              |
|-------------|-------------------------------------------------------------------------|
| Frontend    | React 18, React Router 6, Vite 5, Tailwind CSS 3, Radix UI, Zustand 5 |
| Forms       | React Hook Form 7 + Zod validation, @dnd-kit (drag-and-drop)           |
| Backend     | Hono 4 (Cloudflare Workers)                                            |
| Database    | Cloudflare D1 (SQLite)                                                 |
| File storage| Cloudflare R2                                                          |
| Auth        | JWT (jose library), stored in localStorage                              |
| Anti-spam   | Cloudflare Turnstile                                                   |
| Email       | Mailchannels (free on Workers)                                         |
| Deployment  | Cloudflare Pages (frontend) + Cloudflare Workers (API)                 |

---

## Key Conventions

### TypeScript

- **Frontend** tsconfig has `strict`, `noUnusedLocals`, and `noUnusedParameters`
  enabled — unused imports/variables will cause build errors.
- **Worker** tsconfig has `strict` but does **not** enforce unused variables.

### Data Storage

- Complex data (fields, settings, branding, document_template) is stored as
  JSON TEXT columns in D1. The `serializeForm()` function in
  `worker/src/routes/forms.ts` parses these columns. New JSON columns must
  follow the same pattern.

### API Client

- `frontend/src/lib/api.ts` uses Axios with a Bearer token interceptor.
- Base URL: `import.meta.env.VITE_API_URL ?? '/api'`.
- Note: `forms.update()` sends PATCH, but the worker handler is registered as
  `forms.put()`. Be aware of this mismatch in the existing codebase.

### Styling

- Tailwind utility classes throughout; Radix UI primitives in `components/ui/`.
- Branding colours are applied as CSS custom properties (`--primary`,
  `--foreground`) at runtime.

### Secrets

- Worker secrets (`JWT_SECRET`, `TURNSTILE_SECRET_KEY`, `MAILCHANNELS_API_KEY`)
  are set via `wrangler secret put` — never in `wrangler.toml` or `.env` files.
- Frontend env vars (`VITE_API_URL`, `VITE_TURNSTILE_SITE_KEY`) go in the
  Cloudflare Pages dashboard.

---

## Build & Dev Commands

```bash
# Frontend
cd frontend
npm install
npm run dev          # Vite dev server on :5173 (proxies /api → :8787)
npm run build        # tsc -b && vite build → dist/
npx tsc -b           # Type-check only

# Worker
cd worker
npm install
wrangler dev         # Local dev on :8787 (uses local D1)
npx tsc --noEmit     # Type-check only
wrangler deploy      # Deploy to Cloudflare
```

---

## Routing

### Frontend Routes

| Route                        | Component          | Auth | Notes                  |
|------------------------------|--------------------|------|------------------------|
| `/login`                     | LoginPage          | No   |                        |
| `/register`                  | RegisterPage       | No   |                        |
| `/f/:slug`                   | PublicFormPage      | No   | Full-page public form  |
| `/embed/:slug`               | EmbedFormPage      | No   | iframe-optimised form  |
| `/kiosk/:token`              | KioskPage          | No   |                        |
| `/dashboard`                 | DashboardPage      | Yes  |                        |
| `/forms`                     | FormsPage          | Yes  |                        |
| `/forms/new`                 | FormBuilderPage    | Yes  | Fullscreen, no layout  |
| `/forms/:formId/edit`        | FormBuilderPage    | Yes  | Fullscreen, no layout  |
| `/forms/:formId/responses`   | ResponsesPage      | Yes  |                        |
| `/orgs`, `/orgs/new`, etc.   | Org pages          | Yes  |                        |
| `/field-groups`              | FieldGroupsPage    | Yes  |                        |
| `/settings`                  | SettingsPage       | Yes  |                        |
| `/admin`                     | AdminPage          | Yes  | Super-admin only       |

### Worker API Routes

All API routes are prefixed with `/api/`.

| Prefix              | Module               | Purpose                           |
|---------------------|----------------------|-----------------------------------|
| `/api/auth`         | `routes/auth.ts`     | Login, register, profile          |
| `/api/orgs`         | `routes/organizations.ts` | Org CRUD, members, ACLs     |
| `/api/forms`        | `routes/forms.ts`    | Form CRUD, public form endpoint   |
| `/api/responses`    | `routes/responses.ts`| Submit + list responses           |
| `/api/embed`        | `routes/embed.ts`    | JS widget script, embed config    |
| `/api/kiosk`        | `routes/kiosk.ts`    | Kiosk device management           |
| `/api/webhooks`     | `routes/webhooks.ts` | Webhook management                |
| `/api/field-groups` | `routes/field-groups.ts` | Reusable field templates     |
| `/api/users`        | `routes/users.ts`    | User management (super-admin)     |
| `/api/export`       | `routes/export.ts`   | CSV/JSON export                   |
| `/api/files`        | `routes/files.ts`    | R2 file upload/download           |
| `/api/admin/domains`| `routes/domains.ts`  | Domain management (super-admin)   |

Key **public** (unauthenticated) endpoints:

- `GET  /api/forms/public/:slug` — public form definition
- `POST /api/responses/:slug`    — submit a response (Turnstile-verified)
- `GET  /api/embed/script.js`    — embed widget JavaScript
- `GET  /api/embed/config/:slug` — embed pre-load metadata

---

## Embedding Architecture

Forms can be embedded in any website via:

1. **iframe** — `<iframe src="https://…/embed/:slug">` with a companion
   inline `<script>` that listens for `postMessage` resize events.
2. **JS Widget** — `<script src="https://…/api/embed/script.js" defer>` plus
   `<div data-cloudyforms="slug">`. The script auto-creates iframes and handles
   resizing via `postMessage` + `MutationObserver` (for SPA/SSG navigation).
3. **Hugo shortcode** — documented in `docs/embedding.md`; wraps the JS Widget
   approach in a Hugo-native `{{< cloudyforms >}}` shortcode.

The embed script (`worker/src/routes/embed.ts`) is served dynamically with the
correct `BASE` URL inlined. CORS is open (`Access-Control-Allow-Origin: *`) for
embed routes.

`postMessage` events sent from the iframe to the parent:

- `{ type: 'cloudyforms:resize', slug, height }` — iframe height changed
- `{ type: 'cloudyforms:submitted', slug, responseId }` — form submitted

---

## Testing

There is currently no automated test suite. Validate changes by:

- Running `npx tsc -b` (frontend) or `npx tsc --noEmit` (worker) for type checks.
- Manual testing via `wrangler dev` + `npm run dev`.

---

## Deployment

- **Frontend**: Cloudflare Pages (recommended: link repo in Cloudflare Dashboard
  for auto-deploy). Root directory: `frontend/`, build command: `npm run build`,
  output: `dist/`.
- **Worker**: `cd worker && wrangler deploy`. Optionally automated via
  `.github/workflows/deploy-worker.yml`.
- **Secrets**: `wrangler secret put <NAME>` for worker secrets; Cloudflare Pages
  dashboard for frontend env vars.
