# Reymont — заметки для Claude

- Интерактивы (`diagram_html`) делаются по собственной дизайн-спецификации — она встроена в промпт
  `sysHtml` в `supabase/functions/ai/index.ts` (тёмно-зелёный/молочная палитра, Instrument Serif + DM Sans/Mono).
  Тафти для них больше НЕ применяется.
- Любые диаграммы Mermaid, графики и SVG вне интерактивов (и промпты, которые их генерируют) делаются
  в стиле Эдварда Тафти. Перед такой работой загрузи скилл `tufte-design`
  (`.claude/skills/tufte-design/SKILL.md`).
