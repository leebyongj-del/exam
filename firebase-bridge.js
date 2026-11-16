// 고사 운영 도우미 — Firebase 연결
// firebase-config.js에 설정값이 있으면 Firebase(공유 저장소)를 쓰고, 없으면 이 브라우저에만 저장합니다.
// 로그인 화면은 없습니다. 접속하면 Firebase '익명 로그인'이 화면 뒤에서 자동으로 이루어집니다.
const SDK = 'https://www.gstatic.com/firebasejs/10.12.2/';
const done = p => window.__gosaResolve(p || {});
const local = why => { window.GOSA_STANDALONE = true; if (why) window.GOSA_FB_ERROR = why; done({}); };

async function sha256(t) {
  const b = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(t));
  return [...new Uint8Array(b)].map(x => x.toString(16).padStart(2, '0')).join('');
}
const H = pin => sha256('gosa-fb-v1:' + pin);

(async () => {
  let cfg = null;
  try { cfg = (await import('./firebase-config.js')).firebaseConfig; } catch (x) {}
  if (!cfg || !cfg.apiKey || /여기에/.test(cfg.apiKey)) return local('');

  try {
    const [{ initializeApp }, A, F] = await Promise.all([
      import(SDK + 'firebase-app.js'), import(SDK + 'firebase-auth.js'), import(SDK + 'firebase-firestore.js'),
    ]);
    const app = initializeApp(cfg);
    const auth = A.getAuth(app), fs = F.getFirestore(app);
    const user = await new Promise((res, rej) => {
      const un = A.onAuthStateChanged(auth, u => { if (u) { un(); res(u); } });
      A.signInAnonymously(auth).catch(rej);
    });

    // ── 앱이 쓰는 저장소 모양(doc / collection / where / onSnapshot)을 Firestore에 연결
    const wrap = s => ({ id: s.id, exists: s.exists(), data: () => s.data(), metadata: { fromCache: s.metadata.fromCache, hasPendingWrites: s.metadata.hasPendingWrites } });
    const err = f => e => f && f({ code: e.code === 'permission-denied' ? 'invalid_argument' : 'unavailable', message: e.message });
    const dref = p => F.doc(fs, ...p.split('/'));
    const dbDoc = p => ({
      id: p.split('/').pop(), path: p,
      get: async () => wrap(await F.getDoc(dref(p))),
      set: d => F.setDoc(dref(p), d),
      update: d => F.setDoc(dref(p), d, { merge: true }),
      delete: () => F.deleteDoc(dref(p)),
      onSnapshot: (next, e) => F.onSnapshot(dref(p), s => next(wrap(s)), err(e)),
    });
    const dbQuery = (path, cons) => ({
      where: (f, op, v) => dbQuery(path, cons.concat([F.where(f, op, v)])),
      orderBy() { return this; }, limit() { return this; },
      get: async () => { const s = await F.getDocs(F.query(F.collection(fs, ...path.split('/')), ...cons)); return { docs: s.docs.map(wrap), size: s.size, empty: s.empty }; },
      onSnapshot: (next, e) => F.onSnapshot(F.query(F.collection(fs, ...path.split('/')), ...cons), s => next({ docs: s.docs.map(wrap), size: s.size, empty: s.empty, metadata: { fromCache: s.metadata.fromCache } }), err(e)),
      doc: id => dbDoc(path + '/' + id),
    });
    const db = { doc: dbDoc, collection: p => dbQuery(p, []) };
    const downloads = { save: async ({ filename, data }) => {
      const blob = data instanceof Blob ? data : new Blob([data]);
      const url = URL.createObjectURL(blob), a = document.createElement('a');
      a.href = url; a.download = filename; document.body.appendChild(a); a.click();
      setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 1500);
      return { status: 'saved' };
    } };

    // ── 관리자 번호: 확인은 Firebase 보안 규칙이 함 (firestore.rules 참고)
    const pubRef = dref('settings/public'), secRef = dref('secret/admin'), meRef = dref('adminUids/' + user.uid);
    const pub = async () => { const s = await F.getDoc(pubRef); return s.exists() ? s.data() : null; };
    const P = {
      directHwpx: true,
      isPinSet: async () => { const p = await pub(); return !!(p && p.pinSet); },
      amAdmin: async () => {
        const p = await pub(); if (!p) return false;
        let m = null; try { m = await F.getDoc(meRef); } catch (x) { return false; }
        return !!(m && m.exists() && m.data().v === p.v);
      },
      registerAdmin: async pin => {
        const p = await pub(); if (!p) return false;
        try { await F.setDoc(meRef, { pin: await H(pin), v: p.v, at: Date.now() }); return true; }
        catch (e) { if (e.code === 'permission-denied') return false; throw e; }
      },
      initPin: async pin => {
        const h = await H(pin), b = F.writeBatch(fs);
        b.set(secRef, { pin: h, v: 1 }); b.set(pubRef, { pinSet: true, v: 1 }); b.set(meRef, { pin: h, v: 1, at: Date.now() });
        await b.commit();
      },
      changePin: async (cur, nw) => {
        if (!(await P.registerAdmin(cur))) return false;
        const p = await pub(), v = p.v + 1, h = await H(nw), b = F.writeBatch(fs);
        b.set(secRef, { pin: h, v }); b.set(pubRef, { pinSet: true, v }); b.set(meRef, { pin: h, v, at: Date.now() });
        await b.commit(); return true;
      },
    };
    window.GOSA_PLATFORM = P;
    done({ db, downloads, user: { id: async () => user.uid, isOwner: async () => false, canEdit: async () => true, can: () => null } });
  } catch (e) {
    console.error(e);
    const c = e && e.code || '';
    local(c === 'auth/operation-not-allowed' || c === 'auth/admin-restricted-operation' ? 'Firebase에서 익명 로그인이 꺼져 있습니다' : (c || '인터넷 연결 또는 설정값을 확인해 주세요'));
  }
})();
