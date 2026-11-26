# Reymont — заметки для Claude

- Интерактивы (`diagram_html`): жёсткого стиля нет — в промпте `sysHtml` (`supabase/functions/ai/index.ts`) только
  направление «минималистичный, чистый, современный интерфейс». Тафти для них не применяется.
- Любые диаграммы Mermaid, графики и SVG вне интерактивов (и промпты, которые их генерируют) делаются
  в стиле Эдварда Тафти. Перед такой работой загрузи скилл `tufte-design`
  (`.claude/skills/tufte-design/SKILL.md`).
- Отступы оболочки — токены в `:root` (`index.html`): шкала `--space-1…8` (4, 8, 12, 16, 24, 32, 48, 64px)
  и смысловые токены страницы (`--page-measure`, `--page-gutter`, `--page-top`, `--page-bottom`, `--page-col-gap`,
  `--folio-bottom`, `--sheet-bleed`), библиотеки (`--lib-pad-*`, `--shelf-gap-*`), правой панели (`--panel-pad-x`,
  `--panel-pad-bottom`, `--panel-section-gap`) и модалок (`--modal-pad-*`, `--modal-edge`, `--field-gap`).
  Новые отступы раскладки задавай через них, а не числами (1–3px для бордеров и мелких сдвигов — можно числом);
  мобильные значения переопределяются в `@media (max-width: 900px)`.
