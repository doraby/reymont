-- Интерактивные виды страниц (Premium) — чтобы они были на всех устройствах.
-- Без этой таблицы интерактивы остаются только на устройстве, где их создали.
create table if not exists public.interactives (
  user_id uuid not null references auth.users(id) on delete cascade,
  book_id text not null,
  cfi text not null,
  html text not null,
  page_text text,
  updated bigint not null,
  primary key (user_id, book_id, cfi)
);

alter table public.interactives enable row level security;

drop policy if exists "own interactives" on public.interactives;
create policy "own interactives" on public.interactives
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
