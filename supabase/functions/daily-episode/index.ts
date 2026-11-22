// Reymont — утреннее письмо «следующая серия».
// Раз в день вызывается pg_cron'ом (supabase/daily_episode.sql) с заголовком Authorization: Bearer CRON_SECRET.
// Берёт из reading_state тех, кто включил email_daily, и шлёт начало следующей непрочитанной серии
// (next_ep пишет клиент, когда листает книгу). GET ?unsub=<user_id>&sig=<hmac> — отписка из письма.
// Деплой: supabase functions deploy daily-episode --no-verify-jwt
// Секреты: RESEND_API_KEY, CRON_SECRET, EMAIL_FROM (адрес на домене, подтверждённом в Resend),
// OPENAI_API_KEY (тот же, что у функции ai) — для тизера «в следующей серии»; TEASER_MODEL / TEXT_MODEL — модель.
import { createClient } from "npm:@supabase/supabase-js@2";

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY") ?? "";
const CRON_SECRET = Deno.env.get("CRON_SECRET") ?? "";
const EMAIL_FROM = Deno.env.get("EMAIL_FROM") ?? "Reymont <episodes@reymont.app>";
const APP_URL = "https://reymont.app/";
const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY") ?? "";
const TEASER_MODEL = Deno.env.get("TEASER_MODEL") ?? Deno.env.get("TEXT_MODEL") ?? "gpt-5.4-nano";
const FN_URL = Deno.env.get("SUPABASE_URL") + "/functions/v1/daily-episode";

const admin = () => createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

async function sign(userId: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(CRON_SECRET),
    { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const mac = new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode("unsub:" + userId)));
  return [...mac].map(b => b.toString(16).padStart(2, "0")).join("").slice(0, 32);
}
const esc = (s: string) => String(s ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]!));

type Ep = {
  book_id: string; title: string; author: string; n: number; total: number; season: number; seasons: number;
  season_title: string; e: number; of: number; min: number; cfi: string; teaser: string;
  excerpt?: string; lang?: string;
  ai_teaser?: string; // тизер, уже написанный для этой серии (клиент затирает его, когда next_ep меняется)
};

