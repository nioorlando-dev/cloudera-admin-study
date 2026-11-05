#!/usr/bin/env node
/* Membuat supabase/seed_questions.sql dari data/question-bank.js (sumber lokal yang dipakai app; berkas ini dan hasilnya TIDAK ikut ke GitHub).
   Jalankan: node tools/make_seed_sql.js   lalu paste isi supabase/seed_questions.sql ke Supabase SQL Editor dan Run. */
const fs = require('fs');
global.window = {};
require('../data/question-bank.js');
const all = window.BANK;
if (!Array.isArray(all) || !all.length) throw new Error('bank kosong');
// Hanya soal yang kuncinya terbukti (ada jawaban skor=1). Soal tanpa satu pun jawaban skor=1 (kunci dari review dokumentasi, atau belum terverifikasi) tidak ikut.
const bank = all.filter(q => q.keyOrigin === 'score_result');
console.log(`dikeluarkan ${all.length - bank.length} soal (semua jawaban teramati bernilai 0): ${all.filter(q => q.keyOrigin !== 'score_result').map(q => q.id).join(', ')}`);
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
