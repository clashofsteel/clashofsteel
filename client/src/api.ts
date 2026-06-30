let token = localStorage.getItem('coc_token') || '';
export const getToken = () => token;
export function setToken(t: string) { token = t; localStorage.setItem('coc_token', t); }
export function clearToken() { token = ''; localStorage.removeItem('coc_token'); }

// base URL for the API — same-origin '/api' by default; override via config.js API_URL for split client/server hosts
const API_BASE = ((typeof window !== 'undefined' && (window as any).GAME_CONFIG?.API_URL) || '') + '/api';

async function req(path: string, body?: any) {
  const r = await fetch(API_BASE + path, {
    method: body !== undefined ? 'POST' : 'GET',
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const j = await r.json().catch(() => ({}));
  if (r.status === 401 && token) { clearToken(); location.reload(); return new Promise<any>(() => {}); }   // invalid session -> back to login (no error toast)
  if (!r.ok) { const e: any = new Error(j.error || ('HTTP ' + r.status)); e.status = r.status; e.body = j; throw e; }
  return j;
}

export const api = {
  register: (username: string, password: string) => req('/auth/register', { username, password }),
  login: (username: string, password: string) => req('/auth/login', { username, password }),
  walletAuth: (address: string) => req('/auth/wallet', { address }),
  demoAuth: () => req('/auth/demo', {}),
  base: () => req('/base'),
  build: (type: string, x: number, y: number) => req('/build', { type, x, y }),
  move: (id: string, x: number, y: number) => req('/move', { id, x, y }),
  sell: (id: string) => req('/sell', { id }),
  upgrade: (id: string) => req('/upgrade', { id }),
  speedup: (id: string) => req('/speedup', { id }),
  collect: (id?: string) => req('/collect', id ? { id } : {}),
  train: (troop: string, count = 1) => req('/train', { troop, count }),
  trainFinish: () => req('/train/finish', {}),
  research: (troop: string) => req('/troops/research', { troop }),
  armyClear: () => req('/army/clear', {}),
  attackStart: () => req('/attack/start', {}),
  attackLevel: (level: 'easy' | 'normal' | 'expert' | 'legend') => req('/attack/level', { level }),
  attackFind: () => req('/attack/find', {}),
  attackPlayer: (id: string) => req('/attack/player', { id }),
  campaignList: () => req('/campaign/list'),
  campaignAttack: (levelId: number) => req('/campaign/attack', { levelId }),
  tutorialClaim: () => req('/tutorial/claim', {}),
  dailyClaim: () => req('/daily/claim', {}),
  questsList: () => req('/quests/list'),
  questsClaim: (id: string) => req('/quests/claim', { id }),
  gemsMissions: () => req('/gems/missions'),
  gemsClaim: (id: string, kind: 'achievement' | 'daily') => req('/gems/claim', { id, kind }),
  gemsBuilder: () => req('/gems/builder', {}),
  gemsBoost: () => req('/gems/boost', {}),
  defenseLog: () => req('/defense/log'),
  defenseReplay: (raidId: string) => req('/defense/replay', { raidId }),
  leaderboard: () => req("/leaderboard"),
  setName: (name: string) => req("/profile/name", { name }),
  clanList: () => req('/clan/list'),
  clanMe: () => req('/clan/me'),
  clanCreate: (name: string, tag: string, description: string) => req('/clan/create', { name, tag, description }),
  clanJoin: (clanId: string) => req('/clan/join', { clanId }),
  clanLeave: () => req('/clan/leave', {}),
  clanChat: (text: string) => req('/clan/chat', { text }),
  clanWarStart: () => req('/clan/war/start', {}),
  clanWarAttack: (baseIdx: number) => req('/clan/war/attack', { baseIdx }),
  attackResolve: (battleId: string, stars: number, destructionPct: number, troopsUsed: Record<string, number>) =>
    req('/attack/resolve', { battleId, stars, destructionPct, troopsUsed }),
  devComplete: () => req('/dev/complete', {}),
  devGrant: () => req('/dev/grant', {}),
  devGod: () => req('/dev/god', {}),
};
