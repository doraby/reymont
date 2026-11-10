// Reymont AI proxy — Supabase Edge Function
// Держит OPENAI_API_KEY в секрете и обслуживает переводы/веб-поиск
// для вошедших пользователей. Деплой: dashboard → Edge Functions → name "ai".
import { createClient } from "npm:@supabase/supabase-js@2";

const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY") ?? "";
const CORS_ORIGINS = ["https://reymont.app", "https://www.reymont.app", "https://doraby.github.io"];
const ILLUSTRATIONS_BUCKET = "illustrations";
// Держим в синхроне со списком CURATED_BOOKS в index.html.
const CURATED_BOOK_IDS = new Set(["curated-chlopi", "curated-propaganda", "curated-crystallizing"]);
// Бесплатный лимит AI-иллюстраций/обложек на книги читателя (не на каталог — там куратор без лимита).
const IMAGE_QUOTA_LIMIT = 3;
// Модель для перевода, веб-поиска и схем Mermaid (секрет TEXT_MODEL в Supabase перекрывает). Линейка gpt-5:
// без temperature, лимит ответа — max_completion_tokens (в него входят и токены рассуждений).
const TEXT_MODEL = Deno.env.get("TEXT_MODEL") ?? "gpt-5.4-nano";

// Пишет в Logs функции, что именно ответил OpenAI на неудачный запрос: статус, модель, тело ошибки и
// последние 4 символа ключа (чтобы отличить «неверный ключ» 401 от «нет такой модели/доступа» 404).
// Саму ошибку клиент по-прежнему получает как есть.
async function logOpenAIFailure(label: string, model: string, res: Response) {
  if (res.ok) return;
  let body = "";
  try { body = (await res.clone().text()).slice(0, 500); } catch (_) { /* тело недоступно */ }
  console.error(`[openai] ${label} FAILED: status=${res.status} model=${model} key=…${OPENAI_API_KEY.slice(-4)} body=${body}`);
}
// Сколько хайлайтов с AI можно сделать без входа по e-mail (держим в синхроне с текстом в index.html).
const ANON_FREE_HIGHLIGHTS = 5;

// Отдельный клиент с service-role ключом — только для загрузки картинок в Storage,
// в обход RLS/Storage policies (доступ к этому action и так ограничен одним email).
function storageAdmin() {
  return createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
}
function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}
// Заливает PNG в Storage по стабильному пути (перегенерация перезаписывает тот же файл)
// и возвращает публичный URL с ?v= для сброса кеша браузера/CDN.
async function uploadIllustration(path: string, b64: string): Promise<{ url?: string; error?: string }> {
  try {
    const admin = storageAdmin();
    const { error } = await admin.storage.from(ILLUSTRATIONS_BUCKET)
      .upload(path, base64ToBytes(b64), { contentType: "image/png", upsert: true });
    if (error) return { error: "Storage upload failed: " + error.message };
    const { data } = admin.storage.from(ILLUSTRATIONS_BUCKET).getPublicUrl(path);
    return { url: data.publicUrl + "?v=" + Date.now() };
  } catch (e) {
    return { error: "Storage upload failed: " + (e instanceof Error ? e.message : String(e)) };
  }
}

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

type ImageResult = { b64?: string; error?: string; status?: number };

