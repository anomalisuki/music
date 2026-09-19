const UPSTREAM = 'https://nanzz-music.netlify.app/api';

export const config = {
  runtime: 'nodejs',
  maxDuration: 60,
};

function cleanHeaders(headers) {
  const out = {};
  for (const [k, v] of headers.entries()) {
    const key = k.toLowerCase();
    if (['connection','content-length','transfer-encoding','host'].includes(key)) continue;
    out[k] = v;
  }
  return out;
}

export default async function handler(req, res) {
  const path = Array.isArray(req.query.path) ? req.query.path.join('/') : (req.query.path || '');
  const qs = new URLSearchParams();
  for (const [key, value] of Object.entries(req.query)) {
    if (key === 'path') continue;
    if (Array.isArray(value)) value.forEach(v => qs.append(key, v));
    else if (value != null) qs.set(key, value);
  }

  const target = `${UPSTREAM}/${path}${qs.toString() ? '?' + qs.toString() : ''}`;

  const headers = {
    'accept': req.headers.accept || '*/*',
    'user-agent': req.headers['user-agent'] || 'NanzMusify-Vercel-Proxy/1.0',
  };
  if (req.headers['content-type']) headers['content-type'] = req.headers['content-type'];
  if (req.headers.authorization) headers.authorization = req.headers.authorization;

  let body;
  if (!['GET', 'HEAD'].includes(req.method)) {
    if (typeof req.body === 'string') body = req.body;
    else if (req.body !== undefined) body = JSON.stringify(req.body);
  }

  try {
    const upstream = await fetch(target, {
      method: req.method,
      headers,
      body,
      redirect: 'follow',
    });

    const responseHeaders = cleanHeaders(upstream.headers);
    responseHeaders['access-control-allow-origin'] = '*';
    responseHeaders['access-control-allow-methods'] = 'GET,POST,PUT,PATCH,DELETE,OPTIONS';
    responseHeaders['access-control-allow-headers'] = 'Content-Type, Authorization';

    Object.entries(responseHeaders).forEach(([k,v]) => res.setHeader(k,v));
    res.statusCode = upstream.status;

    if (req.method === 'HEAD') return res.end();
    const buffer = Buffer.from(await upstream.arrayBuffer());
    return res.end(buffer);
  } catch (err) {
    console.error('Nanz proxy error:', err);
    return res.status(502).json({
      status: false,
      error: 'Upstream API tidak dapat dihubungi',
      detail: process.env.NODE_ENV === 'development' ? String(err) : undefined,
    });
  }
}
