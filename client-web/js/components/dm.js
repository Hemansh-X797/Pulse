import { state } from '../state.js';
import { sendChatMessage, notifyTyping } from '../ws.js';
import { initials, gradientStyle, timeAgo, esc } from '../utils.js';
import { icon } from '../icons.js';

const EMOJI_HINT = [':fire:', ':heart:', ':rocket:', ':100:', ':joy:', ':thumbsup:', ':eyes:', ':clap:', ':tada:', ':skull:'];

export function renderDm() {
  return `
  <div class="topbar">
    <h2>Direct Messages</h2>
    <span class="sub mono">channel #${state.dmChannelId}</span>
    <span class="ws-status ${state.wsConnected ? 'live' : ''}" title="${state.wsConnected ? 'Connected' : 'Reconnecting…'}"></span>
  </div>
  <div class="chat-scroll" id="chat-scroll">
    ${state.messages.map(renderBubbleRow).join('')}
  </div>
  <div class="typing-row ${state.typingUser ? 'show' : ''}">
    ${state.typingUser ? `<span class="mono">${esc(state.typingUser)} is typing</span><span class="typing-dots"><i></i><i></i><i></i></span>` : ''}
  </div>
  <div class="composer">
    <div class="composer-inner">
      <input id="chat-input" placeholder="Message... try :fire: :heart: :rocket:"/>
      <button class="send-btn" id="chat-send" aria-label="Send">${icon('send', 15)}</button>
    </div>
    <div class="hint">${EMOJI_HINT.map(s => `<code class="mono">${s}</code>`).join(' ')}</div>
  </div>`;
}

function renderBubbleRow(m) {
  const mine = m.sender === state.me.username;
  return `
  <div class="msg-row ${mine ? 'mine' : ''}">
    <div class="avatar avatar-xs" style="${gradientStyle({ accent_color_top: '#6C8CFF', accent_color_bottom: '#FF6FA5' })}">${initials(m.sender)}</div>
    <div class="msg-body">
      <div class="msg-meta"><span class="msg-name">${esc(m.sender)}</span><span class="msg-time mono">${m.ts ? timeAgo(m.ts) : ''}</span></div>
      <div class="bubble ${mine ? 'mine' : ''}">${m.body}</div>
    </div>
  </div>`;
}

export function wireDm() {
  const scroll = document.getElementById('chat-scroll');
  if (scroll) scroll.scrollTop = scroll.scrollHeight;
  const input = document.getElementById('chat-input');
  const send = () => { sendChatMessage(input.value); input.value = ''; };
  document.getElementById('chat-send').onclick = send;
  input.onkeydown = (e) => { if (e.key === 'Enter') send(); };
  input.oninput = () => { if (input.value.trim()) notifyTyping(); };
}
