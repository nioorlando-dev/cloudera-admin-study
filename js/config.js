// Isi dua nilai ini setelah membuat project Supabase (lihat SETUP.md).
// Anon key MEMANG publik (aman ditaruh di repo) karena akses data dijaga oleh
// Row Level Security di supabase/schema.sql. JANGAN pernah memasukkan service_role key.
//
// Dibiarkan kosong = app jalan "mode lokal" (tanpa login, progres di browser saja).
window.APP_CONFIG = {
  SUPABASE_URL: "https://woitzcrljbtgcffeuuhd.supabase.co",
  SUPABASE_ANON_KEY: "sb_publishable_diw2ICstE0sUgdaTe6HRsg_JLjz77p4"
};
