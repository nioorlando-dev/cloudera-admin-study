/* Cloudera Administrator Study: UI + logika sesi. Data: window.BANK, penyimpanan: Store. */
const $ = s => document.querySelector(s);
const app = $('#app');
// Bank soal TIDAK ada di berkas situs: dimuat setelah login dari Supabase (hanya akun yang disetujui). Lihat setBank() dan enterApp().
let BANK = [], GRADABLE = [], TOPICS = [], EXAM_QUESTIONS = 0;
function setBank(arr) {
  BANK = Array.isArray(arr) ? arr : [];
  GRADABLE = BANK.filter(q => q.gradable);
  TOPICS = [...new Set(BANK.map(q => q.topic).filter(Boolean))];
  EXAM_QUESTIONS = Math.min(84, GRADABLE.length);
}

const esc = s => String(s ?? '').replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[m]));
const norm = s => String(s ?? '').replace(/\s+/g, ' ').trim().toLowerCase().replace(/\.$/, '');
const shuffle = a => { a = [...a]; for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const pct = (a, b) => (b ? Math.round(a / b * 100) : 0);

const PASS_MARK = 60; // perkiraan
// Ujian asli: 84 soal, 90 menit (dikonfirmasi pemilik). Batas lulus 60% masih perkiraan.
const EXAM_MINUTES = 90;
function examDefaults() {
  try { const c = JSON.parse(localStorage.getItem('clouderaExamCfg') || 'null'); if (c && c.n > 0 && c.min > 0) return { n: Math.min(c.n, GRADABLE.length), min: c.min }; } catch (e) {}
  return { n: EXAM_QUESTIONS, min: EXAM_MINUTES };
}
function examLearnPref() { try { return localStorage.getItem('clouderaExamLearn') !== '0'; } catch (e) { return true; } }   // bawaan: mode belajar aktif
let timerId = null;
let progress = { last: {}, attempts: {}, right: {}, sessions: [], totalAnswers: 0, totalRight: 0 };
let view = 'boot';
let S = null; // sesi aktif

/* ---------- util UI ---------- */
function toast(msg, ms = 3500) {
  document.querySelectorAll('.toast').forEach(t => t.remove());
  const t = document.createElement('div');
  t.className = 'toast'; t.setAttribute('role', 'status'); t.textContent = msg;
  document.body.appendChild(t); setTimeout(() => t.remove(), ms);
}
function setView(v, html) { view = v; app.innerHTML = html; scrollTo(0, 0); }
function pillClass(p) { return p >= 80 ? 'good' : p >= 60 ? 'mid' : 'low'; }
function fmtDate(t) { return new Date(t).toLocaleString('id-ID', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }); }
// Penanda kunci hanya ditampilkan kalau ada yang perlu diwaspadai; soal normal tidak diberi label.
const STATUS_ALERT = {
  'UNVERIFIED': { label: 'Kunci belum pasti', tip: 'Kunci jawaban tidak bisa dipastikan, soal ini tidak dihitung di akurasi.' },
  'RESULT / DOC CONFLICT': { label: 'Beda dengan dokumentasi', tip: 'Kunci dari hasil ujian berbeda dengan dokumentasi produk saat ini.' },
  'VERIFIED WITH NOTE': { label: 'Ada catatan', tip: 'Kunci sudah dicek, tapi ada catatan tambahan di pembahasan.' }
};
function statusClass(s) {
  if (s === 'RESULT / DOC CONFLICT') return 'conflict';
  if (s === 'UNVERIFIED' || s.includes('NOTE')) return 'warn';
  if (s.startsWith('DOCUMENTATION') || s === 'REVIEWED') return 'doc';
  return 'ok';
}
const USER_RE = /^[a-z0-9_.-]{3,20}$/;
const toEmail = u => u.toLowerCase() + '@study-app.example.com';
function authErr(e) {
  const m = (e && e.message) || String(e);
  if (/invalid login/i.test(m)) return 'Username atau password salah.';
  if (/already registered|already been registered/i.test(m)) return 'Username ini sudah dipakai. Pilih yang lain atau masuk.';
  if (/not confirmed/i.test(m)) return 'Akun belum aktif. Minta admin mematikan "Confirm email" di Supabase.';
  if (/rate limit|too many/i.test(m)) return 'Terlalu banyak percobaan. Coba lagi beberapa menit lagi.';
  if (/password/i.test(m) && /(short|least|characters)/i.test(m)) return 'Password terlalu pendek (minimal 8 karakter).';
  if (/fetch|network/i.test(m)) return 'Tidak bisa terhubung ke server. Cek koneksi internet.';
  return m;
}

/* ---------- header / menu ---------- */
function renderUser() {
  const chip = $('#userChip');
  const u = Store.user;
  if (Store.mode === 'cloud' && u) {
    chip.classList.remove('hidden');
    $('#avatar').textContent = (u.name || '?').charAt(0).toUpperCase();
    $('#userName').textContent = u.name;
  } else chip.classList.add('hidden');
}
function toggleMenu() {
  const m = $('#menu');
  if (!m.classList.contains('hidden')) { m.classList.add('hidden'); return; }
  const u = Store.user;
  m.innerHTML = `${u ? `<div class="who"><b>${esc(u.name)}</b>${Store.admin ? ' <span class="tag ok">ADMIN</span>' : ''}</div>` : ''}
    ${Store.admin ? '<button data-action="admin">Admin: kelola user</button>' : ''}
    ${Store.mode === 'cloud' ? '<button data-action="chpw">Ganti password</button>' : ''}
    <button data-action="reset">Reset progres saya</button>
    ${Store.mode === 'cloud' ? '<button class="danger" data-action="logout">Keluar</button>' : ''}`;
  m.classList.remove('hidden');
}
function closeMenu() { $('#menu').classList.add('hidden'); }
function toggleTheme() {
  const t = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
  document.documentElement.dataset.theme = t;
  try { localStorage.setItem('clouderaTheme', t); } catch (e) {}
}

