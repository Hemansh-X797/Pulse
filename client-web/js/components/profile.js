import { state, setState } from '../state.js';
import { Auth, Media } from '../api.js';
import { initials, esc, mediaUrl, showToast } from '../utils.js';
import { icon } from '../icons.js';

export function renderProfile() {
  const me = state.me;
  const bannerStyle = me.banner_url
    ? `background-image: url('${mediaUrl(me.banner_url)}'); background-size: cover; background-position: center;`
    : `background: linear-gradient(150deg, ${me.accent_color_top}, ${me.accent_color_bottom});`;
  const avatarStyle = me.avatar_url
    ? `background-image: url('${mediaUrl(me.avatar_url)}'); background-size: cover; background-position: center;`
    : `background: linear-gradient(150deg, ${me.accent_color_top}, ${me.accent_color_bottom});`;

  return `
  <div class="topbar">
    <h2>Edit Profile</h2>
    <span class="sub">your dual-accent gradient, the way Discord does banners — but yours</span>
  </div>
  <div class="profile-scroll">
    <div class="profile-card">
      <div class="banner-preview" id="banner-preview" style="${bannerStyle}">
        <button class="media-upload-btn banner-upload-btn" id="banner-upload-btn" type="button" title="Change banner">${icon('imagePlus', 14)}</button>
        <input type="file" accept="image/png,image/jpeg,image/webp,image/gif" id="banner-file" hidden/>
        <div class="profile-avatar-lg" id="avatar-preview" style="${avatarStyle}">
          ${me.avatar_url ? '' : initials(me.display_name)}
          <button class="media-upload-btn avatar-upload-btn" id="avatar-upload-btn" type="button" title="Change avatar">${icon('imagePlus', 13)}</button>
          <input type="file" accept="image/png,image/jpeg,image/webp,image/gif" id="avatar-file" hidden/>
        </div>
      </div>
      <div class="profile-body">
        <div class="field"><label>Display name</label><input id="p-display" value="${esc(me.display_name)}"/></div>
        <div class="field"><label>Pronouns</label><input id="p-pronouns" value="${esc(me.pronouns)}" placeholder="she/her"/></div>
        <div class="field"><label>Status</label><input id="p-status" value="${esc(me.status_text)}" placeholder="building Pulse :fire:"/></div>
        <div class="field"><label>Bio</label><textarea id="p-bio" placeholder="Say something about yourself... :sparkles:">${esc(me.bio)}</textarea></div>
        <div class="grad-controls">
          <div class="field"><label>Accent — top</label><input type="color" id="p-top" value="${me.accent_color_top}"/></div>
          <div class="field"><label>Accent — bottom</label><input type="color" id="p-bottom" value="${me.accent_color_bottom}"/></div>
        </div>
        <div class="save-row">
          <span class="saved-tag ${state.savedFlash ? 'show' : ''}">Saved ✓</span>
          <button class="btn btn-brand save-btn" id="p-save">Save profile</button>
        </div>
      </div>
    </div>
  </div>`;
}

async function handleUpload(fileInput, field) {
  const file = fileInput.files?.[0];
  if (!file) return;
  try {
    const { url } = await Media.upload(file);
    const me = await Auth.updateProfile({ [field]: url });
    setState({ me });
    showToast(`${field === 'avatar_url' ? 'Avatar' : 'Banner'} updated`);
  } catch (e) {
    showToast(e.message);
  }
}

export function wireProfile() {
  const top = document.getElementById('p-top');
  const bottom = document.getElementById('p-bottom');
  const preview = document.getElementById('banner-preview');
  const avatarPreview = document.getElementById('avatar-preview');
  const updatePreview = () => {
    // Only overrides the gradient when no custom image is set — an
    // uploaded photo shouldn't get clobbered by nudging the color pickers.
    if (!state.me.banner_url) preview.style.background = `linear-gradient(150deg, ${top.value}, ${bottom.value})`;
    if (!state.me.avatar_url) avatarPreview.style.background = `linear-gradient(150deg, ${top.value}, ${bottom.value})`;
  };
  top.oninput = updatePreview;
  bottom.oninput = updatePreview;

  document.getElementById('banner-upload-btn').onclick = () => document.getElementById('banner-file').click();
  document.getElementById('avatar-upload-btn').onclick = (e) => { e.stopPropagation(); document.getElementById('avatar-file').click(); };
  document.getElementById('banner-file').onchange = (e) => handleUpload(e.target, 'banner_url');
  document.getElementById('avatar-file').onchange = (e) => handleUpload(e.target, 'avatar_url');

  document.getElementById('p-save').onclick = async () => {
    const me = await Auth.updateProfile({
      display_name: document.getElementById('p-display').value,
      pronouns: document.getElementById('p-pronouns').value,
      status_text: document.getElementById('p-status').value,
      bio: document.getElementById('p-bio').value,
      accent_color_top: top.value,
      accent_color_bottom: bottom.value,
    });
    setState({ me, savedFlash: true });
    setTimeout(() => setState({ savedFlash: false }), 1600);
  };
}
