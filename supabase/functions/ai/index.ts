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

// Референс стиля — ровно две картины Мальчевского, которые владелец сам выбрал и одобрил
// (третью, с обнажённой натурой, специально исключили — она валила запрос safety-фильтром
// OpenAI). Ищем каждую отдельным точным запросом вместо перебора всей категории на Commons,
// чтобы не подхватить что-то незапланированное. Названия файлов не подтверждены вручную
// (нет прямого доступа в интернет из этой сессии) — если поиск найдёт не то, usedRefs
// в ответе функции покажет, что именно выбралось, и запрос можно будет уточнить.
const REF_SEARCHES = [
  "Malczewski faun flute self-portrait",
  "Malczewski Śmierć peasant scythe",
];
let cachedRefs: { blobs: Blob[]; titles: string[] } | null = null;
async function getStyleReferenceImages(): Promise<{ blobs: Blob[]; titles: string[] }> {
  if (cachedRefs) return cachedRefs;
  const blobs: Blob[] = [];
  const titles: string[] = [];
  for (const q of REF_SEARCHES) {
    try {
      const apiUrl = "https://commons.wikimedia.org/w/api.php?action=query&format=json&origin=*" +
        "&generator=search&gsrnamespace=6&gsrlimit=1&gsrsearch=" + encodeURIComponent(q) +
        "&prop=imageinfo&iiprop=url|size&iiurlwidth=1024";
      const res = await fetch(apiUrl);
      const j = await res.json();
      const pages = Object.values(j.query?.pages ?? {}) as Array<{ title?: string; imageinfo?: Array<{ thumburl?: string }> }>;
      const hit = pages[0];
      const thumburl = hit?.imageinfo?.[0]?.thumburl;
      if (thumburl) {
        const r = await fetch(thumburl);
        if (r.ok) { blobs.push(await r.blob()); titles.push(hit.title ?? thumburl); }
      }
    } catch (_e) { /* пропускаем, если конкретный поиск не сработал */ }
  }
  cachedRefs = { blobs, titles };
  return cachedRefs;
}

const MALCZEWSKI_STYLE = "Style: Polish Symbolist oil painting in the manner of Jacek Malczewski (1854-1929) — " +
  "visible painterly brushstrokes, muted earthy palette (ochre, umber, sage green, dull red) with sudden warm " +
  "golden light, symbolist mood blending Polish peasant realism with allegorical or mythological figures where " +
  "fitting, atmospheric countryside backgrounds, formal painterly composition. The attached reference images are " +
  "genuine Malczewski paintings — match their exact technique, palette and mood closely.";

type ImageResult = { b64?: string; error?: string; status?: number; usedRefs?: string[] };

async function callOpenAIImage(prompt: string, refBlobs: Blob[]): Promise<ImageResult> {
  const form = new FormData();
  form.append("model", "gpt-image-2");
  form.append("prompt", prompt);
  form.append("size", "1024x1536");
  form.append("quality", "medium");
  refBlobs.forEach((blob, i) => form.append("image[]", blob, `ref${i}.jpg`));
  const url = refBlobs.length ? "https://api.openai.com/v1/images/edits" : "https://api.openai.com/v1/images/generations";
  const r = await fetch(url, { method: "POST", headers: { Authorization: `Bearer ${OPENAI_API_KEY}` }, body: form });
  if (!r.ok) {
    const t = await r.text();
    return { error: "Image generation failed: " + t.slice(0, 400), status: r.status };
  }
  const j = await r.json();
  const b64 = j.data?.[0]?.b64_json;
  if (!b64) return { error: "No image returned", status: 502 };
  return { b64 };
}

