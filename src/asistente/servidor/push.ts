// N7: Web Push to the user's installed app
import webpush from 'web-push';
import type { SupabaseClient } from '@supabase/supabase-js';
import { comprobar } from './supabase';

export interface PushPayload { title: string; body: string; url?: string; tag?: string; badge?: number }

let configurado: boolean | null = null;
export function pushConfigurado(): boolean {
  if (configurado !== null) return configurado;
  const pub = (process.env.VAPID_PUBLIC_KEY || '').trim(), priv = (process.env.VAPID_PRIVATE_KEY || '').trim();
  configurado = Boolean(pub && priv);
  if (configurado) webpush.setVapidDetails((process.env.VAPID_SUBJECT || 'mailto:calendarasist@example.com').trim(), pub, priv);
  return configurado;
}

export function clavePublica(): string | null {
  return (process.env.VAPID_PUBLIC_KEY || '').trim() || null;
}

// Sends to every device of the user; drops subscriptions the push service no longer accepts
export async function enviarPush(sb: SupabaseClient, userId: string, payload: PushPayload): Promise<{ enviados: number; fallidos: number }> {
  if (!pushConfigurado()) return { enviados: 0, fallidos: 0 };
  const subs = comprobar(await sb.from('push_suscripciones').select('*').eq('user_id', userId), 'push_suscripciones') || [];
  let enviados = 0, fallidos = 0;
  await Promise.all(subs.map(async (s: any) => {
    try {
      await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, JSON.stringify(payload), { TTL: 6 * 3600 });
      enviados++;
    } catch (err: any) {
      fallidos++;
      if (err?.statusCode === 404 || err?.statusCode === 410) await sb.from('push_suscripciones').delete().eq('endpoint', s.endpoint);
      else console.warn('[Asistente] Push no enviado:', err?.statusCode || err?.message);
    }
  }));
  return { enviados, fallidos };
}
