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
  create: (body, media_url) => api('/posts', { method: 'POST', body: JSON.stringify({ body, media_url }) }),
  react: (postId, shortcode) => api(`/posts/${postId}/react`, { method: 'POST', body: JSON.stringify({ shortcode }) }),
  comments: (postId) => api(`/posts/${postId}/comments`),
  comment: (postId, body) => api(`/posts/${postId}/comments`, { method: 'POST', body: JSON.stringify({ body }) }),
};

export const DMs = {
  createWith: (with_username) => api('/dms', { method: 'POST', body: JSON.stringify({ with_username }) }),
  createGroup: (name, member_usernames) => api('/groups', { method: 'POST', body: JSON.stringify({ name, member_usernames }) }),
};

export const Channels = {
  list: () => api('/channels'),
};

export const Servers = {
  create: (name, accent_color_top, accent_color_bottom) =>
    api('/servers', { method: 'POST', body: JSON.stringify({ name, accent_color_top, accent_color_bottom }) }),
  list: () => api('/servers'),
  channels: (serverId) => api(`/servers/${serverId}/channels`),
  createChannel: (serverId, name) => api(`/servers/${serverId}/channels`, { method: 'POST', body: JSON.stringify({ name }) }),
  join: (invite_code) => api('/servers/join', { method: 'POST', body: JSON.stringify({ invite_code }) }),
};

export const Notifications = {
  list: () => api('/notifications'),
  markRead: (id) => api(`/notifications/${id}/read`, { method: 'POST' }),
  markAllRead: () => api('/notifications/read-all', { method: 'POST' }),
};

// Reads a File as base64 and uploads it, returning { url }.
// Used for avatars, banners, and post images alike.
export function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result; // "data:image/png;base64,AAAA..."
      const comma = result.indexOf(',');
      resolve(result.slice(comma + 1));
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export const Media = {
  upload: async (file) => {
    const data_base64 = await fileToBase64(file);
    return api('/media', { method: 'POST', body: JSON.stringify({ data_base64, mime: file.type }) });
  },
};
