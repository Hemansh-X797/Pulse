'use client';

const STORAGE_KEY = 'palspace-notif-sound';

export function getNotificationSoundEnabled(): boolean {
  if (typeof window === 'undefined') return true;
  const stored = localStorage.getItem(STORAGE_KEY);
  return stored !== 'false';
}

export function setNotificationSoundEnabled(enabled: boolean) {
  localStorage.setItem(STORAGE_KEY, String(enabled));
}

let audioCtx: AudioContext | null = null;
let unlocked = false;

// Browsers block audio playback (including WebAudio) until the page has
// seen a real user gesture (a click, keypress, tap). This listens once
// for the first such gesture anywhere on the page and "warms up" the
// AudioContext then, so the chime can actually play the first time a
// DM arrives rather than silently failing because nobody's clicked
// anything yet.
if (typeof window !== 'undefined') {
  const unlock = () => {
    if (unlocked) return;
    unlocked = true;
    try {
      audioCtx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
    } catch {
      // AudioContext unsupported — chime just won't play, nothing else
      // in the app depends on it.
    }
    window.removeEventListener('pointerdown', unlock);
    window.removeEventListener('keydown', unlock);
  };
  window.addEventListener('pointerdown', unlock, { once: true });
  window.addEventListener('keydown', unlock, { once: true });
}

/**
 * A short (~1s) two-note chime, synthesized rather than an audio file —
 * no licensing question, no extra network request, and it's genuinely
 * simpler than shipping/hosting a sound asset for something this small.
 */
export function playNotificationChime() {
  if (!getNotificationSoundEnabled()) return;
  if (!audioCtx) return; // not unlocked yet — no gesture has happened
  if (audioCtx.state === 'suspended') {
    audioCtx.resume().catch(() => {});
  }

  const now = audioCtx.currentTime;
  const notes = [
    { freq: 880, start: 0, dur: 0.14 },
    { freq: 1318.5, start: 0.12, dur: 0.35 },
  ];

  for (const note of notes) {
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = 'sine';
    osc.frequency.value = note.freq;
    gain.gain.setValueAtTime(0, now + note.start);
    gain.gain.linearRampToValueAtTime(0.16, now + note.start + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + note.start + note.dur);
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.start(now + note.start);
    osc.stop(now + note.start + note.dur + 0.05);
  }
}
