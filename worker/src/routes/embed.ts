/**
 * Embed routes.
 *
 * GET /api/embed/script.js
 *   Serves the embed widget. Supports two modes selected per-container:
 *
 *   Iframe mode (default) — <div data-cloudyform="slug">
 *     Replaces the container with an <iframe> pointing at /embed/:slug.
 *     The form is fully rendered inside the iframe with CloudyForms styling.
 *     Iframe height auto-adjusts via postMessage.
 *
 *   Headless mode — <div data-cloudyform="slug" data-cf-headless>
 *     Fetches the form definition and renders plain <form> HTML directly into
 *     the host page's DOM. No iframe, no CloudyForms CSS — the host site's
 *     own stylesheet applies to all inputs naturally.
 *
 * GET /api/embed/form/:slug
 *   Returns the full public form definition (fields, settings, etc.) for use
 *   by the headless embed script.
 *
 * POST /api/embed/upload/:slug
 *   Public file upload endpoint scoped to a published form. Returns a file key
 *   that is included in the form submission data.
 *
 * GET /api/embed/config/:slug
 *   Returns minimal public form metadata (title, branding) for pre-loading
 *   state. Retained for backwards compatibility.
 */

import { Hono } from "hono";
import { dbQueryFirst } from "../lib/db";
import { uploadFile } from "../lib/r2";
import { generateId } from "../lib/auth";
import type { Bindings } from "../index";

export const embedRoutes = new Hono<{ Bindings: Bindings }>();

// ---------------------------------------------------------------------------
// Headless JavaScript widget
// ---------------------------------------------------------------------------

