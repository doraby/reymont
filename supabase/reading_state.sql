-- Последняя читаемая книга и страница (одна строка на пользователя).
create table if not exists public.reading_state (
  user_id uuid primary key references auth.users(id) on delete cascade,
  book_id text not null,
  cfi text not null,
  updated bigint not null
);

alter table public.reading_state enable row level security;

create policy "own reading_state" on public.reading_state
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
