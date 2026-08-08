import { refreshUnreadBadge } from './components/sidebar.js';

let timer = null;

export function startUnreadPolling() {
  refreshUnreadBadge();
  clearInterval(timer);
  timer = setInterval(refreshUnreadBadge, 6000);
}

export function stopUnreadPolling() {
  clearInterval(timer);
  timer = null;
}
