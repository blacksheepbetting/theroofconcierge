import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";

import { onRequestPost as createAnalyticsSession } from "../functions/api/analytics-session.js";
import { onRequestPost as confirmRoofrLead } from "../functions/api/roofr-lead.js";

class MemoryKv {
  constructor() {
    this.values = new Map();
  }

  async get(key) {
    return this.values.get(key) ?? null;
  }

  async put(key, value) {
    this.values.set(key, value);
  }

  async delete(key) {
    this.values.delete(key);
  }
}

const siteOrigin = "https://www.theroofconcierge.com";
const webhookSecret = "test-secret-that-is-at-least-thirty-two-characters";

test("analytics-session stores attribution behind an opaque token", async () => {
  const kv = new MemoryKv();
  const request = new Request(`${siteOrigin}/api/analytics-session`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Origin: siteOrigin
    },
    body: JSON.stringify({
      clientId: "123456789.987654321",
      sessionId: "1786454474",
      entryPath: "/fishers.html"
    })
  });

  const response = await createAnalyticsSession({
    request,
    env: { LEAD_ATTRIBUTION: kv }
  });
  const body = await response.json();

  assert.equal(response.status, 201);
  assert.match(body.token, /^[0-9a-f-]{36}$/i);

  const stored = JSON.parse(await kv.get(`attribution:${body.token}`));
  assert.deepEqual(
    {
      clientId: stored.clientId,
      sessionId: stored.sessionId,
      entryPath: stored.entryPath
    },
    {
      clientId: "123456789.987654321",
      sessionId: "1786454474",
      entryPath: "/fishers.html"
    }
  );
});

test("analytics-session rejects cross-origin requests", async () => {
  const response = await createAnalyticsSession({
    request: new Request(`${siteOrigin}/api/analytics-session`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Origin: "https://example.com"
      },
      body: JSON.stringify({
        clientId: "123.456",
        sessionId: "1786454474",
        entryPath: "/"
      })
    }),
    env: { LEAD_ATTRIBUTION: new MemoryKv() }
  });

  assert.equal(response.status, 403);
});

test("confirmed Roofr lead sends generate_lead once", async () => {
  const kv = new MemoryKv();
  const token = "550e8400-e29b-41d4-a716-446655440000";
  const leadId = "lead_123456";
  await kv.put(
    `attribution:${token}`,
    JSON.stringify({
      clientId: "123456789.987654321",
      sessionId: "1786454474",
      entryPath: "/carmel.html"
    })
  );

  const leadFormUrl = new URL(
    "https://app.roofr.com/instant-estimator/76cd0b87-47e2-4469-8bc5-980e062fa709/TheRoofConcierge"
  );
  leadFormUrl.searchParams.set("bp_attribution_token", token);
  leadFormUrl.searchParams.set("bp_tracking_version", "1");

  const makeRequest = () =>
    new Request(`${siteOrigin}/api/roofr-lead`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${webhookSecret}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        lead_id: leadId,
        lead_form_url: leadFormUrl.toString()
      })
    });

  const ga4Calls = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, options) => {
    ga4Calls.push({ url, options });
    return new Response(null, { status: 204 });
  };

  try {
    const env = {
      LEAD_ATTRIBUTION: kv,
      GA4_API_SECRET: "ga4-test-secret",
      ROOFR_WEBHOOK_SECRET: webhookSecret,
      GA4_DEBUG_MODE: "true"
    };

    const firstResponse = await confirmRoofrLead({ request: makeRequest(), env });
    const secondResponse = await confirmRoofrLead({ request: makeRequest(), env });

    assert.equal(firstResponse.status, 200);
    assert.deepEqual(await firstResponse.json(), { status: "generate_lead_sent" });
    assert.deepEqual(await secondResponse.json(), { status: "duplicate_ignored" });
    assert.equal(ga4Calls.length, 1);

    const ga4Payload = JSON.parse(ga4Calls[0].options.body);
    assert.equal(ga4Payload.client_id, "123456789.987654321");
    assert.equal(ga4Payload.events[0].name, "generate_lead");
    assert.equal(ga4Payload.events[0].params.session_id, 1786454474);
    assert.equal(ga4Payload.events[0].params.estimator_entry_path, "/carmel.html");
    assert.equal(ga4Payload.events[0].params.event_id, leadId);
    assert.equal(await kv.get(`attribution:${token}`), null);
    assert.ok(await kv.get(`processed:${leadId}`));
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("failed GA4 delivery releases the lead for a safe retry", async () => {
  const kv = new MemoryKv();
  const token = "550e8400-e29b-41d4-a716-446655440001";
  const leadId = "lead_retry_123";
  await kv.put(
    `attribution:${token}`,
    JSON.stringify({
      clientId: "123456789.987654321",
      sessionId: "1786454474",
      entryPath: "/"
    })
  );

  const leadFormUrl = new URL(
    "https://app.roofr.com/instant-estimator/76cd0b87-47e2-4469-8bc5-980e062fa709/TheRoofConcierge"
  );
  leadFormUrl.searchParams.set("bp_attribution_token", token);
  leadFormUrl.searchParams.set("bp_tracking_version", "1");

  const request = new Request(`${siteOrigin}/api/roofr-lead`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${webhookSecret}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      lead_id: leadId,
      lead_form_url: leadFormUrl.toString()
    })
  });
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(null, { status: 500 });

  try {
    const response = await confirmRoofrLead({
      request,
      env: {
        LEAD_ATTRIBUTION: kv,
        GA4_API_SECRET: "ga4-test-secret",
        ROOFR_WEBHOOK_SECRET: webhookSecret
      }
    });

    assert.equal(response.status, 502);
    assert.equal(await kv.get(`processed:${leadId}`), null);
    assert.ok(await kv.get(`attribution:${token}`));
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("debug authorization failure reports only safe header diagnostics", async () => {
  const kv = new MemoryKv();
  const response = await confirmRoofrLead({
    request: new Request("https://example.com/api/roofr-lead", {
      method: "POST",
      headers: {
        Authorization: "Bearer too-short",
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        lead_id: "lead-test-123",
        lead_form_url:
          "https://app.roofr.com/instant-estimator/76cd0b87-47e2-4469-8bc5-980e062fa709/TheRoofConcierge"
      })
    }),
    env: {
      LEAD_ATTRIBUTION: kv,
      GA4_API_SECRET: "ga4-test-secret",
      GA4_DEBUG_MODE: "true",
      ROOFR_WEBHOOK_SECRET: "a".repeat(40)
    }
  });

  assert.equal(response.status, 401);
  assert.deepEqual(await response.json(), {
    error: "Unauthorized.",
    debug: {
      authorization_header_present: true,
      bearer_prefix_valid: true,
      supplied_secret_length: 9,
      configured_secret_length: 40
    }
  });
});