/* ---------- auth views ---------- */
function renderAuth(tab = 'login', msg = null) {
  const reg = tab === 'register';
  setView('auth', `<div class="auth-wrap"><div class="card auth-card">
    <h1>Selamat datang</h1>
    <p class="sub">Masuk untuk menyimpan progres belajarmu di akun sendiri.</p>
    <div class="tabs" role="tablist"><button role="tab" class="${!reg ? 'on' : ''}" data-tab="login">Masuk</button><button role="tab" class="${reg ? 'on' : ''}" data-tab="register">Daftar</button></div>
    ${msg ? `<div class="msg ${msg.type}" role="alert">${esc(msg.text)}</div>` : ''}
    <form id="${reg ? 'registerForm' : 'loginForm'}" data-authform novalidate method="post" action="#">
      <div class="field"><label for="${reg ? 'reg-username' : 'login-username'}">Username${reg ? ' (3–20 karakter: huruf, angka, . _ -)' : ''}</label><input data-role="user" id="${reg ? 'reg-username' : 'login-username'}" name="${reg ? 'new-username' : 'username'}" autocomplete="username" autocapitalize="none" autocorrect="off" spellcheck="false" minlength="3" maxlength="20" required></div>
      <div class="field"><label for="${reg ? 'reg-password' : 'login-password'}">Password${reg ? ' (min. 8 karakter)' : ''}</label>
        <div class="pw"><input data-role="pw" id="${reg ? 'reg-password' : 'login-password'}" name="${reg ? 'new-password' : 'password'}" type="password" autocomplete="${reg ? 'new-password' : 'current-password'}" ${reg ? 'minlength="8"' : ''} required><button type="button" data-action="showpw">Lihat</button></div></div>
      ${reg ? '<div class="field"><label for="reg-password2">Ulangi password</label><input data-role="pw2" id="reg-password2" name="confirm-password" type="password" autocomplete="new-password" minlength="8" required></div>' : ''}
      <button class="btn btn-primary btn-block" id="authBtn" type="submit">${reg ? 'Buat akun' : 'Masuk'}</button>
    </form>
    ${reg ? '<p class="privacy" style="border:0;padding-top:0;margin-top:12px"><b>Catatan:</b> tidak ada fitur lupa password. Simpan passwordmu baik-baik; kalau lupa, minta admin mereset.</p>' : ''}
    <div class="privacy"><b>Privasi:</b> hasil latihanmu hanya bisa dilihat oleh akunmu sendiri. Tidak ada leaderboard dan tidak ada yang bisa melihat skormu dari dalam aplikasi ini.</div>
  </div></div>`);
  document.querySelector('[data-authform]').addEventListener('submit', e => { e.preventDefault(); submitAuth(tab); });
  document.querySelector('[data-role=user]').focus();
}
async function submitAuth(tab) {
  const f = k => (document.querySelector(`[data-authform] [data-role=${k}]`) || {}).value || '';
  const user = f('user').trim().toLowerCase();
  const pw = f('pw');
  const fail = text => renderAuth(tab, { type: 'err', text });
  if (!user) return fail('Username wajib diisi.');
  if (!pw) return fail('Password wajib diisi.');
  if (tab === 'register') {
    if (!USER_RE.test(user)) return fail('Username 3–20 karakter, hanya huruf, angka, titik, garis bawah, atau strip.');
    if (pw.length < 8) return fail('Password minimal 8 karakter.');
    if (pw !== f('pw2')) return fail('Kedua password tidak sama.');
  }
  const btn = $('#authBtn'); btn.disabled = true; btn.textContent = 'Memproses…';
  try {
    if (tab === 'login') await Store.signIn(toEmail(user), pw); /* onAuthChange yang lanjutkan */
    else {
      const r = await Store.signUp(toEmail(user), pw, user);
      if (r.needsConfirm) fail('Akun dibuat tapi belum aktif: "Confirm email" di Supabase harus dimatikan (lihat SETUP.md).');
    }
  } catch (e) { fail(authErr(e)); }
}
function renderRecovery(msg) {
  setView('recovery', `<div class="auth-wrap"><div class="card auth-card"><h1>Buat password baru</h1><p class="sub">Masukkan password baru untuk akunmu.</p>
    ${msg ? `<div class="msg err" role="alert">${esc(msg)}</div>` : ''}
    <form id="recForm"><div class="field"><label for="f-pw">Password baru (min. 8 karakter)</label><input id="f-pw" type="password" autocomplete="new-password"></div>
    <button class="btn btn-primary btn-block" type="submit">Simpan password</button></form></div></div>`);
  $('#recForm').addEventListener('submit', async e => {
    e.preventDefault();
    const pw = $('#f-pw').value;
    if (pw.length < 8) return renderRecovery('Password minimal 8 karakter.');
    try { await Store.updatePassword(pw); toast('Password diperbarui.'); await enterApp(); } catch (er) { renderRecovery(authErr(er)); }
  });
}

