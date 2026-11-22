-- Утреннее письмо «следующая серия» (функция daily-episode).
-- next_ep клиент пишет вместе с местом чтения: начало следующей непрочитанной серии
-- ({book_id, title, author, n, total, season, seasons, season_title, e, of, min, cfi, teaser, excerpt, lang};
-- ai_teaser дописывает функция — AI-тизер «в следующей серии», чтобы не генерировать его повторно).
alter table public.reading_state
  add column if not exists next_ep jsonb,
  add column if not exists email_daily boolean not null default false,
  add column if not exists last_emailed bigint;

-- Расписание: каждый день в 07:07 UTC. Нужны расширения pg_cron и pg_net (Database → Extensions).
-- <CRON_SECRET> — тот же, что в секретах функции.
create extension if not exists pg_cron;
create extension if not exists pg_net;
select cron.unschedule('daily-episode') where exists (select 1 from cron.job where jobname = 'daily-episode');
select cron.schedule('daily-episode', '7 7 * * *', $$
  select net.http_post(
    url := 'https://onetabmtufauhulgjaxv.supabase.co/functions/v1/daily-episode',
    headers := jsonb_build_object('Authorization', 'Bearer <CRON_SECRET>', 'Content-Type', 'application/json'),
    body := '{}'::jsonb);
$$);
