-- Переписка с ИИ внутри хайлайта (массив сообщений {role, content, t}).
-- Без этой колонки чат работает, но хранится только на устройстве, а не в облаке.
alter table public.highlights add column if not exists chat jsonb;
