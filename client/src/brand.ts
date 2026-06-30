// ============================================================
//   CLASH OF STEEL — token & socials config
//   These read from /public/config.js (window.GAME_CONFIG) at
//   RUNTIME, so after deploying you edit config.js (no rebuild).
//   The values below are only fallbacks if config.js is missing.
// ============================================================
const G: any = (typeof window !== 'undefined' && (window as any).GAME_CONFIG) || {};

export const TICKER: string = G.TICKER || '$COS';
export const CA: string = G.CA || 'COMING SOON';
export const LAUNCH: string = G.LAUNCH || '3 Jul 2026';
export const BUY_URL: string = G.BUY_URL || 'https://pump.fun/';
export const SOCIALS: { x: string; telegram: string; github: string } = G.SOCIALS || {
  x:        'https://x.com/clashofsteel',
  telegram: 'https://t.me/clashofsteel',
  github:   'https://github.com/clashofsteel/clashofsteel',
};
