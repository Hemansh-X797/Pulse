import { state, setState } from '../state.js';
import { Notifications } from '../api.js';
import { timeAgo, esc } from '../utils.js';
import { icon } from '../icons.js';

const TYPE_LABEL = {
  message: 'sent a message',
  reaction: 'reacted to your post',
  comment: 'commented on your post',
};

export function renderNotificationsBell() {
  return `
  <div class="notif-wrap">
    <button class="notif-bell" id="notif-bell" aria-label="Notifications" aria-haspopup="true" aria-expanded="${state.notificationsOpen}">
      ${icon('bell', 17)}
      ${state.unreadNotifications > 0 ? `<span class="notif-dot"></span>` : ''}
    </button>
    ${state.notificationsOpen ? renderPanel() : ''}
  </div>`;
}

function renderPanel() {
  return `
  <div class="notif-panel" role="menu">
    <div class="notif-panel-head">
      <span>Notifications</span>
      ${state.notifications.some(n => !n.read) ? `<button class="notif-mark-all" id="notif-mark-all">Mark all read</button>` : ''}
    </div>
    <div class="notif-panel-list">
      ${state.notifications.length === 0 ? `<div class="notif-empty">You're all caught up.</div>` : ''}
      ${state.notifications.map(n => `
        <div class="notif-row ${n.read ? '' : 'unread'}" data-notif-id="${n.id}">
          <div class="notif-row-text">
            <b>${esc(n.actor_username)}</b> ${TYPE_LABEL[n.type] || n.type}
            ${n.type === 'message' && n.body ? `<div class="notif-row-body">${esc(n.body)}</div>` : ''}
          </div>
          <span class="notif-row-time mono">${timeAgo(n.created_at)}</span>
        </div>
      `).join('')}
    </div>
  </div>`;
}

export function wireNotifications() {
  const bell = document.getElementById('notif-bell');
  if (!bell) return;

  bell.onclick = async (e) => {
    e.stopPropagation();
    const opening = !state.notificationsOpen;
    if (opening) {
      const { notifications, unread } = await Notifications.list();
      setState({ notifications, unreadNotifications: unread, notificationsOpen: true });
    } else {
      setState({ notificationsOpen: false });
    }
  };

  document.addEventListener('click', () => {
    if (state.notificationsOpen) setState({ notificationsOpen: false });
  }, { once: true });

  const markAll = document.getElementById('notif-mark-all');
  if (markAll) {
    markAll.onclick = async (e) => {
      e.stopPropagation();
      await Notifications.markAllRead();
      setState({ notifications: state.notifications.map(n => ({ ...n, read: true })), unreadNotifications: 0 });
    };
  }

  document.querySelectorAll('[data-notif-id]').forEach(el => {
    el.onclick = async (e) => {
      e.stopPropagation();
      const id = Number(el.dataset.notifId);
      await Notifications.markRead(id);
      setState({
        notifications: state.notifications.map(n => n.id === id ? { ...n, read: true } : n),
        unreadNotifications: Math.max(0, state.unreadNotifications - 1),
      });
    };
  });
}
