/**
 * Twilio SMS webhook — Pathway SMS enrollment flow
 *
 * Twilio posts to this function on every inbound SMS.
 * If the body is a 5-digit ZIP code:
 *   1. Look up the navigator(s) serving that ZIP
 *   2. Insert an sms_leads row
 *   3. Send the navigator an SMS alert via Twilio
 *   4. Reply to the senior with a confirmation
 *
 * Register in Twilio: Messaging → Phone Numbers → Webhook URL:
 *   https://<project-ref>.supabase.co/functions/v1/sms-webhook
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { validateRequest } from "https://esm.sh/twilio@4/lib/webhooks/webhooks.js";

const SUPABASE_URL            = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_KEY    = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const TWILIO_AUTH_TOKEN       = Deno.env.get("TWILIO_AUTH_TOKEN")!;
const TWILIO_ACCOUNT_SID      = Deno.env.get("TWILIO_ACCOUNT_SID")!;
const TWILIO_FROM_NUMBER      = Deno.env.get("TWILIO_FROM_NUMBER")!;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function twimlResponse(message: string): Response {
  return new Response(
    `<?xml version="1.0" encoding="UTF-8"?><Response><Message>${escapeXml(message)}</Message></Response>`,
    { headers: { "Content-Type": "text/xml; charset=utf-8" } },
  );
}

function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

async function sendSms(to: string, body: string): Promise<void> {
  const url = `https://api.twilio.com/2010-04-01/Accounts/${TWILIO_ACCOUNT_SID}/Messages.json`;
  const auth = btoa(`${TWILIO_ACCOUNT_SID}:${TWILIO_AUTH_TOKEN}`);
  const params = new URLSearchParams({ To: to, From: TWILIO_FROM_NUMBER, Body: body });

  const res = await fetch(url, {
    method: "POST",
    headers: { Authorization: `Basic ${auth}`, "Content-Type": "application/x-www-form-urlencoded" },
    body: params.toString(),
  });

  if (!res.ok) {
    const err = await res.text();
    console.error("Twilio send failed:", err);
  }
}

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") {
    return new Response("Method Not Allowed", { status: 405 });
  }

  // --- Verify Twilio signature -------------------------------------------
  const rawBody  = await req.text();
  const params   = Object.fromEntries(new URLSearchParams(rawBody));
  const sig      = req.headers.get("x-twilio-signature") ?? "";
  const url      = req.url;

  const isValid = validateRequest(TWILIO_AUTH_TOKEN, sig, url, params);
  if (!isValid) {
    console.error("Invalid Twilio signature");
    return new Response("Forbidden", { status: 403 });
  }

  const from = (params["From"] ?? "").trim();
  const body = (params["Body"] ?? "").trim();

  console.log(`Inbound SMS from ${from}: "${body}"`);

  // --- Parse intent --------------------------------------------------------
  // ZIP code: exactly 5 digits
  const zipMatch = body.match(/^\s*(\d{5})\s*$/);

  if (!zipMatch) {
    // Unrecognized message — send the help menu
    return twimlResponse(
      "Welcome to Pathway! Text your 5-digit ZIP code to get connected with your local Navigator. " +
      "Need help? Text HELP.",
    );
  }

  const zip = zipMatch[1];

  // --- Supabase (service role, bypasses RLS) --------------------------------
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

  // Look up a navigator serving this ZIP
  const { data: navigators, error: navErr } = await supabase
    .from("navigators")
    .select("id, county, profiles(name, phone)")
    .contains("zip_codes", [zip])
    .eq("active", true)
    .limit(1);

  if (navErr) console.error("Navigator lookup error:", navErr.message);

  const navigator = navigators?.[0] ?? null;
  const navProfile = navigator?.profiles as { name: string; phone: string } | null;

  // Insert lead record
  const { error: insertErr } = await supabase.from("sms_leads").insert({
    phone:                 from,
    zip,
    county:                navigator?.county ?? null,
    message_body:          body,
    assigned_navigator_id: navigator?.id ?? null,
    navigator_notified_at: navigator ? new Date().toISOString() : null,
  });

  if (insertErr) console.error("Lead insert error:", insertErr.message);

  // Notify the assigned navigator by SMS
  if (navigator && navProfile?.phone) {
    await sendSms(
      navProfile.phone,
      `[Pathway] New SMS lead from ${from} — ZIP ${zip}. ` +
      `Log in to review: https://app.pathway.community`,
    );
  }

  // Reply to the senior
  const reply = navigator
    ? `Thanks for reaching out to Pathway! Your local Navigator will contact you within 24 hours to get you set up.`
    : `Thanks! Pathway is coming to your area soon. We'll reach out when we're ready in ZIP ${zip}.`;

  return twimlResponse(reply);
});
