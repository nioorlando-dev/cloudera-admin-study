-- Jalankan sekali di Supabase: Dashboard > SQL Editor > New query > paste > Run.
-- Progres belajar tiap user privat: Row Level Security hanya mengizinkan
-- user membaca/menulis/menghapus barisnya sendiri.

create table if not exists public.answers (
  id          bigint generated always as identity primary key,
  user_id     uuid not null default auth.uid() references auth.users(id) on delete cascade,
  question_id int  not null,
  is_correct  boolean not null,
  created_at  timestamptz not null default now()
);

create table if not exists public.sessions (
  id           bigint generated always as identity primary key,
  user_id      uuid not null default auth.uid() references auth.users(id) on delete cascade,
  mode         text not null,
  checked      int  not null,
  graded       int  not null,
  correct      int  not null,
  duration_sec int  not null default 0,
  created_at   timestamptz not null default now()
);

create index if not exists answers_user_idx  on public.answers  (user_id, created_at desc);
create index if not exists sessions_user_idx on public.sessions (user_id, created_at desc);

alter table public.answers  enable row level security;
alter table public.sessions enable row level security;

drop policy if exists "answers own select"  on public.answers;
drop policy if exists "answers own insert"  on public.answers;
drop policy if exists "answers own delete"  on public.answers;
drop policy if exists "sessions own select" on public.sessions;
drop policy if exists "sessions own insert" on public.sessions;
drop policy if exists "sessions own delete" on public.sessions;

create policy "answers own select"  on public.answers  for select using (auth.uid() = user_id);
create policy "answers own insert"  on public.answers  for insert with check (auth.uid() = user_id);
create policy "answers own delete"  on public.answers  for delete using (auth.uid() = user_id);

create policy "sessions own select" on public.sessions for select using (auth.uid() = user_id);
create policy "sessions own insert" on public.sessions for insert with check (auth.uid() = user_id);
create policy "sessions own delete" on public.sessions for delete using (auth.uid() = user_id);

-- ============================================================
-- ADMIN: kelola user (reset password). Dijaga di sisi database.
-- Admin tidak bisa melihat progres/skor siapa pun lewat fungsi ini.
-- ============================================================
create table if not exists public.admins (
  user_id uuid primary key references auth.users(id) on delete cascade
);
alter table public.admins enable row level security;  -- tanpa policy: tidak bisa diakses dari client

create or replace function public.is_admin() returns boolean
language sql security definer stable set search_path = public as $$
  select exists (select 1 from public.admins where user_id = auth.uid());
$$;

create or replace function public.admin_list_users()
returns table (username text, created_at timestamptz, last_sign_in_at timestamptz)
language plpgsql security definer set search_path = public, auth as $$
begin
  if not public.is_admin() then raise exception 'not authorized'; end if;
  return query
    select split_part(u.email, '@', 1), u.created_at, u.last_sign_in_at
    from auth.users u order by u.created_at;
end $$;

create or replace function public.admin_reset_password(p_username text, p_new_password text)
returns void
language plpgsql security definer set search_path = public, auth, extensions as $$
begin
  if not public.is_admin() then raise exception 'not authorized'; end if;
  if length(p_new_password) < 8 then raise exception 'password too short'; end if;
  update auth.users
     set encrypted_password = crypt(p_new_password, gen_salt('bf')), updated_at = now()
   where email = lower(p_username) || '@study-app.example.com';
  if not found then raise exception 'user not found'; end if;
end $$;

revoke all on function public.is_admin() from public, anon;
revoke all on function public.admin_list_users() from public, anon;
revoke all on function public.admin_reset_password(text, text) from public, anon;
grant execute on function public.is_admin() to authenticated;
grant execute on function public.admin_list_users() to authenticated;
grant execute on function public.admin_reset_password(text, text) to authenticated;

-- LANGKAH TERAKHIR (jalankan SETELAH kamu mendaftar di app dengan username admin-mu):
--   insert into public.admins (user_id)
--   select id from auth.users where email = 'USERNAME_KAMU@study-app.example.com';
