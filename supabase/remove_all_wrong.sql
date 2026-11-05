-- Menghapus soal yang SEMUA jawaban teramatinya bernilai 0 (keyOrigin bukan 'score_result'): kunci dari review dokumentasi (9) + belum terverifikasi (8).
-- Jalankan sekali di SQL Editor. Aman diulang. Setelah ini: select count(*) from public.questions;  -> 85
delete from public.questions where (data->>'keyOrigin') is distinct from 'score_result';
