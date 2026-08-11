# Roofr lead completion tracking setup

This implementation keeps `estimate_start` as an ordinary GA4 event and sends
`generate_lead` only after Roofr confirms that it created a lead.

## How it works

1. The website reads the visitor's pseudonymous GA4 client and session IDs.
2. A same-origin Cloudflare Pages Function stores those IDs for up to 24 hours
   and returns a random, one-time token.
3. Only the token, campaign parameters, and entry path are appended to the Roofr
   estimator URL. GA4 identifiers are not exposed to Roofr.
4. Roofr stores the estimator URL with the successful lead.
5. A Zapier `Roofr Lead Created` trigger sends the Roofr lead ID and stored URL
   to the protected `/api/roofr-lead` endpoint.
6. The endpoint reserves the unique Roofr lead ID and sends one `generate_lead`
   event through the GA4 Measurement Protocol. When Roofr preserves the token,
   the event is joined to the website session and the token is deleted. If
   Roofr removes the query string, the confirmed lead is recorded as
   `confirmed_unattributed` using a non-PII server identifier. The lead ID is
   remembered for 180 days to reject duplicates in either case.

If the attribution service is unavailable, the estimator still opens and
`estimate_start` still fires. A later Roofr confirmation can record the real
lead, but it is explicitly kept separate from session-attributed conversions.

## 1. Create the GA4 API secret

1. In GA4, open **Admin**.
2. Open **Data streams** and select **The Roof Concierge Website**.
3. Open **Measurement Protocol API secrets**.
4. Create a secret named `Cloudflare Roofr Leads`.
5. Copy the secret. Do not commit it to this repository.

The measurement ID is already configured as `G-C4HSNT9BY1`.

## 2. Configure Cloudflare Pages

In the Cloudflare Pages project for `theroofconcierge.com`:

1. Create a KV namespace named `roofr-lead-attribution`.
2. Add a KV namespace binding to the Pages project:
   - Variable name: `LEAD_ATTRIBUTION`
   - KV namespace: `roofr-lead-attribution`
3. Add these encrypted secrets for both Preview and Production:
   - `GA4_API_SECRET`: the secret created in GA4
   - `ROOFR_WEBHOOK_SECRET`: a new random value at least 32 characters long
4. Add this regular variable while testing:
   - `GA4_DEBUG_MODE`: `true`
5. Redeploy the latest commit after saving the bindings and variables.

Keep the webhook secret available for the Zapier step. Do not place it in a
public file, URL, screenshot, or chat message.

## 3. Create the Zapier automation

1. Create a Zap with **Roofr** as the trigger app.
2. Select **Roofr Lead Created** as the trigger event.
3. Connect the Roofr account and test the trigger using a newly submitted test
   Instant Estimator lead.
4. Confirm that the sample exposes both:
   - a unique Roofr lead ID or lead UUID
   - the lead form URL, named `lead_form_url` or similarly
5. Add **Webhooks by Zapier** as the action and choose **Custom Request**.
6. Configure the request:
   - Method: `POST`
   - URL: `https://www.theroofconcierge.com/api/roofr-lead`
   - Header `Authorization`: `Bearer [ROOFR_WEBHOOK_SECRET]`
   - Header `Content-Type`: `application/json`
   - Body:

```json
{
  "lead_id": "[Roofr lead ID or UUID]",
  "lead_form_url": "[Roofr lead form URL]"
}
```

Map the bracketed values from the Roofr trigger; do not type the brackets. If
the Roofr sample does not expose the lead form URL, stop before publishing the
Zap. A different Roofr API mapping will be required.

## 4. Test before using the event for ads

1. Visit this URL in a private window:
   `https://www.theroofconcierge.com/?utm_source=qa&utm_medium=test&utm_campaign=ga4_lead_test`
2. Open the Instant Estimator and submit one clearly labeled test lead.
3. Confirm the lead appears in Roofr.
4. Confirm the Zap succeeds and the webhook response is
   `{"status":"generate_lead_sent","attribution":"matched"}` or
   `{"status":"generate_lead_sent","attribution":"unattributed"}`.
5. In GA4, confirm `generate_lead` appears in Realtime or DebugView.
6. Replay the same Zapier action once. The endpoint should return
   `{"status":"duplicate_ignored"}` and GA4 should still show one lead event.
7. Mark `generate_lead` as a key event only after the successful test.
8. Remove `GA4_DEBUG_MODE` or set it to `false` after testing.

Do not import `generate_lead` into Google Ads or use it for bidding when the
response says `unattributed`. Those events are valid confirmed-lead counts, but
they cannot be safely connected to the originating ad click or website session.