// «В следующей серии…»: 2–3 фразы на языке читателя, интрига без развязки.
async function aiTeaser(ep: Ep): Promise<string> {
  if (!OPENAI_API_KEY || !ep.excerpt) return "";
  const lang = String(ep.lang || "English").slice(0, 30);
  const system = `You write the "next time on…" line for a book read as a TV series. ` +
    `From the episode text, write 2–3 short sentences in ${lang} that make the reader want to open it right now: ` +
    `who is in it, what is at stake, what question hangs open. Present tense, concrete names and details from the text. ` +
    `Never reveal how the episode ends or resolves anything. No quotes from the text, no title, no "In this episode", no emoji. ` +
    `Reply with the sentences only.`;
  const user = `Book: "${ep.title}"${ep.author ? " by " + ep.author : ""}. ` +
    `Season ${ep.season} (${ep.season_title}), episode ${ep.e} of ${ep.of}.\n<episode>${ep.excerpt.slice(0, 6000)}</episode>`;
  try {
    const r = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${OPENAI_API_KEY}` },
      body: JSON.stringify({
        model: TEASER_MODEL, reasoning_effort: "low", max_completion_tokens: 1500,
        messages: [{ role: "system", content: system }, { role: "user", content: user }],
      }),
    });
    if (!r.ok) { console.error("teaser:", r.status, (await r.text()).slice(0, 300)); return ""; }
    const j = await r.json();
    return String(j.choices?.[0]?.message?.content ?? "").trim().slice(0, 600);
  } catch (e) { console.error("teaser:", e); return ""; }
}

function render(ep: Ep, unsubUrl: string) {
  const link = `${APP_URL}?book=${encodeURIComponent(ep.book_id)}&at=${encodeURIComponent(ep.cfi)}`;
  const head = `Season ${ep.season} · episode ${ep.e} of ${ep.of}`;
  const paras = ep.teaser.split(/\n{2,}/).map(p => p.trim()).filter(Boolean);
  const hook = (ep.ai_teaser ?? "").trim();
  const html = `<!doctype html><html><body style="margin:0;background:#fffff8;color:#111;">
<div style="max-width:560px;margin:0 auto;padding:32px 20px;font-family:Georgia,'Times New Roman',serif;font-size:18px;line-height:1.55;">
  <div style="font-size:14px;color:#666;font-style:italic;">${esc(ep.title)}${ep.author ? " — " + esc(ep.author) : ""}</div>
  <div style="font-size:14px;color:#666;margin:2px 0 24px;">${esc(head)} · ${esc(ep.season_title)} · ${ep.min} min · ${ep.n} of ${ep.total}</div>
  ${hook ? `<p style="margin:0 0 28px;font-style:italic;">${esc(hook)}</p>` : ""}
  ${paras.map(p => `<p style="margin:0 0 14px;">${esc(p)}</p>`).join("\n  ")}
  <p style="margin:24px 0 0;"><a href="${link}" style="color:#a00000;">Keep reading →</a></p>
  <p style="margin:40px 0 0;font-size:12px;color:#999;"><a href="${unsubUrl}" style="color:#999;">Stop daily episodes</a></p>
</div></body></html>`;
  const text = `${ep.title}${ep.author ? " — " + ep.author : ""}\n${head} · ${ep.season_title} · ${ep.min} min\n\n${hook ? hook + "\n\n" : ""}${paras.join("\n\n")}\n\nKeep reading: ${link}\n\nStop daily episodes: ${unsubUrl}`;
  return { subject: `${ep.title}: ${head}`, html, text };
}

Deno.serve(async (req) => {
  const url = new URL(req.url);

  // Отписка по ссылке из письма
  const unsub = url.searchParams.get("unsub");
  if (req.method === "GET" && unsub) {
    const ok = CRON_SECRET && url.searchParams.get("sig") === await sign(unsub);
    if (ok) await admin().from("reading_state").update({ email_daily: false }).eq("user_id", unsub);
    return new Response(ok ? "Done — no more daily episodes. You can turn them back on in Reymont settings."
      : "Invalid link.", { status: ok ? 200 : 400, headers: { "Content-Type": "text/plain; charset=utf-8" } });
  }

  if (!CRON_SECRET || req.headers.get("Authorization") !== `Bearer ${CRON_SECRET}`) {
    return new Response("Forbidden", { status: 403 });
  }
  if (!RESEND_API_KEY) return new Response("RESEND_API_KEY is not set", { status: 500 });

  const db = admin();
  const { data: rows, error } = await db.from("reading_state")
    .select("user_id,next_ep,last_emailed").eq("email_daily", true).not("next_ep", "is", null);
  if (error) return new Response(error.message, { status: 500 });

  const dayAgo = Date.now() - 20 * 3600 * 1000; // защита от двойного запуска в тот же день
  let sent = 0, failed = 0;
  for (const r of rows ?? []) {
    if (r.last_emailed && Number(r.last_emailed) > dayAgo) continue;
    const ep = r.next_ep as Ep;
    if (!ep?.teaser || !ep?.cfi) continue;
    const { data: u } = await db.auth.admin.getUserById(r.user_id);
    const to = u?.user?.email;
    if (!to) continue;
    if (!ep.ai_teaser) {
      const t = await aiTeaser(ep);
      if (t) { // кешируем в той же строке: завтра, если читатель не продвинулся, тизер не генерируем заново
        ep.ai_teaser = t;
        await db.from("reading_state").update({ next_ep: ep }).eq("user_id", r.user_id);
      }
    }
    const unsubUrl = `${FN_URL}?unsub=${r.user_id}&sig=${await sign(r.user_id)}`;
    const m = render(ep, unsubUrl);
    try {
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${RESEND_API_KEY}` },
        body: JSON.stringify({
          from: EMAIL_FROM, to: [to], subject: m.subject, html: m.html, text: m.text,
          headers: { "List-Unsubscribe": `<${unsubUrl}>` },
        }),
      });
      if (!res.ok) { failed++; console.error("resend:", res.status, await res.text()); continue; }
      await db.from("reading_state").update({ last_emailed: Date.now() }).eq("user_id", r.user_id);
      sent++;
    } catch (e) { failed++; console.error("resend:", e); }
  }
  return new Response(JSON.stringify({ sent, failed }), { headers: { "Content-Type": "application/json" } });
});
