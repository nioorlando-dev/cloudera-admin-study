-- ============================================================
-- BANK SOAL DI DATABASE + PERSETUJUAN AKUN (jalankan SETELAH schema.sql)
-- Tujuan: soal dan kunci jawaban TIDAK ada di berkas situs; hanya bisa dibaca akun yang disetujui admin.
-- Pendaftaran di app terbuka, jadi "sudah login" saja tidak cukup: akun baru berstatus belum disetujui.
-- Aman dijalankan ulang (idempoten).
-- ============================================================

create table if not exists public.members (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  approved   boolean not null default false,
  created_at timestamptz not null default now()
);
alter table public.members enable row level security;
drop policy if exists "members own select" on public.members;
create policy "members own select" on public.members for select using (auth.uid() = user_id);
-- tanpa policy insert/update/delete: client tidak bisa menyetujui dirinya sendiri

-- akun yang SUDAH ada saat skrip ini pertama dijalankan dianggap disetujui (migrasi)
insert into public.members (user_id, approved)
select id, true from auth.users
on conflict (user_id) do nothing;

-- akun baru otomatis tercatat BELUM disetujui
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.members (user_id, approved) values (new.id, false) on conflict (user_id) do nothing;
  return new;
end $$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

create or replace function public.is_approved() returns boolean
language sql security definer stable set search_path = public as $$
  select coalesce((select approved from public.members where user_id = auth.uid()), false)
      or public.is_admin();
$$;
revoke all on function public.is_approved() from public, anon;
grant execute on function public.is_approved() to authenticated;

-- bank soal: satu baris per soal (data = objek soal dalam jsonb)
create table if not exists public.questions (
  id   int primary key,
  data jsonb not null
);
alter table public.questions enable row level security;
drop policy if exists "questions approved select" on public.questions;
create policy "questions approved select" on public.questions
  for select to authenticated using (public.is_approved());
-- tanpa policy insert/update/delete: isi tabel hanya lewat SQL Editor (seed_questions.sql)

-- admin: daftar user + status persetujuan, dan tombol setujui/cabut
drop function if exists public.admin_list_users();
create function public.admin_list_users()
returns table (username text, created_at timestamptz, last_sign_in_at timestamptz, approved boolean)
language plpgsql security definer set search_path = public, auth as $$
begin
  if not public.is_admin() then raise exception 'not authorized'; end if;
  return query
    select split_part(u.email, '@', 1), u.created_at, u.last_sign_in_at,
           coalesce(m.approved, false) or exists (select 1 from public.admins a where a.user_id = u.id)
    from auth.users u left join public.members m on m.user_id = u.id
    order by u.created_at;
end $$;

create or replace function public.admin_set_approved(p_username text, p_approved boolean)
returns void
language plpgsql security definer set search_path = public, auth as $$
declare uid uuid;
begin
  if not public.is_admin() then raise exception 'not authorized'; end if;
  select id into uid from auth.users where email = lower(p_username) || '@study-app.example.com';
  if uid is null then raise exception 'user not found'; end if;
  insert into public.members (user_id, approved) values (uid, p_approved)
  on conflict (user_id) do update set approved = excluded.approved;
end $$;

revoke all on function public.admin_list_users() from public, anon;
revoke all on function public.admin_set_approved(text, boolean) from public, anon;
grant execute on function public.admin_list_users() to authenticated;
grant execute on function public.admin_set_approved(text, boolean) to authenticated;
