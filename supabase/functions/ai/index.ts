// Reymont AI proxy — Supabase Edge Function
// Держит OPENAI_API_KEY в секрете и обслуживает переводы/веб-поиск
// для вошедших пользователей. Деплой: dashboard → Edge Functions → name "ai".
import { createClient } from "npm:@supabase/supabase-js@2";

const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY") ?? "";
const CORS_ORIGINS = ["https://reymont.app", "https://www.reymont.app", "https://doraby.github.io"];
const ILLUSTRATIONS_BUCKET = "illustrations";
// Держим в синхроне со списком CURATED_BOOKS в index.html.
const CURATED_BOOK_IDS = new Set(["curated-chlopi", "curated-propaganda", "curated-crystallizing"]);
// Бесплатный лимит генераций: иллюстрации, обложки, диаграммы и интерактивы — один общий счётчик
// (таблица image_quota). У Premium (pro_users) лимита нет и счётчик не растёт. Куратор каталога — тоже без лимита.
const IMAGE_QUOTA_LIMIT = 3;
async function getQuotaUsed(userId: string): Promise<number> {
  const { data } = await storageAdmin().from("image_quota").select("count").eq("user_id", userId).maybeSingle();
  return data?.count ?? 0;
}
// Счётчик растёт только после успешной генерации — деньги уже потрачены.
async function bumpQuota(userId: string) {
  const used = await getQuotaUsed(userId);
  const { error } = await storageAdmin().from("image_quota")
    .upsert({ user_id: userId, count: used + 1, updated_at: new Date().toISOString() });
  if (error) console.error("image_quota upsert failed:", error.message);
}
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

// Единый визуальный язык интерактивов — принципы Эдварда Тафти. Меняется только здесь.
const TUFTE_STYLE =
  `VISUAL STYLE — follow Edward Tufte's principles strictly; the result should look like a page from "The Visual Display of Quantitative Information" or "Envisioning Information", not like an app UI. ` +
  `(1) Maximise the data-ink ratio: every drop of ink must carry information about the passage. Erase everything else — no cards, panels, boxes around content, badges, pills, gradients, drop shadows, glows, rounded "chip" buttons, background textures, icons for decoration, emoji. ` +
  `(2) No chartjunk: no 3D, no heavy gridlines, no thick borders, no ornamental frames. Structure is made with whitespace, alignment and thin hairlines (0.5–1px, ink at 30–50% opacity), never with filled boxes. ` +
  `(3) Paper and ink: background #FFFFF8 (warm off-white paper), text and lines #111 / #333, secondary text #6b6b6b. ONE restrained accent colour (deep red #a00000 or a muted ochre/indigo that fits the mood) used sparingly, only to mark what the reader must notice — the selected element, the current step. Other distinctions use grey values, line weight, italic, small caps — not extra hues. Never more than 3 colours besides ink and grey. ` +
  `(4) Typography carries the design: a serif book face — font-family: et-book, Palatino, "Palatino Linotype", "Book Antiqua", Georgia, serif — for ALL text including controls; body 15–17px, line-height 1.4–1.5; labels in small italic or small caps (font-variant: small-caps; letter-spacing: .04em); old-style numerals (font-variant-numeric: oldstyle-nums). No bold blocks of text, no all-caps headings, no sans-serif UI font. ` +
  `(5) Label directly: put names right next to the lines, points and figures they describe instead of legends, keys or tooltips-only information. Use sidenotes in the margin for commentary and verbatim quotes (italic, smaller, grey), like Tufte's margin notes. ` +
  `(6) Small multiples and layering: when comparing states, moments or points of view, show them side by side at the same scale rather than hiding them behind tabs; separate layers by value (light grey context, dark ink foreground). Show the data at several levels of detail at once — the overview and the fine structure. ` +
  `(7) Integrate words, images and numbers: annotations sit inside the graphic, next to what they explain; text and picture are one composition. Prefer high information density: many small precise marks over a few big decorative ones. ` +
  `(8) Interaction is quiet: controls look like text — an underlined or small-caps word, a thin-ruled slider, a ‹ › step marker; hover/focus/active states shown by the accent colour or an underline, never by bouncing, scaling, shadows or glowing. Transitions short (≤200ms) and only where they show a change of state. Touch targets still at least 40px (use padding, not visible boxes). ` +
  `(9) Generous margins and a calm grid: content column about 60–65% wide with a margin column for notes on wide screens; on narrow screens notes drop under the item they belong to. ` +
  `Before finishing, review the result as Tufte would: remove any element that could be erased without loss of information, and check that every colour, line and word earns its place. `;