async function generateImage(prompt: string): Promise<ImageResult> {
  try {
    const { blobs, titles } = await getStyleReferenceImages();
    let result = await callOpenAIImage(prompt, blobs);
    // Малчевский часто рисовал обнажённую натуру (фавны, музы) — если картинка-референс
    // всё же зацепила safety-фильтр OpenAI, пробуем ещё раз тем же текстом, но без картинок.
    if (result.error && blobs.length && /safety|sexual/i.test(result.error)) {
      result = await callOpenAIImage(prompt, []);
      if (!result.error) result.usedRefs = ["(none — safety fallback)"];
    } else if (!result.error) {
      result.usedRefs = titles;
    }
    return result;
  } catch (e) {
    return { error: "Illustration error: " + (e instanceof Error ? e.message : String(e)), status: 500 };
  }
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

  // заявка на платную версию — квота на неё не действует
  if (body.action === "upgrade") {
    const message = String(body.message ?? "").slice(0, 500);
    const { error } = await supa.from("upgrade_requests")
      .insert({ email: user.email, message });
    if (error) return err("Could not save the request: " + error.message, 500, cors);

    // письмо владельцу через Resend; сбой почты не роняет заявку — она уже в таблице
    const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY") ?? "";
    const NOTIFY_EMAIL = Deno.env.get("NOTIFY_EMAIL") ?? "";
    if (RESEND_API_KEY && NOTIFY_EMAIL) {
      try {
        const r = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${RESEND_API_KEY}` },
          body: JSON.stringify({
            from: "Reymont <onboarding@resend.dev>",
            to: [NOTIFY_EMAIL],
            subject: "Reymont Pro — new upgrade request",
            text: `New Reymont Pro request ($10/month)\n\nFrom: ${user.email}\nUser id: ${user.id}\nMessage: ${message}\nTime: ${new Date().toISOString()}\n\nAll requests: Supabase → Table Editor → upgrade_requests`,
          }),
        });
        if (!r.ok) console.error("resend:", r.status, await r.text());
      } catch (e) { console.error("resend:", e); }
    }
    return json({ ok: true }, 200, cors);
  }

  // AI-иллюстрации и обложки — приглашённым по email, вне общей квоты (проверяем до неё)
  if (body.action === "illustrate" || body.action === "illustrate_cover") {
    const ILLUSTRATOR_EMAIL = (Deno.env.get("ILLUSTRATOR_EMAIL") ?? "").toLowerCase();
    if (!ILLUSTRATOR_EMAIL || (user.email ?? "").toLowerCase() !== ILLUSTRATOR_EMAIL) {
      return err("Illustrations are invite-only right now", 403, cors);
    }
    const title = String(body.title ?? "").slice(0, 200);
    const author = String(body.author ?? "").slice(0, 200);

    let prompt: string;
    if (body.action === "illustrate") {
      const text = String(body.text ?? "").slice(0, 2000);
      const para = String(body.para ?? "").slice(0, 1500);
      if (!text) return err("No text", 400, cors);
      prompt = `Book illustration for a scene from the novel "${title}"${author ? " by " + author : ""}.\n` +
        `Depicted moment (the reader's highlighted text): "${text}"\n` +
        (para ? `Full paragraph for context: """${para}"""\n` : "") +
        MALCZEWSKI_STYLE + ` No text, letters, signatures or watermarks in the image.`;
    } else {
      if (!title) return err("No title", 400, cors);
      prompt = `Book cover illustration for the classic novel "${title}"${author ? " by " + author : ""}.\n` +
        `Capture the overall mood, setting and themes of the book in a single evocative scene — the essence, not a specific plot spoiler.\n` +
        MALCZEWSKI_STYLE + ` Portrait orientation suited for a book cover, with a clear focal point and open space near the top for a title to be overlaid separately. ` +
        `No text, letters, titles, author names or watermarks in the image.`;
    }

    const result = await generateImage(prompt);
    if (result.error) return err(result.error, result.status ?? 500, cors);
    return json({ b64: result.b64, usedRefs: result.usedRefs }, 200, cors);
  }

  // Pro-подписчики (оплата через Stripe) без лимита; бесплатный тариф — 10 хайлайтов
  const { data: pro } = await supa.from("pro_users").select("user_id").eq("user_id", user.id).maybeSingle();
  if (!pro) {
    const { count, error: cntErr } = await supa.from("highlights").select("*", { count: "exact", head: true });
    if (!cntErr && (count ?? 0) > 10) return err("Free limit reached", 402, cors);
  }

  const text = String(body.text ?? "").slice(0, 3000);
  const para = String(body.para ?? "").slice(0, 1500);
  const lang = String(body.lang ?? "English").slice(0, 30);
  const extra = String(body.extra ?? "").slice(0, 500);
  if (!text) return err("No text", 400, cors);

  if (body.action === "translate") {
    const sys = `You are an expert literary translator. Translate the text inside <text> tags into ${lang}. Output ONLY the translation, no comments, tags or quotes.` +
      (body.short
        ? ` Since the text is a single word or short phrase: first line — the best translation as used in this context; then a new line in parentheses with the part of speech and 2–4 alternative meanings in ${lang}, comma-separated.`
        : " Preserve the tone and style of the original.") +
      (para ? " A <context> tag contains the surrounding paragraph — use it only to disambiguate meaning; never translate or mention it." : "") +
      (extra ? ` The reader also set this standing instruction for this book, apply it every time after the translation, as extra lines starting with "— ": ${extra}` : "");
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
      `\nIn ${lang}, briefly explain (3-5 sentences) what or who this is and the most interesting facts about it. If it is a place, person, work of art or historical event — say so. If the web results clearly do not match the meaning in the paragraph, say what it means in the book instead of forcing a match. Answer in ${lang} only.` +
      (extra ? `\nThe reader also set this standing instruction for this book, apply it every time when relevant: ${extra}` : "");
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
