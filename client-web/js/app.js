import { state, onStateChange, setState } from './state.js';
import { Auth, Feed as FeedApi } from './api.js';
import { connectWs } from './ws.js';
import { renderAuth, wireAuth } from './components/auth.js';
import { renderSidebar, wireSidebar } from './components/sidebar.js';
import { renderFeed, wireFeed } from './components/feed.js';
import { renderDm, wireDm } from './components/dm.js';
import { renderProfile, wireProfile } from './components/profile.js';

const root = document.getElementById('app');

function render() {
  if (state.screen === 'login' || state.screen === 'signup') {
    root.innerHTML = renderAuth();
    wireAuth();
    return;
  }

  const bodyMarkup = state.tab === 'feed' ? renderFeed()
    : state.tab === 'dm' ? renderDm()
    : renderProfile();

  root.innerHTML = `${renderSidebar()}<div class="main">${bodyMarkup}</div>`;
  wireSidebar();
  if (state.tab === 'feed') wireFeed();
  else if (state.tab === 'dm') wireDm();
  else wireProfile();

  if (window.anime) {
    const targets = state.tab === 'feed' ? '.post-card, .composer-post'
      : state.tab === 'dm' ? '.msg-row'
      : '.profile-card';
    window.anime({
      targets,
      opacity: [0, 1],
      translateY: [8, 0],
      delay: window.anime.stagger(35, { start: 0 }),
      duration: 380,
      easing: 'easeOutQuad',
    });
  }
}

onStateChange(render);

async function completeLogin(token) {
  localStorage.setItem('pulse_token', token);
  setState({ token });
  const me = await Auth.me();
  const feed = await FeedApi.list();
  setState({ me, screen: 'app', posts: feed.posts });
  connectWs();
}

(async function boot() {
  // OAuth callback lands back here with #token=... or #oauth_error=...
  if (window.location.hash.startsWith('#token=')) {
    const token = decodeURIComponent(window.location.hash.slice('#token='.length));
    history.replaceState(null, '', window.location.pathname);
    try {
      await completeLogin(token);
      return;
    } catch (e) {
      localStorage.removeItem('pulse_token');
      setState({ token: null, screen: 'login', authError: 'Sign-in succeeded but loading your account failed — try again.' });
      return;
    }
  }
  if (window.location.hash.startsWith('#oauth_error=')) {
    const msg = decodeURIComponent(window.location.hash.slice('#oauth_error='.length));
    history.replaceState(null, '', window.location.pathname);
    setState({ screen: 'login', authError: msg });
    return;
  }

  if (state.token) {
    try {
      const me = await Auth.me();
      const feed = await FeedApi.list();
      setState({ me, screen: 'app', posts: feed.posts });
      connectWs();
      return;
    } catch (e) {
      localStorage.removeItem('pulse_token');
      setState({ token: null, screen: 'login' });
      return;
    }
  }
  render();
})();
