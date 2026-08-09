// Minimal store: one source of truth + a render callback registered by app.js.
// No framework — modular by file boundary, not by build tooling.
export const state = {
  screen: localStorage.getItem('pulse_token') ? 'app' : 'login', // login | signup | app
  token: localStorage.getItem('pulse_token') || null,
  me: null,
  tab: 'feed',            // feed | dm | profile
  dmChannelId: 1,
  messages: [],
  onlineUserIds: new Set(),
  typingUser: null,
  wsConnected: false,
  replyTarget: null,   // { id, sender, body } — message being replied to
  editingId: null,     // message id currently being edited inline
  unreadChannels: 0,   // total unread across DM channels, for the sidebar badge

  // Servers (Discord-style spaces)
  servers: [],
  activeServerId: null,      // null = Home context (Feed/DMs/Profile)
  activeServerChannels: [],
  activeServerChannelId: null,

  // Notifications
  notifications: [],
  unreadNotifications: 0,
  notificationsOpen: false,

  posts: [],
  commentsOpen: {},
  commentsCache: {},
  authError: '',
  savedFlash: false,
};

let renderFn = () => {};
export function onStateChange(fn) { renderFn = fn; }
export function setState(patch) {
  Object.assign(state, patch);
  renderFn();
}
export function rerender() { renderFn(); }
