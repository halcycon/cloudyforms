/**
 * Pages Function: proxy all /api/* requests to the CloudyForms Worker.
 *
 * The WORKER_BASE_URL variable is injected at deploy time via the Cloudflare
 * Pages dashboard (Settings → Environment variables) so the Worker URL never
 * appears in the repository.
 *
 * Set WORKER_BASE_URL to: https://cloudyforms-worker.adam-57b.workers.dev
 */
export async function onRequest(context) {
  const workerBase = context.env.WORKER_BASE_URL?.replace(/\/$/, "");

  if (!workerBase) {
    return new Response("WORKER_BASE_URL not configured", { status: 502 });
  }

  const url = new URL(context.request.url);
  const targetUrl = workerBase + url.pathname + url.search;

  // Forward the original host so the Worker builds the correct embed baseUrl
  const headers = new Headers(context.request.headers);
  headers.set("X-Forwarded-Host", url.hostname);
  headers.set("X-Forwarded-Proto", "https");

  const response = await fetch(targetUrl, {
    method: context.request.method,
    headers,
    body: ["GET", "HEAD"].includes(context.request.method)
      ? undefined
      : context.request.body,
  });

  return response;
}
