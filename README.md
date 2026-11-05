# Cloudera Administrator Study v4

Situs latihan soal ujian Cloudera Administrator. Statis (HTML/CSS/JS) + Supabase untuk login dan progres per akun.

- **Setup login & hosting:** lihat [SETUP.md](SETUP.md)
- **Bank soal:** `data/question-bank.js` (85 soal (semua kuncinya terbukti dari jawaban skor=1; 17 soal yang semua jawabannya bernilai 0 dikeluarkan))
- **Audit validasi:** `data/validation-audit.json`
- **Versi lama (v3, satu file):** `_backup/`

Tanpa konfigurasi Supabase, app jalan di mode lokal (tanpa login).

## Struktur
```
index.html            kerangka halaman
css/style.css         tema terang/gelap, responsif
js/config.js          URL + anon key Supabase
js/store.js           lapisan data (Supabase atau localStorage)
js/app.js             UI, sesi latihan, auth
data/question-bank.js bank soal
supabase/schema.sql   tabel + Row Level Security
```
