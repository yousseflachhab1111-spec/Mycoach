// Netlify Function: /api/gif?exercise=lunge&q=lunge[&id=EIeI8Vf][&raw=1]
// Server-side proxy for the free ExerciseDB v1 API (no CORS problems on servers).
// Returns JSON { url, name } or, with raw=1, the GIF bytes themselves.
// No npm dependencies. Requires Node 18+ (global fetch) - Netlify's default.

const BASES = ['https://oss.exercisedb.dev', 'https://exercisedb-api.vercel.app'];
const MONTH = 60 * 60 * 24 * 30;
const CORS = { 'access-control-allow-origin': '*', 'access-control-allow-methods': 'GET, OPTIONS' };
const mem = new Map(); // warm-instance cache: cacheKey -> { url, name }

const json = (status, body, extra) => ({
  statusCode: status,
  headers: Object.assign({ 'content-type': 'application/json; charset=utf-8', ...CORS }, extra || {}),
  body: JSON.stringify(body),
});

const norm = x => String(x || '').toLowerCase().replace(/[-_]/g, ' ').replace(/[^a-z0-9 ]/g, '').trim();

function pick(list, term) {
  const t = norm(term), tw = t.split(' ').filter(Boolean);
  let best = null, bs = 0;
  (list || []).forEach(it => {
    if (!it || typeof it.gifUrl !== 'string' || it.gifUrl.indexOf('https://') !== 0) return;
    const n = norm(it.name), nw = n.split(' ');
    let sc = n === t ? 100 : n.indexOf(t) === 0 ? 70 : n.indexOf(t) >= 0 ? 55
      : (tw.filter(w => nw.indexOf(w) >= 0).length / (tw.length || 1)) * 40;
    const eq = it.equipments || [];
    if (eq.indexOf('body weight') >= 0 || eq.indexOf('bodyweight') >= 0) sc += 10;
    sc -= n.length * 0.1;
    if (sc > bs) { bs = sc; best = it; }
  });
  return bs >= 30 ? best : null;
}

const listOf = j => Array.isArray(j) ? j : Array.isArray(j && j.data) ? j.data
  : (j && j.data && Array.isArray(j.data.exercises)) ? j.data.exercises : (j && Array.isArray(j.exercises)) ? j.exercises : [];

// Returns { ok:true, json } or { ok:false, status } (status 0 = network/timeout)
async function upstream(path, ms) {
  let last = { ok: false, status: 0 };
  for (const base of BASES) {
    const url = base + path, ctl = new AbortController(), t = setTimeout(() => ctl.abort(), ms || 6000);
    try {
      const r = await fetch(url, { signal: ctl.signal, headers: { accept: 'application/json' } });
      clearTimeout(t);
      console.log('[gif] upstream', r.status, url);
      if (r.ok) { try { return { ok: true, json: await r.json() }; } catch (e) { last = { ok: false, status: 502 }; continue; } }
      if (r.status === 429) return { ok: false, status: 429 };
      last = { ok: false, status: r.status };
    } catch (e) { clearTimeout(t); console.log('[gif] upstream FAILED', url, e.name, e.message); last = { ok: false, status: 0 }; }
  }
  return last;
}

async function resolve(exercise, q, id) {
  const ck = id + '|' + q + '|' + exercise;
  if (mem.has(ck)) return { hit: mem.get(ck) };
  let worst = null;
  const note = s => { if (s && s !== 404) worst = worst || s; };
  if (id) {
    const r = await upstream('/api/v1/exercises/' + encodeURIComponent(id));
    if (r.ok) { const d = (r.json && r.json.data) || r.json; if (d && typeof d.gifUrl === 'string' && d.gifUrl.indexOf('https://') === 0) { const h = { url: d.gifUrl, name: d.name || '' }; mem.set(ck, h); return { hit: h }; } }
    else note(r.status);
  }
  const term = q || exercise;
  if (term) {
    let r = await upstream('/api/v1/exercises/search?q=' + encodeURIComponent(term) + '&limit=10');
    let list = r.ok ? listOf(r.json) : [];
    if (!r.ok) note(r.status);
    if (!list.length) { r = await upstream('/api/v1/exercises?search=' + encodeURIComponent(term) + '&limit=10'); if (r.ok) list = listOf(r.json); else note(r.status); }
    const b = pick(list, term);
    console.log('[gif] term=%j candidates=%d pick=%j', term, list.length, b && b.name);
    if (b) { const h = { url: b.gifUrl, name: b.name }; mem.set(ck, h); return { hit: h }; }
    if (list.length || (r && r.ok)) return { status: 404 };
  }
  return { status: worst === 429 ? 429 : (worst === 401 || worst === 403) ? 401 : 502 };
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: CORS, body: '' };
  const p = event.queryStringParameters || {};
  const exercise = String(p.exercise || '').slice(0, 60), q = String(p.q || '').slice(0, 80), id = String(p.id || '').slice(0, 40);
  if (!exercise && !q && !id) return json(400, { error: 'missing exercise' });
  if (id && !/^[A-Za-z0-9_-]+$/.test(id)) return json(400, { error: 'bad id' });

  let out;
  try { out = await resolve(exercise, q, id); } catch (e) { console.log('[gif] error', e); return json(502, { error: 'upstream' }); }
  if (!out.hit) {
    const map = { 404: 'notfound', 401: 'auth', 429: 'ratelimit', 502: 'upstream' };
    return json(out.status, { error: map[out.status] || 'upstream' }, out.status === 404 ? { 'cache-control': 'public, max-age=3600' } : { 'cache-control': 'no-store' });
  }
  const cache = { 'cache-control': 'public, max-age=' + MONTH };

  if (p.raw === '1') { // stream the GIF bytes through us (in case hotlinking is blocked)
    let host = ''; try { host = new URL(out.hit.url).hostname; } catch (e) {}
    if (!/(^|\.)exercisedb\.dev$/.test(host)) return json(400, { error: 'host not allowed' });
    try {
      const ctl = new AbortController(), t = setTimeout(() => ctl.abort(), 9000);
      const r = await fetch(out.hit.url, { signal: ctl.signal }); clearTimeout(t);
      console.log('[gif] raw', r.status, out.hit.url);
      if (!r.ok) return json(r.status === 404 ? 404 : 502, { error: r.status === 404 ? 'notfound' : 'upstream' });
      const buf = Buffer.from(await r.arrayBuffer());
      if (buf.length > 5.5 * 1024 * 1024) return json(502, { error: 'too large' });
      return { statusCode: 200, isBase64Encoded: true, body: buf.toString('base64'), headers: Object.assign({ 'content-type': r.headers.get('content-type') || 'image/gif', ...CORS }, cache) };
    } catch (e) { return json(502, { error: 'upstream' }); }
  }
  return json(200, { url: out.hit.url, name: out.hit.name }, cache);
};