/* ---------- dashboard ---------- */
function stats() {
  const mastered = GRADABLE.filter(q => progress.last[q.id] === true).length;
  const wrong = GRADABLE.filter(q => progress.last[q.id] === false).length;
  const unseen = GRADABLE.filter(q => progress.attempts[q.id] === undefined).length;
  return { mastered, wrong, unseen, acc: pct(progress.totalRight, progress.totalAnswers) };
}
function weakestTopic() {
  let best = null;
  for (const t of TOPICS) {
    const g = GRADABLE.filter(q => q.topic === t && progress.attempts[q.id] !== undefined);
    if (g.length < 3) continue;
    const p = pct(g.filter(q => progress.last[q.id] === true).length, g.length);
    if (!best || p < best.p) best = { t, p };
  }
  return best && best.p < 80 ? best : null;
}
function renderHome() {
  const st = stats(), has = progress.totalAnswers > 0;
  const name = Store.user ? Store.user.name : null;
  const sessions = progress.sessions.slice(0, 6);
  const mp = pct(st.mastered, GRADABLE.length);
  const weak = weakestTopic();
  const next = !has ? { label: 'Mulai latihan cepat', mode: 'focus' }
    : st.wrong ? { label: `Ulang ${st.wrong} soal yang salah`, mode: 'wrong' }
    : st.unseen ? { label: 'Lanjut soal baru', mode: 'new' }
    : { label: 'Latihan cepat', mode: 'focus' };
  const hist = sessions.length ? sessions.map(s => {
    const p = pct(s.correct, s.graded);
    return `<div class="history-row"><span>${esc(modeLabel(s.mode))}<br><small>${fmtDate(s.t)} · ${s.checked} dicek</small></span><b>${s.correct}/${s.graded}</b><span class="pill ${pillClass(p)}">${p}%</span></div>`;
  }).join('') : '<div class="empty">Belum ada sesi.</div>';
  setView('home', `
    ${Store.mode === 'local' ? '<div class="banner">Mode lokal: progres hanya tersimpan di browser ini. Login belum dikonfigurasi (lihat SETUP.md).</div>' : ''}
    <section class="card hero">
      <h1>${name ? `Halo, ${esc(name)}` : 'Cloudera Administrator Study'}</h1>
      <p>${sessions.length ? `Terakhir latihan ${fmtDate(sessions[0].t)}.` : 'Belum ada riwayat latihan.'}</p>
      ${has ? `<div class="mastery"><div class="mastery-row"><span>Soal dikuasai</span><span>${st.mastered} / ${GRADABLE.length}</span></div>
        <div class="bar" role="progressbar" aria-valuenow="${mp}" aria-valuemin="0" aria-valuemax="100"><span style="width:${mp}%"></span></div></div>` : ''}
      <div class="row" style="margin-top:18px"><button class="btn btn-primary" data-start="${next.mode}">${next.label}</button>
        ${weak ? `<button class="btn" data-topic="${esc(weak.t)}">Perkuat: ${esc(weak.t)} (${weak.p}%)</button>` : ''}</div>
    </section>
    ${has ? `<div class="metrics">
      <div class="card metric"><b>${st.acc}%</b><span>akurasi keseluruhan</span></div>
      <div class="card metric"><b>${st.wrong}</b><span>perlu diulang</span></div>
      <div class="card metric"><b>${progress.sessions.length}</b><span>sesi selesai</span></div></div>` : ''}
    <section class="section"><h2>Mode latihan</h2><div class="modes">
      <div class="card mode"><h3>Latihan cepat</h3><p>20 soal acak. Pembahasan tampil setelah tiap jawaban.</p><div class="row"><button class="btn" data-start="focus">Mulai</button></div></div>
      <div class="card mode"><h3>Soal baru</h3><p>Soal yang belum pernah kamu jawab.</p><div class="row"><button class="btn" data-start="new" ${st.unseen ? '' : 'disabled'}>Mulai</button><span class="count">${st.unseen} soal</span></div></div>
      <div class="card mode"><h3>Ulang yang salah</h3><p>Soal yang jawaban terakhirnya masih salah.</p><div class="row"><button class="btn" data-start="wrong" ${st.wrong ? '' : 'disabled'}>Mulai</button><span class="count">${st.wrong} soal</span></div></div>
      <div class="card mode"><h3>Semua soal</h3><p>Seluruh bank soal, termasuk yang belum terverifikasi.</p><div class="row"><button class="btn" data-start="all">Mulai</button><span class="count">${BANK.length} soal</span></div></div>
    </div></section>
    <section class="section"><h2>Simulasi ujian</h2><div class="card mode exam-card">
      <p>Soal diacak dengan timer. Pilih: <b>mode belajar</b> (jawaban dan pembahasan langsung tampil setelah tiap soal) atau <b>mode ujian ketat</b> (pembahasan baru muncul setelah dikumpulkan).</p><p class="fine">Format ujian asli: ${EXAM_QUESTIONS} soal, ${EXAM_MINUTES} menit. Kamu bisa ubah jumlah soal (maks. ${GRADABLE.length}) dan waktunya. Target lulus ${PASS_MARK}% adalah patokan latihan.</p>
      <div class="exam-fields"><label>Jumlah soal<input id="examN" type="number" inputmode="numeric" min="1" max="${GRADABLE.length}" value="${examDefaults().n}"></label>
      <label>Waktu (menit)<input id="examMin" type="number" inputmode="numeric" min="1" max="300" value="${examDefaults().min}"></label>
      <button class="btn btn-primary" data-action="exam">Mulai ujian</button></div>
      <label class="learn-opt"><input type="checkbox" id="examLearn" ${examLearnPref() ? 'checked' : ''}> Mode belajar: tampilkan jawaban dan pembahasan setelah tiap soal</label></div></section>
    <section class="section"><h2>Latihan per topik</h2><div class="topics">${topicCards()}</div></section>
    <section class="section"><h2>Sesi terakhir</h2><div class="card history">${hist}</div></section>
    <details class="card about"><summary>Tentang bank soal &amp; status verifikasi</summary><div class="in">
      <p>Bank soal digabung dari hasil empat kontributor (E, A, R, H). Total ${BANK.length} soal unik, ${GRADABLE.length} di antaranya dihitung dalam akurasi.</p>
      <table class="source-table"><tr><th>Sumber</th><th>Soal</th><th>Irisan</th></tr>
        <tr><td>E</td><td>84</td><td>Hasil dasar</td></tr><tr><td>A</td><td>84</td><td>Hasil dasar</td></tr><tr><td>R</td><td>84</td><td>Hasil dasar</td></tr>
        <tr><td>H</td><td>84</td><td>E 73 · A 70 · R 73 · 1 soal baru</td></tr></table>
      <div class="notice"><b>Terverifikasi</b>: kunci dari skor=1 dan cocok dengan dokumentasi resmi. <b>Dari hasil ujian</b>: kunci dari hasil ujian, belum ada referensi langsung. <b>Beda dengan dokumentasi</b>: hasil ujian berbeda dengan dokumentasi terkini. <b>Dari dokumentasi</b>: kunci dari dokumentasi karena tidak ada skor=1. <b>Belum terverifikasi</b>: kunci tidak bisa dipastikan, tidak dihitung di akurasi.</div>
      <p class="footer">Materi latihan pribadi berdasarkan workbook yang diberikan. Cloudera dan logo Cloudera adalah merek dagang Cloudera, Inc. Bukan produk ujian resmi Cloudera.</p>
    </div></details>`);
}
function topicCards() {
  return TOPICS.map(t => {
    const qs = BANK.filter(q => q.topic === t), g = qs.filter(q => q.gradable);
    const m = g.filter(q => progress.last[q.id] === true).length, p = pct(m, g.length);
    return `<div class="card topic"><div class="tname">${esc(t)}</div><div class="tmeta">${qs.length} soal · ${m}/${g.length} dikuasai</div>
      <div class="bar"><span style="width:${p}%"></span></div><button class="btn" data-topic="${esc(t)}">Latihan</button></div>`;
  }).join('');
}
function modeLabel(m) { if (m === 'exam') return 'Simulasi ujian'; if (m && m.startsWith('topic:')) return 'Topik: ' + m.slice(6); return ({ focus: 'Latihan cepat', new: 'Soal baru', wrong: 'Ulang yang salah', all: 'Semua soal', migrated: 'Sesi lama' })[m] || 'Latihan'; }

