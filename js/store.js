// Lapisan data: Supabase (cloud, per akun) atau localStorage (mode lokal).
// Antarmuka sama, jadi app.js tidak peduli mana yang aktif.
const Store = (() => {
  const cfg = window.APP_CONFIG || {};
  const cloud = !!(cfg.SUPABASE_URL && cfg.SUPABASE_ANON_KEY && window.supabase);
  const sb = cloud ? window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY) : null;
  const LOCAL_KEY = 'clouderaStudyV4:local';

  // ---------- helper lokal ----------
  function localLoad() {
    try {
      const d = JSON.parse(localStorage.getItem(LOCAL_KEY) || 'null');
      if (d) return d;
    } catch (e) {}
    // migrasi dari versi lama (v3: {wrong:[], history:[]})
    const out = { answers: [], sessions: [] };
    try {
      const old = JSON.parse(localStorage.getItem('clouderaStudyV3') || 'null');
      if (old) {
        (old.wrong || []).forEach(id => out.answers.push({ q: id, ok: false, t: Date.now() }));
        (old.history || []).forEach(h => out.sessions.push({ mode: 'migrated', checked: h.checked, graded: h.graded, correct: h.correct, dur: 0, t: new Date(h.date).getTime() }));
      }
    } catch (e) {}
    return out;
  }
  function localSave(d) { try { localStorage.setItem(LOCAL_KEY, JSON.stringify(d)); } catch (e) {} }

  // ---------- ringkasan progres (dipakai kedua mode) ----------
  function summarize(answers, sessions) {
    // answers: [{q, ok, t}] ; urut apa saja
    const sorted = [...answers].sort((a, b) => a.t - b.t);
    const last = {}, attempts = {}, right = {};
    for (const a of sorted) {
      last[a.q] = a.ok;
      attempts[a.q] = (attempts[a.q] || 0) + 1;
      if (a.ok) right[a.q] = (right[a.q] || 0) + 1;
    }
    return { last, attempts, right, sessions: [...sessions].sort((a, b) => b.t - a.t), totalAnswers: answers.length, totalRight: answers.filter(a => a.ok).length };
  }

  const api = {
    mode: cloud ? 'cloud' : 'local',
    user: null,
    _answers: [],
    _sessions: [],

    // ---------- auth ----------
    async init() {
      if (!cloud) return null;
      const { data } = await sb.auth.getSession();
      api.user = data.session ? api._mapUser(data.session.user) : null;
      sb.auth.onAuthStateChange((evt, session) => {
        if (evt === 'PASSWORD_RECOVERY') { api.user = session ? api._mapUser(session.user) : null; if (api.onRecovery) api.onRecovery(); return; }
        const was = api.user && api.user.id;
        api.user = session ? api._mapUser(session.user) : null;
        if ((api.user && api.user.id) !== was && api.onAuthChange) api.onAuthChange(api.user);
      });
      return api.user;
    },
    _mapUser(u) { return { id: u.id, email: u.email, name: (u.user_metadata && u.user_metadata.name) || (u.email || '').split('@')[0] }; },
    async signUp(email, password, name) {
      const { data, error } = await sb.auth.signUp({ email, password, options: { data: { name } } });
      if (error) throw error;
      // jika konfirmasi email aktif, session null sampai user klik link
      return { needsConfirm: !data.session };
    },
    async signIn(email, password) {
      const { error } = await sb.auth.signInWithPassword({ email, password });
      if (error) throw error;
    },
    async signOut() {
      if (cloud) await sb.auth.signOut();
      api._answers = []; api._sessions = []; api.admin = false; api.bank = null;
    },
    async resetPassword(email) {
      const { error } = await sb.auth.resetPasswordForEmail(email, { redirectTo: location.href.split('#')[0] });
      if (error) throw error;
    },
    async updatePassword(password) {
      const { error } = await sb.auth.updateUser({ password });
      if (error) throw error;
    },

    // ---------- progres ----------
    async load() {
      if (!cloud) {
        const d = localLoad();
        api._answers = d.answers; api._sessions = d.sessions;
      } else {
        const [a, s] = await Promise.all([
          sb.from('answers').select('question_id,is_correct,created_at').order('created_at', { ascending: false }).limit(5000),
          sb.from('sessions').select('mode,checked,graded,correct,duration_sec,created_at').order('created_at', { ascending: false }).limit(200)
        ]);
        if (a.error) throw a.error;
        if (s.error) throw s.error;
        api._answers = a.data.map(r => ({ q: r.question_id, ok: r.is_correct, t: new Date(r.created_at).getTime() }));
        api._sessions = s.data.map(r => ({ mode: r.mode, checked: r.checked, graded: r.graded, correct: r.correct, dur: r.duration_sec, t: new Date(r.created_at).getTime() }));
      }
      return api.progress();
    },
    progress() { return summarize(api._answers, api._sessions); },

    async recordAnswer(q, ok) {
      api._answers.push({ q, ok, t: Date.now() });
      if (!cloud) return localSave({ answers: api._answers, sessions: api._sessions });
      const { error } = await sb.from('answers').insert({ question_id: q, is_correct: ok });
      if (error) throw error;
    },
    async recordSession(s) {
      api._sessions.push({ ...s, t: Date.now() });
      if (!cloud) return localSave({ answers: api._answers, sessions: api._sessions });
      const { error } = await sb.from('sessions').insert({ mode: s.mode, checked: s.checked, graded: s.graded, correct: s.correct, duration_sec: s.dur });
      if (error) throw error;
    },
    // ---------- bank soal dan persetujuan ----------
    // Cloud: soal dibaca dari tabel `questions` (RLS: hanya akun yang disetujui admin). Lokal: berkas data/question-bank.js bila ada.
    async isApproved() {
      if (!cloud) return true;
      const { data, error } = await sb.rpc('is_approved');
      if (error) throw error;
      return data === true;
    },
    async loadBank() {
      if (!cloud) {
        if (!window.BANK) await new Promise(res => { const sc = document.createElement('script'); sc.src = 'data/question-bank.js'; sc.onload = sc.onerror = res; document.head.appendChild(sc); });
        return window.BANK || [];
      }
      const { data, error } = await sb.from('questions').select('id,data').order('id');
      if (error) throw error;
      return (data || []).map(r => r.data);
    },
    // ---------- admin (RPC; dijaga di sisi database) ----------
    admin: false,
    async checkAdmin() {
      if (!cloud || !api.user) { api.admin = false; return false; }
      const { data, error } = await sb.rpc('is_admin');
      api.admin = !error && data === true;
      return api.admin;
    },
    async adminListUsers() {
      const { data, error } = await sb.rpc('admin_list_users');
      if (error) throw error;
      return data;
    },
    async adminSetApproved(username, approved) {
      const { error } = await sb.rpc('admin_set_approved', { p_username: username, p_approved: approved });
      if (error) throw error;
    },
    async adminResetPassword(username, password) {
      const { error } = await sb.rpc('admin_reset_password', { p_username: username, p_new_password: password });
      if (error) throw error;
    },
    async resetProgress() {
      api._answers = []; api._sessions = [];
      if (!cloud) return localSave({ answers: [], sessions: [] });
      const u = api.user.id;
      const [a, s] = await Promise.all([sb.from('answers').delete().eq('user_id', u), sb.from('sessions').delete().eq('user_id', u)]);
      if (a.error) throw a.error;
      if (s.error) throw s.error;
    }
  };
  return api;
})();