async function callOpenAIImage(prompt: string): Promise<ImageResult> {
  // /v1/images/generations (в отличие от /v1/images/edits) принимает только JSON,
  // не multipart/form-data — тот формат был нужен только для загрузки файлов-референсов.
  const r = await fetch("https://api.openai.com/v1/images/generations", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${OPENAI_API_KEY}` },
    body: JSON.stringify({ model: "gpt-image-2", prompt, size: "1024x1536", quality: "medium" }),
  });
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
    return await callOpenAIImage(prompt);
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
            subject: "Reymont Premium — new upgrade request",
            text: `New Reymont Premium request ($10/month)\n\nFrom: ${user.email}\nUser id: ${user.id}\nMessage: ${message}\nTime: ${new Date().toISOString()}\n\nAll requests: Supabase → Table Editor → upgrade_requests`,
          }),
        });
        if (!r.ok) console.error("resend:", r.status, await r.text());
      } catch (e) { console.error("resend:", e); }
    }
    return json({ ok: true }, 200, cors);
  }

  // Premium-статус для клиента: показывает кнопку диаграмм только подписчикам.
  if (body.action === "me" || body.action === "diagram" || body.action === "diagram_html" || body.action === "diagram_html_improve") {
    const { data: pro } = await supa.from("pro_users").select("user_id").eq("user_id", user.id).maybeSingle();
    if (body.action === "me") return json({ pro: !!pro }, 200, cors);
    if (!pro) return err("Diagrams are a Premium feature", 403, cors);

    // Один запрос — одна диаграмма: без стрима, без ретраев и без цепочек вызовов.
    const pageText = String(body.text ?? "").slice(0, 4000);
    const title = String(body.title ?? "").slice(0, 200);
    const author = String(body.author ?? "").slice(0, 200);
    const lang = String(body.lang ?? "English").slice(0, 30);
    if (!pageText.trim()) return err("No text", 400, cors);
    const userMsg = `Book: "${title}"${author ? " by " + author : ""}\n<passage>${pageText}</passage>`;
    if (body.action === "diagram_html" || body.action === "diagram_html_improve") {
      // Название книги модели не передаём: стоит его назвать — и оно оказывается в заголовке.
      const userMsgHtml = `<passage>${pageText}</passage>`;
      // Интерактивная версия: один самодостаточный HTML-документ. Клиент запускает его в
      // изолированной рамке (sandbox без allow-same-origin + CSP без сети), поэтому внешних
      // ресурсов в нём быть не должно.
      const sysHtml = `You are a senior front-end designer. Turn the passage from a book into ONE polished, interactive single-file HTML "explorable" for the reader. ` +
        `Build it with inline SVG + CSS + vanilla JavaScript. Choose the views the passage genuinely supports and offer them as tabs (omit the ones it does not support): ` +
        `(1) "Scene" — an SVG stage: places as soft shapes, characters as coloured discs with initials placed where the text puts them, objects as small SVG icons, with a subtle idle animation; ` +
        `(2) "Relations" — a graph: characters as nodes, edges labelled with the action or feeling, hovering a character highlights its connections; ` +
        `(3) "Timeline" — the events on a rail with Play / Step controls that animate progress and highlight the matching quote. ` +
        `Clicking any element opens a detail card (bottom sheet) with: who or what it is, what it does in this passage, and a SHORT verbatim quote (max 15 words, original language). ` +
        `Design: smooth CSS transitions, visible hover/focus states, touch targets of at least 40px, rounded 12px cards, soft shadows. ` +
        `Palette: background #FAF9F5, ink #3D3929, accent #C15F3C plus 3–4 harmonious muted colours for characters; Georgia for headings, system-ui for UI. It must look refined, never like a default form. ` +
        `Layout works from 320px to 900px wide and fills the height (html, body { height: 100% }), no horizontal scroll. ` +
        `NO HEADER BLOCK AT ALL: the document must not contain a title, kicker/eyebrow, subtitle or caption that names the book, the author, the chapter or describes the passage ` +
        `(never anything like "Book title · Evening scene" or "A fragment of a conversation about…") — the reader already knows the book and the page. ` +
        `Start straight with the interactive content itself (the tabs and the visualisation). Labels inside the visualisation (characters, places, events) are fine. ` +
        `Hard rules: output ONLY the complete HTML document starting with <!doctype html> — no markdown fences, no commentary. ` +
        `Fully self-contained: inline <style> and <script>; no external files, fonts, CDNs, images, network requests or localStorage. ` +
        `All visible text in ${lang} (quotes stay in the original language). Use only facts from the passage; never invent. At most about 350 lines. The JavaScript must be free of syntax errors.`;
      // Доработка по отзыву читателя (👎): модель получает текущий код и жалобу и возвращает улучшенный
      // документ целиком. Один запрос, без цепочек.
      const improve = body.action === "diagram_html_improve";
      const currentHtml = improve ? String(body.html ?? "").slice(0, 60000) : "";
      const feedback = improve ? String(body.feedback ?? "").slice(0, 800) : "";
      if (improve && !currentHtml) return err("No interactive code to improve", 400, cors);
      const sysFinal = improve
        ? sysHtml + ` You are given the CURRENT version of the document and the reader's feedback on it. ` +
          `If the current document has a title, kicker, subtitle or any text naming the book or describing the passage, REMOVE it. ` +
          `Return an improved COMPLETE document that fixes what the reader disliked (if the feedback is empty, fix the most obvious weaknesses: ` +
          `emptiness, unreadable text, broken interactions, weak layout). Keep what already works. The same hard rules apply.`
        : sysHtml;
      const inputFinal = improve
        ? `${userMsgHtml}\n<reader_feedback>${feedback || "(no comment — improve the visualisation in general)"}</reader_feedback>\n<current_html>${currentHtml}</current_html>`
        : userMsgHtml;
      const clean = (t: string) => t.trim().replace(/^```(?:html)?\s*/i, "").replace(/```\s*$/, "").trim().slice(0, 80000);

      // Провайдер интерактива: секрет INTERACTIVE_PROVIDER ("anthropic" по умолчанию | "openai" — прежний путь
      // через OpenAI остаётся в коде и включается этим секретом); запрос может переопределить полем provider.
      const provider = ["openai", "anthropic"].includes(String(body.provider))
        ? String(body.provider)
        : (Deno.env.get("INTERACTIVE_PROVIDER") ?? "anthropic");
      if (provider === "anthropic") {
        const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY") ?? "";
        if (!ANTHROPIC_API_KEY) return err("ANTHROPIC_API_KEY secret is not set in Supabase", 500, cors);
        const claudeModel = Deno.env.get("ANTHROPIC_MODEL") ?? "claude-opus-5-5";
        try {
          const { default: Anthropic } = await import("npm:@anthropic-ai/sdk");
          const claude = new Anthropic({ apiKey: ANTHROPIC_API_KEY });
          // Стрим + finalMessage: ответ длинный, обычный запрос упёрся бы в HTTP-таймауты.
          // Мышление у Opus 5.5 всегда включено (параметр thinking не передаём), глубина — через effort.
          // Серверные fallbacks включены по умолчанию (при отказе классификаторов запрос идёт на запасную модель);
          // отключить: секрет ANTHROPIC_FALLBACKS=off.
          const useFallbacks = (Deno.env.get("ANTHROPIC_FALLBACKS") ?? "on") !== "off";
          const stream = claude.beta.messages.stream({
            model: claudeModel,
            max_tokens: 16000,
            output_config: { effort: "medium" },
            system: sysFinal,
            messages: [{ role: "user", content: inputFinal }],
            ...(useFallbacks ? { betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" } : {}),
          });
          const msg = await stream.finalMessage();
          if (msg.stop_reason === "refusal") return err("Claude declined this request (" + (msg.stop_details?.category ?? "refusal") + ")", 502, cors);
          if (msg.stop_reason === "max_tokens") return err("Claude's answer was cut off — try again", 502, cors);
          const html = clean(msg.content.filter((b: { type: string }) => b.type === "text").map((b: { text: string }) => b.text).join(""));
          if (!/<html|<!doctype/i.test(html)) return err("Empty interactive diagram", 502, cors);
          console.log(`[interactive] ${body.action} ok: provider=anthropic model=${msg.model ?? claudeModel} html=${html.length} chars` + (improve ? ` feedback=${JSON.stringify(feedback)} unchanged=${html === currentHtml.trim()}` : ""));
          return json({ html, model: msg.model ?? claudeModel, provider: "anthropic" }, 200, cors);
        } catch (e) {
          const m = e instanceof Error ? e.message : String(e);
          console.error(`[anthropic] ${body.action} FAILED: model=${claudeModel} key=…${ANTHROPIC_API_KEY.slice(-4)} error=${m.slice(0, 500)}`);
          return err(`Interactive diagram failed (Claude ${claudeModel}): ${m.slice(0, 300)}`, 502, cors);
        }
      }
      const htmlModel = Deno.env.get("INTERACTIVE_MODEL") ?? "gpt-5.6-luna";
      // Без тихих откатов на более слабую модель: если id модели неверный или недоступен ключу,
      // клиент увидит настоящую ошибку OpenAI, а не молча получит худший результат.
      const rr = await fetch("https://api.openai.com/v1/responses", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${OPENAI_API_KEY}` },
        body: JSON.stringify({
          model: htmlModel, instructions: sysFinal, input: inputFinal, max_output_tokens: 12000,
          ...(/^(gpt-5|o\d)/.test(htmlModel) ? { reasoning: { effort: "low" } } : {}),
        }),
      });
      if (!rr.ok) {
        const t = (await rr.text()).slice(0, 300);
        console.error(`[openai] diagram_html FAILED: status=${rr.status} model=${htmlModel} key=…${OPENAI_API_KEY.slice(-4)} body=${t}`);
        return err(`Interactive diagram failed (model ${htmlModel}): ${t}`, 502, cors);
      }
      const jr = await rr.json();
      const parts: string[] = [];
      for (const item of jr.output ?? []) {
        if (item.type === "message") for (const c of item.content ?? []) if (c.type === "output_text") parts.push(c.text);
      }
      const html = clean(parts.join(""));
      if (!/<html|<!doctype/i.test(html)) return err("Empty interactive diagram", 502, cors);
      console.log(`[interactive] ${body.action} ok: model=${htmlModel} html=${html.length} chars` + (improve ? ` feedback=${JSON.stringify(feedback)} unchanged=${html === currentHtml.trim()}` : ""));
      return json({ html, model: htmlModel, provider: "openai" }, 200, cors);
    }
    const sys = `You turn a passage from a book into ONE Mermaid diagram that helps the reader visualise it. ` +
      `Pick the form that fits the passage best: the staging of a scene (who stands where, places, objects — flowchart with subgraphs), ` +
      `the interaction between characters (flowchart or sequenceDiagram: who does or says what to whom), or the sequence of events (timeline or sequenceDiagram). ` +
      `Rules: output ONLY valid Mermaid code — no markdown fences, no comments, no explanations. ` +
      `At most 12 nodes. Write every label in ${lang}, always inside double quotes, without HTML, without parentheses or quotes inside labels. ` +
      `Use only what the passage actually says; do not invent facts. Do not use click, link or style directives.`;
    const r = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${OPENAI_API_KEY}` },
      body: JSON.stringify({
        model: TEXT_MODEL, reasoning_effort: "low", max_completion_tokens: 3000,
        messages: [{ role: "system", content: sys }, { role: "user", content: userMsg }],
      }),
    });
    await logOpenAIFailure("diagram", TEXT_MODEL, r);
    if (!r.ok) return err("Diagram generation failed: " + (await r.text()).slice(0, 300), 502, cors);
    const j = await r.json();
    let code = String(j.choices?.[0]?.message?.content ?? "").trim();
    code = code.replace(/^```(?:mermaid)?\s*/i, "").replace(/```\s*$/, "").trim();
    if (!code) return err("Empty diagram", 502, cors);
    return json({ code }, 200, cors);
  }

  // AI-иллюстрации и обложки — вне общей квоты (проверяем до неё).
  // Для книг из каталога (CURATED_BOOK_IDS) — только владелец, результат общий для всех.
  // Для книг, которые читатель добавил сам, — доступно любому вошедшему пользователю.
  if (body.action === "illustrate" || body.action === "illustrate_cover") {
    // Картинки стоят дороже текста — анонимной сессии (см. ниже) их не даём вообще,
    // только настоящий e-mail-аккаунт.
    if (user.is_anonymous) return err("Sign in with email to generate illustrations", 403, cors);
    const isCurated = CURATED_BOOK_IDS.has(String(body.bookId ?? ""));
    if (isCurated) {
      const ILLUSTRATOR_EMAIL = (Deno.env.get("ILLUSTRATOR_EMAIL") ?? "").toLowerCase();
      if (!ILLUSTRATOR_EMAIL || (user.email ?? "").toLowerCase() !== ILLUSTRATOR_EMAIL) {
        return err("Illustrations for the built-in library are curated by the Reymont team only", 403, cors);
      }
    } else {
      // Каждый образ стоит денег (gpt-image-2) — на книги читателя лимит в 3 штуки навсегда.
      // Куратор (владелец, ветка выше) в этот лимит не упирается.
      const { data: quotaRow } = await storageAdmin().from("image_quota")
        .select("count").eq("user_id", user.id).maybeSingle();
      const used = quotaRow?.count ?? 0;
      if (used >= IMAGE_QUOTA_LIMIT) {
        return err(`You’ve used all ${IMAGE_QUOTA_LIMIT} free illustrations`, 402, cors);
      }
    }
    const title = String(body.title ?? "").slice(0, 200);
    const author = String(body.author ?? "").slice(0, 200);

    let prompt: string;
    if (body.action === "illustrate") {
      const text = String(body.text ?? "").slice(0, 2000);
      const para = String(body.para ?? "").slice(0, 3000);
      const chapter = String(body.chapter ?? "").slice(0, 200);
      if (!text) return err("No text", 400, cors);
      console.log("illustrate: chapter=", JSON.stringify(chapter), "| para=", JSON.stringify(para.slice(0, 200)) + "…");
      prompt = `Book illustration for a scene from the novel "${title}"${author ? " by " + author : ""}` +
        `${chapter ? ` (from the chapter/section "${chapter}")` : ""}.\n` +
        `Depicted moment (the reader's highlighted text): "${text}"\n` +
        (para ? `Surrounding passage — a couple of paragraphs before and after the highlighted moment, for accurate scene, character and setting detail:\n"""${para}"""\n` : "") +
        `No text, letters, signatures or watermarks in the image.`;
    } else {
      if (!title) return err("No title", 400, cors);
      const customPrompt = String(body.customPrompt ?? "").slice(0, 500).trim();
      // Без явного промпта одно и то же название/автор каждый раз давали очень похожую
      // картинку — теперь читатель сам описывает сцену, вместо фиксированной формулировки.
      const sceneLine = customPrompt
        ? `Depicted scene: ${customPrompt}\n`
        : `Capture the overall mood, setting and themes of the book in a single evocative scene — the essence, not a specific plot spoiler.\n`;
      prompt = `Book cover illustration for the classic novel "${title}"${author ? " by " + author : ""}.\n` +
        sceneLine +
        `Portrait orientation suited for a book cover.\n` +
        `Render the title "${title}" as elegant, legible typography near the top of the cover` +
        (author ? `, and the author name "${author}" in smaller type near the bottom` : "") +
        `, in a style fitting a fin-de-siècle Polish edition (serif lettering, no modern fonts). ` +
        `No other text, captions or watermarks in the image.`;
    }

    const result = await generateImage(prompt);
    if (result.error) return err(result.error, result.status ?? 500, cors);
    if (!result.b64) return err("No image returned", 502, cors);

    // Счётчик — сразу после успешной генерации, деньги уже потрачены независимо от аплоада ниже.
    if (!isCurated) {
      const { data: quotaRow } = await storageAdmin().from("image_quota")
        .select("count").eq("user_id", user.id).maybeSingle();
      const { error: quotaErr } = await storageAdmin().from("image_quota")
        .upsert({ user_id: user.id, count: (quotaRow?.count ?? 0) + 1, updated_at: new Date().toISOString() });
      if (quotaErr) console.error("image_quota upsert failed:", quotaErr.message);
    }

    const path = body.action === "illustrate"
      ? `${user.id}/notes/${String(body.noteId ?? "unknown").replace(/[^a-zA-Z0-9_-]/g, "")}.png`
      : `${user.id}/covers/${String(body.bookId ?? "unknown").replace(/[^a-zA-Z0-9_-]/g, "")}.png`;
    const upload = await uploadIllustration(path, result.b64);
    if (upload.error) return err(upload.error, 500, cors);

    // Обложка из каталога — сохраняем в общую таблицу, чтобы её видели все читатели,
    // не только тот, кто нажал «сгенерировать».
    if (isCurated && body.action === "illustrate_cover" && upload.url) {
      const { error: covErr } = await storageAdmin().from("curated_covers")
        .upsert({ id: String(body.bookId), url: upload.url, updated_at: new Date().toISOString() });
      if (covErr) console.error("curated_covers upsert failed:", covErr.message);
    }

    return json({ url: upload.url }, 200, cors);
  }

  // Анонимная Supabase-сессия (Authentication → Sign In / Providers → Allow anonymous
  // sign-ins) — ANON_FREE_HIGHLIGHTS бесплатных переводов/поисков без e-mail, дальше sign up.
  // Хайлайт клиент сохраняет ДО этого вызова, поэтому > (не >=) — иначе блокировали бы и
  // последнюю разрешённую попытку.
  if (user.is_anonymous) {
    // .eq("user_id", ...) обязателен: без него запрос считает ВСЕ строки, видимые по
    // RLS — а после публичной read-policy для демо-хайлайтов на страницах каталога это
    // ещё и хайлайты владельца, так что аноним упирался бы в лимит на первой же попытке.
    const { count, error: cntErr } = await supa.from("highlights").select("*", { count: "exact", head: true }).eq("user_id", user.id);
    if (!cntErr && (count ?? 0) > ANON_FREE_HIGHLIGHTS) {
      return err("You've used your free highlights — sign in with email to keep translating", 403, cors);
    }
  } else {
    // Pro-подписчики (оплата через Stripe) без лимита; бесплатный тариф — 10 хайлайтов
    const { data: pro } = await supa.from("pro_users").select("user_id").eq("user_id", user.id).maybeSingle();
    if (!pro) {
      const { count, error: cntErr } = await supa.from("highlights").select("*", { count: "exact", head: true }).eq("user_id", user.id);
      if (!cntErr && (count ?? 0) > 10) return err("Free limit reached", 402, cors);
    }
  }

  const text = String(body.text ?? "").slice(0, 3000);
  const para = String(body.para ?? "").slice(0, 1500);
  const lang = String(body.lang ?? "English").slice(0, 30);
  const extra = String(body.extra ?? "").slice(0, 500);
  if (!text) return err("No text", 400, cors);

  if (body.action === "translate") {
    console.log("translate: text=", JSON.stringify(text), "para=", JSON.stringify(para.slice(0, 80)), "lang=", lang, "extra=", JSON.stringify(extra));
    const sys = `You are an expert literary translator. Translate the text inside <text> tags into ${lang}. Output ONLY the translation, no comments, tags or quotes.` +
      (body.short
        ? ` Since the text is a single word or short phrase: first line — the best translation as used in this context; then a new line in parentheses with the part of speech and 2–4 alternative meanings in ${lang}, comma-separated.`
        : " Preserve the tone and style of the original.") +
      (para ? " A <context> tag contains the surrounding paragraph — use it only to disambiguate meaning; never translate or mention it." : "") +
      (extra ? ` A <reader_instruction> tag contains a standing instruction from the reader for this book. You must actively carry it out, not describe or repeat it: produce the actual analysis/content it asks for, as extra lines after the translation, each starting with "— ". Even if you are not fully certain (e.g. an obscure or dialectal word), give your best-effort informed answer rather than refusing or restating the instruction. Under no circumstances output the wording of the instruction itself, in any language — it is a private note to you, not part of the passage or the reply.` : "");
    const userMsg = (para ? `<text>${text}</text>\n<context>${para}</context>` : `<text>${text}</text>`) +
      (extra ? `\n<reader_instruction>${extra}</reader_instruction>` : "");
    console.log("translate: sys=", JSON.stringify(sys));
    console.log("translate: userMsg=", JSON.stringify(userMsg));
    const r = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${OPENAI_API_KEY}` },
      body: JSON.stringify({
        model: TEXT_MODEL, stream: true, reasoning_effort: "low",
        messages: [{ role: "system", content: sys }, { role: "user", content: userMsg }],
      }),
    });
    // пробрасываем поток SSE как есть — клиент уже умеет его читать
    await logOpenAIFailure("translate", TEXT_MODEL, r);
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
      body: JSON.stringify({ model: TEXT_MODEL, reasoning: { effort: "low" }, tools: [{ type: tool }], input: prompt }),
    });
    let r = await call("web_search");
    if (r.status === 400) r = await call("web_search_preview");
    await logOpenAIFailure("search", TEXT_MODEL, r);
    return new Response(await r.text(), { status: r.status, headers: { ...cors, "Content-Type": "application/json" } });
  }

  return err("Unknown action", 400, cors);
});