/* ---------- sesi ---------- */
function startSession(mode, arg) {
  let pool, n, exam = null;
  if (mode === 'wrong') pool = GRADABLE.filter(q => progress.last[q.id] === false);
  else if (mode === 'new') pool = GRADABLE.filter(q => progress.attempts[q.id] === undefined);
  else if (mode === 'topic') { pool = BANK.filter(q => q.topic === arg); mode = 'topic:' + arg; }
  else if (mode === 'exam') {
    const pr = arg || examDefaults();
    pool = GRADABLE; n = Math.min(pr.n, pool.length);
    exam = { secs: pr.min * 60, deadline: Date.now() + pr.min * 60000, flags: {}, n, min: pr.min, learn: pr.learn !== undefined ? !!pr.learn : examLearnPref() };
  } else pool = BANK;
  if (!pool.length) { toast('Tidak ada soal untuk mode ini.'); return; }
  if (!n) n = mode === 'focus' ? 20 : pool.length;
  clearInterval(timerId);
  S = {
    mode, exam, started: Date.now(), idx: 0, answers: {}, checked: {}, results: {}, finished: false,
    questions: shuffle(pool).slice(0, n).map(q => ({ ...q, options: shuffle(q.options) }))
  };
  view = 'x'; renderSession();
  if (exam) { timerId = setInterval(tick, 1000); tick(); }
}
function tick() {
  if (!S || !S.exam || S.finished) { clearInterval(timerId); return; }
  const left = Math.max(0, Math.round((S.exam.deadline - Date.now()) / 1000));
  const el = $('#timer'); if (el) { el.textContent = fmtTime(left); el.classList.toggle('low', left <= 300); }
  if (left <= 0) { toast('Waktu habis. Jawaban dikumpulkan otomatis.'); submitExam(); }
}
function fmtTime(sec) { const h = Math.floor(sec / 3600), m = Math.floor(sec % 3600 / 60), s = sec % 60; return (h ? h + ':' + String(m).padStart(2, '0') : m) + ':' + String(s).padStart(2, '0'); }
const cur = () => S.questions[S.idx];
const isCorrect = (q, sel) => { const a = (sel || []).map(norm).sort(), b = q.correct.map(norm).sort(); return a.length === b.length && a.every((x, i) => x === b[i]); };

