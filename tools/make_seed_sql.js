#!/usr/bin/env node
/* Membuat supabase/seed_questions.sql dari data/question-bank.js (sumber lokal yang dipakai app; berkas ini dan hasilnya TIDAK ikut ke GitHub).
   Jalankan: node tools/make_seed_sql.js   lalu paste isi supabase/seed_questions.sql ke Supabase SQL Editor dan Run. */
const fs = require('fs');
global.window = {};
require('../data/question-bank.js');
const bank = window.BANK;   // SEMUA soal ikut ke database; app.js memisahkan 'belum valid' (keyOrigin != score_result) ke bagian tersendiri
if (!Array.isArray(bank) || !bank.length) throw new Error('bank kosong');
console.log(`valid (ada skor=1): ${bank.filter(q => q.keyOrigin === 'score_result').length}; belum valid: ${bank.filter(q => q.keyOrigin !== 'score_result').length}`);
const ids = new Set();
const rows = bank.map(q => {
  if (ids.has(q.id)) throw new Error('id ganda: ' + q.id); ids.add(q.id);
  const j = JSON.stringify(q);
  if (j.includes('$j$')) throw new Error('pemisah $j$ muncul di data');
  return `(${Number(q.id)}, $j$${j}$j$::jsonb)`;
});
const sql = '-- seed bank soal (dibuat otomatis oleh tools/make_seed_sql.js; JANGAN di-commit)\ninsert into public.questions (id, data) values\n' + rows.join(',\n') + '\non conflict (id) do update set data = excluded.data;\n';
fs.writeFileSync('supabase/seed_questions.sql', sql);
console.log(`${rows.length} soal -> supabase/seed_questions.sql (${Math.round(sql.length / 1024)} KB); topik: ${[...new Set(bank.map(q => q.topic).filter(Boolean))].length}`);
