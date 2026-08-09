import { state, setState } from '../state.js';
import { Servers } from '../api.js';
import { switchChannel } from '../ws.js';
import { initials, showToast } from '../utils.js';
import { icon } from '../icons.js';

export function renderRail() {
  return `
  <nav class="rail" aria-label="Servers">
    <button class="rail-item rail-home ${state.activeServerId === null ? 'active' : ''}" id="rail-home" aria-label="Home" title="Home">
      ${icon('house', 20)}
    </button>
    <div class="rail-divider" role="separator"></div>
    <div class="rail-scroll">
      ${state.servers.map(s => `
        <button class="rail-item rail-server ${state.activeServerId === s.id ? 'active' : ''}"
                data-server="${s.id}" aria-label="${escAttr(s.name)}" title="${escAttr(s.name)}"
                style="background: linear-gradient(150deg, ${s.accent_color_top}, ${s.accent_color_bottom});">
          ${initials(s.name)}
        </button>
      `).join('')}
    </div>
    <button class="rail-item rail-add" id="rail-add" aria-label="Add or join a server" title="Add a server">
      <span aria-hidden="true">+</span>
    </button>
  </nav>`;
}

function escAttr(s) {
  return (s || '').replace(/"/g, '&quot;');
}

export function wireRail() {
  document.getElementById('rail-home').onclick = () => {
    setState({ activeServerId: null, activeServerChannels: [], activeServerChannelId: null, tab: 'feed' });
  };

  document.querySelectorAll('[data-server]').forEach(el => {
    el.onclick = async () => {
      const serverId = Number(el.dataset.server);
      const { channels } = await Servers.channels(serverId);
      const firstChannel = channels[0];
      setState({
        activeServerId: serverId, activeServerChannels: channels,
        activeServerChannelId: firstChannel?.id ?? null, tab: 'dm',
      });
      if (firstChannel) switchChannel(firstChannel.id);
    };
  });

  document.getElementById('rail-add').onclick = async () => {
    const choice = prompt('Create a new server: type a name.\nJoin one instead: paste an invite code.');
    if (!choice) return;
    try {
      // Heuristic: invite codes are our own random_hex(6) = 12 hex chars, no spaces.
      const looksLikeInvite = /^[0-9a-f]{8,16}$/i.test(choice.trim());
      if (looksLikeInvite) {
        const r = await Servers.join(choice.trim());
        showToast(`Joined ${r.name}`);
      } else {
        await Servers.create(choice.trim());
        showToast(`Created ${choice.trim()}`);
      }
      const { servers } = await Servers.list();
      setState({ servers });
    } catch (e) {
      showToast(e.message);
    }
  };
}