function buildEmbedScript(baseUrl: string): string {
  return `(function(){
'use strict';
var BASE='${baseUrl}';

// ── Utility ────────────────────────────────────────────────────────────────

function el(tag,attrs,children){
  var e=document.createElement(tag);
  if(attrs){Object.keys(attrs).forEach(function(k){
    if(k==='style'&&typeof attrs[k]==='object'){
      Object.assign(e.style,attrs[k]);
    } else if(k==='className'){
      e.className=attrs[k];
    } else {
      e.setAttribute(k,attrs[k]);
    }
  });}
  if(children){[].concat(children).forEach(function(c){
    if(c==null) return;
    e.appendChild(typeof c==='string'?document.createTextNode(c):c);
  });}
  return e;
}

// ── Field renderers ─────────────────────────────────────────────────────────

function renderText(field,type){
  var input=el('input',{
    type:type||'text',
    id:'cf-'+field.id,
    name:field.id,
    placeholder:field.placeholder||'',
    required:field.required?'required':null,
    'data-cf-field':field.id
  });
  if(field.validation){
    if(field.validation.minLength) input.setAttribute('minlength',field.validation.minLength);
    if(field.validation.maxLength) input.setAttribute('maxlength',field.validation.maxLength);
    if(field.validation.pattern)   input.setAttribute('pattern',field.validation.pattern);
  }
  return input;
}

function renderTextarea(field){
  var ta=el('textarea',{
    id:'cf-'+field.id,
    name:field.id,
    placeholder:field.placeholder||'',
    required:field.required?'required':null,
    rows:'4',
    'data-cf-field':field.id
  });
  if(field.validation){
    if(field.validation.minLength) ta.setAttribute('minlength',field.validation.minLength);
    if(field.validation.maxLength) ta.setAttribute('maxlength',field.validation.maxLength);
  }
  return ta;
}

function renderSelect(field){
  var sel=el('select',{
    id:'cf-'+field.id,
    name:field.id,
    required:field.required?'required':null,
    'data-cf-field':field.id
  });
  sel.appendChild(el('option',{value:''},field.placeholder||'— select —'));
  (field.options||[]).forEach(function(opt){
    var o=el('option',{value:opt.value},opt.label);
    if(opt.default) o.setAttribute('selected','selected');
    sel.appendChild(o);
  });
  return sel;
}

function renderRadio(field){
  var wrap=el('div',{'data-cf-field':field.id});
  (field.options||[]).forEach(function(opt){
    var id='cf-'+field.id+'-'+opt.value;
    var label=el('label',{for:id});
    var input=el('input',{type:'radio',id:id,name:field.id,value:opt.value});
    if(opt.default) input.setAttribute('checked','checked');
    if(field.required) input.setAttribute('required','required');
    label.appendChild(input);
    label.appendChild(document.createTextNode(' '+opt.label));
    wrap.appendChild(label);
  });
  return wrap;
}

function renderCheckbox(field){
  // Single boolean checkbox (no options)
  if(!field.options||!field.options.length){
    var id='cf-'+field.id;
    var wrap=el('div',{'data-cf-field':field.id});
    var input=el('input',{type:'checkbox',id:id,name:field.id,value:'true'});
    if(field.required) input.setAttribute('required','required');
    var label=el('label',{for:id},field.label);
    wrap.appendChild(input);
    wrap.appendChild(label);
    return wrap;
  }
  // Multi-option checkboxes
  var wrap=el('div',{'data-cf-field':field.id});
  (field.options||[]).forEach(function(opt){
    var id='cf-'+field.id+'-'+opt.value;
    var label=el('label',{for:id});
    var input=el('input',{type:'checkbox',id:id,name:field.id,value:opt.value});
    if(opt.default) input.setAttribute('checked','checked');
    label.appendChild(input);
    label.appendChild(document.createTextNode(' '+opt.label));
    wrap.appendChild(label);
  });
  return wrap;
}

function renderFile(field){
  var wrap=el('div',{'data-cf-file-wrap':field.id,'data-cf-field':field.id});
  var input=el('input',{
    type:'file',
    id:'cf-'+field.id,
    name:field.id,
    accept:field.accept||'',
    'data-cf-field':field.id
  });
  if(field.multiple) input.setAttribute('multiple','multiple');
  if(field.required) input.setAttribute('required','required');
  wrap.appendChild(input);
  return wrap;
}

function renderRating(field){
  var max=field.max||5;
  var wrap=el('div',{'data-cf-field':field.id,'data-cf-rating':'1',style:{display:'flex',gap:'0.25em'}});
  var hidden=el('input',{type:'hidden',name:field.id,'data-cf-rating-val':field.id});
  wrap.appendChild(hidden);
  for(var i=1;i<=max;i++){
    (function(val){
      var btn=el('button',{type:'button','data-cf-star':val,style:{cursor:'pointer',background:'none',border:'none',fontSize:'1.5em',padding:'0'}},'\u2605');
      btn.addEventListener('click',function(){
        hidden.value=String(val);
        wrap.querySelectorAll('[data-cf-star]').forEach(function(s){
          s.style.opacity=Number(s.getAttribute('data-cf-star'))<=val?'1':'0.3';
        });
      });
      wrap.appendChild(btn);
    })(i);
  }
  return wrap;
}

function renderScale(field){
  var min=field.min||1, max=field.max||10, step=field.step||1;
  var wrap=el('div',{'data-cf-field':field.id});
  var input=el('input',{
    type:'range',
    id:'cf-'+field.id,
    name:field.id,
    min:min,
    max:max,
    step:step,
    value:min,
    'data-cf-field':field.id
  });
  if(field.required) input.setAttribute('required','required');
  var display=el('span',{style:{marginLeft:'0.5em'}},String(min));
  input.addEventListener('input',function(){display.textContent=input.value;});
  wrap.appendChild(input);
  wrap.appendChild(display);
  return wrap;
}

function renderSignature(field,formEl){
  var wrap=el('div',{'data-cf-field':field.id});
  var canvas=el('canvas',{
    id:'cf-'+field.id,
    width:'400',
    height:'150',
    style:{border:'1px solid currentColor',cursor:'crosshair',touchAction:'none',maxWidth:'100%',display:'block'}
  });
  var hidden=el('input',{type:'hidden',name:field.id,'data-cf-sig':field.id});
  var clearBtn=el('button',{type:'button',style:{marginTop:'0.25em',fontSize:'0.8em'}},'Clear');

  var drawing=false;
  var ctx=canvas.getContext('2d');
  ctx.strokeStyle='currentColor';
  ctx.lineWidth=2;
  ctx.lineCap='round';

  function pos(e){
    var r=canvas.getBoundingClientRect();
    var src=e.touches?e.touches[0]:e;
    return {x:src.clientX-r.left,y:src.clientY-r.top};
  }
  canvas.addEventListener('mousedown',function(e){drawing=true;ctx.beginPath();var p=pos(e);ctx.moveTo(p.x,p.y);});
  canvas.addEventListener('mousemove',function(e){if(!drawing)return;var p=pos(e);ctx.lineTo(p.x,p.y);ctx.stroke();});
  canvas.addEventListener('mouseup',function(){drawing=false;hidden.value=canvas.toDataURL();});
  canvas.addEventListener('mouseleave',function(){drawing=false;});
  canvas.addEventListener('touchstart',function(e){e.preventDefault();drawing=true;ctx.beginPath();var p=pos(e);ctx.moveTo(p.x,p.y);},{passive:false});
  canvas.addEventListener('touchmove',function(e){e.preventDefault();if(!drawing)return;var p=pos(e);ctx.lineTo(p.x,p.y);ctx.stroke();},{passive:false});
  canvas.addEventListener('touchend',function(){drawing=false;hidden.value=canvas.toDataURL();});
  clearBtn.addEventListener('click',function(){ctx.clearRect(0,0,canvas.width,canvas.height);hidden.value='';});

  if(field.required){
    // validate on submit
    formEl.addEventListener('cf:presend',function(){
      if(!hidden.value) throw new Error(field.label+' is required');
    });
  }

  wrap.appendChild(canvas);
  wrap.appendChild(clearBtn);
  wrap.appendChild(hidden);
  return wrap;
}

// ── Field wrapper (label + input + error slot) ──────────────────────────────

function renderField(field,formEl){
  var type=field.type;

  // Layout-only elements
  if(type==='heading'){
    var level=field.level||2;
    return el('h'+level,{'data-cf-field':field.id},field.content||field.label);
  }
  if(type==='paragraph'){
    return el('p',{'data-cf-field':field.id},field.content||'');
  }
  if(type==='divider'){
    return el('hr',{'data-cf-field':field.id});
  }
  // Hidden fields
  if(type==='hidden'&&!field.visibleToUser){
    var h=el('input',{type:'hidden',name:field.id});
    if(field.defaultValue) h.setAttribute('value',field.defaultValue);
    return h;
  }

  var wrap=el('div',{'data-cf-field-wrap':field.id,className:'cf-field'});
  var label=el('label',{for:'cf-'+field.id},field.label+(field.required?' *':''));
  wrap.appendChild(label);

  if(field.description){
    wrap.appendChild(el('small',{'data-cf-desc':field.id},field.description));
  }

  var input;
  if(type==='text'||type==='email'||type==='phone'||type==='number'||type==='date'){
    var htmlType=type==='phone'?'tel':type;
    input=renderText(field,htmlType);
  } else if(type==='textarea'){
    input=renderTextarea(field);
  } else if(type==='select'||type==='multiselect'){
    input=renderSelect(field);
    if(type==='multiselect') input.setAttribute('multiple','multiple');
  } else if(type==='radio'){
    input=renderRadio(field);
  } else if(type==='checkbox'){
    input=renderCheckbox(field);
  } else if(type==='file'){
    input=renderFile(field);
  } else if(type==='rating'){
    input=renderRating(field);
  } else if(type==='scale'){
    input=renderScale(field);
  } else if(type==='signature'){
    input=renderSignature(field,formEl);
  } else {
    // calculated / visibleToUser hidden — read-only display
    var ro=el('div',{'data-cf-field':field.id},field.defaultValue||'');
    wrap.appendChild(ro);
    return wrap;
  }

  wrap.appendChild(input);
  var errSlot=el('span',{'data-cf-err':field.id,style:{color:'red',fontSize:'0.85em',display:'none'}});
  wrap.appendChild(errSlot);
  return wrap;
}

// ── Collect form values ─────────────────────────────────────────────────────

function collectValues(formEl){
  var data={};
  // All named inputs
  new FormData(formEl).forEach(function(v,k){
    if(data[k]===undefined){
      data[k]=v;
    } else if(Array.isArray(data[k])){
      data[k].push(v);
    } else {
      data[k]=[data[k],v];
    }
  });
  return data;
}

// ── Upload any File objects in the data map ─────────────────────────────────

async function uploadFiles(data,slug){
  var promises=Object.keys(data).map(async function(k){
    var v=data[k];
    if(v instanceof File){
      var fd=new FormData();
      fd.append('file',v);
      var res=await fetch(BASE+'/api/embed/upload/'+encodeURIComponent(slug),{method:'POST',body:fd});
      if(!res.ok) throw new Error('File upload failed for field '+k);
      var json=await res.json();
      data[k]=json.key;
    } else if(Array.isArray(v)){
      data[k]=await Promise.all(v.map(async function(item){
        if(!(item instanceof File)) return item;
        var fd=new FormData();
        fd.append('file',item);
        var res=await fetch(BASE+'/api/embed/upload/'+encodeURIComponent(slug),{method:'POST',body:fd});
        if(!res.ok) throw new Error('File upload failed for field '+k);
        var json=await res.json();
        return json.key;
      }));
    }
  });
  await Promise.all(promises);
  return data;
}

// ── Render a form into a container ─────────────────────────────────────────

async function renderForm(slug,container){
  container.setAttribute('data-cf-loading','1');

  var res;
  try{
    res=await fetch(BASE+'/api/embed/form/'+encodeURIComponent(slug));
  }catch(e){
    container.removeAttribute('data-cf-loading');
    container.appendChild(el('p',{},'Could not load form.'));
    return;
  }

  if(!res.ok){
    container.removeAttribute('data-cf-loading');
    container.appendChild(el('p',{},'Form not available.'));
    return;
  }

  var form_def=await res.json();
  container.removeAttribute('data-cf-loading');

  var formEl=el('form',{'data-cf-form':slug,'novalidate':'novalidate'});

  // Render all fields
  (form_def.fields||[]).forEach(function(field){
    // Skip office-use and fully hidden fields
    if(field.officeUse) return;
    formEl.appendChild(renderField(field,formEl));
  });

  // Submit button
  var submitBtn=el('button',{type:'submit'},form_def.settings&&form_def.settings.submitButtonText?form_def.settings.submitButtonText:'Submit');
  formEl.appendChild(submitBtn);

  // Error summary
  var errorSummary=el('p',{style:{color:'red',display:'none'},'data-cf-error':slug});
  formEl.appendChild(errorSummary);

  formEl.addEventListener('submit',async function(e){
    e.preventDefault();

    // Clear previous errors
    formEl.querySelectorAll('[data-cf-err]').forEach(function(s){s.style.display='none';s.textContent='';});
    errorSummary.style.display='none';
    errorSummary.textContent='';

    // Fire presend hooks (signature required check etc.)
    try{
      var ev=new Event('cf:presend');
      formEl.dispatchEvent(ev);
    }catch(err){
      errorSummary.textContent=err.message;
      errorSummary.style.display='';
      return;
    }

    var data=collectValues(formEl);

    submitBtn.setAttribute('disabled','disabled');

    try{
      data=await uploadFiles(data,slug);
    }catch(err){
      errorSummary.textContent=err.message;
      errorSummary.style.display='';
      submitBtn.removeAttribute('disabled');
      return;
    }

    var payload={data:data};
    var r;
    try{
      r=await fetch(BASE+'/api/responses/submit/'+encodeURIComponent(slug),{
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body:JSON.stringify(payload)
      });
    }catch(e){
      errorSummary.textContent='Network error, please try again.';
      errorSummary.style.display='';
      submitBtn.removeAttribute('disabled');
      return;
    }

    if(r.ok){
      var result=await r.json();
      container.innerHTML='';
      container.appendChild(el('p',{'data-cf-success':slug},result.message||'Thank you!'));
      if(result.redirectUrl){
        setTimeout(function(){window.location.href=result.redirectUrl;},1500);
      }
    } else {
      var errData=await r.json().catch(function(){return {};});
      // Field-level errors (422) or general error
      if(errData.fieldErrors){
        Object.keys(errData.fieldErrors).forEach(function(fieldId){
          var slot=formEl.querySelector('[data-cf-err="'+fieldId+'"]');
          if(slot){slot.textContent=errData.fieldErrors[fieldId];slot.style.display='';}
        });
      }
      errorSummary.textContent=errData.error||'Submission failed, please try again.';
      errorSummary.style.display='';
      submitBtn.removeAttribute('disabled');
    }
  });

  container.appendChild(formEl);
}

// ── Iframe mode ─────────────────────────────────────────────────────────────

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

// ── Auto-init & public API ──────────────────────────────────────────────────

function initContainer(container){
  var slug=container.getAttribute('data-cloudyform')||container.getAttribute('data-cloudyforms');
  if(!slug||container.getAttribute('data-cf-init')) return;
  container.setAttribute('data-cf-init','1');
  if(container.hasAttribute('data-cf-headless')){
    renderForm(slug,container);
  } else {
    createIframe(slug,container,{theme:container.getAttribute('data-theme')||''});
  }
}

function init(){
  var els=document.querySelectorAll('[data-cloudyform],[data-cloudyforms]');
  for(var i=0;i<els.length;i++){ initContainer(els[i]); }
}

if(document.readyState==='loading'){
  document.addEventListener('DOMContentLoaded',init);
}else{
  init();
}

if(typeof MutationObserver!=='undefined'){
  new MutationObserver(function(mutations){
    for(var m=0;m<mutations.length;m++){
      var nodes=mutations[m].addedNodes;
      for(var n=0;n<nodes.length;n++){
        var node=nodes[n];
        if(node.nodeType!==1) continue;
        if(node.matches&&node.matches('[data-cloudyform],[data-cloudyforms]')){
          initContainer(node);
        }
        if(node.querySelectorAll){
          var nested=node.querySelectorAll('[data-cloudyform],[data-cloudyforms]');
          for(var j=0;j<nested.length;j++){ initContainer(nested[j]); }
        }
      }
    }
  }).observe(document.documentElement,{childList:true,subtree:true});
}

window.CloudyForms=window.CloudyForms||{};
// Iframe embed (default)
window.CloudyForms.embed=function(slug,selector,opts){
  var containers=typeof selector==='string'?document.querySelectorAll(selector):[selector];
  for(var i=0;i<containers.length;i++){createIframe(slug,containers[i],opts||{});}
};
// Headless embed
window.CloudyForms.embedHeadless=function(slug,selector){
  var containers=typeof selector==='string'?document.querySelectorAll(selector):[selector];
  for(var i=0;i<containers.length;i++){renderForm(slug,containers[i]);}
};

})();`;
}

