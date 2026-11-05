# Setup: login + hosting gratis

Arsitektur: situs statis di **GitHub Pages** + **Supabase** (gratis) untuk login dan progres per akun.
Tanpa langkah Supabase, app tetap jalan di "mode lokal" (tanpa login, progres di browser).

## 1. Buat project Supabase (±5 menit)
1. Daftar di https://supabase.com, lalu **New project** (region terdekat, misalnya Singapore).
2. **SQL Editor > New query**, paste isi `supabase/schema.sql`, klik **Run**.
   Ini membuat tabel `answers` dan `sessions` dengan Row Level Security: tiap user hanya bisa
   membaca dan menulis datanya sendiri.
3. **Project Settings > API**: salin **Project URL** dan **anon public key**, lalu isi di `js/config.js`.
   (Anon key memang publik. Jangan pernah memakai `service_role` key.)
4. **Authentication > Providers > Email**: pastikan aktif, dan **matikan "Confirm email"**.
   Login memakai username + password. Di balik layar username diubah menjadi email palsu
   (`username@study-app.example.com`), jadi tidak ada email yang dikirim dan konfirmasi email
   harus mati supaya akun langsung aktif.
5. (Opsional) **Authentication > Rate Limits**: naikkan batas sign-up kalau tim mendaftar bersamaan.

## Admin (kamu): reset password user
Lupa password dilayani oleh kamu sebagai admin, lewat menu di app.
1. Daftar dulu di app dengan username admin-mu.
2. Di Supabase **SQL Editor**, jalankan baris terakhir `schema.sql` (ganti username):
   ```sql
   insert into public.admins (user_id)
   select id from auth.users where email = 'USERNAME_KAMU@study-app.example.com';
   ```
3. Login ulang. Di menu pojok kanan atas muncul **Admin: kelola user**: daftar akun + tombol
   **Reset password**. Kamu isi password sementara, sampaikan ke user, lalu user menggantinya
   sendiri lewat **Ganti password**.

Keamanan: fungsi admin dicek di database (`is_admin()`), bukan di tampilan, jadi user biasa tidak bisa
memanggilnya walau mengakali browser. Panel admin hanya menampilkan username dan waktu login, bukan skor
atau progres siapa pun.

## 1b. Bank soal di database + persetujuan akun (WAJIB, jalankan sekali)
Soal dan kunci jawaban TIDAK ada di repo/situs. Mereka disimpan di tabel Supabase `questions` yang hanya bisa dibaca akun yang
disetujui admin (pendaftaran di app terbuka, jadi login saja tidak cukup). Di **SQL Editor**, jalankan berurutan:
1. `supabase/schema.sql` (kalau belum), lalu `supabase/questions.sql` (tabel `members`, `questions`, aturan akses, fungsi admin).
   Akun yang sudah ada otomatis disetujui; akun baru berstatus *Menunggu* sampai admin menyetujui di menu **Admin: kelola user**.
2. Buat berkas seed dari komputer yang punya `data/question-bank.js`: `node tools/make_seed_sql.js`, lalu paste isi
   `supabase/seed_questions.sql` ke SQL Editor dan **Run** (berkas ini sengaja tidak ikut ke GitHub).
3. Pastikan akun admin-mu sudah ada di tabel `admins` (lihat bagian Admin di bawah). Admin selalu bisa membaca soal.

## 2. Hosting di GitHub Pages
Repo hanya berisi kode (tanpa soal dan kunci), jadi aman dibuat public (GitHub Pages versi gratis butuh repo public).
Catatan: `js/config.js` memuat URL dan anon key Supabase; itu memang publik (diamankan Row Level Security), jangan pernah memasukkan service_role key.
1. Repo dibuat dengan `gh repo create ... --source=. --push` (`.gitignore` mengecualikan `data/`, `_backup/`, `*.zip`, dan seed).
2. **Settings > Pages > Build and deployment**: Source = *Deploy from a branch*, branch `main`, folder `/ (root)`.
3. Tunggu ±1 menit. Link muncul di halaman Pages. Bagikan ke tim.

## Privasi
- Dari dalam app, tidak ada yang bisa melihat progres orang lain, dan tidak ada leaderboard.
- Pemilik project Supabase (kamu) secara teknis bisa membuka tabel lewat dashboard Supabase.
  Kalau mau menjanjikan privasi penuh ke tim, sampaikan itu dengan jujur.
- Password disimpan oleh Supabase Auth (di-hash), bukan di kode ini.

## Mengedit soal
Bank soal ada di `data/question-bank.js` (`window.BANK`). Field penting: `question`, `options`, `correct`,
`type` (`Multiple Choice` / `Multiple Response`), `choose`, `gradable`, `status`, `explanation`, `reference`.
`data/question-bank-v3.json` adalah salinan lama; sumber yang dipakai app adalah `question-bank.js`.

## Jalankan lokal
```
python3 -m http.server 8000   # lalu buka http://localhost:8000
```
(Membuka `index.html` langsung via file:// juga bisa untuk mode lokal, tapi login Supabase butuh http.)
