import { state } from './state.js';

export const API_BASE = 'http://localhost:8080';

export async function api(path, opts = {}) {
  const headers = { 'Content-Type': 'application/json', ...(opts.headers || {}) };
  if (state.token) headers['Authorization'] = 'Bearer ' + state.token;
  const res = await fetch(API_BASE + path, { ...opts, headers });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error || 'request failed');
  return json;
}

export const Auth = {
  signup: (username, password, display_name) =>
    api('/signup', { method: 'POST', body: JSON.stringify({ username, password, display_name }) }),
  login: (username, password) =>
    api('/login', { method: 'POST', body: JSON.stringify({ username, password }) }),
  me: () => api('/me'),
  updateProfile: (fields) => api('/me', { method: 'PATCH', body: JSON.stringify(fields) }),
};

export const Feed = {
  list: () => api('/feed'),
  create: (body) => api('/posts', { method: 'POST', body: JSON.stringify({ body }) }),
  react: (postId, shortcode) => api(`/posts/${postId}/react`, { method: 'POST', body: JSON.stringify({ shortcode }) }),
  comments: (postId) => api(`/posts/${postId}/comments`),
  comment: (postId, body) => api(`/posts/${postId}/comments`, { method: 'POST', body: JSON.stringify({ body }) }),
};

export const DMs = {
  createWith: (with_username) => api('/dms', { method: 'POST', body: JSON.stringify({ with_username }) }),
  createGroup: (name, member_usernames) => api('/groups', { method: 'POST', body: JSON.stringify({ name, member_usernames }) }),
};
