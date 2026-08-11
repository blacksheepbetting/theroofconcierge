import {
  GA4_MEASUREMENT_ID,
  getRoofrAttributionToken,
  isAuthorizedWebhook,
  isValidEntryPath,
  isValidLeadId,
  jsonResponse
} from "../../src/server-tracking.js";

const PROCESSED_LEAD_TTL_SECONDS = 180 * 24 * 60 * 60;

export async function onRequestPost({ request, env }) {
  if (
    !env.LEAD_ATTRIBUTION ||
    typeof env.GA4_API_SECRET !== "string" ||
    typeof env.ROOFR_WEBHOOK_SECRET !== "string"
  ) {
    return jsonResponse({ error: "Lead tracking is not configured." }, 503);
  }

  if (!isAuthorizedWebhook(request, env.ROOFR_WEBHOOK_SECRET)) {
    const authorization = request.headers.get("Authorization") || "";
    const hasBearerPrefix = authorization.startsWith("Bearer ");
    const suppliedSecret = hasBearerPrefix ? authorization.slice(7) : "";
    const responseBody = { error: "Unauthorized." };

    // Preview-only diagnostics reveal formatting/length mistakes without ever
    // returning either secret. Remove GA4_DEBUG_MODE after end-to-end QA.
    if (env.GA4_DEBUG_MODE === "true") {
      responseBody.debug = {
        authorization_header_present: Boolean(authorization),
        bearer_prefix_valid: hasBearerPrefix,
        supplied_secret_length: suppliedSecret.length,
        configured_secret_length: env.ROOFR_WEBHOOK_SECRET.length
      };
    }

    return jsonResponse(responseBody, 401);
  }

  const contentLength = Number(request.headers.get("Content-Length") || 0);
  if (contentLength > 16384) {
    return jsonResponse({ error: "Request is too large." }, 413);
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return jsonResponse({ error: "Invalid JSON." }, 400);
  }

  const leadId = body?.lead_id || body?.leadId;
  const leadFormUrl = body?.lead_form_url || body?.leadFormUrl;
  if (!isValidLeadId(leadId) || typeof leadFormUrl !== "string") {
    return jsonResponse({ error: "Invalid lead confirmation." }, 400);
  }

  const processedKey = `processed:${leadId}`;
  if (await env.LEAD_ATTRIBUTION.get(processedKey)) {
    return jsonResponse({ status: "duplicate_ignored" });
  }

  const token = getRoofrAttributionToken(leadFormUrl);
  if (!token) {
    return jsonResponse({ error: "Attribution token is missing or invalid." }, 422);
  }

  const attributionKey = `attribution:${token}`;
  const storedAttribution = await env.LEAD_ATTRIBUTION.get(attributionKey);
  if (!storedAttribution) {
    return jsonResponse({ error: "Attribution token is expired or unknown." }, 422);
  }

  let attribution;
  try {
    attribution = JSON.parse(storedAttribution);
  } catch {
    return jsonResponse({ error: "Stored attribution is invalid." }, 500);
  }

  if (!isValidEntryPath(attribution.entryPath)) {
    return jsonResponse({ error: "Stored entry path is invalid." }, 500);
  }

  // Reserve the lead ID before contacting GA4 so normal retries or overlapping
  // Zapier deliveries cannot send the same lead twice. Failed sends release it.
  await env.LEAD_ATTRIBUTION.put(
    processedKey,
    JSON.stringify({ status: "processing", reservedAt: new Date().toISOString() }),
    { expirationTtl: 5 * 60 }
  );

  const eventParameters = {
    session_id: Number(attribution.sessionId),
    engagement_time_msec: 1,
    method: "Roofr Instant Estimator",
    estimator_provider: "Roofr",
    estimator_entry_path: attribution.entryPath,
    page_location: `https://www.theroofconcierge.com${attribution.entryPath}`,
    event_id: leadId.slice(0, 100)
  };

  if (env.GA4_DEBUG_MODE === "true") {
    eventParameters.debug_mode = 1;
  }

  const endpoint = new URL("https://www.google-analytics.com/mp/collect");
  endpoint.searchParams.set("measurement_id", GA4_MEASUREMENT_ID);
  endpoint.searchParams.set("api_secret", env.GA4_API_SECRET);

  let ga4Response;
  try {
    ga4Response = await fetch(endpoint.toString(), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        client_id: attribution.clientId,
        timestamp_micros: Date.now() * 1000,
        events: [{ name: "generate_lead", params: eventParameters }]
      })
    });
  } catch {
    await env.LEAD_ATTRIBUTION.delete(processedKey);
    return jsonResponse({ error: "GA4 could not be reached." }, 502);
  }

  if (!ga4Response.ok) {
    await env.LEAD_ATTRIBUTION.delete(processedKey);
    return jsonResponse({ error: "GA4 rejected the lead event." }, 502);
  }

  await env.LEAD_ATTRIBUTION.put(
    processedKey,
    JSON.stringify({ status: "sent", processedAt: new Date().toISOString() }),
    { expirationTtl: PROCESSED_LEAD_TTL_SECONDS }
  );
  await env.LEAD_ATTRIBUTION.delete(attributionKey);

  return jsonResponse({ status: "generate_lead_sent" });
}

export function onRequest() {
  return jsonResponse({ error: "Method not allowed." }, 405);
}
