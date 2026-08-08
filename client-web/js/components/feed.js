import { state, setState, rerender } from '../state.js';
import { Feed as FeedApi, Media } from '../api.js';
import { initials, gradientStyle, timeAgo, esc, mediaUrl, showToast } from '../utils.js';
import { icon } from '../icons.js';

let pendingImageUrl = null;

export function renderFeed() {
  return `
  <div class="topbar">
    <h2>Feed</h2>
    <span class="sub">posts from everyone on Pulse</span>
  </div>
  <div class="feed-scroll">
    <div class="composer-post">
      <textarea id="post-input" placeholder="What's happening? Try :fire: :rocket: :100:"></textarea>
      <div id="composer-image-preview"></div>
      <div class="composer-post-row">
        <div class="composer-post-left">
          <button class="composer-attach-btn" id="post-attach" type="button" title="Attach image">${icon('imagePlus', 15)}</button>
          <input type="file" id="post-file" accept="image/png,image/jpeg,image/webp,image/gif" hidden/>
          <span class="composer-hint mono">:shortcode: → emoji</span>
        </div>
        <button class="btn btn-brand" id="post-submit">Post</button>
      </div>
    </div>
    ${state.posts.length === 0 ? `<div class="empty-state">No posts yet — be the first.</div>` : ''}
    ${state.posts.map(renderPostCard).join('')}
  </div>`;
}

function renderPostCard(p) {
  const open = !!state.commentsOpen[p.id];
  const comments = state.commentsCache[p.id] || [];
  return `
  <div class="post-card">
    <div class="post-head">
      <div class="avatar avatar-sm" style="${gradientStyle({ accent_color_top: '#6C8CFF', accent_color_bottom: '#FF6FA5' })}">${initials(p.author_display_name)}</div>
      <div>
        <div class="post-name">${esc(p.author_display_name)}</div>
        <div class="post-meta mono">@${esc(p.author_username)} · ${timeAgo(p.created_at)}</div>
      </div>
    </div>
    <div class="post-body">${p.body}</div>
    ${p.media_url ? `<div class="post-image-wrap"><img class="post-image" src="${mediaUrl(p.media_url)}" alt=""/></div>` : ''}
    <div class="post-actions">
      <button class="react-btn" data-react="${p.id}" data-shortcode="fire">${icon('flame', 13)}</button>
      <button class="react-btn" data-react="${p.id}" data-shortcode="heart">${icon('heart', 13)}</button>
      <button class="react-btn react-btn-text mono" data-react="${p.id}" data-shortcode="100">100</button>
      <button class="comment-toggle mono" data-comments="${p.id}">${p.comment_count} comment${p.comment_count === 1 ? '' : 's'}</button>
    </div>
    <div class="comments-box ${open ? 'open' : ''}">
      ${comments.map(c => `<div class="comment-row"><b>${esc(c.author)}</b> ${c.body}</div>`).join('') || '<div class="comment-row muted">No comments yet.</div>'}
      <div class="comment-input-row">
        <input placeholder="Write a comment..." data-comment-input="${p.id}"/>
        <button class="btn btn-ghost" data-comment-submit="${p.id}">Send</button>
      </div>
    </div>
  </div>`;
}

export function wireFeed() {
  pendingImageUrl = null;

  const attachBtn = document.getElementById('post-attach');
  const fileInput = document.getElementById('post-file');
  const previewBox = document.getElementById('composer-image-preview');

  attachBtn.onclick = () => fileInput.click();
  fileInput.onchange = async () => {
    const file = fileInput.files?.[0];
    if (!file) return;
    try {
      const { url } = await Media.upload(file);
      pendingImageUrl = url;
      previewBox.innerHTML = `
        <div class="composer-image-chip">
          <img src="${mediaUrl(url)}" alt=""/>
          <button id="composer-image-remove" type="button">&times;</button>
        </div>`;
      document.getElementById('composer-image-remove').onclick = () => {
        pendingImageUrl = null;
        previewBox.innerHTML = '';
      };
    } catch (e) {
      showToast(e.message);
    }
  };

  document.getElementById('post-submit').onclick = async () => {
    const el = document.getElementById('post-input');
    if (!el.value.trim()) return;
    await FeedApi.create(el.value, pendingImageUrl || undefined);
    el.value = '';
    pendingImageUrl = null;
    previewBox.innerHTML = '';
    const feed = await FeedApi.list();
    setState({ posts: feed.posts });
  };

  document.querySelectorAll('[data-react]').forEach(el => {
    el.onclick = async () => {
      await FeedApi.react(el.dataset.react, el.dataset.shortcode);
      const feed = await FeedApi.list();
      setState({ posts: feed.posts });
    };
  });

  document.querySelectorAll('[data-comments]').forEach(el => {
    el.onclick = async () => {
      const id = el.dataset.comments;
      const nowOpen = !state.commentsOpen[id];
      state.commentsOpen[id] = nowOpen;
      if (nowOpen && !state.commentsCache[id]) {
        const r = await FeedApi.comments(id);
        state.commentsCache[id] = r.comments;
      }
      rerender();
    };
  });

  document.querySelectorAll('[data-comment-submit]').forEach(el => {
    el.onclick = async () => {
      const id = el.dataset.commentSubmit;
      const input = document.querySelector(`[data-comment-input="${id}"]`);
      if (!input.value.trim()) return;
      await FeedApi.comment(id, input.value);
      input.value = '';
      const r = await FeedApi.comments(id);
      state.commentsCache[id] = r.comments;
      const feed = await FeedApi.list();
      setState({ posts: feed.posts });
    };
  });
}
