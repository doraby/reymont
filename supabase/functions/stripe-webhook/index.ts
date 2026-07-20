// Stripe webhook — включает/выключает Reymont Pro после оплаты.
// Деплой: dashboard → Edge Functions → name "stripe-webhook",
// ОБЯЗАТЕЛЬНО отключить "Verify JWT" (Stripe не шлёт Supabase-токены).
// Секрет: STRIPE_WEBHOOK_SECRET (whsec_... из настроек вебхука в Stripe).
import { createClient } from "npm:@supabase/supabase-js@2";

async function verifyStripeSignature(payload: string, header: string, secret: string): Promise<boolean> {
  // Заголовок вида: t=1699999999,v1=abcdef...,v1=... — проверяем HMAC-SHA256 от `${t}.${payload}`
  let t = "";
  const sigs: string[] = [];
  for (const part of header.split(",")) {
    const i = part.indexOf("=");
    if (i < 0) continue;
    const k = part.slice(0, i).trim(), v = part.slice(i + 1).trim();
    if (k === "t") t = v;
    if (k === "v1") sigs.push(v);
  }
  if (!t || !sigs.length) return false;
  if (Math.abs(Date.now() / 1000 - Number(t)) > 600) return false; // защита от повторов
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const mac = await crypto.subtle.sign("HMAC", key, enc.encode(`${t}.${payload}`));
  const hex = [...new Uint8Array(mac)].map((b) => b.toString(16).padStart(2, "0")).join("");
  return sigs.includes(hex);
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response("ok");
  const secret = Deno.env.get("STRIPE_WEBHOOK_SECRET") ?? "";
  if (!secret) return new Response("STRIPE_WEBHOOK_SECRET is not set", { status: 500 });

  const payload = await req.text();
  const sig = req.headers.get("stripe-signature") ?? "";
  if (!(await verifyStripeSignature(payload, sig, secret))) {
    return new Response("bad signature", { status: 400 });
  }

  const event = JSON.parse(payload);
  // service role — пишем в pro_users в обход RLS; ключ автоматически доступен функциям
  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  if (event.type === "checkout.session.completed") {
    const s = event.data.object;
    const userId = s.client_reference_id; // id пользователя Supabase, передаётся в ссылке оплаты
    if (userId) {
      const { error } = await admin.from("pro_users").upsert({
        user_id: userId,
        stripe_customer: s.customer ?? null,
        email: s.customer_details?.email ?? null,
      });
      if (error) console.error("pro_users upsert:", error);
    } else {
      console.error("checkout.session.completed without client_reference_id");
    }
  }

  if (event.type === "customer.subscription.deleted") {
    const sub = event.data.object;
    if (sub.customer) {
      const { error } = await admin.from("pro_users").delete().eq("stripe_customer", sub.customer);
      if (error) console.error("pro_users delete:", error);
    }
  }

  return new Response(JSON.stringify({ received: true }), { headers: { "Content-Type": "application/json" } });
});