embedRoutes.get("/script.js", (c) => {
  const proto = c.req.header("X-Forwarded-Proto") ?? "https";
  const host = c.req.header("X-Forwarded-Host") ?? c.req.header("Host") ?? "localhost";
  const baseUrl = `${proto}://${host}`;

  return new Response(buildEmbedScript(baseUrl), {
    headers: {
      "Content-Type": "application/javascript; charset=utf-8",
      "Cache-Control": "public, max-age=300",
      "Access-Control-Allow-Origin": "*",
    },
  });
});

// ---------------------------------------------------------------------------
// Public form definition (for headless embed)
// ---------------------------------------------------------------------------

embedRoutes.get("/form/:slug", async (c) => {
  const { slug } = c.req.param();
  const form = await dbQueryFirst<{
    id: string;
    title: string;
    description: string | null;
    status: string;
    access_type: string;
    fields: string;
    settings: string;
    branding: string;
  }>(
    c.env.DB,
    "SELECT id, title, description, status, access_type, fields, settings, branding FROM forms WHERE slug = ?",
    [slug]
  );

  if (!form || form.status !== "published") {
    return c.json({ error: "Form not found" }, 404);
  }

  let fields = [];
  let settings = {};
  let branding = {};
  try { fields = JSON.parse(form.fields ?? "[]"); } catch { /* */ }
  try { settings = JSON.parse(form.settings ?? "{}"); } catch { /* */ }
  try { branding = JSON.parse(form.branding ?? "{}"); } catch { /* */ }

  return c.json({
    id: form.id,
    title: form.title,
    description: form.description,
    accessType: form.access_type,
    fields,
    settings,
    branding,
  });
});

