// Procedural sound effects via Web Audio — no asset files, works offline.
// AudioContext is created/resumed on first user gesture (browser autoplay policy).
let ctx: AudioContext | null = null;
let sfxMuted = false;     // sound effects (clicks, collect, battle…) — toggled in Settings
let musicMuted = false;   // background music — toggled separately in Settings

function ac(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  if (!ctx) { try { ctx = new (window.AudioContext || (window as any).webkitAudioContext)(); } catch { return null; } }
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}

function tone(freq: number, dur: number, type: OscillatorType = 'sine', vol = 0.2, slideTo?: number) {
  const c = ac(); if (!c || sfxMuted) return;
  const o = c.createOscillator(), g = c.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, c.currentTime);
  if (slideTo) o.frequency.exponentialRampToValueAtTime(Math.max(1, slideTo), c.currentTime + dur);
  g.gain.setValueAtTime(vol, c.currentTime);
  g.gain.exponentialRampToValueAtTime(0.001, c.currentTime + dur);
  o.connect(g).connect(c.destination);
  o.start(); o.stop(c.currentTime + dur);
}

function noise(dur: number, vol = 0.3, cutoff = 1400) {
  const c = ac(); if (!c || sfxMuted) return;
  const buf = c.createBuffer(1, Math.floor(c.sampleRate * dur), c.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / d.length, 2);
  const s = c.createBufferSource(); s.buffer = buf;
  const g = c.createGain(); g.gain.value = vol;
  const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = cutoff;
  s.connect(f).connect(g).connect(c.destination); s.start();
}

// ---- background music: real MP3 tracks (hero / in-game / war), looped ----
type MusicMode = 'hero' | 'game' | 'war';
let music: HTMLAudioElement | null = null;
let musicMode: MusicMode = 'hero';
const TRACKS: Record<MusicMode, string> = {
  hero: '/audio/sound1.mp3',   // landing / hero section
  game: '/audio/sound2.mp3',   // building your base
  war:  '/audio/sound3.mp3',   // battle / raid / war
};
function playMusic() {
  if (typeof window === 'undefined' || musicMuted) return;
  if (!music) { music = new Audio(); music.loop = true; music.volume = 0.4; music.preload = 'auto'; }
  const src = TRACKS[musicMode];
  if (!music.src.endsWith(src)) { music.src = src; }   // switch track (restarts that track)
  music.loop = true;
  music.play().catch(() => {});                        // autoplay may be blocked until a gesture; unlock() retries
}
function startMusic() { playMusic(); }
function stopMusic() { if (music) music.pause(); }
function setMusicMode(mode: MusicMode) {
  if (mode === musicMode && music && !music.paused) return;
  musicMode = mode;
  playMusic();
}

export const sfx = {
  unlock: () => { ac(); playMusic(); },                            // first gesture: prime SFX audio + start music (autoplay needs a gesture)
  startMusic, stopMusic, setMusicMode,                             // setMusicMode('hero'|'game'|'war')
  setMusicMuted: (m: boolean) => { musicMuted = m; if (m) stopMusic(); else playMusic(); },
  setSfxMuted: (m: boolean) => { sfxMuted = m; },
  isMusicMuted: () => musicMuted,
  isSfxMuted: () => sfxMuted,
  setMuted: (m: boolean) => { sfxMuted = m; musicMuted = m; if (m) stopMusic(); else playMusic(); },   // both at once
  press: () => tone(440, 0.035, 'triangle', 0.06, 620),            // soft tactile blip for any button
  click: () => tone(520, 0.04, 'square', 0.05),
  collect: () => { tone(660, 0.09, 'sine', 0.12, 990); setTimeout(() => tone(880, 0.08, 'sine', 0.1, 1200), 60); },
  build: () => tone(280, 0.16, 'sine', 0.14, 560),
  deploy: () => tone(420, 0.12, 'square', 0.1, 660),
  shoot: () => tone(900, 0.05, 'square', 0.04, 320),
  explode: () => { noise(0.35, 0.32); tone(150, 0.25, 'sawtooth', 0.12, 50); },
  star: (i = 0) => tone(1000 + i * 300, 0.16, 'triangle', 0.18, 1500 + i * 400),
  win: () => [523, 659, 784, 1047, 1319].forEach((f, i) => setTimeout(() => tone(f, 0.2, 'triangle', 0.16), i * 110)),
  lose: () => [420, 320, 220].forEach((f, i) => setTimeout(() => tone(f, 0.26, 'sawtooth', 0.14), i * 150)),
  reward: () => [784, 988, 1319].forEach((f, i) => setTimeout(() => tone(f, 0.22, 'triangle', 0.18), i * 90)),
  wake: () => { tone(300, 0.07, 'sine', 0.09, 470); setTimeout(() => tone(540, 0.07, 'sine', 0.08, 720), 70); },   // poked-awake "huh?" chirp
};
