// Reymont AI proxy — Supabase Edge Function
// Держит OPENAI_API_KEY в секрете и обслуживает переводы/веб-поиск
// для вошедших пользователей. Деплой: dashboard → Edge Functions → name "ai".
import { createClient } from "npm:@supabase/supabase-js@2";

const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY") ?? "";
const CORS_ORIGINS = ["https://reymont.app", "https://www.reymont.app", "https://doraby.github.io"];

function corsHeaders(req: Request) {
  const origin = req.headers.get("origin") ?? "";
  const allow = CORS_ORIGINS.includes(origin) || origin.startsWith("http://localhost") ? origin : CORS_ORIGINS[0];
  return {
    "Access-Control-Allow-Origin": allow,
    "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  };
}
function json(obj: unknown, status: number, cors: Record<string, string>) {
  return new Response(JSON.stringify(obj), { status, headers: { ...cors, "Content-Type": "application/json" } });
}
function err(message: string, status: number, cors: Record<string, string>) {
  return json({ error: { message } }, status, cors);
}

Deno.serve(async (req) => {
  const cors = corsHeaders(req);
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return err("Method not allowed", 405, cors);
  if (!OPENAI_API_KEY) return err("OPENAI_API_KEY secret is not set in Supabase", 500, cors);

  // Только вошедшие пользователи — иначе ключ выкачает любой аноним
  const supa = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } } },
  );
  const { data: { user } } = await supa.auth.getUser();
  if (!user) return err("Sign in required", 401, cors);

  const body = await req.json().catch(() => ({}));
  const text = String(body.text ?? "").slice(0, 3000);
  const para = String(body.para ?? "").slice(0, 1500);
  const lang = String(body.lang ?? "English").slice(0, 30);
  if (!text) return err("No text", 400, cors);

  if (body.action === "translate") {
    const sys = `You are an expert literary translator. Translate the text inside <text> tags into ${lang}. Output ONLY the translation, no comments, tags or quotes.` +
      (body.short
        ? ` Since the text is a single word or short phrase: first line — the best translation as used in this context; then a new line in parentheses with the part of speech and 2–4 alternative meanings in ${lang}, comma-separated.`
        : " Preserve the tone and style of the original.") +
      (para ? " A <context> tag contains the surrounding paragraph — use it only to disambiguate meaning; never translate or mention it." : "");
    const userMsg = para ? `<text>${text}</text>\n<context>${para}</context>` : `<text>${text}</text>`;
    const r = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${OPENAI_API_KEY}` },
      body: JSON.stringify({
        model: "gpt-4o-mini", stream: true, temperature: 0.3,
        messages: [{ role: "system", content: sys }, { role: "user", content: userMsg }],
      }),
    });
    // пробрасываем поток SSE как есть — клиент уже умеет его читать
    return new Response(r.body, { status: r.status, headers: { ...cors, "Content-Type": "text/event-stream" } });
  }

  if (body.action === "search") {
    const title = String(body.title ?? "").slice(0, 200);
    const author = String(body.author ?? "").slice(0, 200);
    const prompt = `Search the web for information about: "${text}". It appears in the book "${title}"${author ? " by " + author : ""}.` +
      (para ? `\nHere is the paragraph where it appears — use it to identify what "${text}" actually refers to, and trust this context over guesses:\n"""${para}"""` : "") +
      `\nIn ${lang}, briefly explain (3-5 sentences) what or who this is and the most interesting facts about it. If it is a place, person, work of art or historical event — say so. If the web results clearly do not match the meaning in the paragraph, say what it means in the book instead of forcing a match. Answer in ${lang} only.`;
    const call = (tool: string) => fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${OPENAI_API_KEY}` },
      body: JSON.stringify({ model: "gpt-4o-mini", tools: [{ type: tool }], input: prompt }),
    });
    let r = await call("web_search");
    if (r.status === 400) r = await call("web_search_preview");
    return new Response(await r.text(), { status: r.status, headers: { ...cors, "Content-Type": "application/json" } });
  }

  return err("Unknown action", 400, cors);
});
