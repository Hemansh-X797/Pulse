import { state, setState } from './state.js';

export const WS_URL = 'ws://localhost:8081';

let socket = null;
let typingTimeout = null;

export function connectWs() {
  socket = new WebSocket(WS_URL);

  socket.onopen = () => {
    setState({ wsConnected: true });
    socket.send(JSON.stringify({ op: 'auth', token: state.token }));
  };

  socket.onmessage = (evt) => {
    const msg = JSON.parse(evt.data);
    if (msg.op === 'auth_ok') {
      socket.send(JSON.stringify({ op: 'join', channel_id: state.dmChannelId }));
      socket.send(JSON.stringify({ op: 'history', channel_id: state.dmChannelId, limit: 50 }));
    } else if (msg.op === 'history') {
      setState({ messages: msg.messages.slice().reverse() });
    } else if (msg.op === 'message' && msg.channel_id === state.dmChannelId) {
      setState({ messages: [...state.messages, msg], typingUser: null });
    } else if (msg.op === 'presence') {
      const online = new Set(state.onlineUserIds);
      if (msg.online) online.add(msg.user_id); else online.delete(msg.user_id);
      setState({ onlineUserIds: online });
    } else if (msg.op === 'typing' && msg.channel_id === state.dmChannelId) {
      if (msg.username === state.me?.username) return; // ignore our own echo
      clearTimeout(typingTimeout);
      setState({ typingUser: msg.username });
      typingTimeout = setTimeout(() => setState({ typingUser: null }), 2500);
    }
  };

  socket.onclose = () => {
    setState({ wsConnected: false });
    setTimeout(() => { if (state.screen === 'app') connectWs(); }, 1500);
  };
}

export function disconnectWs() {
  if (socket) socket.close();
  socket = null;
}

export function sendChatMessage(body) {
  if (!body.trim() || !socket || socket.readyState !== WebSocket.OPEN) return;
  socket.send(JSON.stringify({ op: 'send', channel_id: state.dmChannelId, body }));
}

let lastTypingSent = 0;
export function notifyTyping() {
  if (!socket || socket.readyState !== WebSocket.OPEN) return;
  const now = Date.now();
  if (now - lastTypingSent < 1200) return; // throttle
  lastTypingSent = now;
  socket.send(JSON.stringify({ op: 'typing', channel_id: state.dmChannelId }));
}
