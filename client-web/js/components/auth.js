import { state, setState } from '../state.js';
import { Auth } from '../api.js';
import { connectWs } from '../ws.js';
import { Feed } from '../api.js';
import { showToast } from '../utils.js';

export function renderAuth() {
  const isSignup = state.screen === 'signup';
  return `
  <div class="auth-screen">
    <div class="auth-art" role="img" aria-label="Dusk over rolling hills"></div>
    <div class="auth-panel">
      <div class="auth-inner">
        <div class="auth-mark">
          <span class="auth-mark-dot"></span>
          <span class="auth-logo">Pulse</span>
        </div>

        <h1 class="auth-headline">${isSignup ? 'Join Pulse' : 'Welcome back'}</h1>
        <p class="auth-sub">${isSignup ? 'pick a username, we\u2019ll handle the rest' : 'sign in to pick up where you left off'}</p>

        <div class="auth-fields">
          ${isSignup ? `<input class="auth-field-single" id="f-display" placeholder="Display name"/>` : ''}
          <input class="auth-field-single" id="f-username" placeholder="Username" autocomplete="username"/>
          <input class="auth-field-single" id="f-password" type="password" placeholder="Password" autocomplete="current-password"/>
        </div>

        <button class="btn btn-brand auth-submit" id="f-submit">${isSignup ? 'Create account' : "Let's go"}</button>
        <div class="auth-error">${state.authError || ''}</div>

        <div class="oauth-divider"><span>or continue with</span></div>
        <div class="oauth-row">
          <button class="oauth-circle" id="oauth-google" type="button" aria-label="Continue with Google">
            <img src="assets/google-logo.svg" alt=""/>
          </button>
          <button class="oauth-circle discord" id="oauth-discord" type="button" aria-label="Continue with Discord">
            <img src="assets/discord-logo.svg" alt=""/>
          </button>
        </div>

        <div class="auth-toggle">
          ${isSignup ? `Already have an account? <a id="f-toggle">Log in</a>` : `New here? <a id="f-toggle">Create an account</a>`}
        </div>

        <div class="auth-legal">By signing in, you agree to our <a href="#">terms</a> &amp; <a href="#">privacy policy</a></div>
      </div>
    </div>
  </div>`;
}

export function wireAuth() {
  if (window.anime) {
    window.anime({
      targets: '.auth-inner > *',
      opacity: [0, 1],
      translateY: [10, 0],
      delay: window.anime.stagger(45),
      duration: 520,
      easing: 'easeOutQuad',
    });
  }

  document.getElementById('f-toggle').onclick = () => {
    setState({ screen: state.screen === 'signup' ? 'login' : 'signup', authError: '' });
  };

  document.getElementById('oauth-google').onclick = () =>
    showToast('Google sign-in lands in Phase 3 — full OAuth flow.');
  document.getElementById('oauth-discord').onclick = () =>
    showToast('Discord sign-in lands in Phase 3 — full OAuth flow.');

  document.getElementById('f-submit').onclick = async () => {
    const username = document.getElementById('f-username').value.trim();
    const password = document.getElementById('f-password').value;
    try {
      if (state.screen === 'signup') {
        const display_name = document.getElementById('f-display').value.trim();
        await Auth.signup(username, password, display_name);
      }
      const r = await Auth.login(username, password);
      localStorage.setItem('pulse_token', r.token);
      setState({ token: r.token });
      const me = await Auth.me();
      const feed = await Feed.list();
      setState({ me, screen: 'app', posts: feed.posts, authError: '' });
      connectWs();
    } catch (e) {
      setState({ authError: e.message });
    }
  };
}
