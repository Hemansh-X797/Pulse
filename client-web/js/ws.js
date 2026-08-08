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
      return;
    }

    if (msg.op === 'history') {
      setState({ messages: msg.messages.slice().reverse() });
      return;
    }

    if (msg.op === 'message' && msg.channel_id === state.dmChannelId) {
      setState({ messages: [...state.messages, msg], typingUser: null });
      // Auto-mark-read since the channel is open and visible right now.
      if (msg.sender_id !== state.me?.id) markRead(msg.id);
      return;
    }

    if (msg.op === 'message_edited' && msg.channel_id === state.dmChannelId) {
      setState({
        messages: state.messages.map(m => m.id === msg.id ? { ...m, body: msg.body, edited_at: msg.edited_at } : m),
      });
      return;
    }

    if (msg.op === 'message_deleted' && msg.channel_id === state.dmChannelId) {
      setState({
        messages: state.messages.map(m => m.id === msg.id ? { ...m, deleted: true, body: '' } : m),
      });
      return;
    }

    if (msg.op === 'read_receipt' && msg.channel_id === state.dmChannelId) {
      if (msg.user_id === state.me?.id) return;
      setState({ lastReadByOthers: msg.message_id });
      return;
    }

    if (msg.op === 'presence') {
      const online = new Set(state.onlineUserIds);
      if (msg.online) online.add(msg.user_id); else online.delete(msg.user_id);
      setState({ onlineUserIds: online });
      return;
    }

    if (msg.op === 'typing' && msg.channel_id === state.dmChannelId) {
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

function send(payload) {
  if (!socket || socket.readyState !== WebSocket.OPEN) return;
  socket.send(JSON.stringify(payload));
}

export function sendChatMessage(body, replyToId = 0) {
  if (!body.trim()) return;
  send({ op: 'send', channel_id: state.dmChannelId, body, reply_to_id: replyToId });
}

export function editMessage(messageId, body) {
  if (!body.trim()) return;
  send({ op: 'edit', channel_id: state.dmChannelId, message_id: messageId, body });
}

export function deleteMessage(messageId) {
  send({ op: 'delete', channel_id: state.dmChannelId, message_id: messageId });
}

export function markRead(messageId) {
  send({ op: 'read', channel_id: state.dmChannelId, message_id: messageId });
}

let lastTypingSent = 0;
export function notifyTyping() {
  const now = Date.now();
  if (now - lastTypingSent < 1200) return; // throttle
  lastTypingSent = now;
  send({ op: 'typing', channel_id: state.dmChannelId });
}
