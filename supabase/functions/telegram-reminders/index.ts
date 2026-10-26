// Supabase Edge Function: deploy pelo CLI e execute somente via Supabase Cron.
// Secrets: TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID, CRON_SECRET.
// SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY são providenciadas no runtime Supabase.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-secret", "Access-Control-Allow-Methods": "POST, OPTIONS", "Content-Type": "application/json" };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: cors });
const sendTelegram = async (token: string, chatId: string, text: string) => {
  const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ chat_id: chatId, text }) });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || !payload.ok) throw new Error("Falha no envio ao Telegram.");
};
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "POST only" }, 405);
  const telegramToken = Deno.env.get("TELEGRAM_BOT_TOKEN");
  const chatId = Deno.env.get("TELEGRAM_CHAT_ID");
  if (!telegramToken || !chatId) return json({ error: "Configure TELEGRAM_BOT_TOKEN e TELEGRAM_CHAT_ID nos secrets do Supabase." }, 500);
  let body: { action?: string } = {};
  try { body = await req.json(); } catch { /* Cron calls may omit a JSON body. */ }
  if (req.headers.get("x-cron-secret") === Deno.env.get("CRON_SECRET") && Deno.env.get("CRON_SECRET")) {
    // Job do Cron autorizado por segredo fora do navegador.
  } else {
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
  }
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  if (!serviceKey || !supabaseUrl) return json({ error: "Configure os secrets do Supabase." }, 500);
  const db = createClient(supabaseUrl, serviceKey);
  const { data: meds, error } = await db.from("medications").select("id,user_id,name,unit,base_remaining,daily_consumption,base_date,prescription_days,needs_prescription,low_stock_days,paused,paused_days_offset");
  if (error) return json({ error: error.message }, 500);
  const today = new Date(); today.setUTCHours(0, 0, 0, 0);
  const alerts: string[] = [];
  for (const m of meds || []) {
    const elapsed = Math.max(0, Math.floor((today.getTime() - new Date(`${m.base_date}T00:00:00Z`).getTime()) / 86400000));
    const billableDays = m.paused ? 0 : Math.max(0, elapsed - Number(m.paused_days_offset || 0));
    const remaining = Math.max(0, Number(m.base_remaining) - billableDays * Number(m.daily_consumption));
    const daily = Number(m.daily_consumption);
    if (daily <= 0) continue;
    const days = remaining / daily;
    if (days <= Number(m.low_stock_days)) alerts.push(`⚠️ Estoque baixo: ${m.name} — cerca de ${Math.floor(days)} dia(s) restantes (${remaining} ${m.unit}).`);
    else if (m.needs_prescription && days <= Number(m.prescription_days)) alerts.push(`📄 Receita: ${m.name} — cerca de ${Math.floor(days)} dia(s) de estoque. Verifique se precisa pedir a receita.`);
  }
  if (!alerts.length) return json({ sent: false, reason: "Nenhum alerta no momento." });
  const message = `Lembretes da Minha Farmácia\n\n${alerts.join("\n\n")}\n\nEstimativas organizacionais — confirme suas orientações com um profissional de saúde.`;
  try { await sendTelegram(telegramToken, chatId, message); return json({ sent: true, count: alerts.length }); }
  catch (e) { return json({ error: e instanceof Error ? e.message : "Falha no envio ao Telegram." }, 502); }
});
