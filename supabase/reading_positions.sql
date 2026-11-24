-- Позиция чтения по КАЖДОЙ книге (одна строка на пару пользователь + книга).
-- Заменяет reading_state (там была одна строка на пользователя — только последняя книга).
-- Источник правды для вошедших читателей; localStorage для них больше не используется.
create table if not exists public.reading_positions (
  user_id  uuid   not null references auth.users(id) on delete cascade,
  book_id  text   not null,
  cfi      text   not null,
  progress real,              -- 0..1, доля книги; null — ещё не посчитана
  updated  bigint not null,   -- мс, Date.now() на устройстве
  primary key (user_id, book_id)
);

alter table public.reading_positions enable row level security;
drop policy if exists "own reading_positions" on public.reading_positions;
create policy "own reading_positions" on public.reading_positions
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
grant select, insert, update, delete on public.reading_positions to authenticated;

-- Переносим то, что уже было: последнюю книгу из старой таблицы.
insert into public.reading_positions (user_id, book_id, cfi, updated)
  select user_id, book_id, cfi, updated from public.reading_state
  on conflict (user_id, book_id) do nothing;