function renderSession() {
  if (view !== 'session') {
    setView('session', `<div class="session-head"><div class="grow"><div class="title"><b id="sTitle"></b><span id="sCount"></span></div><div class="progress"><span id="sBar"></span></div></div><button class="btn btn-ghost" id="finBtn" data-action="finish">Selesai</button></div>
    <div class="layout"><div class="card question-card"><div class="meta" id="meta"></div><div class="qtext" id="qtext"></div><div class="helper" id="helper"></div><div class="options" id="options" role="group"></div><div id="feedback" aria-live="polite"></div>
      <div class="actions"><div class="kbd"><kbd>A</kbd>–<kbd>E</kbd> pilih · <kbd>Enter</kbd> ${S.exam && !S.exam.learn ? 'lanjut · <kbd>F</kbd> tandai' : S.exam ? 'cek/lanjut · <kbd>F</kbd> tandai' : 'cek/lanjut'} · <kbd>←</kbd><kbd>→</kbd> pindah</div>
      <div class="right"><button class="btn" data-action="prev">Sebelumnya</button> <button class="btn hidden" id="flagBtn" data-action="flag">Tandai</button> <button class="btn btn-primary" id="checkBtn" data-action="check">Cek jawaban</button><button class="btn btn-primary hidden" id="nextBtn" data-action="next">Lanjut</button></div></div></div>
    <aside class="side"><div class="card"><h3>${S.exam ? 'Ujian' : 'Sesi ini'}</h3><div class="live">${S.exam
      ? '<div class="mini wide"><b id="timer" class="timer">—</b><span>sisa waktu</span></div><div class="mini"><b id="xA">0</b><span>terjawab</span></div><div class="mini"><b id="xF">0</b><span>ditandai</span></div>'
      : '<div class="mini"><b id="cN">0</b><span>benar</span></div><div class="mini"><b id="wN">0</b><span>salah</span></div><div class="mini"><b id="gN">0</b><span>dinilai</span></div><div class="mini"><b id="aN">—</b><span>akurasi</span></div>'}</div></div>
      <div class="card" style="margin-top:10px"><h3>Soal</h3><div class="qgrid" id="qgrid"></div></div></aside></div>`);
  }
  const q = cur(), sel = S.answers[q.id] || [], done = !!S.checked[q.id], multi = q.type === 'Multiple Response';
  $('#sTitle').textContent = S.exam ? (S.exam.learn ? 'Simulasi ujian · mode belajar' : 'Simulasi ujian') : modeLabel(S.mode);
  $('#sCount').textContent = `${S.idx + 1} / ${S.questions.length}`;
  $('#sBar').style.width = ((S.idx + 1) / S.questions.length * 100) + '%';
  const alert = STATUS_ALERT[q.status];
  $('#meta').innerHTML = S.exam
    ? (S.exam.flags[q.id] ? '<span class="tag warn">Ditandai</span>' : '')
    : `${q.topic ? `<span class="tag topic">${esc(q.topic)}</span>` : ''}${alert ? `<span class="tag ${statusClass(q.status)}" title="${esc(alert.tip)}">${esc(alert.label)}</span>` : ''}`;
  $('#qtext').textContent = q.question;
  $('#helper').textContent = S.exam ? (multi ? `Pilih ${q.choose} jawaban.` : 'Pilih satu jawaban.') : q.gradable ? (multi ? `Pilih ${q.choose} jawaban.` : 'Pilih satu jawaban.') : 'Soal ini belum punya kunci yang bisa dipastikan, jadi tidak dihitung di akurasi.';
  $('#options').innerHTML = q.options.map((o, i) => {
    const selected = sel.map(norm).includes(norm(o)), right = q.correct.map(norm).includes(norm(o));
    const cls = 'option' + (selected ? ' selected' : '') + (done && q.gradable ? (right ? ' correct' : selected ? ' wrong' : '') : '');
    const mark = done && q.gradable ? (right ? 'BENAR' : selected ? 'SALAH' : '') : '';
    return `<button class="${cls}" data-pick="${i}" ${done ? 'disabled' : ''} aria-pressed="${selected}"><span class="letter">${String.fromCharCode(65 + i)}</span><span>${esc(o)}</span><span class="mark">${mark}</span></button>`;
  }).join('');
  $('#feedback').innerHTML = done ? feedbackHtml(q) : '';
  if (S.exam) {
    $('#checkBtn').classList.toggle('hidden', !S.exam.learn || done); $('#nextBtn').classList.remove('hidden');
    $('#flagBtn').classList.remove('hidden'); $('#flagBtn').textContent = S.exam.flags[q.id] ? 'Hapus tanda' : 'Tandai';
    $('#finBtn').textContent = 'Kumpulkan';
    $('#nextBtn').textContent = S.idx === S.questions.length - 1 ? 'Kumpulkan' : 'Lanjut';
  } else {
    $('#checkBtn').classList.toggle('hidden', done);
    $('#nextBtn').classList.toggle('hidden', !done);
    $('#nextBtn').textContent = S.idx === S.questions.length - 1 ? 'Selesai' : 'Lanjut';
  }
  renderGrid(); renderLive();
}
function pick(i) {
  const q = cur(); if (S.checked[q.id]) return;
  const o = q.options[i]; if (o === undefined) return;
  let a = S.answers[q.id] || [];
  if (q.type === 'Multiple Response') {
    if (a.map(norm).includes(norm(o))) a = a.filter(x => norm(x) !== norm(o));
    else if (a.length < q.choose) a = [...a, o];
  } else a = [o];
  S.answers[q.id] = a; renderSession();
}
function checkAnswer() {
  const q = cur(), sel = S.answers[q.id] || [];
  if (S.checked[q.id]) return;
  if (!sel.length) return toast('Pilih jawaban dulu.');
  if (q.gradable && q.type === 'Multiple Response' && sel.length !== q.choose) return toast(`Pilih tepat ${q.choose} jawaban.`);
  S.checked[q.id] = true;
  if (q.gradable) {
    const ok = isCorrect(q, sel); S.results[q.id] = ok;
    Store.recordAnswer(q.id, ok).then(() => { progress = Store.progress(); }, () => toast('Gagal menyimpan jawaban ke server. Cek koneksi.'));
    progress = Store.progress();
  } else S.results[q.id] = null;
  renderSession();
}
function feedbackHtml(q) {
  const r = S.results[q.id];
  const cls = r === true ? 'ok' : r === false ? 'bad' : '';
  const title = r === true ? 'Benar' : r === false ? 'Belum tepat, ini yang perlu diingat' : 'Soal belum terverifikasi, tidak dinilai';
  // urutan belajar: (1) jawabanmu bila salah, (2) jawaban benar, (3) kenapa, (4) bukti/sumber dilipat
  const mine = r === false ? `<div class="block yours"><h4>Jawabanmu</h4><p>${(S.answers[q.id] || []).map(x => '• ' + esc(x)).join('<br>')}</p></div>` : '';
  const key = q.gradable ? `<div class="block key"><h4>Jawaban benar</h4><p>${q.correct.map(x => '• ' + esc(x)).join('<br>')}</p></div>`
    : `<div class="block"><h4>Kunci jawaban</h4><p>Belum ada kunci yang bisa dipastikan dari workbook. Semua percobaan bernilai 0, atau soal hasil ekspor terpotong.</p></div>`;
  const ev = q.keyOrigin === 'score_result' ? `Bukti skor=1: ${esc((q.keySources || []).join(', '))}` : q.keyOrigin === 'reviewed' ? 'Tidak ada skor=1; kunci disusun dari review dokumentasi/referensi.' : 'Tidak ada jawaban hasil yang diterima.';
  const ref = q.reference ? `<a href="${esc(q.reference.url)}" target="_blank" rel="noreferrer noopener">${esc(q.reference.title)}</a> <span class="src">· ${esc(q.reference.kind)}</span>` : '<span class="src">Belum ada halaman dokumentasi resmi yang cocok.</span>';
  const rev = q.revisionNote ? `<p><b>Catatan revisi workbook:</b> ${esc(q.revisionNote)}</p>` : '';
  const conf = q.status === 'RESULT / DOC CONFLICT' ? `<div class="block"><h4>Konflik dokumentasi</h4><p>Kunci hasil ujian dan dokumentasi produk saat ini tidak sepenuhnya sejalan. Pakai kunci ini untuk mengenali soal ujian; pakai dokumentasi untuk administrasi sebenarnya.</p></div>` : '';
  return `<div class="feedback ${cls}"><h3>${title}</h3>${mine}${key}<div class="block why"><h4>Kenapa</h4><p>${esc(q.explanation)}</p></div>${conf}
    <div class="block"><details><summary>Bukti, sumber, dan catatan</summary><p class="src">${ev}</p><p>${ref}</p>${rev}<p class="src">Pilihan jawaban di sini direkonstruksi dari jawaban yang teramati di workbook; bukan salinan resmi soal ujian.</p></details></div></div>`;
}
function renderGrid() {
  $('#qgrid').innerHTML = S.questions.map((q, i) => {
    let c = 'qnum'; if (i === S.idx) c += ' current';
    if (S.checked[q.id]) c += q.gradable ? (S.results[q.id] ? ' good' : ' bad') : ' unverified';
    else if ((S.answers[q.id] || []).length) c += ' answered';
    if (S.exam && S.exam.flags[q.id]) c += ' flag';
    return `<button class="${c}" data-go="${i}" aria-label="Soal ${i + 1}">${i + 1}</button>`;
  }).join('');
}
function renderLive() {
  if (S.exam) {
    $('#xA').textContent = S.questions.filter(q => (S.answers[q.id] || []).length).length + '/' + S.questions.length;
    $('#xF').textContent = Object.values(S.exam.flags).filter(Boolean).length; return;
  }
  const g = Object.values(S.results).filter(v => v === true || v === false), c = g.filter(Boolean).length;
  $('#cN').textContent = c; $('#wN').textContent = g.length - c; $('#gN').textContent = g.length; $('#aN').textContent = g.length ? pct(c, g.length) + '%' : '—';
}
function next() { if (S.idx === S.questions.length - 1) return finishSession(); S.idx++; renderSession(); }
function prev() { if (S.idx > 0) { S.idx--; renderSession(); } }