// Стили иллюстраций (выбирает читатель). Без имён художников — только описание манеры.
const ILLUS_STYLES: Record<string, string> = {
  infographic:
    `a clean, minimal explanatory infographic in the tradition of classic statistical-graphics books: warm off-white paper background, ` +
    `fine black hairlines of even weight, at most one restrained accent colour (deep red), flat shapes, no gradients, no shadows, no 3D, no ornament. ` +
    `Reduce the scene to a precise diagram-like drawing — a floor plan, map, cross-section, timeline strip or figure layout — that shows who and what is where and how they relate. ` +
    `Maximum information, minimum ink, lots of calm white space; wordless, without labels.`,
  artnouveau:
    `the style of a decorative Art Nouveau / early Art Deco poster and book illustration: elegant flowing contour lines, ` +
    `flat areas of soft muted colour (sage green, ochre, dusty rose, pale gold), stylised natural ornament — flowers, vines, ` +
    `a halo-like circular motif framing the main figure — graceful idealised figures with long flowing hair and drapery, ` +
    `a decorative border, and the slightly grainy raster texture of a colour lithograph print.`,
  painting:
    `the style of a 19th-century academic realist oil painting from the Eastern European landscape school: ` +
    `meticulously observed nature — tall pine and oak forests, fields, rivers, sunlight filtering through trees, precise botanical detail — ` +
    `calm naturalistic daylight, subdued earthy greens, browns and greys, fine visible brushwork on canvas, museum-quality realism; ` +
    `people painted with the same sober naturalism and integrated into the landscape.`,
  print:
    `a black-and-white printmaking style — linocut or stone lithograph: pure black ink on off-white paper, bold carved shapes and gouge marks, ` +
    `strong contrast, hatching and cross-hatching for tone, slightly uneven hand-printed texture; no colour and no smooth digital gradients.`,
};

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

  // Premium-статус и счётчик бесплатных генераций для клиента; диаграммы/интерактив — в общем лимите.
  if (body.action === "me" || body.action === "diagram" || body.action === "diagram_html" || body.action === "diagram_html_improve") {
    const { data: pro } = await supa.from("pro_users").select("user_id").eq("user_id", user.id).maybeSingle();
    const used = await getQuotaUsed(user.id);
    if (body.action === "me") return json({ pro: !!pro, used, limit: IMAGE_QUOTA_LIMIT }, 200, cors);
    if (!pro) {
      if (user.is_anonymous) return err("Sign in with email to generate diagrams", 403, cors);
      if (used >= IMAGE_QUOTA_LIMIT) return err(`You’ve used all ${IMAGE_QUOTA_LIMIT} free generations`, 402, cors);
    }
    const countIt = async () => { if (!pro) await bumpQuota(user.id); };

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
      const sysHtml = `You are a creative front-end designer and interactive storyteller. Turn the passage from a book into ONE self-contained, single-file HTML experience that makes THIS particular passage come alive for the reader — something they could not get from just reading the text. ` +
        `Find the single most illuminating idea for this specific passage and execute it with craft. Examples of the kind of thing you might invent (do NOT default to any of them; each passage deserves its own idea): ` +
        `a floor plan or map of the place where you can move the characters around; an animated stage where the dialogue plays out line by line; a "who stands where" tableau at the key moment; ` +
        `a mood or atmosphere scene (light, weather, time of day, sound words) the reader can tweak; a physical object or document shown close up with hotspots; ` +
        `a cause-and-effect chain the reader can trigger step by step; a word-by-word reveal of a loaded phrase or dialect with its meaning; a tiny game or puzzle built from what happens; ` +
        `a clock/calendar/route showing how time or movement unfolds; a comparison of two points of view; or something entirely different that fits. ` +
        `Do NOT build a character-relationship graph (nodes and edges between people) — the app already has a separate diagram for relations and events. ` +
        `Do NOT default to a set of tabs; use tabs or multiple views only when the idea genuinely needs them. One strong, focused idea beats many generic views. Surprise the reader. ` +
        `It must be genuinely interactive (hover, click, drag, play/step, sliders — whatever suits the idea) and reward exploration; where it helps, reveal a short verbatim quote from the passage (max 15 words, original language) or a one-line explanation. ` +
        `Build it with inline SVG + CSS + vanilla JavaScript. ` + TUFTE_STYLE +
        `Layout works from 320px to 900px wide and fills the height (html, body { height: 100% }), no horizontal scroll. ` +
        `NO HEADER BLOCK AT ALL: the document must not contain a title, kicker/eyebrow, subtitle or caption that names the book, the author, the chapter or describes the passage ` +
        `(never anything like "Book title · Evening scene" or "A fragment of a conversation about…") — the reader already knows the book and the page. ` +
        `Start straight with the interactive content itself. Labels inside the experience (characters, places, objects, events) are fine. ` +
        `Hard rules: output ONLY the complete HTML document starting with <!doctype html> — no markdown fences, no commentary. ` +
        `Fully self-contained: inline <style> and <script>; no external files, fonts, CDNs, images, network requests or localStorage. ` +
        `LANGUAGE: write the content (labels of characters, places, objects, events, phrases, quotes) in the ORIGINAL language of the passage, ` +
        `and give each phrase its translation into ${lang} right next to it as a gloss — smaller, italic, grey (#6b6b6b), directly under or beside the original, never only in a tooltip. ` +
        `Proper names stay as in the original without a gloss. Interface words (buttons, hints, step controls) are in ${lang}. ` +
        `If the passage is already in ${lang}, write everything once in ${lang} with no glosses. Use only facts from the passage; never invent events or details. At most about 400 lines. The JavaScript must be free of syntax errors and work without any setup.`;
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
          `emptiness, unreadable text, broken interactions, weak layout). Also bring the whole document in line with the VISUAL STYLE above — strip shadows, cards, gradients, sans-serif UI and extra colours. Keep what already works. The same hard rules apply.`
        : sysHtml;
      const inputFinal = improve
        ? `${userMsgHtml}\n<reader_feedback>${feedback || "(no comment — improve the visualisation in general)"}</reader_feedback>\n<current_html>${currentHtml}</current_html>`
        : userMsgHtml;
      const clean = (t: string) => t.trim().replace(/^```(?:html)?\s*/i, "").replace(/```\s*$/, "").trim().slice(0, 80000);

      // Провайдер интерактива: секрет INTERACTIVE_PROVIDER ("anthropic" по умолчанию | "openai" — прежний путь
      // через OpenAI остаётся в коде и включается этим секретом); запрос может переопределить полем provider.
      // Значение секрета читаем терпимо (регистр, пробелы): всё, что не "openai", — это Claude.
      const provider = ["openai", "anthropic"].includes(String(body.provider))
        ? String(body.provider)
        : ((Deno.env.get("INTERACTIVE_PROVIDER") ?? "").trim().toLowerCase() === "openai" ? "openai" : "anthropic");
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
          await countIt();
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
      await countIt();
      return json({ html, model: htmlModel, provider: "openai" }, 200, cors);
    }
    const sys = `You turn a passage from a book into ONE Mermaid diagram that helps the reader visualise it. ` +
      `Pick the form that fits the passage best: the staging of a scene (who stands where, places, objects — flowchart with subgraphs), ` +
      `the interaction between characters (flowchart or sequenceDiagram: who does or says what to whom), or the sequence of events (timeline or sequenceDiagram). ` +
      `Rules: output ONLY valid Mermaid code — no markdown fences, no comments, no explanations. ` +
      `In a sequenceDiagram every message arrow must be followed by a colon and NON-EMPTY text (never "A->>B:" with nothing after it); no semicolons. ` +
      `Keep it small and READABLE. Show only the 3 to 5 most important characters (never more than 5): declare each participant EXACTLY ONCE, with a short but distinct name (a first name, never a single letter), ` +
      `and declare ONLY participants that send or receive at least one message — no empty lifelines, no duplicates, no placeholder or minor characters. ` +
      `Retell the passage as a brief summary: at most 10 messages, each a short phrase of up to 6 words (plus its translation) in your own words (do NOT quote long lines verbatim); skip repeated or trivial exchanges. ` +
      `At most 12 nodes. LANGUAGE: write every label and message in the ORIGINAL language of the passage, followed by its translation into ${lang} after " · " ` +
      `(e.g. "Original phrase · translated phrase"); names of characters and places stay in the original without translation; if the passage is already in ${lang}, write each label once. ` +
      `Every label always inside double quotes, without HTML, without parentheses or quotes inside labels. ` +
      `Use only what the passage actually says; do not invent facts. Do not use click, link or style directives. ` +
      `Follow Edward Tufte's principles: every node and arrow must carry information — no decorative nodes, no labels that repeat what the structure already shows, ` +
      `no generic words like "Start", "End", "Scene" or "Event"; prefer specific, concrete labels (names, places, objects, quoted key words).`;
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
    await countIt();
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
    }
    // Каждый образ стоит денег (gpt-image-2) — бесплатным 3 генерации на всё вместе, Premium без лимита.
    const { data: proRow } = await supa.from("pro_users").select("user_id").eq("user_id", user.id).maybeSingle();
    const countsToQuota = !isCurated && !proRow;
    if (countsToQuota && (await getQuotaUsed(user.id)) >= IMAGE_QUOTA_LIMIT) {
      return err(`You’ve used all ${IMAGE_QUOTA_LIMIT} free generations`, 402, cors);
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
      prompt = `Illustration for a scene from the novel "${title}"${author ? " by " + author : ""}` +
        `${chapter ? ` (from the chapter/section "${chapter}")` : ""}.\n` +
        `Depicted moment (the reader's highlighted text): "${text}"\n` +
        (para ? `Surrounding passage — a couple of paragraphs before and after the highlighted moment, for accurate scene, character and setting detail:\n"""${para}"""\n` : "") +
        `No text, letters, signatures or watermarks in the image. ` +
        `Use ${ILLUS_STYLES[String(body.style)] ?? ILLUS_STYLES.artnouveau}`;
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
    if (countsToQuota) await bumpQuota(user.id);

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

  // Продолжение разговора о хайлайте (чат). Контекст целиком собирается здесь: книга, выделение, окружающий
  // текст, уже данный перевод, постоянная инструкция читателя и вся (обрезанная по размеру) переписка —
  // иначе ответы получаются «обезвреженными» и не помнят, о чём шла речь. Анонимным не даём (дорого).
  if (body.action === "chat") {
    if (user.is_anonymous) return err("Sign in with email to continue the conversation", 403, cors);
    const title = String(body.title ?? "").slice(0, 200);
    const author = String(body.author ?? "").slice(0, 200);
    const chapter = String(body.chapter ?? "").slice(0, 200);
    const wide = String(body.wide ?? "").slice(0, 5000);
    const translation = String(body.translation ?? "").slice(0, 3000);
    const msgs = (Array.isArray(body.messages) ? body.messages : []).slice(-24)
      .map((m: { role?: string; content?: unknown }) => ({ role: m?.role === "assistant" ? "assistant" : "user", content: String(m?.content ?? "").slice(0, 4000) }))
      .filter((m: { content: string }) => m.content.trim());
    if (!msgs.length || msgs[msgs.length - 1].role !== "user") return err("No question", 400, cors);
    const sysChat = `You are a learned, candid literary companion discussing a passage from the book "${title}"${author ? " by " + author : ""}${chapter ? " (chapter: " + chapter + ")" : ""} with a reader who is reading it right now. ` +
      `Reply in ${lang}. You have the full picture below — use it instead of asking the reader to repeat anything. ` +
      `Be substantive and specific: explain meaning, nuance, tone, dialect and archaisms, etymology, historical, social and cultural background, allusions, character motives and what the author is doing stylistically; ` +
      `compare alternative translations when relevant; quote short snippets of the original when it helps. ` +
      `No generic filler, no flattery, no restating the question, no refusing to engage with the text. If you are not sure about a fact, say so plainly rather than inventing it. ` +
      `Keep answers focused (usually one to three short paragraphs) unless the reader asks for depth. Stay consistent with what was already said earlier in this conversation.` +
      (extra ? `\nStanding instruction from the reader for this book (apply it when relevant, never quote it): ${extra}` : "") +
      `\n\n<highlight>${text}</highlight>` +
      (para ? `\n<paragraph>${para}</paragraph>` : "") +
      (wide ? `\n<wider_context>${wide}</wider_context>` : "") +
      (translation ? `\n<translation_already_given>${translation}</translation_already_given>` : "");
    const chatModel = Deno.env.get("CHAT_MODEL") ?? Deno.env.get("INTERACTIVE_MODEL") ?? TEXT_MODEL;
    const rc = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${OPENAI_API_KEY}` },
      body: JSON.stringify({
        model: chatModel, stream: true, reasoning_effort: Deno.env.get("CHAT_EFFORT") ?? "low",
        messages: [{ role: "system", content: sysChat }, ...msgs],
      }),
    });
    await logOpenAIFailure("chat", chatModel, rc);
    return new Response(rc.body, { status: rc.status, headers: { ...cors, "Content-Type": "text/event-stream" } });
  }

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

  return err("Unknown action", 400, cors);
});
