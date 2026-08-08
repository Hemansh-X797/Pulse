import { state, setState } from '../state.js';
import { sendChatMessage, notifyTyping, editMessage, deleteMessage } from '../ws.js';
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
  ${state.replyTarget ? `
  <div class="reply-preview">
    <div class="reply-preview-bar"></div>
    <div class="reply-preview-body">
      <span class="reply-preview-label mono">replying to ${esc(state.replyTarget.sender)}</span>
      <span class="reply-preview-text">${state.replyTarget.body}</span>
    </div>
    <button class="reply-preview-close" id="reply-cancel" aria-label="Cancel reply">&times;</button>
  </div>` : ''}
  <div class="composer">
    <div class="composer-inner">
      <input id="chat-input" placeholder="${state.replyTarget ? 'Reply...' : 'Message... try :fire: :heart: :rocket:'}"/>
      <button class="send-btn" id="chat-send" aria-label="Send">${icon('send', 15)}</button>
    </div>
    <div class="hint">${EMOJI_HINT.map(s => `<code class="mono">${s}</code>`).join(' ')}</div>
  </div>`;
}

function renderBubbleRow(m) {
  const mine = m.sender === state.me.username;
  if (m.deleted) {
    return `
    <div class="msg-row ${mine ? 'mine' : ''}">
      <div class="mini-spacer"></div>
      <div class="msg-body">
        <div class="bubble bubble-deleted mono">message deleted</div>
      </div>
    </div>`;
  }

  const isEditing = state.editingId === m.id;
  const replySnippet = m.reply_to_id
    ? state.messages.find(x => x.id === m.reply_to_id)
    : null;

  return `
  <div class="msg-row ${mine ? 'mine' : ''}" data-msg-id="${m.id}">
    <div class="avatar avatar-xs" style="${gradientStyle({ accent_color_top: '#6C8CFF', accent_color_bottom: '#FF6FA5' })}">${initials(m.sender)}</div>
    <div class="msg-body">
      <div class="msg-meta">
        <span class="msg-name">${esc(m.sender)}</span>
        <span class="msg-time mono">${m.ts ? timeAgo(m.ts) : ''}</span>
        ${m.edited_at ? `<span class="msg-edited mono">edited</span>` : ''}
      </div>
      ${replySnippet ? `<div class="reply-tag mono">↩ ${esc(replySnippet.sender)}: ${stripTags(replySnippet.body).slice(0, 40)}</div>` : ''}
      ${isEditing ? `
        <div class="bubble-edit-row">
          <input class="bubble-edit-input" id="edit-input-${m.id}" value="${esc(stripTags(m.body))}"/>
          <button class="edit-save" data-edit-save="${m.id}">${icon('check', 13)}</button>
        </div>
      ` : `<div class="bubble ${mine ? 'mine' : ''}">${m.body}</div>`}
    </div>
    ${mine && !isEditing ? `
    <div class="msg-actions">
      <button class="msg-action-btn" data-reply="${m.id}" title="Reply">${icon('messageCircle', 13)}</button>
      <button class="msg-action-btn" data-edit="${m.id}" title="Edit">${icon('penLine', 13)}</button>
      <button class="msg-action-btn" data-delete="${m.id}" title="Delete">&times;</button>
    </div>` : mine ? '' : `
    <div class="msg-actions">
      <button class="msg-action-btn" data-reply="${m.id}" title="Reply">${icon('messageCircle', 13)}</button>
    </div>`}
  </div>`;
}

function stripTags(html) {
  const div = document.createElement('div');
  div.innerHTML = html;
  return div.textContent || '';
}

export function wireDm() {
  const scroll = document.getElementById('chat-scroll');
  if (scroll) scroll.scrollTop = scroll.scrollHeight;

  const input = document.getElementById('chat-input');
  const send = () => {
    sendChatMessage(input.value, state.replyTarget?.id || 0);
    input.value = '';
    setState({ replyTarget: null });
  };
  document.getElementById('chat-send').onclick = send;
  input.onkeydown = (e) => { if (e.key === 'Enter') send(); };
  input.oninput = () => { if (input.value.trim()) notifyTyping(); };
  input.focus();

  const cancelBtn = document.getElementById('reply-cancel');
  if (cancelBtn) cancelBtn.onclick = () => setState({ replyTarget: null });

  document.querySelectorAll('[data-reply]').forEach(el => {
    el.onclick = () => {
      const id = Number(el.dataset.reply);
      const m = state.messages.find(x => x.id === id);
      if (m) setState({ replyTarget: { id: m.id, sender: m.sender, body: m.body } });
    };
  });

  document.querySelectorAll('[data-edit]').forEach(el => {
    el.onclick = () => setState({ editingId: Number(el.dataset.edit) });
  });

  document.querySelectorAll('[data-edit-save]').forEach(el => {
    el.onclick = () => {
      const id = Number(el.dataset.editSave);
      const editInput = document.getElementById(`edit-input-${id}`);
      editMessage(id, editInput.value);
      setState({ editingId: null });
    };
  });

  document.querySelectorAll('[data-delete]').forEach(el => {
    el.onclick = () => {
      const id = Number(el.dataset.delete);
      if (confirm('Delete this message?')) deleteMessage(id);
    };
  });
}