// ---------------------------------------------------------------------------
// Public file upload (scoped to a published form)
// ---------------------------------------------------------------------------

const ALLOWED_TYPES = new Set([
  "image/jpeg", "image/png", "image/gif", "image/webp", "image/svg+xml",
  "application/pdf",
  "text/plain", "text/csv",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "video/mp4", "video/webm",
  "audio/mpeg", "audio/wav",
]);
const MAX_SIZE = 10 * 1024 * 1024; // 10 MB

embedRoutes.post("/upload/:slug", async (c) => {
  const { slug } = c.req.param();

  // Verify the form exists and is published before accepting the upload
  const form = await dbQueryFirst<{ id: string }>(
    c.env.DB,
    "SELECT id FROM forms WHERE slug = ? AND status = 'published'",
    [slug]
  );
  if (!form) {
    return c.json({ error: "Form not found" }, 404);
  }

  const contentType = c.req.header("Content-Type") ?? "";
  if (!contentType.includes("multipart/form-data")) {
    return c.json({ error: "Request must be multipart/form-data" }, 400);
  }

  const formData = await c.req.formData();
  const file = formData.get("file") as File | null;

  if (!file || typeof file.arrayBuffer !== "function") {
    return c.json({ error: "No file provided" }, 400);
  }
  if (file.size > MAX_SIZE) {
    return c.json({ error: `File exceeds maximum size of ${MAX_SIZE / 1024 / 1024}MB` }, 413);
  }
  const mimeType = file.type || "application/octet-stream";
  if (!ALLOWED_TYPES.has(mimeType)) {
    return c.json({ error: "File type not allowed" }, 415);
  }

  const ext = file.name.split(".").pop() ?? "bin";
  const key = `${generateId()}.${ext}`;
  await uploadFile(c.env.R2, key, await file.arrayBuffer(), mimeType);

  return c.json({ key, url: `/api/files/${key}`, name: file.name, size: file.size }, 201);
});

// ---------------------------------------------------------------------------
// Public form config (retained for backwards compatibility)
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
  }>(
    c.env.DB,
    "SELECT id, title, description, status, access_type, branding FROM forms WHERE slug = ?",
    [slug]
  );

  if (!form || form.status !== "published") {
    return c.json({ error: "Form not found" }, 404);
  }

  let branding: Record<string, unknown> = {};
  try { branding = JSON.parse(form.branding ?? "{}") as Record<string, unknown>; } catch { /* */ }

  return c.json({
    id: form.id,
    title: form.title,
    description: form.description,
    accessType: form.access_type,
    branding,
  });
});
