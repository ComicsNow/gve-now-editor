'use strict';

// Minimal fetch wrapper for route tests.
async function api(baseUrl, path, { method = 'GET', body, headers } = {}) {
  const res = await fetch(baseUrl + path, {
    method,
    headers: body !== undefined ? { 'content-type': 'application/json', ...headers } : headers,
    body: body !== undefined ? JSON.stringify(body) : undefined
  });
  const text = await res.text();
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    parsed = text;
  }
  return { status: res.status, body: parsed, headers: res.headers, text };
}

module.exports = { api };
