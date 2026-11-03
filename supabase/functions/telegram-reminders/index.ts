// Supabase Edge Function: execute via Supabase Cron.
// Secrets: TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID, TELEGRAM_OWNER_USER_ID, CRON_SECRET.
// SUPABASE_URL, SUPABASE_ANON_KEY and SUPABASE_SERVICE_ROLE_KEY are runtime secrets.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-secret", "Access-Control-Allow-Methods": "POST, OPTIONS", "Content-Type": "application/json" };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: cors });
const sendTelegram = async (token: string, chatId: string, text: string) => {
  const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ chat_id: chatId, text }) });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || !payload.ok) throw new Error("Falha no envio ao Telegram.");
};
function medicationStatus(m: any) {
  const today = new Date(); today.setUTCHours(0, 0, 0, 0);
  const elapsed = Math.max(0, Math.floor((today.getTime() - new Date(`${m.base_date}T00:00:00Z`).getTime()) / 86400000));
  const billableDays = m.paused ? 0 : Math.max(0, elapsed - Number(m.paused_days_offset || 0));
  const remaining = Math.max(0, Number(m.base_remaining) - billableDays * Number(m.daily_consumption));
  const daily = Number(m.daily_consumption);
  const days = daily > 0 ? remaining / daily : Number.POSITIVE_INFINITY;
  return { remaining, days, prescription: !!m.needs_prescription && days <= Number(m.prescription_days), purchase: days <= Number(m.low_stock_days) };
}
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "POST only" }, 405);
  const telegramToken = Deno.env.get("TELEGRAM_BOT_TOKEN");
  const chatId = Deno.env.get("TELEGRAM_CHAT_ID");
  if (!telegramToken || !chatId) return json({ error: "Configure TELEGRAM_BOT_TOKEN e TELEGRAM_CHAT_ID nos secrets do Supabase." }, 500);
  let body: { action?: string } = {};
  try { body = await req.json(); } catch { /* Cron pode omitir o corpo JSON. */ }

  const cronSecret = Deno.env.get("CRON_SECRET");
  if (cronSecret && req.headers.get("x-cron-secret") === cronSecret) {
    const ownerId = Deno.env.get("TELEGRAM_OWNER_USER_ID");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    if (!ownerId || !serviceKey || !supabaseUrl) return json({ error: "Configure TELEGRAM_OWNER_USER_ID e as credenciais de serviço do Supabase." }, 500);
    const db = createClient(supabaseUrl, serviceKey);
    const { data: meds, error: medError } = await db.from("medications").select("id,user_id,name,unit,base_remaining,daily_consumption,base_date,prescription_days,needs_prescription,low_stock_days,paused,paused_days_offset").eq("user_id", ownerId);
    if (medError) return json({ error: medError.message }, 500);
    const { data: existing, error: reminderError } = await db.from("medication_reminders").select("id,medication_id,kind,status,is_eligible").eq("user_id", ownerId);
    if (reminderError) return json({ error: reminderError.message }, 500);
    const byKey = new Map((existing || []).map((r: any) => [`${r.medication_id}:${r.kind}`, r]));
    let created = 0;
    for (const m of meds || []) {
      const status = medicationStatus(m);
      for (const kind of ["prescription", "purchase"]) {
        const eligible = kind === "prescription" ? status.prescription : status.purchase;
        const key = `${m.id}:${kind}`;
        const reminder: any = byKey.get(key);
        if (!reminder && eligible) {
          const { error } = await db.from("medication_reminders").insert({ user_id: ownerId, medication_id: m.id, kind, status: "pending", is_eligible: true });
          if (error && error.code !== "23505") return json({ error: error.message }, 500);
          if (!error) created++;
        } else if (reminder) {
          const reopen = eligible && reminder.status === "completed" && !reminder.is_eligible;
          const { error } = await db.from("medication_reminders").update({ is_eligible: eligible, ...(reopen ? { status: "pending", completed_at: null, last_notified_at: null } : {}) }).eq("id", reminder.id);
          if (error) return json({ error: error.message }, 500);
        }
      }
    }
    const { data: pending, error: pendingError } = await db.from("medication_reminders").select("id,kind,last_notified_at,medication:medications(name,unit,base_remaining,daily_consumption,base_date,paused,paused_days_offset)").eq("user_id", ownerId).eq("status", "pending");
    if (pendingError) return json({ error: pendingError.message }, 500);
    const todayUtc = new Date().toISOString().slice(0, 10);
    const due = (pending || []).filter((r: any) => !r.last_notified_at || String(r.last_notified_at).slice(0, 10) < todayUtc);
    if (!due.length) return json({ sent: false, created, reason: "Nenhum lembrete pendente para enviar hoje." });
    const lines = due.map((r: any) => {
      const m = Array.isArray(r.medication) ? r.medication[0] : r.medication;
      if (r.kind === "prescription") return `📄 Pedir/renovar a receita de ${m?.name || "medicamento"}.`;
      const st = medicationStatus(m || {});
      return `🛒 Comprar ${m?.name || "medicamento"} — estoque estimado: ${Math.floor(st.remaining)} ${m?.unit || "unidades"}, cerca de ${Math.floor(st.days)} dia(s).`;
    });
    const message = `Lembretes pendentes da Minha Farmácia\n\n${lines.join("\n\n")}\n\nConfirme cada ação no app. Lembretes organizacionais — siga sempre a orientação do profissional de saúde.`;
    try {
      await sendTelegram(telegramToken, chatId, message);
      const notifiedAt = new Date().toISOString();
      for (const r of due) {
        const { error } = await db.from("medication_reminders").update({ last_notified_at: notifiedAt }).eq("id", r.id).eq("status", "pending");
        if (error) return json({ error: error.message }, 500);
      }
      return json({ sent: true, count: due.length, created });
    } catch (e) { return json({ error: e instanceof Error ? e.message : "Falha no Telegram." }, 502); }
  }

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return json({ error: "Unauthorized" }, 401);
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  if (!supabaseUrl || !anonKey) return json({ error: "Configuração Supabase incompleta." }, 500);
  const userClient = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authHeader } } });
  const { data: { user }, error: authError } = await userClient.auth.getUser();
  if (authError || !user) return json({ error: "Unauthorized" }, 401);
  if (body.action === "test") {
    try { await sendTelegram(telegramToken, chatId, "✅ Teste da Minha Farmácia: conexão com o Telegram funcionando."); return json({ sent: true }); }
    catch (e) { return json({ error: e instanceof Error ? e.message : "Falha no Telegram." }, 502); }
  }
  return json({ error: "Ação não suportada." }, 400);
});
