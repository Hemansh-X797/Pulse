import { state, setState } from '../state.js';
import { disconnectWs } from '../ws.js';
import { Channels } from '../api.js';
import { initials, gradientStyle, esc, mediaUrl } from '../utils.js';
import { icon } from '../icons.js';

export function renderSidebar() {
  const me = state.me;
  const avatarStyle = me.avatar_url
    ? `background-image: url('${mediaUrl(me.avatar_url)}'); background-size: cover; background-position: center;`
    : gradientStyle(me);
  return `
  <div class="sidebar">
    <div class="sidebar-mark">
      <span class="sidebar-mark-dot"></span>
      <span class="sidebar-logo">Pulse</span>
    </div>
    <div class="nav-section">
      <div class="nav-label">Home</div>
      <div class="nav-item ${state.tab === 'feed' ? 'active' : ''}" data-tab="feed">
        ${icon('house', 15)} Feed
      </div>
      <div class="nav-item ${state.tab === 'dm' ? 'active' : ''}" data-tab="dm">
        ${icon('messageCircle', 15)} Direct Messages
        ${state.unreadChannels > 0 ? `<span class="unread-badge">${state.unreadChannels > 9 ? '9+' : state.unreadChannels}</span>` : ''}
      </div>
      <div class="nav-item ${state.tab === 'profile' ? 'active' : ''}" data-tab="profile">
        ${icon('userRound', 15)} Edit Profile
      </div>
    </div>
    <div class="sidebar-footer" id="footer-logout">
      <div class="avatar-wrap">
        <div class="avatar" style="${avatarStyle}">${me.avatar_url ? '' : initials(me.display_name)}</div>
        <span class="presence-dot ${state.wsConnected ? 'online' : ''}"></span>
      </div>
      <div class="who-block">
        <div class="who">${esc(me.display_name)}</div>
        <div class="status">${esc(me.status_text) || '@' + esc(me.username)}</div>
      </div>
      <span class="logout-icon">${icon('logOut', 15)}</span>
    </div>
  </div>`;
}

export async function refreshUnreadBadge() {
  try {
    const { channels } = await Channels.list();
    const total = channels.reduce((sum, c) => sum + c.unread, 0);
    setState({ unreadChannels: total });
  } catch (e) {
    // non-fatal — badge just won't update this cycle
  }
}

export function wireSidebar() {
  document.querySelectorAll('.nav-item[data-tab]').forEach(el => {
    el.onclick = () => setState({ tab: el.dataset.tab });
  });
  document.getElementById('footer-logout').onclick = () => {
    localStorage.removeItem('pulse_token');
    disconnectWs();
    setState({ token: null, me: null, screen: 'login', tab: 'feed' });
  };
}
