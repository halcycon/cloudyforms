/**
 * EmbedCode – shows all the ways a form can be shared or embedded.
 *
 * Used in the FormBuilder sidebar (as an extra tab) and in the FormsPage
 * share-form dialog.
 *
 * Sections:
 *  1. Direct link (share URL)
 *  2. iframe snippet
 *  3. JavaScript widget snippet (requires embed.js)
 */

import { useState } from 'react';
import { Copy, Check, Code2, Link2, Braces } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { cn } from '@/lib/utils';

interface EmbedCodeProps {
  formSlug: string;
  formTitle?: string;
  /** Override the base URL (defaults to window.location.origin) */
  baseUrl?: string;
}

function CodeBlock({ code, language = 'html' }: { code: string; language?: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    await navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="relative rounded-lg bg-gray-900 text-gray-100 text-xs font-mono">
      <div className="flex items-center justify-between px-3 py-2 border-b border-gray-700">
        <span className="text-gray-400 text-[10px] uppercase tracking-wide">{language}</span>
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6 text-gray-400 hover:text-white"
          onClick={copy}
          title="Copy to clipboard"
        >
          {copied ? <Check className="h-3.5 w-3.5 text-green-400" /> : <Copy className="h-3.5 w-3.5" />}
        </Button>
      </div>
      <pre className="overflow-x-auto p-3 leading-relaxed whitespace-pre-wrap break-all">
        <code>{code}</code>
      </pre>
    </div>
  );
}

function CopyInput({ value, label }: { value: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    await navigator.clipboard.writeText(value);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }
  return (
    <div className="space-y-1">
      {label && <p className="text-xs text-gray-500">{label}</p>}
      <div className="flex items-center gap-2 rounded-md border border-gray-200 bg-gray-50 px-3 py-2">
        <span className="flex-1 truncate text-sm font-mono text-gray-700">{value}</span>
        <button
          onClick={copy}
          className="flex-shrink-0 text-gray-400 hover:text-gray-700 transition-colors"
          title="Copy"
        >
          {copied ? (
            <Check className="h-4 w-4 text-green-500" />
          ) : (
            <Copy className="h-4 w-4" />
          )}
        </button>
      </div>
    </div>
  );
}

