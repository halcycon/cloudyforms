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

| Route                                          | Component           | Auth        | Notes                                        |
|------------------------------------------------|---------------------|-------------|----------------------------------------------|
| `/login`                                       | LoginPage           | No          |                                              |
| `/register`                                    | RegisterPage        | No          |                                              |
| `/f/:slug`                                     | PublicFormPage      | No          | Full-page public form                        |
| `/embed/:slug`                                 | EmbedFormPage       | No          | iframe-optimised form                        |
| `/kiosk/:token`                                | KioskPage           | No          |                                              |
| `/fill/:token`                                 | PrefillSubmitPage   | No          | Token-based pre-fill submission (public)     |
| `/dashboard`                                   | DashboardPage       | Yes         |                                              |
| `/my-tasks`                                    | MyTasksPage         | Yes         | Workflow tasks assigned to current user      |
| `/forms`                                       | FormsPage           | Yes         |                                              |
| `/forms/new`                                   | FormBuilderPage     | Yes         | Fullscreen, no layout                        |
| `/forms/:formId/edit`                          | FormBuilderPage     | Yes         | Fullscreen, no layout                        |
| `/forms/:formId/responses`                     | ResponsesPage       | Yes         |                                              |
| `/forms/:formId/responses/:responseId/edit`    | ResponseEditPage    | Yes         | Office-use field completion / response edit  |
| `/forms/:formId/prefill`                       | PrefillFormPage     | Yes         | Pre-fill a form before sending to recipient  |
| `/orgs`                                        | OrganizationsPage   | Yes         |                                              |
| `/orgs/new`                                    | CreateOrgPage       | Yes         |                                              |
| `/orgs/:orgId`                                 | OrgDetailPage       | Yes         |                                              |
| `/orgs/:orgId/members`                         | OrgMembersPage      | Yes         |                                              |
| `/orgs/:orgId/settings`                        | OrgSettingsPage     | Yes         |                                              |
| `/orgs/:orgId/domains`                         | OrgDomainsPage      | Yes         |                                              |
| `/field-groups`                                | FieldGroupsPage     | Yes         |                                              |
| `/option-lists`                                | OptionListsPage     | Yes         | Reusable option lists for select/radio/checkbox fields |
| `/kiosk-setup`                                 | KioskSetupPage      | Yes         |                                              |
| `/settings`                                    | SettingsPage        | Yes         |                                              |
| `/admin`                                       | AdminPage           | Yes         | Super-admin only                             |
| `/admin/domains`                               | AdminDomainsPage    | Yes         | Super-admin only                             |

### Worker API Routes

All API routes are prefixed with `/api/`.

| Prefix                      | Module                    | Purpose                              |
|-----------------------------|---------------------------|--------------------------------------|
| `/api/auth`                 | `routes/auth.ts`          | Login, register, profile             |
| `/api/orgs`                 | `routes/organizations.ts` | Org CRUD, members, ACLs              |
| `/api/orgs/:orgId/groups`   | `routes/groups.ts`        | User groups within an org            |
| `/api/forms`                | `routes/forms.ts`         | Form CRUD, public form endpoint      |
| `/api/forms/:formId/workflow` | `routes/workflow.ts`    | Multi-stage workflow configuration   |
| `/api/responses`            | `routes/responses.ts`     | Submit + list + edit responses       |
| `/api/embed`                | `routes/embed.ts`         | JS widget script, embed config       |
| `/api/kiosk`                | `routes/kiosk.ts`         | Kiosk device management              |
| `/api/webhooks`             | `routes/webhooks.ts`      | Webhook management                   |
| `/api/field-groups`         | `routes/field-groups.ts`  | Reusable field templates             |
| `/api/option-lists`         | `routes/option-lists.ts`  | Reusable option lists                |
| `/api/users`                | `routes/users.ts`         | User management (super-admin)        |
| `/api/export`               | `routes/export.ts`        | CSV/JSON/PDF export                  |
| `/api/files`                | `routes/files.ts`         | R2 file upload/download              |
| `/api/admin/domains`        | `routes/domains.ts`       | Domain management (super-admin)      |

Key **public** (unauthenticated) endpoints:

- `GET  /api/forms/public/:slug`      — public form definition
- `POST /api/responses/:slug`         — submit a response (Turnstile-verified)
- `GET  /api/responses/draft/:token`  — fetch pre-filled draft (token-based)
- `POST /api/responses/draft/:token/submit` — submit a pre-filled draft
- `GET  /api/embed/script.js`         — embed widget JavaScript
- `GET  /api/embed/config/:slug`      — embed pre-load metadata

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

---

## Role Hierarchy

User roles within an organisation have a strict hierarchy (highest to lowest):

| Role    | Level |
|---------|-------|
| owner   | 5     |
| admin   | 4     |
| editor  | 3     |
| creator | 2     |
| viewer  | 1     |

