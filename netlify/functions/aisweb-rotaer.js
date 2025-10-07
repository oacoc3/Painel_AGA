// netlify/functions/aisweb-rotaer.js
// Proxy seguro para consultar o resumo do ROTAER na API AISWEB.
// Permite configurar endpoint/token via variáveis de ambiente e evita CORS no frontend.

const DEFAULT_ENDPOINT = 'https://aisweb.decea.mil.br/api/?p=rotaer&icao={{ICAO}}';
const DEFAULT_TIMEOUT_MS = Number(process.env.AISWEB_TIMEOUT_MS || 12000) || 12000;

function corsHeaders(extra = {}) {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    ...extra,
  };
}

function json(statusCode, payload, extraHeaders = {}) {
  return {
    statusCode,
    headers: corsHeaders({ 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...extraHeaders }),
    body: JSON.stringify(payload),
  };
}

function appendToken(urlStr) {
  const token = process.env.AISWEB_TOKEN || process.env.AISWEB_API_TOKEN;
  if (!token) return urlStr;
  if (/[?&]token=/.test(urlStr)) return urlStr;
  const separator = urlStr.includes('?') ? '&' : '?';
  return `${urlStr}${separator}token=${encodeURIComponent(token)}`;
}

function buildAiswebUrl(icao) {
  const raw = process.env.AISWEB_ROTAER_URL || DEFAULT_ENDPOINT;
  if (raw.includes('{{ICAO}}')) {
    const replaced = raw.replace('{{ICAO}}', encodeURIComponent(icao));
    return appendToken(replaced);
  }
  try {
    const url = new URL(raw);
    if (!url.searchParams.has('icao')) url.searchParams.set('icao', icao);
    return appendToken(url.toString());
  } catch (_) {
    const separator = raw.includes('?') ? '&' : '?';
    return appendToken(`${raw}${separator}icao=${encodeURIComponent(icao)}`);
  }
}

function buildRequestHeaders() {
  const headers = {
    Accept: 'application/json, application/xml;q=0.9, text/plain;q=0.8',
  };

  const basicRaw = process.env.AISWEB_BASIC_AUTH;
  const user = process.env.AISWEB_USERNAME;
  const pass = process.env.AISWEB_PASSWORD;
  if (basicRaw) {
    const value = basicRaw.includes(':') ? Buffer.from(basicRaw, 'utf8').toString('base64') : basicRaw;
    headers.Authorization = `Basic ${value}`;
  } else if (user && pass) {
    headers.Authorization = `Basic ${Buffer.from(`${user}:${pass}`, 'utf8').toString('base64')}`;
  }

  if (process.env.AISWEB_API_KEY) {
    headers['x-api-key'] = process.env.AISWEB_API_KEY;
  }

  return headers;
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 204,
      headers: corsHeaders(),
      body: '',
    };
  }

  if (event.httpMethod !== 'GET') {
    return json(405, { ok: false, error: 'Method not allowed' });
  }

  const params = event.queryStringParameters || {};
  const rawIcao = params.icao || params.oaci || '';
  const icao = String(rawIcao || '').trim().toUpperCase();

  if (!icao) {
    return json(400, { ok: false, error: 'Parâmetro "icao" é obrigatório.' });
  }

  try {
    const url = buildAiswebUrl(icao);
    const headers = buildRequestHeaders();
    const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
    let timeoutId = null;
    if (controller) {
      timeoutId = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);
    }

    let response;
    try {
      response = await fetch(url, { headers, signal: controller ? controller.signal : undefined });
    } finally {
      if (timeoutId) clearTimeout(timeoutId);
    }

    const text = await response.text();
    let data = null;
    if (text) {
      try { data = JSON.parse(text); } catch (_) { data = null; }
    }

    if (!response.ok) {
      const message = data?.error || data?.message || text || `AISWEB respondeu com status ${response.status}.`;
      return json(response.status, { ok: false, error: message, status: response.status, data: data ?? text });
    }

    const payload = {
      ok: true,
      icao,
      source: url,
      fetched_at: new Date().toISOString(),
      status: response.status,
      data: data ?? text,
    };

    return json(200, payload);
  } catch (err) {
    const isAbort = err?.name === 'AbortError';
    const message = isAbort ? 'Tempo excedido ao consultar o AISWEB.' : `Falha ao consultar o AISWEB: ${err?.message || err}`;
    return json(isAbort ? 504 : 502, { ok: false, error: message });
  }
};