async function saveSession() {
  if (S.finished) return;
  S.finished = true;
  const checked = Object.keys(S.checked).length;
  const g = Object.values(S.results).filter(v => v === true || v === false);
  if (!checked) return;
  try {
    await Store.recordSession({ mode: S.mode, checked, graded: g.length, correct: g.filter(Boolean).length, dur: Math.round((Date.now() - S.started) / 1000) });
    progress = Store.progress();
  } catch (e) { toast('Gagal menyimpan ringkasan sesi.'); }
}
async function finishSession() {
  if (S.exam) return confirmExam();
  const checked = Object.keys(S.checked).length;
  if (!checked && !confirm('Belum ada soal yang dicek. Keluar dari sesi?')) return;
  await saveSession();
  const g = Object.entries(S.results).filter(([, v]) => v === true || v === false);
  const c = g.filter(([, v]) => v).length, p = pct(c, g.length);
  const wrongQs = S.questions.filter(q => S.results[q.id] === false);
  const review = wrongQs.length ? `<div class="card review"><h2>Perlu dipelajari lagi (${wrongQs.length})</h2>${wrongQs.map(q => `<div class="review-row"><h4>${esc(q.question)}</h4><p class="yours">Jawabanmu: ${esc((S.answers[q.id] || []).join(' / '))}</p><p class="right">Kunci: ${esc(q.correct.join(' / '))}</p><p>${esc(q.explanation)}</p></div>`).join('')}</div>` : '';
  setView('result', `<div class="card result"><div class="ring" style="--p:${p}"><div>${g.length ? p + '%' : '—'}</div></div>
    <h1>${!g.length ? 'Sesi selesai' : p >= 80 ? 'Mantap!' : p >= 60 ? 'Sudah lumayan' : 'Terus latihan'}</h1>
    <p class="sub">${checked} soal dicek · ${c} benar · ${g.length - c} salah${checked > g.length ? ' · soal belum terverifikasi tidak dinilai' : ''}</p>
    <div class="row">${wrongQs.length ? '<button class="btn btn-primary" data-start="wrong">Ulang yang salah</button>' : ''}<button class="btn" data-start="focus">Latihan lagi</button><button class="btn btn-ghost" data-action="home">Ke dashboard</button></div></div>${review}`);
}
function confirmExam() {
  const un = S.questions.filter(q => !(S.answers[q.id] || []).length).length, fl = Object.values(S.exam.flags).filter(Boolean).length;
  const msg = `Kumpulkan ujian sekarang?${un ? `\n• ${un} soal belum dijawab (dihitung salah)` : ''}${fl ? `\n• ${fl} soal masih ditandai` : ''}`;
  if (confirm(msg)) submitExam();
}
async function submitExam() {
  if (!S || S.finished) return;
  S.finished = true; clearInterval(timerId);
  const used = Math.min(S.exam.secs, Math.round((Date.now() - S.started) / 1000));
  let answered = 0, correct = 0;
  const byTopic = {}, writes = [];
  for (const q of S.questions) {
    const sel = S.answers[q.id] || [], ok = sel.length > 0 && isCorrect(q, sel);
    const already = !!S.checked[q.id];   // mode belajar: soal yang sudah dicek sudah tercatat di Store.recordAnswer
    S.results[q.id] = ok; S.checked[q.id] = true;
    const t = byTopic[q.topic || 'Lainnya'] = byTopic[q.topic || 'Lainnya'] || { n: 0, ok: 0 };
    t.n++; if (ok) { t.ok++; correct++; }
    if (sel.length) { answered++; if (!already) writes.push(Store.recordAnswer(q.id, ok)); }
  }
  const total = S.questions.length;
  try {
    await Promise.all([...writes, Store.recordSession({ mode: 'exam', checked: answered, graded: total, correct, dur: used })]);
  } catch (e) { toast('Sebagian hasil gagal tersimpan ke server.'); }
  progress = Store.progress();
  const p = pct(correct, total), pass = p >= PASS_MARK;
  const wrongQs = S.questions.filter(q => !S.results[q.id]);
  const topicRows = Object.entries(byTopic).sort((a, b) => a[1].ok / a[1].n - b[1].ok / b[1].n).map(([t, v]) => `<tr><td>${esc(t)}</td><td>${v.ok}/${v.n}</td><td><span class="pill ${pillClass(pct(v.ok, v.n))}">${pct(v.ok, v.n)}%</span></td></tr>`).join('');
  const review = wrongQs.length ? `<div class="card review"><h2>Pembahasan soal yang salah (${wrongQs.length})</h2>${wrongQs.map(q => { const sel = S.answers[q.id] || []; return `<div class="review-row"><h4>${esc(q.question)}</h4><p class="yours">${sel.length ? 'Jawabanmu: ' + esc(sel.join(' / ')) : 'Tidak dijawab'}</p><p class="right">Kunci: ${esc(q.correct.join(' / '))}</p><p>${esc(q.explanation)}</p></div>`; }).join('')}</div>` : '';
  setView('result', `<div class="card result"><div class="ring ${pass ? '' : 'fail'}" style="--p:${p}"><div>${p}%</div></div>
    <h1>${pass ? 'Lulus simulasi' : 'Belum lulus simulasi'}</h1>
    <p class="sub">${correct}/${total} benar · target ${PASS_MARK}% · waktu ${fmtTime(used)} dari ${fmtTime(S.exam.secs)} · ${total - answered} tidak dijawab</p>
    <table class="source-table topic-table"><tr><th>Topik</th><th>Benar</th><th>Skor</th></tr>${topicRows}</table>
    <div class="row" style="margin-top:16px">${wrongQs.length ? '<button class="btn btn-primary" data-start="wrong">Ulang yang salah</button>' : ''}<button class="btn" data-action="exam">Ujian lagi</button><button class="btn btn-ghost" data-action="home">Ke dashboard</button></div></div>${review}`);
}
async function goHome() {
  closeMenu();
  if (view === 'session' && S && S.exam && !S.finished) {
    if (!confirm('Ujian sedang berlangsung. Keluar akan membatalkan ujian tanpa dinilai. Keluar?')) return;
    S.finished = true; clearInterval(timerId); return renderHome();
  }
  if (view === 'session' && S && !S.finished) await saveSession();
  renderHome();
}