The hierarchy is enforced by `requireRole()` in `worker/src/middleware/auth.ts`.
All 5 roles must be present in Zod schemas and UI dropdowns whenever roles are
listed or validated.

---

## Workflow System (Multi-Stage Sign-Off)

Forms support an optional multi-level sign-off workflow:

- **`form_workflow_stages`** table: `form_id`, `stage_order`, `allowed_roles`
  (JSON array), `allowed_groups` (JSON array of group IDs).
- Enabled per form via `FormSettings.workflowEnabled`.
- `form_responses.current_stage` tracks which stage a response is at.
- `FormField.fieldPermission.editableAtStage` links a field to a specific stage.
- `canUserActOnStage()` helper in `responses.ts` checks whether the authenticated
  user has permission to act on the current stage.

Key API endpoints:
- `GET/POST /api/forms/:formId/workflow` — list / create stages
- `GET /api/responses/my-tasks`          — workflow tasks for the current user
- `POST /api/responses/:responseId/advance` — advance to the next stage
- `GET /api/responses/:responseId/workflow-status` — detailed stage info

---

## Pre-Fill Workflow

Editors can pre-populate a form before sending it to a recipient:

1. `POST /api/responses/form/:formId/prefill` — creates a draft with a unique
   `draft_token` and returns a share URL (shown with a QR code via `qrcode.react`).
2. The recipient opens `/fill/:token` (`PrefillSubmitPage`) — this is a public
   route; no authentication required.
3. `GET /api/responses/draft/:token` — returns the form definition + pre-filled
   field values.
4. `POST /api/responses/draft/:token/submit` — converts the draft to a submitted
   response.

`form_responses` status values: `'draft'` → `'submitted'` → `'completed'`.
The `draft_token` column is unique and used only for pre-fill URLs.

---

## Theme System

Themes are applied hierarchically: **system default → org → user → form**.

- Six presets: `default`, `ocean`, `sunset`, `forest`, `rose`, `slate`.
- Three modes: `Light`, `Dark`, `System`.
- Theme definitions live in `frontend/src/lib/themes.ts`.
- `ThemeProvider` (`frontend/src/components/ThemeProvider.tsx`) resolves the
  active theme and writes CSS variables (`--primary`, `--background`, etc.) to
  `document.documentElement` as RGB triples.
- Dark mode uses Tailwind's `darkMode: 'class'` — the `.dark` class is toggled
  on `document.documentElement`.
- `theme` TEXT column (JSON `ThemeConfig`) exists on both the `users` and
  `organizations` tables (added in migration `003_add_theme_support.sql`).
- The platform system default is stored in `platform_settings` with key
  `'default_theme'`.
- Per-form theme/branding is stored in the `forms.branding` JSON column
  (`BrandingConfig.theme`).

---

## Database Migrations

- Schema DDL is in `worker/src/db/schema.sql` (uses `CREATE TABLE IF NOT EXISTS`
  — safe for new tables but does **not** add columns to existing tables).
- Column additions use numbered migration files:
  `worker/src/db/migrations/NNN_description.sql` with `ALTER TABLE ADD COLUMN`.
- Apply a migration:
  ```bash
  wrangler d1 execute cloudyforms --remote --file=src/db/migrations/NNN_xxx.sql
  ```
- Complex data (fields, settings, branding, document_template, workflow stages)
  is stored as JSON TEXT columns. Use `JSON_EXTRACT` in SQL or parse after fetch
  in `serializeForm()` (`worker/src/routes/forms.ts`).

---

## Key Field Concepts

### Office-Use Fields

`FormField.officeUse?: boolean` marks a field as internal/office-use only.
- Hidden in `'public'` mode of `FormRenderer`.
- Visible and editable in `'edit'` mode (office completion / `ResponseEditPage`).
- Toggled in the form builder via the Briefcase icon in `FieldEditor.tsx`.

### Conditional Logic

All field types (including layout fields: heading, paragraph, divider) support
conditional visibility rules. A field's `conditionalLogic` array controls when
it is shown or hidden based on other field values.

Conditional groups (`FormField.conditionalGroup`) let multiple fields share a
single show/hide condition: the group-start field's `conditionalLogic` controls
visibility for all fields with the same `groupId`.

### PDF / Document Template Export

`forms.document_template` (JSON) stores a PDF field-mapping config:

- `FieldMapping` supports `mappingId` (unique key), `fieldId`, `pdfFieldName`,
  `optionValue` (for radio/checkbox per-option mapping), and `optionRenderMode`
  (`'text'` / `'checkmark'` / `'cross'`).
- Multiple mappings per field are allowed (one per option for radio/checkbox).
- `isBoolean` applies only to checkbox fields without explicit options.
- Export logic is in `worker/src/routes/export.ts`.
- The UI for mapping is in
  `frontend/src/components/FormBuilder/DocumentTemplateEditor.tsx`.
