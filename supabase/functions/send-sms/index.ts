/**
 * Pathway outbound SMS dispatcher
 * Called by Navigator app after task completion, session save, client activation, doc upload.
 *
 * POST /functions/v1/send-sms
 * Authorization: Bearer <user JWT>
 * Body: { event: SmsEvent }
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const TWILIO_ACCOUNT_SID = Deno.env.get("TWILIO_ACCOUNT_SID")!;
const TWILIO_AUTH_TOKEN  = Deno.env.get("TWILIO_AUTH_TOKEN")!;
const TWILIO_FROM        = Deno.env.get("TWILIO_FROM_NUMBER")!;
const SUPABASE_URL       = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE   = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

// ---------------------------------------------------------------------------
// Event types (matches smsClient.ts on the frontend)
// ---------------------------------------------------------------------------
type SmsEvent =
  | { type: "CLIENT_WELCOME";      to: string; clientName: string; navigatorName: string }
  | { type: "PROXY_WELCOME";       to: string; proxyName: string; clientName: string; navigatorName: string }
  | { type: "TASK_COMPLETE";       to: string; clientName: string; navigatorName: string; taskTitle: string }
  | { type: "SESSION_SAVED";       to: string; proxyName: string; clientName: string; navigatorName: string; durationMinutes: number; taskList: string; nextSteps: string }
  | { type: "DOCUMENT_UPLOADED";   to: string; clientName: string; docType: string }

function formatMessage(event: SmsEvent): string {
  switch (event.type) {
    case "CLIENT_WELCOME":
      return `Hi ${event.clientName.split(" ")[0]}, this is Pathway. Your community navigator ${event.navigatorName} has set up your account. Text HELP anytime if you need assistance.`

    case "PROXY_WELCOME":
      return `Hi ${event.proxyName}, ${event.navigatorName} has set up a Pathway account for ${event.clientName}. You'll receive updates when tasks are completed on their behalf. Reply STOP to opt out.`

    case "TASK_COMPLETE":
      return `Hi ${event.clientName.split(" ")[0]}, ${event.navigatorName} completed a task for you today: ${event.taskTitle}. Text HELP if you have questions.`

    case "SESSION_SAVED":
      return `Hi ${event.proxyName}, ${event.navigatorName} visited ${event.clientName} today for ${event.durationMinutes} minutes. Tasks worked on: ${event.taskList || "general support"}. Next steps: ${event.nextSteps || "follow up soon"}.`

    case "DOCUMENT_UPLOADED":
      return `Hi — ${event.docType} has been uploaded to ${event.clientName}'s secure Pathway vault by their navigator.`
  }
}

// ---------------------------------------------------------------------------
// Twilio REST send
// ---------------------------------------------------------------------------
async function twilioSend(to: string, body: string): Promise<string | null> {
  const url  = `https://api.twilio.com/2010-04-01/Accounts/${TWILIO_ACCOUNT_SID}/Messages.json`
  const auth = btoa(`${TWILIO_ACCOUNT_SID}:${TWILIO_AUTH_TOKEN}`)
  const res  = await fetch(url, {
    method:  "POST",
    headers: { Authorization: `Basic ${auth}`, "Content-Type": "application/x-www-form-urlencoded" },
    body:    new URLSearchParams({ To: to, From: TWILIO_FROM, Body: body }).toString(),
  })
  if (!res.ok) {
    const err = await res.json()
    throw new Error(err.message ?? "Twilio error")
  }
  const data = await res.json()
  return data.sid ?? null
}

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------
Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return new Response("Method Not Allowed", { status: 405 })

  const authHeader = req.headers.get("Authorization") ?? ""
  const userJwt    = authHeader.replace("Bearer ", "")

  // Verify caller is an authenticated Pathway user
  const userClient = createClient(SUPABASE_URL, SUPABASE_SERVICE)
  const { data: { user }, error: authErr } = await userClient.auth.getUser(userJwt)
  if (authErr || !user) return new Response("Unauthorized", { status: 401 })

  const { event }: { event: SmsEvent } = await req.json()
  if (!event?.type || !event?.to) {
    return new Response(JSON.stringify({ error: "Invalid payload" }), { status: 400 })
  }

  const body = formatMessage(event)

  // Admin service client for sms_log
  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE)

  try {
    const sid = await twilioSend(event.to, body)

    await admin.from("sms_log").insert({
      to_number:  event.to,
      body,
      event_type: event.type,
      status:     "sent",
      twilio_sid: sid,
    })

    return new Response(JSON.stringify({ ok: true, sid }), { status: 200 })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error("SMS send failed:", msg)

    await admin.from("sms_log").insert({
      to_number:  event.to,
      body,
      event_type: event.type,
      status:     "failed",
      error_msg:  msg,
    })

    return new Response(JSON.stringify({ error: msg }), { status: 500 })
  }
})
