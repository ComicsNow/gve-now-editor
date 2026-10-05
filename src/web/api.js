'use strict';

// Thin fetch wrappers over the editor's own HTTP API.

async function request(url, options) {
  const res = await fetch(url, options);
  let data = null;
  try {
    data = await res.json();
  } catch {
    data = null;
  }
  if (!res.ok) {
    const message =
      (data && (data.errors ? data.errors.join('; ') : data.error)) || `HTTP ${res.status}`;
    const err = new Error(message);
    err.status = res.status;
    err.data = data;
    throw err;
  }
  return data;
}

const jsonPost = (url, body) =>
  request(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });

const jsonPut = (url, body) =>
  request(url, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });

const api = {
  health: () => request('/api/health'),
  listComics: ({ q = '', status = '', limit = 100, offset = 0 } = {}) =>
    request(
      `/api/comics?q=${encodeURIComponent(q)}&status=${encodeURIComponent(status)}&limit=${limit}&offset=${offset}`
    ),
  getComic: (id) => request(`/api/comics/${id}`),
  pages: (id) => request(`/api/comics/${id}/pages`),
  pageImageUrl: (id, page) => `/api/comics/${id}/page-image?page=${encodeURIComponent(page)}`,
  guided: (id) => request(`/api/comics/${id}/guided`),
  saveGuided: (id, doc) => jsonPut(`/api/comics/${id}/guided`, doc),
  resetGuided: (id) => jsonPost(`/api/comics/${id}/guided/reset`, {}),
  exportUrl: (id) => `/api/comics/${id}/export`,
  getSettings: () => request('/api/settings'),
  saveSettings: (body) => jsonPut('/api/settings', body),
  scoreImport: (file) => jsonPost('/api/import/score', { file }),
  scoreAgainst: (file, comicId) => jsonPost('/api/import/score-against', { file, comicId }),
  applyImport: (file, comicId, mode) => jsonPost('/api/import/apply', { file, comicId, mode })
};

module.exports = { api };
