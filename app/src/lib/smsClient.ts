/**
 * Frontend SMS client — calls the send-sms Supabase Edge Function.
 * Fires and forgets (errors are logged, not thrown).
 */

import { supabase } from './supabase'

export type SmsEvent =
  | { type: 'CLIENT_WELCOME';    to: string; clientName: string; navigatorName: string }
  | { type: 'PROXY_WELCOME';     to: string; proxyName: string; clientName: string; navigatorName: string }
  | { type: 'TASK_COMPLETE';     to: string; clientName: string; navigatorName: string; taskTitle: string }
  | { type: 'SESSION_SAVED';     to: string; proxyName: string; clientName: string; navigatorName: string; durationMinutes: number; taskList: string; nextSteps: string }
  | { type: 'DOCUMENT_UPLOADED'; to: string; clientName: string; docType: string }

export async function sendSms(event: SmsEvent): Promise<void> {
  try {
    const { error } = await supabase.functions.invoke('send-sms', {
      body: { event },
    })
    if (error) console.error('[smsClient] send failed:', error)
  } catch (err) {
    console.error('[smsClient] unexpected error:', err)
  }
}