function renderPending() {
  setView('pending', `<div class="auth-wrap"><div class="card auth-card"><h1>Menunggu persetujuan</h1>
    <p class="sub">Akunmu sudah dibuat, tapi belum disetujui admin. Setelah disetujui, bank soal akan terbuka. Kabari admin agar akunmu disetujui.</p>
    <button class="btn btn-primary btn-block" data-action="retry">Cek lagi</button>
    <p style="margin-top:10px"><button class="btn btn-ghost btn-block" data-action="logout">Keluar</button></p></div></div>`);
}

/* ---------- admin ---------- */
async function renderAdmin() {
  setView('admin', '<div class="spinner" role="status"></div>');
  try {
    const users = await Store.adminListUsers();
    setView('admin', `<section class="card hero"><h1>Kelola user</h1><p>Daftar akun dan reset password. Panel ini tidak menampilkan progres atau skor siapa pun.</p></section>
      <div class="card history" style="margin-top:14px"><table class="source-table"><tr><th>Username</th><th>Daftar</th><th>Login terakhir</th><th>Status</th><th></th></tr>
      ${users.map(u => `<tr><td><b>${esc(u.username)}</b></td><td>${u.created_at ? fmtDate(u.created_at) : '—'}</td><td>${u.last_sign_in_at ? fmtDate(u.last_sign_in_at) : '—'}</td><td>${u.approved ? '<span class="pill good">Disetujui</span>' : '<span class="pill mid">Menunggu</span>'}</td><td><button class="btn" data-approve="${esc(u.username)}" data-to="${u.approved ? '0' : '1'}">${u.approved ? 'Cabut' : 'Setujui'}</button> <button class="btn" data-resetuser="${esc(u.username)}">Reset password</button></td></tr>`).join('')}</table></div>
      <p style="margin-top:14px"><button class="btn" data-action="home">Kembali</button></p>`);
  } catch (e) { toast('Gagal memuat user: ' + authErr(e)); renderHome(); }
}
async function adminReset(username) {
  const pw = prompt(`Password sementara baru untuk "${username}" (min. 8 karakter):`);
  if (pw === null) return;
  if (pw.length < 8) return toast('Password minimal 8 karakter.');
  try { await Store.adminResetPassword(username, pw); toast(`Password ${username} direset. Sampaikan ke user, lalu minta dia menggantinya.`, 6000); }
  catch (e) { toast('Gagal reset: ' + authErr(e)); }
}

/* ---------- boot ---------- */
async function enterApp() {
  if (view === 'recovery') return;
  renderUser();
  if (Store.mode === 'cloud' && !Store.user) { renderAuth('login'); return; }
  setView('boot', '<div class="spinner" role="status" aria-label="Memuat"></div>');
  try {
    if (!(await Store.isApproved())) return renderPending();
    setBank(await Store.loadBank());
    if (!BANK.length) return setView('err', `<div class="card hero"><h1>Bank soal kosong</h1><p>${Store.mode === 'cloud' ? 'Tabel <code>questions</code> belum diisi. Jalankan <code>supabase/seed_questions.sql</code> di Supabase SQL Editor (lihat SETUP.md).' : 'Berkas <code>data/question-bank.js</code> tidak ditemukan (mode lokal butuh berkas itu).'}</p><p style="margin-top:12px"><button class="btn btn-primary" data-action="retry">Coba lagi</button></p></div>`);
  } catch (e) { setView('err', `<div class="card hero"><h1>Gagal memuat bank soal</h1><p>${esc(authErr(e))}</p><p style="margin-top:12px">Pastikan <code>supabase/questions.sql</code> sudah dijalankan.</p><p style="margin-top:12px"><button class="btn btn-primary" data-action="retry">Coba lagi</button></p></div>`); return; }
  try { progress = await Store.load(); }
  catch (e) { setView('err', `<div class="card hero"><h1>Gagal memuat progres</h1><p>${esc(authErr(e))}</p><p style="margin-top:12px">Pastikan <code>supabase/schema.sql</code> sudah dijalankan.</p><p style="margin-top:12px"><button class="btn btn-primary" data-action="retry">Coba lagi</button></p></div>`); return; }
  Store.checkAdmin();
  renderHome();
}

