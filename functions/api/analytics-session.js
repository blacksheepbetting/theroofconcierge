import {
  isValidClientId,
  isValidEntryPath,
  isValidSessionId,
  jsonResponse
} from "../../src/server-tracking.js";

const ATTRIBUTION_TTL_SECONDS = 24 * 60 * 60;

export async function onRequestPost({ request, env }) {
  if (!env.LEAD_ATTRIBUTION) {
    return jsonResponse({ error: "Attribution storage is not configured." }, 503);
  }

  const requestOrigin = new URL(request.url).origin;
  if (request.headers.get("Origin") !== requestOrigin) {
    return jsonResponse({ error: "Origin not allowed." }, 403);
  }

  const contentLength = Number(request.headers.get("Content-Length") || 0);
  if (contentLength > 4096) {
    return jsonResponse({ error: "Request is too large." }, 413);
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return jsonResponse({ error: "Invalid JSON." }, 400);
  }

  const { clientId, sessionId, entryPath } = body || {};
  if (
    !isValidClientId(clientId) ||
    !isValidSessionId(sessionId) ||
    !isValidEntryPath(entryPath)
  ) {
    return jsonResponse({ error: "Invalid analytics context." }, 400);
  }

  const token = crypto.randomUUID();
  await env.LEAD_ATTRIBUTION.put(
    `attribution:${token}`,
    JSON.stringify({
      clientId,
      sessionId: String(sessionId),
      entryPath,
      createdAt: new Date().toISOString()
    }),
    { expirationTtl: ATTRIBUTION_TTL_SECONDS }
  );

  return jsonResponse({ token }, 201);
}

export function onRequest() {
  return jsonResponse({ error: "Method not allowed." }, 405);
}
