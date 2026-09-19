'use strict';

const UPSTREAM = 'https://nanzz-music.netlify.app/api';
const TIMEOUT_MS = 20000;

function queryString(req) {
  const raw = req.query || {};
  const qs = new URLSearchParams();
  for (const [key, value] of Object.entries(raw)) {
    if (value == null) continue;
    if (Array.isArray(value)) value.forEach(v => qs.append(key, String(v)));
    else qs.set(key, String(value));
  }
  return qs.toString();
}

function setCors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,HEAD,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Access-Control-Max-Age', '86400');
}

function copyHeaders(res, headers) {
  const skip = new Set(['connection', 'content-length', 'transfer-encoding', 'content-encoding', 'host']);
  for (const [key, value] of headers.entries()) {
    if (!skip.has(key.toLowerCase())) res.setHeader(key, value);
  }
}

async function readBody(req) {
  if (req.body === undefined || req.body === null) return undefined;
  if (Buffer.isBuffer(req.body)) return req.body;
  if (typeof req.body === 'string') return req.body;
  return JSON.stringify(req.body);
}

async function proxy(req, res, endpoint) {
  setCors(res);

  if (req.method === 'OPTIONS') return res.status(204).end();

  const qs = queryString(req);
  const target = UPSTREAM + '/' + endpoint + (qs ? '?' + qs : '');
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const headers = {
      'accept': req.headers.accept || 'application/json,text/plain,*/*',
      'accept-language': req.headers['accept-language'] || 'id-ID,id;q=0.9,en;q=0.8',
      'user-agent': req.headers['user-agent'] || 'Mozilla/5.0 (Linux; Android 10) AppleWebKit/537.36 Chrome/131 Mobile Safari/537.36',
      'referer': 'https://nanzz-music.netlify.app/',
      'origin': 'https://nanzz-music.netlify.app'
    };
    if (req.headers['content-type']) headers['content-type'] = req.headers['content-type'];
    if (req.headers.authorization) headers.authorization = req.headers.authorization;

    const body = await readBody(req);
    const upstream = await fetch(target, {
      method: req.method,
      headers,
      body: ['GET', 'HEAD'].includes(req.method) ? undefined : body,
      redirect: 'follow',
      signal: controller.signal
    });

    copyHeaders(res, upstream.headers);
    setCors(res);
    res.setHeader('X-Nanz-Proxy', 'vercel');
    res.statusCode = upstream.status;

    if (req.method === 'HEAD' || !upstream.body) return res.end();

    // Stream large audio/image responses instead of buffering them in memory.
    if (typeof require('stream').Readable.fromWeb === 'function') {
      return require('stream').Readable.fromWeb(upstream.body).pipe(res);
    }

    const buffer = Buffer.from(await upstream.arrayBuffer());
    return res.end(buffer);
  } catch (err) {
    const timedOut = err && err.name === 'AbortError';
    console.error('[Nanz proxy]', endpoint, timedOut ? 'timeout' : err);
    res.statusCode = timedOut ? 504 : 502;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    return res.end(JSON.stringify({
      status: false,
      error: timedOut ? 'Upstream API timeout' : 'Upstream API tidak dapat dihubungi',
      endpoint
    }));
  } finally {
    clearTimeout(timer);
  }
}

module.exports = { proxy };
