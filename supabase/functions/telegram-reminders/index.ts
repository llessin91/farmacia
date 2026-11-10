// Supabase Edge Function: cron diário + webhook privado do Telegram.
// Secrets: TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID, TELEGRAM_OWNER_USER_ID,
// CRON_SECRET, TELEGRAM_WEBHOOK_SECRET, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-secret, x-telegram-bot-api-secret-token", "Access-Control-Allow-Methods": "POST, OPTIONS", "Content-Type": "application/json" };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: cors });
const tg = async (token: string, method: string, body: Record<string, unknown>) => {
  const response = await fetch(`https://api.telegram.org/bot${token}/${method}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || !payload.ok) throw new Error(`Falha na operação Telegram (${method}).`);
  return payload.result;
};
const sendTelegram = (token: string, chatId: string, text: string, replyMarkup?: unknown) => tg(token, "sendMessage", { chat_id: chatId, text, ...(replyMarkup ? { reply_markup: replyMarkup } : {}) });
const answerCallback = (token: string, id: string, text: string) => tg(token, "answerCallbackQuery", { callback_query_id: id, text });
const removeButtons = (token: string, chatId: string | number, messageId: number) => tg(token, "editMessageReplyMarkup", { chat_id: chatId, message_id: messageId, reply_markup: { inline_keyboard: [] } });
const editMessageText = (token: string, chatId: string | number, messageId: number, text: string) => tg(token, "editMessageText", { chat_id: chatId, message_id: messageId, text });
function medicationStatus(m: any) {
  const today = new Date(); today.setUTCHours(0, 0, 0, 0);
  const elapsed = Math.max(0, Math.floor((today.getTime() - new Date(`${m.base_date}T00:00:00Z`).getTime()) / 86400000));
  const billableDays = m.paused ? 0 : Math.max(0, elapsed - Number(m.paused_days_offset || 0));
  const remaining = Math.max(0, Number(m.base_remaining) - billableDays * Number(m.daily_consumption));
  const daily = Number(m.daily_consumption);
  const days = daily > 0 ? remaining / daily : Number.POSITIVE_INFINITY;
  return { remaining, days, prescription: !!m.needs_prescription && days <= Number(m.prescription_days), purchase: remaining <= 0 || days <= Number(m.low_stock_days) };
}
function keyboard(kind: string, reminderId: string) {
  const data = kind === "prescription" ? [`rx|confirm|${reminderId}`, `rx|wait|${reminderId}`] : [`buy|confirm|${reminderId}`, `buy|wait|${reminderId}`];
  const labels = kind === "prescription" ? ["Confirmado", "Aguardar"] : ["Confirmar compra", "Aguardar"];
  return { inline_keyboard: [[{ text: labels[0], callback_data: data[0] }, { text: labels[1], callback_data: data[1] }]] };
}
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "POST only" }, 405);
  const telegramToken = Deno.env.get("TELEGRAM_BOT_TOKEN");
  const expectedChatId = Deno.env.get("TELEGRAM_CHAT_ID");
  if (!telegramToken || !expectedChatId) return json({ error: "Configure TELEGRAM_BOT_TOKEN e TELEGRAM_CHAT_ID nos secrets do Supabase." }, 500);
  let body: any = {};
  try { body = await req.json(); } catch { /* Cron pode omitir o corpo JSON. */ }

  // Webhook do Telegram: só aceita atualizações autenticadas e vindas do chat privado configurado.
  const webhookSecret = Deno.env.get("TELEGRAM_WEBHOOK_SECRET");
  if (webhookSecret && req.headers.get("x-telegram-bot-api-secret-token") === webhookSecret && (body.callback_query || body.message)) {
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const ownerId = Deno.env.get("TELEGRAM_OWNER_USER_ID");
    if (!serviceKey || !supabaseUrl || !ownerId) return json({ error: "Configuração segura do Supabase incompleta." }, 500);
    const db = createClient(supabaseUrl, serviceKey);
    const updateId = Number(body.update_id);
    if (body.callback_query) {
      const cb = body.callback_query;
      const chatId = String(cb.message?.chat?.id ?? "");
      const fromId = String(cb.from?.id ?? "");
      if (chatId !== expectedChatId || fromId !== expectedChatId) {
        await answerCallback(telegramToken, cb.id, "Esta ação não está autorizada.");
        return json({ ok: true, ignored: true });
      }
      const match = /^(rx|buy)\|(confirm|wait)\|([0-9a-f-]{36})$/i.exec(String(cb.data || ""));
      if (!match) { await answerCallback(telegramToken, cb.id, "Ação inválida."); return json({ ok: true, ignored: true }); }
      const [, type, choice, reminderId] = match;
      const kind = type.toLowerCase() === "rx" ? "prescription" : "purchase";
      const { data: reminder, error } = await db.from("medication_reminders").select("id,user_id,kind,status,medication:medications(name,unit,list:medication_lists(name))").eq("id", reminderId).eq("user_id", ownerId).maybeSingle();
      if (error) return json({ error: error.message }, 500);
      if (!reminder || reminder.kind !== kind || reminder.status !== "pending") {
        await answerCallback(telegramToken, cb.id, "Este lembrete já foi concluído ou não está disponível.");
        await removeButtons(telegramToken, cb.message.chat.id, cb.message.message_id).catch(() => null);
        return json({ ok: true, ignored: true });
      }
      const med = Array.isArray(reminder.medication) ? reminder.medication[0] : reminder.medication;
      if (choice === "wait") {
        const { error: updateError } = await db.from("medication_reminders").update({ last_notified_at: new Date().toISOString() }).eq("id", reminderId).eq("status", "pending");
        if (updateError) return json({ error: updateError.message }, 500);
        await answerCallback(telegramToken, cb.id, "Certo, avisaremos no próximo horário programado.");
        await removeButtons(telegramToken, cb.message.chat.id, cb.message.message_id).catch(() => null);
        await editMessageText(telegramToken, cb.message.chat.id, cb.message.message_id, `${cb.message.text || "Lembrete"}\n\n⏳ Aguardar registrado. Voltaremos no próximo horário programado.`).catch(() => null);
        return json({ ok: true, action: "wait" });
      }
      if (kind === "prescription") {
        const { error: updateError } = await db.from("medication_reminders").update({ status: "completed", completed_at: new Date().toISOString() }).eq("id", reminderId).eq("status", "pending");
        if (updateError) return json({ error: updateError.message }, 500);
        await answerCallback(telegramToken, cb.id, "Receita confirmada; os avisos foram encerrados.");
        await removeButtons(telegramToken, cb.message.chat.id, cb.message.message_id).catch(() => null);
        await editMessageText(telegramToken, cb.message.chat.id, cb.message.message_id, `${cb.message.text || "Lembrete"}\n\n✅ Confirmado. Os avisos foram encerrados.`).catch(() => null);
        return json({ ok: true, action: "prescription_completed" });
      }
      const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
      const { error: pendingError } = await db.from("telegram_pending_purchases").upsert({ chat_id: expectedChatId, user_id: ownerId, reminder_id: reminderId, expires_at: expiresAt }, { onConflict: "chat_id" });
      if (pendingError) return json({ error: pendingError.message }, 500);
      await answerCallback(telegramToken, cb.id, "Envie a quantidade comprada neste chat.");
      await removeButtons(telegramToken, cb.message.chat.id, cb.message.message_id).catch(() => null);
      await editMessageText(telegramToken, cb.message.chat.id, cb.message.message_id, `${cb.message.text || "Lembrete"}\n\n🔢 Aguardando a quantidade da compra.`).catch(() => null);
      await sendTelegram(telegramToken, expectedChatId, `Qual quantidade de ${med?.name || "medicamento"} você comprou?\nInforme um número em ${med?.unit || "unidades"} (por exemplo: 30).`);
      return json({ ok: true, action: "ask_quantity" });
    }

    const message = body.message;
    const chatId = String(message?.chat?.id ?? "");
    const fromId = String(message?.from?.id ?? "");
    if (chatId !== expectedChatId || fromId !== expectedChatId || typeof message?.text !== "string") return json({ ok: true, ignored: true });
    const { data: waiting, error: waitingError } = await db.from("telegram_pending_purchases").select("chat_id,reminder_id,expires_at").eq("chat_id", expectedChatId).maybeSingle();
    if (waitingError) return json({ error: waitingError.message }, 500);
    if (!waiting) return json({ ok: true, ignored: true });
    if (new Date(waiting.expires_at).getTime() < Date.now()) {
      await db.from("telegram_pending_purchases").delete().eq("chat_id", expectedChatId);
      await sendTelegram(telegramToken, expectedChatId, "O pedido de quantidade expirou. Se ainda precisar, aguarde o próximo lembrete e confirme novamente.");
      return json({ ok: true, expired: true });
    }
    const rawQuantity = String(message.text).trim().replace(/\s/g, "").replace(",", ".");
    const quantity = Number(rawQuantity);
    if (!/^\d+(\.\d+)?$/.test(rawQuantity) || !Number.isFinite(quantity) || quantity <= 0) {
      await sendTelegram(telegramToken, expectedChatId, "Não reconheci essa quantidade. Envie apenas um número maior que zero (por exemplo: 30). A compra ainda não foi registrada.");
      return json({ ok: true, invalid_quantity: true });
    }
    if (!Number.isSafeInteger(updateId)) return json({ error: "Identificador de atualização inválido." }, 400);
    const { data: purchaseReminder, error: purchaseReminderError } = await db.from("medication_reminders").select("medication:medications(name,unit)").eq("id", waiting.reminder_id).eq("user_id", ownerId).maybeSingle();
    if (purchaseReminderError) return json({ error: purchaseReminderError.message }, 500);
    const purchasedMed = Array.isArray(purchaseReminder?.medication) ? purchaseReminder.medication[0] : purchaseReminder?.medication;
    const { data: registered, error: rpcError } = await db.rpc("complete_telegram_purchase", { p_update_id: updateId, p_chat_id: expectedChatId, p_quantity: quantity });
    if (rpcError) return json({ error: rpcError.message }, 500);
    if (!registered) {
      await sendTelegram(telegramToken, expectedChatId, "Essa resposta já foi processada; não registrei uma compra duplicada.");
      return json({ ok: true, duplicate: true });
    }
    await sendTelegram(telegramToken, expectedChatId, `Compra registrada: ${quantity} ${purchasedMed?.unit || "unidades"} de ${purchasedMed?.name || "medicamento"} adicionadas ao estoque. O lembrete foi concluído e o app será atualizado pelo Supabase.`);
    return json({ ok: true, purchase_completed: true });
  }

  const cronSecret = Deno.env.get("CRON_SECRET");
  if (cronSecret && req.headers.get("x-cron-secret") === cronSecret) {
    const ownerId = Deno.env.get("TELEGRAM_OWNER_USER_ID");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    if (!ownerId || !serviceKey || !supabaseUrl) return json({ error: "Configure TELEGRAM_OWNER_USER_ID e as credenciais de serviço do Supabase." }, 500);
    const db = createClient(supabaseUrl, serviceKey);
    const { data: meds, error: medError } = await db.from("medications").select("id,user_id,list_id,name,unit,base_remaining,daily_consumption,base_date,prescription_days,needs_prescription,low_stock_days,paused,paused_days_offset").eq("user_id", ownerId);
    if (medError) return json({ error: medError.message }, 500);
    const { data: existing, error: reminderError } = await db.from("medication_reminders").select("id,medication_id,list_id,kind,status,is_eligible").eq("user_id", ownerId);
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
          const { error } = await db.from("medication_reminders").insert({ user_id: ownerId, medication_id: m.id, list_id: m.list_id, kind, status: "pending", is_eligible: true });
          if (error && error.code !== "23505") return json({ error: error.message }, 500);
          if (!error) created++;
        } else if (reminder) {
          const reopen = eligible && reminder.status === "completed" && !reminder.is_eligible;
          const { error } = await db.from("medication_reminders").update({ list_id: m.list_id, is_eligible: eligible, ...(reopen ? { status: "pending", completed_at: null, last_notified_at: null } : {}) }).eq("id", reminder.id);
          if (error) return json({ error: error.message }, 500);
        }
      }
    }
    const { data: pending, error: pendingError } = await db.from("medication_reminders").select("id,kind,list_id,last_notified_at,medication:medications(name,unit,base_remaining,daily_consumption,base_date,paused,paused_days_offset,list:medication_lists(name))").eq("user_id", ownerId).eq("status", "pending");
    if (pendingError) return json({ error: pendingError.message }, 500);
    const { data: waitingPurchases, error: waitingError } = await db.from("telegram_pending_purchases").select("reminder_id,expires_at").eq("chat_id", expectedChatId);
    if (waitingError) return json({ error: waitingError.message }, 500);
    const waitingIds = new Set((waitingPurchases || []).filter((x: any) => new Date(x.expires_at).getTime() > Date.now()).map((x: any) => x.reminder_id));
    const todayUtc = new Date().toISOString().slice(0, 10);
    const due = (pending || []).filter((r: any) => !waitingIds.has(r.id) && (!r.last_notified_at || String(r.last_notified_at).slice(0, 10) < todayUtc));
    if (!due.length) return json({ sent: false, created, reason: "Nenhum lembrete pendente para enviar hoje." });
    let sent = 0;
    try {
      for (const r of due) {
        const m = Array.isArray(r.medication) ? r.medication[0] : r.medication;
        const list = Array.isArray(m?.list) ? m.list[0] : m?.list;
        const prefix = list?.name ? `[${list.name}] ` : "";
        const stock = medicationStatus(m || {});
        const text = r.kind === "prescription"
          ? `📄 ${prefix}Pedir/renovar a receita de ${m?.name || "medicamento"}.\n\nToque em Confirmado quando resolver, ou em Aguardar para receber novamente no próximo horário programado.`
          : stock.remaining <= 0
            ? `🛒 ${prefix}O estoque de ${m?.name || "medicamento"} acabou.\n\nToque em Confirmar compra para informar a quantidade e atualizar o estoque, ou em Aguardar para receber novamente no próximo horário programado.`
            : `🛒 ${prefix}Comprar ${m?.name || "medicamento"} — estoque estimado: ${Math.floor(stock.remaining)} ${m?.unit || "unidades"}.\n\nToque em Confirmar compra para informar a quantidade e atualizar o estoque, ou em Aguardar para receber novamente no próximo horário programado.`;
        await sendTelegram(telegramToken, expectedChatId, text, keyboard(r.kind, r.id));
        const { error } = await db.from("medication_reminders").update({ last_notified_at: new Date().toISOString() }).eq("id", r.id).eq("status", "pending");
        if (error) return json({ error: error.message }, 500);
        sent++;
      }
      return json({ sent: true, count: sent, created });
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
    try { await sendTelegram(telegramToken, expectedChatId, "✅ Teste da Minha Farmácia: conexão com o Telegram funcionando."); return json({ sent: true }); }
    catch (e) { return json({ error: e instanceof Error ? e.message : "Falha no Telegram." }, 502); }
  }
  return json({ error: "Ação não suportada." }, 400);
});
