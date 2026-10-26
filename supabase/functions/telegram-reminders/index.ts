// Supabase Edge Function: deploy pelo CLI e execute somente via Supabase Cron.
// Secrets: TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID, CRON_SECRET.
// SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY são providenciadas no runtime Supabase.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-secret", "Content-Type": "application/json" };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: cors });
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "POST only" }, 405);
  const cronSecret = Deno.env.get("CRON_SECRET");
  if (!cronSecret || req.headers.get("x-cron-secret") !== cronSecret) return json({ error: "Unauthorized" }, 401);
  const telegramToken = Deno.env.get("TELEGRAM_BOT_TOKEN");
  const chatId = Deno.env.get("TELEGRAM_CHAT_ID");
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!telegramToken || !chatId || !supabaseUrl || !serviceKey) return json({ error: "Configure os secrets do Supabase e Telegram." }, 500);
  const db = createClient(supabaseUrl, serviceKey);
  const { data: meds, error } = await db.from("medications").select("id,user_id,name,unit,base_remaining,daily_consumption,base_date,prescription_days,low_stock_days,paused");
  if (error) return json({ error: error.message }, 500);
  const today = new Date(); today.setUTCHours(0, 0, 0, 0);
  const alerts: string[] = [];
  for (const m of meds || []) {
    const elapsed = m.paused ? 0 : Math.max(0, Math.floor((today.getTime() - new Date(`${m.base_date}T00:00:00Z`).getTime()) / 86400000));
    const remaining = Math.max(0, Number(m.base_remaining) - elapsed * Number(m.daily_consumption));
    const days = Number(m.daily_consumption) > 0 ? remaining / Number(m.daily_consumption) : Infinity;
    if (days <= Number(m.low_stock_days)) alerts.push(`⚠️ Estoque baixo: ${m.name} — cerca de ${Math.floor(days)} dia(s) restantes (${remaining} ${m.unit}).`);
    else if (days <= Number(m.prescription_days)) alerts.push(`📄 Receita: ${m.name} — cerca de ${Math.floor(days)} dia(s) de estoque. Verifique se precisa pedir a receita.`);
  }
  if (!alerts.length) return json({ sent: false, reason: "Nenhum alerta no momento." });
  const message = `Lembretes da Minha Farmácia\n\n${alerts.join("\n\n")}\n\nEstimativas organizacionais — confirme suas orientações com um profissional de saúde.`;
  const result = await fetch(`https://api.telegram.org/bot${telegramToken}/sendMessage`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ chat_id: chatId, text: message }) });
  if (!result.ok) return json({ error: "Falha no envio ao Telegram." }, 502);
  return json({ sent: true, count: alerts.length });
});
