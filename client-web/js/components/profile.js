import { state, setState } from '../state.js';
import { Auth } from '../api.js';
import { initials, esc } from '../utils.js';

export function renderProfile() {
  const me = state.me;
  return `
  <div class="topbar">
    <h2>Edit Profile</h2>
    <span class="sub">your dual-accent gradient, the way Discord does banners — but yours</span>
  </div>
  <div class="profile-scroll">
    <div class="profile-card">
      <div class="banner-preview" id="banner-preview" style="background: linear-gradient(150deg, ${me.accent_color_top}, ${me.accent_color_bottom});">
        <div class="profile-avatar-lg" id="avatar-preview" style="background: linear-gradient(150deg, ${me.accent_color_top}, ${me.accent_color_bottom});">${initials(me.display_name)}</div>
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

export function wireProfile() {
  const top = document.getElementById('p-top');
  const bottom = document.getElementById('p-bottom');
  const preview = document.getElementById('banner-preview');
  const avatarPreview = document.getElementById('avatar-preview');
  const updatePreview = () => {
    const g = `linear-gradient(150deg, ${top.value}, ${bottom.value})`;
    preview.style.background = g;
    avatarPreview.style.background = g;
  };
  top.oninput = updatePreview;
  bottom.oninput = updatePreview;

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
