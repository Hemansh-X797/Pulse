import { state, setState } from '../state.js';
import { disconnectWs, switchChannel } from '../ws.js';
import { Channels, Servers } from '../api.js';
import { initials, gradientStyle, esc, mediaUrl } from '../utils.js';
import { icon } from '../icons.js';
import { renderNotificationsBell, wireNotifications } from './notifications.js';

export function renderSidebar() {
  const me = state.me;
  const avatarStyle = me.avatar_url
    ? `background-image: url('${mediaUrl(me.avatar_url)}'); background-size: cover; background-position: center;`
    : gradientStyle(me);
  const inServer = state.activeServerId !== null;

  return `
  <div class="sidebar">
    <div class="sidebar-mark">
      <span class="sidebar-mark-dot"></span>
      <span class="sidebar-logo">${inServer ? esc(currentServerName()) : 'Pulse'}</span>
      ${renderNotificationsBell()}
    </div>
    ${inServer ? renderServerChannelList() : renderHomeNav()}
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

function currentServerName() {
  const s = state.servers.find(s => s.id === state.activeServerId);
  return s ? s.name : 'Server';
}

function renderHomeNav() {
  return `
  <div class="nav-section">
    <div class="nav-label">Home</div>
    <div class="nav-item ${state.tab === 'feed' ? 'active' : ''}" data-tab="feed" role="button" tabindex="0">
      ${icon('house', 15)} Feed
    </div>
    <div class="nav-item ${state.tab === 'dm' ? 'active' : ''}" data-tab="dm" role="button" tabindex="0">
      ${icon('messageCircle', 15)} Direct Messages
      ${state.unreadChannels > 0 ? `<span class="unread-badge">${state.unreadChannels > 9 ? '9+' : state.unreadChannels}</span>` : ''}
    </div>
    <div class="nav-item ${state.tab === 'profile' ? 'active' : ''}" data-tab="profile" role="button" tabindex="0">
      ${icon('userRound', 15)} Edit Profile
    </div>
  </div>`;
}

function renderServerChannelList() {
  return `
  <div class="nav-section">
    <div class="nav-label">Text Channels</div>
    ${state.activeServerChannels.map(c => `
      <div class="nav-item channel-item ${state.activeServerChannelId === c.id ? 'active' : ''}" data-channel="${c.id}" role="button" tabindex="0">
        <span class="channel-hash mono">#</span> ${esc(c.name)}
      </div>
    `).join('')}
    <div class="nav-item channel-add" id="add-channel-btn" role="button" tabindex="0">
      <span class="channel-hash mono">+</span> Add channel
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
    el.onkeydown = (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); el.onclick(); } };
  });

  document.querySelectorAll('[data-channel]').forEach(el => {
    el.onclick = () => {
      const channelId = Number(el.dataset.channel);
      setState({ activeServerChannelId: channelId });
      switchChannel(channelId);
    };
    el.onkeydown = (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); el.onclick(); } };
  });

  const addChannelBtn = document.getElementById('add-channel-btn');
  if (addChannelBtn) {
    addChannelBtn.onclick = async () => {
      const name = prompt('Channel name:');
      if (!name) return;
      await Servers.createChannel(state.activeServerId, name);
      const { channels } = await Servers.channels(state.activeServerId);
      setState({ activeServerChannels: channels });
    };
  }

  document.getElementById('footer-logout').onclick = () => {
    localStorage.removeItem('pulse_token');
    disconnectWs();
    setState({ token: null, me: null, screen: 'login', tab: 'feed', activeServerId: null });
  };

  wireNotifications();
}