test("estimator attaches only an opaque token and prevents duplicate starts", async () => {
  const source = await readFile(new URL("../script.js", import.meta.url), "utf8");
  const domListeners = {};
  const buttonListeners = {};
  const iframeAttributes = new Map();
  const analyticsEvents = [];
  let tokenRequests = 0;

  const iframe = {
    dataset: {
      src: "https://app.roofr.com/instant-estimator/76cd0b87-47e2-4469-8bc5-980e062fa709/TheRoofConcierge"
    },
    hidden: true,
    getAttribute(name) {
      return iframeAttributes.get(name) || null;
    },
    setAttribute(name, value) {
      iframeAttributes.set(name, value);
    }
  };
  const launchButton = {
    addEventListener(name, listener) {
      buttonListeners[name] = listener;
    }
  };
  const shell = {
    dataset: {},
    classList: { add() {} },
    querySelector(selector) {
      if (selector === "iframe[data-src]") return iframe;
      if (selector === ".estimator-launch") return launchButton;
      return null;
    }
  };
  const document = {
    body: { classList: { toggle() {} } },
    addEventListener(name, listener) {
      domListeners[name] = listener;
    },
    querySelector() {
      return null;
    },
    querySelectorAll(selector) {
      if (selector === "[data-estimator]") return [shell];
      return [];
    }
  };
  const window = {
    location: {
      href: `${siteOrigin}/fishers.html?utm_source=qa&utm_campaign=lead-test`,
      pathname: "/fishers.html",
      search: "?utm_source=qa&utm_campaign=lead-test"
    },
    innerWidth: 1200,
    addEventListener() {},
    setTimeout,
    clearTimeout,
    gtag(command, targetOrEvent, fieldOrParameters, callback) {
      if (command === "get") {
        const value = fieldOrParameters === "client_id" ? "123.456" : "1786454474";
        callback(value);
      } else if (command === "event") {
        analyticsEvents.push({ name: targetOrEvent, parameters: fieldOrParameters });
      }
    },
    async fetch(url, options) {
      tokenRequests += 1;
      const requestBody = JSON.parse(options.body);
      assert.equal(url, "/api/analytics-session");
      assert.equal(requestBody.entryPath, "/fishers.html");
      return new Response(
        JSON.stringify({ token: "550e8400-e29b-41d4-a716-446655440000" }),
        { status: 201, headers: { "Content-Type": "application/json" } }
      );
    }
  };

  vm.runInNewContext(source, {
    AbortController,
    Boolean,
    JSON,
    Promise,
    URL,
    URLSearchParams,
    document,
    window
  });
  domListeners.DOMContentLoaded();

  await Promise.all([buttonListeners.click(), buttonListeners.click()]);
  await buttonListeners.click();

  const estimatorUrl = new URL(iframeAttributes.get("src"));
  assert.equal(tokenRequests, 1);
  assert.equal(analyticsEvents.filter(({ name }) => name === "estimate_start").length, 1);
  assert.equal(
    estimatorUrl.searchParams.get("bp_attribution_token"),
    "550e8400-e29b-41d4-a716-446655440000"
  );
  assert.equal(estimatorUrl.searchParams.get("bp_entry_path"), "/fishers.html");
  assert.equal(estimatorUrl.searchParams.get("utm_campaign"), "lead-test");
  assert.equal(estimatorUrl.searchParams.has("bp_ga_client_id"), false);
  assert.equal(estimatorUrl.searchParams.has("bp_ga_session_id"), false);
});
