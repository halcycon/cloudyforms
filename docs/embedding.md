# Embedding CloudyForms

CloudyForms can be embedded in any website — static or dynamic — via two
rendering modes and several integration methods:

| Mode | How it works | Best for |
|------|-------------|----------|
| **Iframe** (default) | Form renders inside an `<iframe>` with CloudyForms styling | JS widget embeds, standalone form pages |
| **Headless** | Form fields render directly in your page's DOM — no iframe, no CloudyForms CSS | Hugo/SSG sites, anywhere you want the form to inherit your site's own styles |

---

## Table of Contents

1. [Quick Start](#quick-start)
2. [iframe Embed](#iframe-embed)
3. [JavaScript Widget](#javascript-widget)
4. [Headless Mode](#headless-mode)
5. [Hugo Static Sites](#hugo-static-sites)
6. [Other Static Site Generators](#other-static-site-generators)
7. [Customisation Options](#customisation-options)
8. [postMessage API](#postmessage-api)
9. [Content Security Policy (CSP)](#content-security-policy-csp)
10. [Troubleshooting](#troubleshooting)

---

## Quick Start

**Iframe mode** — form renders with CloudyForms styling inside an iframe:

```html
<script src="https://your-instance.pages.dev/api/embed/script.js" defer></script>
<div data-cloudyforms="your-form-slug"></div>
```

**Headless mode** — form fields render directly in your page, inheriting your site's own CSS:

```html
<script src="https://your-instance.pages.dev/api/embed/script.js" defer></script>
<div data-cloudyforms="your-form-slug" data-cf-headless></div>
```

The only difference is the `data-cf-headless` attribute. See [Headless Mode](#headless-mode) for details.

You can also find ready-to-copy embed snippets inside the **Form Builder →
Embed** tab for every form.

---

## iframe Embed

Use this when you need full control or the JS widget cannot be loaded (e.g.
strict CSP without `script-src` for your CloudyForms origin).

```html
<iframe
  src="https://your-instance.pages.dev/embed/your-form-slug"
  style="width:100%;border:none;min-height:480px;"
  frameborder="0"
  scrolling="no"
  title="Contact form"
  loading="lazy"
></iframe>

<!-- Optional: auto-resize the iframe to fit the form -->
<script>
  window.addEventListener('message', function(e) {
    if (e.data && e.data.type === 'cloudyforms:resize') {
      document.querySelectorAll('iframe[src*="your-form-slug"]')
        .forEach(function(f) { f.style.height = (e.data.height + 32) + 'px'; });
    }
  });
</script>
```

> **Tip:** Replace `your-instance.pages.dev` with your actual CloudyForms URL
> and `your-form-slug` with the slug shown in the Form Builder.

---

## JavaScript Widget

The JS widget is the recommended approach. It automatically discovers every
element with a `data-cloudyforms` (or `data-cloudyform`) attribute and replaces
it with a responsive, auto-resizing iframe.

```html
<!-- Load once per page -->
<script src="https://your-instance.pages.dev/api/embed/script.js" defer></script>

<!-- Place wherever you want the form -->
<div data-cloudyforms="your-form-slug"></div>
```

### Multiple forms on one page

```html
<script src="https://your-instance.pages.dev/api/embed/script.js" defer></script>

<div data-cloudyforms="contact-form"></div>
<div data-cloudyforms="feedback-survey"></div>
```

### Programmatic API

```html
<script src="https://your-instance.pages.dev/api/embed/script.js" defer></script>
<div id="my-form"></div>
<script>
  document.addEventListener('DOMContentLoaded', function() {
    CloudyForms.embed('your-form-slug', '#my-form', { theme: 'dark' });
  });
</script>
```

### Dynamic / SPA navigation

The embed script includes a `MutationObserver` that watches for new
`data-cloudyforms` elements added to the DOM at any time — including after
client-side navigation in an SPA or after Turbo/PJAX page transitions in Hugo
themes. You do **not** need to manually re-initialise the script after
navigation.

---

## Headless Mode

Headless mode renders the form's fields as plain HTML directly into your page's
DOM — no `<iframe>`, no CloudyForms stylesheet. Your site's existing CSS applies
to `<input>`, `<label>`, `<select>`, `<textarea>` etc. just as it would for any
other form on your site.

### When to use headless

- Your site has its own design system and you want the form to look native
- You're using a static site generator (Hugo, Astro, Jekyll, Eleventy) and want
  the form to inherit the site's typography and spacing
- You want full control over form styling via your own CSS

### When to use iframe (default)

- You want the form to look exactly as designed in the CloudyForms form builder
- You're embedding on a third-party site you don't control
- You're using form branding (custom colours, logo) configured in the form builder

### Enabling headless mode

Add `data-cf-headless` to the container div:

```html
<script src="https://your-instance.pages.dev/api/embed/script.js" defer></script>
<div data-cloudyforms="your-form-slug" data-cf-headless></div>
```

### Styling headless forms

The script adds no styles of its own. Target the wrapper and its children with
your own CSS:

```css
/* Target the form wrapper */
[data-cloudyform] form { /* your form styles */ }

/* Target fields */
[data-cloudyform] .cf-field { margin-bottom: 1rem; }
[data-cloudyform] label { display: block; font-weight: 600; }
[data-cloudyform] input,
[data-cloudyform] select,
[data-cloudyform] textarea { width: 100%; padding: 0.5rem; }

/* Success message */
[data-cf-success] { color: green; }
```

### Programmatic headless API

```js
CloudyForms.embedHeadless('your-form-slug', '#my-container');
```

### Turnstile / bot protection

You do not need to disable Turnstile when using headless mode. The public form
(accessible directly at `/f/your-slug`) remains fully Turnstile-protected.
Headless embed submissions are exempted automatically.

**How it works:**

1. When the embed script fetches `GET /api/embed/form/:slug` to load the form
   definition, the server mints a short-lived signed token
   (`embedToken`, valid for 1 hour) scoped to that form slug.
2. The token is included automatically in the submission payload when the user
   submits the headless form.
3. The server verifies the token's signature and slug before skipping the
   Turnstile check. An invalid, expired, or mismatched token falls back to
   requiring a Turnstile challenge.

Bots targeting `POST /api/responses/submit/:slug` directly never receive a
valid `embedToken` (it is only issued by the authenticated form-fetch endpoint),
so they still face the full Turnstile challenge.

### Supported field types in headless mode

All field types are supported: text, email, phone, number, date, textarea,
select, multiselect, radio, checkbox, file upload, star rating, scale/slider,
signature (canvas), heading, paragraph, divider, and hidden fields.

---

## Hugo Static Sites

Hugo is a popular static site generator often hosted on Cloudflare Pages. The
CloudyForms embed script works well with Hugo — including themes that use
[Turbo](https://turbo.hotwired.dev/) or similar client-side navigation — because
the script's `MutationObserver` automatically initialises new form containers
when they appear in the DOM.

### Option A — Hugo Shortcode (recommended)

Create a reusable shortcode so content authors can embed forms from any markdown
file with a single line.

**1. Create the shortcode file**

```
layouts/shortcodes/cloudyforms.html
```

```html
{{- $slug     := .Get "slug" | default (.Get 0) -}}
{{- $theme    := .Get "theme" | default "" -}}
{{- $headless := .Get "headless" | default "true" -}}
{{- $base     := site.Params.cloudyformsUrl | default "https://your-instance.pages.dev" -}}

{{- if $slug -}}
<div
  data-cloudyforms="{{ $slug }}"
  {{- if eq $headless "true" }} data-cf-headless{{ end }}
  {{- if $theme }} data-theme="{{ $theme }}"{{ end }}
  style="min-height:200px;"
></div>

{{- /* Load the widget script once per page via a scratch guard */ -}}
{{- if not (.Page.Scratch.Get "cloudyforms-script-loaded") -}}
  {{- .Page.Scratch.Set "cloudyforms-script-loaded" true -}}
  <script src="{{ $base }}/api/embed/script.js" defer></script>
{{- end -}}
{{- else -}}
  <!-- cloudyforms shortcode: missing "slug" parameter -->
{{- end -}}
```

> **Headless is the default for Hugo.** The shortcode uses headless mode by
> default so the form inherits your site's CSS. To use the iframe mode instead,
> pass `headless="false"`:
>
> ```markdown
> {{</* cloudyforms slug="contact" headless="false" */>}}
> ```

**2. (Optional) Set your CloudyForms URL in `hugo.toml` / `config.toml`**

```toml
[params]
  cloudyformsUrl = "https://your-instance.pages.dev"
```

If omitted, the shortcode defaults to `https://your-instance.pages.dev` — update
the fallback in the shortcode file to match your actual URL.

**3. Use the shortcode in any content file**

```markdown
---
title: "Contact Us"
---

Fill in the form below and we'll get back to you within 24 hours.

{{</* cloudyforms slug="contact-form" */>}}
```

Or with the positional syntax:

```markdown
{{</* cloudyforms "contact-form" */>}}
```

Dark theme:

```markdown
{{</* cloudyforms slug="feedback" theme="dark" */>}}
```

### Option B — Directly in a Hugo Layout / Partial

If you want the form in a layout template rather than markdown content, add the
script and container directly:

```html
<!-- layouts/partials/contact-form.html -->
<section class="my-8">
  <div data-cloudyforms="contact-form"></div>
  <script src="{{ site.Params.cloudyformsUrl }}/api/embed/script.js" defer></script>
</section>
```

Then include it: `{{ partial "contact-form.html" . }}`

### Option C — Raw HTML in Markdown

Hugo passes inline HTML through to the output by default (Goldmark renderer
requires `markup.goldmark.renderer.unsafe = true` in your Hugo config). You can
paste the JS widget snippet directly:

```markdown
---
title: "Contact"
---

<script src="https://your-instance.pages.dev/api/embed/script.js" defer></script>
<div data-cloudyforms="contact-form"></div>
```

> **Note:** If raw HTML is stripped, enable unsafe rendering in `hugo.toml`:
>
> ```toml
> [markup.goldmark.renderer]
>   unsafe = true
> ```
>
> The shortcode approach (Option A) avoids this requirement entirely.

### Hugo on Cloudflare Pages — Same-Stack Deployment

When both your Hugo site and CloudyForms are on Cloudflare Pages, requests stay
within Cloudflare's edge network for minimal latency. Typical setup:

| Project          | Cloudflare Pages project | URL                              |
|------------------|--------------------------|----------------------------------|
| Hugo site        | `my-site`                | `https://my-site.pages.dev`      |
| CloudyForms      | `cloudyforms`            | `https://cloudyforms.pages.dev`  |

The embed `<script>` and `<iframe>` load cross-origin, but this is fully
supported — the embed script sets `Access-Control-Allow-Origin: *` and the
iframes use `postMessage` for communication.

If you use a custom domain for CloudyForms (e.g. `forms.yourdomain.com`), update
the `cloudyformsUrl` parameter in your Hugo config accordingly.

---

## Other Static Site Generators

The JS widget approach works with **any** SSG (Astro, Next.js static export,
Eleventy, Jekyll, Gatsby, etc.) because it only needs a `<script>` tag and a
`<div>` with a data attribute. There is nothing Hugo-specific about the widget —
the Hugo shortcode above is just a convenience wrapper.

**Astro** example (`.astro` component):

```astro
---
// src/components/CloudyForm.astro
const { slug, theme, headless = true } = Astro.props;
const base = import.meta.env.PUBLIC_CLOUDYFORMS_URL ?? 'https://your-instance.pages.dev';
---
<div
  data-cloudyforms={slug}
  data-theme={theme ?? ''}
  data-cf-headless={headless ? '' : undefined}
  style="min-height:200px;"
></div>
<script src={`${base}/api/embed/script.js`} defer></script>
```

**Jekyll** `_includes/cloudyforms.html`:

```html
{% assign slug = include.slug %}
{% assign headless = include.headless | default: true %}
<div
  data-cloudyforms="{{ slug }}"
  {% if headless %}data-cf-headless{% endif %}
  style="min-height:200px;"
></div>
<script src="https://your-instance.pages.dev/api/embed/script.js" defer></script>
```

---

## Customisation Options

### Theme

Force dark mode by adding a `data-theme` attribute or query parameter:

```html
<div data-cloudyforms="my-form" data-theme="dark"></div>
```

Or via the iframe URL: `?theme=dark`

### Transparent Background

Useful when the form should blend with the host page background:

```
https://your-instance.pages.dev/embed/my-form?bg=transparent
```

### Form Branding

Per-form branding (primary colour, logo, background colour, text colour) is
configured in the Form Builder → Branding tab. The embedded form respects these
settings automatically.

---

## postMessage API

The embedded form sends the following `window.postMessage` events to the parent
window:

| Event | Payload | When |
|---|---|---|
| `cloudyforms:resize` | `{ type, slug, height }` | Form container height changes |
| `cloudyforms:submitted` | `{ type, slug, responseId }` | User successfully submits |

**Listen for submission:**

```js
window.addEventListener('message', function(event) {
  if (event.data?.type === 'cloudyforms:submitted') {
    console.log('Form submitted!', event.data.slug, event.data.responseId);
    // e.g. redirect, show a thank-you message, fire analytics event
  }
});
```

---

## Content Security Policy (CSP)

If your site sets a Content-Security-Policy header, allow these directives:

```
frame-src   https://your-instance.pages.dev;
script-src  https://your-instance.pages.dev;
```

Replace with your actual CloudyForms URL. If you're using a custom domain, use
that domain instead.

On **Cloudflare Pages**, you can set custom headers via a `public/_headers` file
in your Hugo project:

```
/*
  Content-Security-Policy: frame-src https://cloudyforms.pages.dev; script-src 'self' https://cloudyforms.pages.dev;
```

---

## Troubleshooting

| Problem | Solution |
|---|---|
| Form doesn't appear | Check the browser console for errors. Verify the form slug is correct and the form is published. |
| Shortcode renders as literal text | The shortcode file is missing. Create `layouts/shortcodes/cloudyforms.html` in your Hugo site with the content from [Option A](#option-a--hugo-shortcode-recommended) above. |
| iframe has scrollbars | Ensure the resize `<script>` is loaded (or use the JS widget which handles this automatically). |
| Raw HTML stripped in Hugo | Enable `markup.goldmark.renderer.unsafe = true` in `hugo.toml`, or use the shortcode approach instead. |
| Headless form has no styling | Expected — headless mode renders unstyled HTML. Add CSS targeting `[data-cloudyform] input` etc. to your site's stylesheet. |
| Headless form returns "Turnstile token required" | The embed token was not included in the submission. This should not happen in normal use — check that the form is being loaded via `GET /api/embed/form/:slug` before submission (i.e. the headless script is initialising correctly). |
| Form doesn't load after navigation | The JS widget's `MutationObserver` should handle this. If using a custom SPA router, call `CloudyForms.embed(slug, selector)` or `CloudyForms.embedHeadless(slug, selector)` manually after navigation. |
| CORS error in console | Embed routes allow all origins by default. If you see CORS errors, check that your CloudyForms Worker is deployed and accessible. |
| CSP blocks script/iframe | Add the CloudyForms origin to your site's `frame-src` and `script-src` CSP directives. |