document.addEventListener('click', async e => {
  const t = e.target.closest('[data-action],[data-start],[data-pick],[data-go],[data-tab],[data-topic],[data-resetuser],[data-approve]');
  if (!t) { if (!e.target.closest('#menu')) closeMenu(); return; }
  if (t.dataset.pick !== undefined) return pick(+t.dataset.pick);
  if (t.dataset.go !== undefined) { S.idx = +t.dataset.go; return renderSession(); }
  if (t.dataset.start) { closeMenu(); return startSession(t.dataset.start); }
  if (t.dataset.tab) return renderAuth(t.dataset.tab);
  if (t.dataset.topic) return startSession('topic', t.dataset.topic);
  if (t.dataset.approve) {
    try { await Store.adminSetApproved(t.dataset.approve, t.dataset.to === '1'); toast(t.dataset.to === '1' ? `${t.dataset.approve} disetujui.` : `Persetujuan ${t.dataset.approve} dicabut.`); } catch (er) { toast('Gagal: ' + authErr(er)); }
    return renderAdmin();
  }
  if (t.dataset.resetuser) return adminReset(t.dataset.resetuser);
  switch (t.dataset.action) {
    case 'home': return goHome();
    case 'theme': return toggleTheme();
    case 'menu': e.stopPropagation(); return toggleMenu();
    case 'check': return checkAnswer();
    case 'next': return next();
    case 'prev': return prev();
    case 'finish': return finishSession();
    case 'retry': return enterApp();
    case 'exam': {
      let n, min, learn = examLearnPref();
      if ($('#examN')) { n = parseInt($('#examN').value, 10); min = parseInt($('#examMin').value, 10); if ($('#examLearn')) learn = $('#examLearn').checked; }
      else if (S && S.exam) { n = S.exam.n; min = S.exam.min; learn = S.exam.learn; }
      else { n = EXAM_QUESTIONS; min = EXAM_MINUTES; }
      if (!(n >= 1) || !(min >= 1)) return toast('Isi jumlah soal dan waktu dengan angka lebih dari 0.');
      if (n > GRADABLE.length) { n = GRADABLE.length; toast(`Maksimal ${GRADABLE.length} soal.`); }
      if (min > 300) min = 300;
      try { localStorage.setItem('clouderaExamCfg', JSON.stringify({ n, min })); localStorage.setItem('clouderaExamLearn', learn ? '1' : '0'); } catch (e) {}
      if (view === 'home' && !confirm(`Mulai simulasi ujian ${n} soal, ${min} menit${learn ? ' (mode belajar)' : ' (mode ujian ketat)'}? Timer langsung berjalan.`)) return;
      return startSession('exam', { n, min, learn });
    }
    case 'flag': { const q = cur(); S.exam.flags[q.id] = !S.exam.flags[q.id]; return renderSession(); }
    case 'admin': closeMenu(); return renderAdmin();
    case 'chpw': {
      closeMenu();
      const pw = prompt('Password baru (minimal 8 karakter):');
      if (pw === null) return;
      if (pw.length < 8) return toast('Password minimal 8 karakter.');
      try { await Store.updatePassword(pw); toast('Password diperbarui.'); } catch (er) { toast('Gagal: ' + authErr(er)); }
      return;
    }
    case 'showpw': { const i = document.querySelector('[data-authform] [data-role=pw]'); i.type = i.type === 'password' ? 'text' : 'password'; t.textContent = i.type === 'password' ? 'Lihat' : 'Sembunyi'; return; }
    case 'logout': closeMenu(); await Store.signOut(); setBank([]); progress = { last: {}, attempts: {}, right: {}, sessions: [], totalAnswers: 0, totalRight: 0 }; renderUser(); return renderAuth('login');
    case 'reset':
      closeMenu();
      if (!confirm('Hapus semua progres dan riwayat sesimu? Tindakan ini tidak bisa dibatalkan.')) return;
      try { await Store.resetProgress(); progress = Store.progress(); toast('Progres direset.'); renderHome(); } catch (er) { toast('Gagal reset: ' + authErr(er)); }
  }
});
document.addEventListener('input', e => {
  if (e.target.id === 'examMin') e.target.dataset.manual = '1';
  if (e.target.id === 'examN') {
    const m = $('#examMin'), n = parseInt(e.target.value, 10);
    if (m && !m.dataset.manual && n >= 1) m.value = Math.max(1, Math.round(EXAM_MINUTES * n / EXAM_QUESTIONS));
  }
});
document.addEventListener('keydown', e => {
  if (view !== 'session' || !S || e.ctrlKey || e.metaKey || e.altKey) return;
  if (/INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName)) return;
  const q = cur(), done = !!S.checked[q.id], k = e.key;
  if (S.exam && (k === 'f' || k === 'F')) { S.exam.flags[q.id] = !S.exam.flags[q.id]; renderSession(); return; }
  if (S.finished) return;
  if (/^[a-hA-H]$/.test(k)) { pick(k.toUpperCase().charCodeAt(0) - 65); e.preventDefault(); }
  else if (/^[1-8]$/.test(k)) { pick(+k - 1); e.preventDefault(); }
  else if (k === 'Enter') { if (document.activeElement.tagName === 'BUTTON' && document.activeElement.dataset.action) return; (done || (S.exam && !S.exam.learn)) ? next() : checkAnswer(); e.preventDefault(); }
  else if (k === 'ArrowRight') { if (S.idx < S.questions.length - 1) { S.idx++; renderSession(); } }
  else if (k === 'ArrowLeft') prev();
});

Store.onAuthChange = u => { renderUser(); if (u) enterApp(); else if (view !== 'auth') renderAuth('login'); };
Store.onRecovery = () => renderRecovery();
Store.init().then(enterApp, e => { console.error(e); enterApp(); });