export function EmbedCode({ formSlug, formTitle = 'form', baseUrl }: EmbedCodeProps) {
  const origin = baseUrl ?? (typeof window !== 'undefined' ? window.location.origin : '');

  const directLink = `${origin}/f/${formSlug}`;
  const embedLink = `${origin}/embed/${formSlug}`;
  const scriptSrc = `${origin}/api/embed/script.js`;

  const iframeSnippet = `<!-- CloudyForms embed – ${formTitle} -->
<iframe
  src="${embedLink}"
  style="width:100%;border:none;min-height:480px;"
  frameborder="0"
  scrolling="no"
  title="${formTitle}"
  loading="lazy"
></iframe>
<script>
  /* Auto-resize the iframe to fit the form */
  window.addEventListener('message', function(e) {
    if (e.data && e.data.type === 'cloudyforms:resize') {
      var frames = document.querySelectorAll('iframe[src*="${formSlug}"]');
      frames.forEach(function(f) { f.style.height = (e.data.height + 32) + 'px'; });
    }
  });
</script>`;

  const jsSnippet = `<!-- Step 1: load the CloudyForms embed widget once per page -->
<script src="${scriptSrc}" defer></script>

<!-- Step 2: place this where you want the form to appear -->
<div data-cloudyforms="${formSlug}"></div>`;

  const jsApiSnippet = `<!-- Or use the JavaScript API for programmatic embedding -->
<script src="${scriptSrc}" defer></script>
<div id="my-form-container"></div>
<script>
  document.addEventListener('DOMContentLoaded', function() {
    CloudyForms.embed('${formSlug}', '#my-form-container');
  });
</script>`;

  return (
    <div className="space-y-4">
      {/* Direct link */}
      <div className="space-y-2">
        <div className="flex items-center gap-2 text-sm font-medium text-gray-700">
          <Link2 className="h-4 w-4" />
          Direct Link
        </div>
        <CopyInput value={directLink} label="Share this URL to let people fill in the form directly" />
      </div>

      <div className="border-t border-gray-100" />

      {/* Embed tabs */}
      <div className="space-y-2">
        <div className="flex items-center gap-2 text-sm font-medium text-gray-700">
          <Code2 className="h-4 w-4" />
          Embed in a Page
        </div>

        <Tabs defaultValue="iframe">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="iframe">iframe</TabsTrigger>
            <TabsTrigger value="js">
              <Braces className="h-3.5 w-3.5 mr-1" />
              JS Widget
            </TabsTrigger>
          </TabsList>

          {/* iframe */}
          <TabsContent value="iframe" className="mt-3 space-y-3">
            <p className="text-xs text-gray-500">
              Paste this snippet anywhere in your HTML. The iframe automatically resizes
              to fit the form content.
            </p>
            <CodeBlock code={iframeSnippet} language="html" />
            <IframeOptions embedLink={embedLink} formSlug={formSlug} />
          </TabsContent>

          {/* JS widget */}
          <TabsContent value="js" className="mt-3 space-y-3">
            <p className="text-xs text-gray-500">
              Load the CloudyForms script once per page, then use the{' '}
              <code className={cn('rounded bg-gray-100 px-1 font-mono text-[11px]')}>
                data-cloudyforms
              </code>{' '}
              attribute or the JavaScript API to embed forms anywhere.
            </p>
            <CodeBlock code={jsSnippet} language="html" />
            <details className="text-xs">
              <summary className="cursor-pointer text-gray-500 hover:text-gray-700">
                JavaScript API alternative
              </summary>
              <div className="mt-2">
                <CodeBlock code={jsApiSnippet} language="html" />
              </div>
            </details>
            <div className="rounded-md bg-blue-50 border border-blue-200 p-3 text-xs text-blue-700">
              <strong>Tip:</strong> The script tag only needs to be added once per page even
              if you are embedding multiple forms.
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}

// ── Helper: iframe customisation options ─────────────────────────────────────

function IframeOptions({
  embedLink,
  formSlug,
}: {
  embedLink: string;
  formSlug: string;
}) {
  const [theme, setTheme] = useState<'light' | 'dark'>('light');
  const [transparent, setTransparent] = useState(false);

  const params = new URLSearchParams();
  if (theme === 'dark') params.set('theme', 'dark');
  if (transparent) params.set('bg', 'transparent');
  const paramStr = params.toString();
  const finalSrc = paramStr ? `${embedLink}?${paramStr}` : embedLink;

  const customSnippet = `<iframe
  src="${finalSrc}"
  style="width:100%;border:none;min-height:480px;"
  frameborder="0"
  scrolling="no"
  title="Form"
  loading="lazy"
></iframe>
<script>
  window.addEventListener('message', function(e) {
    if (e.data && e.data.type === 'cloudyforms:resize') {
      var frames = document.querySelectorAll('iframe[src*="${formSlug}"]');
      frames.forEach(function(f) { f.style.height = (e.data.height + 32) + 'px'; });
    }
  });
</script>`;

  return (
    <details className="text-xs">
      <summary className="cursor-pointer text-gray-500 hover:text-gray-700">
        Customise appearance
      </summary>
      <div className="mt-3 space-y-3">
        <div className="flex flex-wrap gap-3">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={theme === 'dark'}
              onChange={(e) => setTheme(e.target.checked ? 'dark' : 'light')}
              className="rounded"
            />
            Dark theme
          </label>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={transparent}
              onChange={(e) => setTransparent(e.target.checked)}
              className="rounded"
            />
            Transparent background
          </label>
        </div>
        {(theme === 'dark' || transparent) && (
          <CodeBlock code={customSnippet} language="html" />
        )}
      </div>
    </details>
  );
}
