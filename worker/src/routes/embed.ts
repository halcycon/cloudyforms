/**
 * Embed routes.
 *
 * GET /api/embed/script.js
 *   Serves the self-contained JavaScript widget that site owners paste into
 *   their pages.  The script:
 *     1. Finds every element with [data-cloudyform] or [data-cloudyforms]
 *        attribute and creates an <iframe> pointing to /embed/:slug.
 *     2. Listens for postMessage resize events from the iframe so the iframe
 *        height adjusts dynamically (no scrollbars needed).
 *     3. Exposes a global CloudyForms.embed(slug, selector) API for
 *        programmatic use.
 *
 * GET /api/embed/config/:slug
 *   Returns minimal public form metadata (title, branding) so the embed
 *   script can set page-title / loading state before the iframe loads.
 */

import { Hono } from "hono";
import { dbQueryFirst } from "../lib/db";
import type { Bindings } from "../index";

export const embedRoutes = new Hono<{ Bindings: Bindings }>();

// ---------------------------------------------------------------------------
// JavaScript widget
// ---------------------------------------------------------------------------

/**
 * Builds the embed script.  We inline the base URL so the script knows where
 * to point iframes even when loaded from a CDN or custom domain.
 */
function buildEmbedScript(baseUrl: string): string {
  // Minified-style but still readable – bundled as a plain string so no build
  // step is needed on the worker side.
  return `(function(){
'use strict';
var BASE='${baseUrl}';
var ORIGIN='${new URL(baseUrl).origin}';

function createIframe(slug,container,opts){
  opts=opts||{};
  var iframe=document.createElement('iframe');
  iframe.src=BASE+'/embed/'+encodeURIComponent(slug)+(opts.theme?'?theme='+encodeURIComponent(opts.theme):'');
  iframe.style.cssText='width:100%;border:none;display:block;transition:height 0.2s ease;';
  iframe.setAttribute('data-cloudyforms-slug',slug);
  iframe.setAttribute('frameborder','0');
  iframe.setAttribute('scrolling','no');
  iframe.setAttribute('title','CloudyForms – '+slug);
  iframe.setAttribute('loading','lazy');
  iframe.setAttribute('allow','geolocation;camera');
  // Initial height while loading
  iframe.style.height='480px';
  container.innerHTML='';
  container.appendChild(iframe);
  return iframe;
}

// Listen for height updates from embedded iframes
window.addEventListener('message',function(e){
  if(!e.data||e.data.type!=='cloudyforms:resize') return;
  var iframes=document.querySelectorAll('iframe[data-cloudyforms-slug]');
  for(var i=0;i<iframes.length;i++){
    var f=iframes[i];
    try{
      if(f.contentWindow===e.source||
         (f.getAttribute('data-cloudyforms-slug')===e.data.slug)){
        f.style.height=(e.data.height+32)+'px';
      }
    }catch(err){}
  }
},false);

// Auto-initialise elements with data-cloudyform(s) attribute
function autoInit(){
  var els=document.querySelectorAll('[data-cloudyform],[data-cloudyforms]');
  for(var i=0;i<els.length;i++){
    var el=els[i];
    var slug=el.getAttribute('data-cloudyform')||el.getAttribute('data-cloudyforms');
    if(slug&&!el.getAttribute('data-cf-init')){
      el.setAttribute('data-cf-init','1');
      createIframe(slug,el,{theme:el.getAttribute('data-theme')||''});
    }
  }
}

if(document.readyState==='loading'){
  document.addEventListener('DOMContentLoaded',autoInit);
}else{
  autoInit();
}

// Public API
window.CloudyForms=window.CloudyForms||{};
window.CloudyForms.embed=function(slug,selector,opts){
  var containers=typeof selector==='string'
    ?document.querySelectorAll(selector)
    :[selector];
  for(var i=0;i<containers.length;i++){
    createIframe(slug,containers[i],opts||{});
  }
};
})();`;
}

embedRoutes.get("/script.js", (c) => {
  // Determine canonical base URL from request
  const proto = c.req.header("X-Forwarded-Proto") ?? "https";
  const host = c.req.header("Host") ?? "localhost";
  const baseUrl = `${proto}://${host}`;

  const script = buildEmbedScript(baseUrl);

  return new Response(script, {
    headers: {
      "Content-Type": "application/javascript; charset=utf-8",
      // Cache for 5 minutes (short so updates propagate quickly)
      "Cache-Control": "public, max-age=300",
      // Allow any origin to load the script
      "Access-Control-Allow-Origin": "*",
    },
  });
});

// ---------------------------------------------------------------------------
// Public form config (for embed pre-loading)
// ---------------------------------------------------------------------------

embedRoutes.get("/config/:slug", async (c) => {
  const { slug } = c.req.param();
  const form = await dbQueryFirst<{
    id: string;
    title: string;
    description: string | null;
    status: string;
    access_type: string;
    branding: string;
    settings: string;
  }>(
    c.env.DB,
    "SELECT id, title, description, status, access_type, branding, settings FROM forms WHERE slug = ?",
    [slug]
  );

  if (!form) {
    return c.json({ error: "Form not found" }, 404);
  }
  if (form.status !== "published") {
    return c.json({ error: "Form is not available" }, 404);
  }

  let branding: Record<string, unknown> = {};
  try {
    branding = JSON.parse(form.branding ?? "{}") as Record<string, unknown>;
  } catch {
    // use empty branding
  }

  return c.json({
    id: form.id,
    title: form.title,
    description: form.description,
    accessType: form.access_type,
    branding,
  });
});
