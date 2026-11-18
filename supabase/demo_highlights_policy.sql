-- Демо-хайлайты на книгах каталога (book_id 'curated-*'), оставленные аккаунтом владельца,
-- читаются всеми — и незалогиненными (роль anon), и анонимными/обычными сессиями.
-- Клиент (loadDemoHighlights в index.html) выбирает highlights по book_id и помечает
-- чужие строки как demo: «Preview», без чата и удаления.
--
-- Чтобы показать хайлайты другого аккаунта, поменяйте e-mail ниже и выполните файл заново.

create or replace function public.demo_highlights_owner()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select id from auth.users where lower(email) = 'doraby1@gmail.com' limit 1
$$;

revoke all on function public.demo_highlights_owner() from public;
grant execute on function public.demo_highlights_owner() to anon, authenticated;

drop policy if exists "demo highlights are public" on public.highlights;
create policy "demo highlights are public" on public.highlights
  for select to anon, authenticated
  using (book_id like 'curated-%' and user_id = public.demo_highlights_owner());
