/**
 * Twilio SMS webhook — Pathway inbound SMS handler
 *
 * Handles:
 *   1. ZIP code → SMS enrollment (lead creation)
 *   2. PICKUP keyword → draft pharmacy/errand request for navigator review
 *   3. RIDE keyword → draft ride & wait request for navigator review
 *   4. HELP → help menu
 *
 * Register in Twilio: Messaging → Phone Numbers → Webhook URL:
 *   https://<project-ref>.supabase.co/functions/v1/sms-webhook
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { validateRequest } from "https://esm.sh/twilio@4/lib/webhooks/webhooks.js";

const SUPABASE_URL         = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const TWILIO_AUTH_TOKEN    = Deno.env.get("TWILIO_AUTH_TOKEN")!;
const TWILIO_ACCOUNT_SID   = Deno.env.get("TWILIO_ACCOUNT_SID")!;
const TWILIO_FROM_NUMBER   = Deno.env.get("TWILIO_FROM_NUMBER")!;

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
  const url  = `https://api.twilio.com/2010-04-01/Accounts/${TWILIO_ACCOUNT_SID}/Messages.json`;
  const auth = btoa(`${TWILIO_ACCOUNT_SID}:${TWILIO_AUTH_TOKEN}`);
  const res  = await fetch(url, {
    method:  "POST",
    headers: { Authorization: `Basic ${auth}`, "Content-Type": "application/x-www-form-urlencoded" },
    body:    new URLSearchParams({ To: to, From: TWILIO_FROM_NUMBER, Body: body }).toString(),
  });
  if (!res.ok) console.error("Twilio send failed:", await res.text());
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return new Response("Method Not Allowed", { status: 405 });

  const rawBody = await req.text();
  const params  = Object.fromEntries(new URLSearchParams(rawBody));
  const sig     = req.headers.get("x-twilio-signature") ?? "";

  const isValid = validateRequest(TWILIO_AUTH_TOKEN, sig, req.url, params);
  if (!isValid) {
    console.error("Invalid Twilio signature");
    return new Response("Forbidden", { status: 403 });
  }

  const from    = (params["From"] ?? "").trim();
  const rawText = (params["Body"] ?? "").trim();
  const keyword = rawText.toUpperCase().split(/\s+/)[0]; // First word, normalized

  // Log masked phone only — never log message body (may contain PHI from seniors)
  console.log(`Inbound SMS from ${from.slice(0, 6)}***`);

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

  // ---------------------------------------------------------------------------
  // PICKUP or RIDE: senior requesting an errand or ride
  // ---------------------------------------------------------------------------
  if (keyword === "PICKUP" || keyword === "RIDE") {
    // Look up the client by phone number
    const { data: client } = await supabase
      .from("clients")
      .select("id, name, navigator_id, navigators(profiles(name, phone))")
      .eq("phone", from)
      .single();

    const navProfile = (client as any)?.navigators?.profiles as { name: string; phone: string } | null;
    const navName    = navProfile?.name ?? "your navigator";
    const navPhone   = navProfile?.phone ?? null;

    const requestType = keyword === "PICKUP" ? "pickup" : "ride";
    const serviceHint = keyword === "PICKUP" ? "pharmacy_pickup" : "ride_and_wait";

    // Create a draft errand request for the navigator to review
    if (client) {
      await supabase.from("sms_errand_requests").insert({
        client_id:    client.id,
        phone:        from,
        keyword,
        raw_body:     rawText,
        navigator_id: client.navigator_id,
        status:       "pending",
      });

      // Notify the navigator
      if (navPhone) {
        await sendSms(
          navPhone,
          `Pathway: ${client.name} requested a ${requestType} via text. ` +
          `Open the Pathway app to review and confirm the request.`,
        );
      }
    } else {
      // Unknown phone — still create a request but with no client link
      await supabase.from("sms_errand_requests").insert({
        phone:    from,
        keyword,
        raw_body: rawText,
        status:   "pending",
      });
    }

    const reply = keyword === "PICKUP"
      ? `Got it! We'll arrange a pickup for you. ${navName} will confirm the details shortly. – Pathway`
      : `Got it! We'll arrange a ride for you. ${navName} will confirm the details shortly. – Pathway`;

    return twimlResponse(reply);
  }

  // ---------------------------------------------------------------------------
  // HELP keyword
  // ---------------------------------------------------------------------------
  if (keyword === "HELP") {
    return twimlResponse(
      "Pathway Help:\n" +
      "• Text PICKUP to request a pharmacy or errand pickup\n" +
      "• Text RIDE to request a Ride & Wait appointment trip\n" +
      "• Text your 5-digit ZIP code to enroll\n" +
      "Questions? Call your Navigator directly.",
    );
  }

  // ---------------------------------------------------------------------------
  // ZIP code enrollment
  // ---------------------------------------------------------------------------
  const zipMatch = rawText.match(/^\s*(\d{5})\s*$/);

  if (zipMatch) {
    const zip = zipMatch[1];

    const { data: navigators, error: navErr } = await supabase
      .from("navigators")
      .select("id, county, profiles(name, phone)")
      .contains("zip_codes", [zip])
      .eq("active", true)
      .limit(1);

    if (navErr) console.error("Navigator lookup error:", navErr.message);

    const navigator  = navigators?.[0] ?? null;
    const navProfile = navigator?.profiles as { name: string; phone: string } | null;

    await supabase.from("sms_leads").insert({
      phone:                 from,
      zip,
      county:                (navigator as any)?.county ?? null,
      message_body:          rawText,
      assigned_navigator_id: navigator?.id ?? null,
      navigator_notified_at: navigator ? new Date().toISOString() : null,
    });

    if (navigator && navProfile?.phone) {
      await sendSms(
        navProfile.phone,
        `[Pathway] New SMS lead from ${from} — ZIP ${zip}. Log in to review.`,
      );
    }

    return twimlResponse(
      navigator
        ? `Thanks for reaching out to Pathway! Your local Navigator will contact you within 24 hours to get you started.`
        : `Thanks! Pathway is coming to your area soon. We'll reach out when we're ready in ZIP ${zip}.`,
    );
  }

  // ---------------------------------------------------------------------------
  // Unrecognized — send help menu
  // ---------------------------------------------------------------------------
  return twimlResponse(
    "Welcome to Pathway! Text your 5-digit ZIP code to get connected, " +
    "PICKUP for a pharmacy or errand, RIDE for a ride to an appointment, " +
    "or HELP for more options.",
  );
});
