export const GA4_MEASUREMENT_ID = "G-C4HSNT9BY1";
export const ROOFR_ESTIMATOR_ORIGIN = "https://app.roofr.com";
export const ROOFR_ESTIMATOR_PATH =
  "/instant-estimator/76cd0b87-47e2-4469-8bc5-980e062fa709/TheRoofConcierge";

export const jsonResponse = (body, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff"
    }
  });

export const isValidClientId = (value) =>
  typeof value === "string" && /^[A-Za-z0-9._-]{1,100}$/.test(value);

export const isValidSessionId = (value) =>
  (typeof value === "string" || typeof value === "number") &&
  /^\d{1,20}$/.test(String(value));

export const isValidEntryPath = (value) =>
  typeof value === "string" && /^\/[^?#]{0,199}$/.test(value);

export const isValidLeadId = (value) =>
  (typeof value === "string" || typeof value === "number") &&
  /^[A-Za-z0-9_-]{1,128}$/.test(String(value));

export const isValidAttributionToken = (value) =>
  typeof value === "string" &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value
  );

export const isAuthorizedWebhook = (request, expectedSecret) => {
  if (typeof expectedSecret !== "string" || expectedSecret.length < 32) {
    return false;
  }

  const authorization = request.headers.get("Authorization") || "";
  const suppliedSecret = authorization.startsWith("Bearer ")
    ? authorization.slice(7)
    : "";

  if (suppliedSecret.length !== expectedSecret.length) return false;

  let difference = 0;
  for (let index = 0; index < expectedSecret.length; index += 1) {
    difference |= suppliedSecret.charCodeAt(index) ^ expectedSecret.charCodeAt(index);
  }

  return difference === 0;
};

export const getRoofrAttributionToken = (leadFormUrl) => {
  try {
    const url = new URL(leadFormUrl);
    const isExpectedEstimator =
      url.origin === ROOFR_ESTIMATOR_ORIGIN &&
      url.pathname === ROOFR_ESTIMATOR_PATH &&
      url.searchParams.get("bp_tracking_version") === "1";

    if (!isExpectedEstimator) return undefined;

    const token = url.searchParams.get("bp_attribution_token");
    return isValidAttributionToken(token) ? token : undefined;
  } catch {
    return undefined;
  }
};
