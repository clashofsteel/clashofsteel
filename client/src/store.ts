import { create } from 'zustand';
import { getToken, setToken, clearToken } from './api';

// deep-link login (/?token=...) — DEV convenience only, ignored in production builds
const urlTok = import.meta.env.DEV ? new URLSearchParams(location.search).get('token') : null;
if (urlTok) setToken(urlTok);

interface State {
  token: string;
  base: any | null;
  selected: any | null;
  buildMode: string | null;
  error: string;
  setToken: (t: string) => void;
  setBase: (b: any) => void;
  setSelected: (s: any | null) => void;
  setBuildMode: (m: string | null) => void;
  setError: (e: string) => void;
}

export const useStore = create<State>((set) => ({
  token: getToken(),
  base: null,
  selected: null,
  buildMode: null,
  error: '',
  setToken: (token) => { token ? setToken(token) : clearToken(); set({ token }); },   // keep api.ts (Authorization header) + localStorage in sync
  setBase: (base) => set({ base }),
  setSelected: (selected) => set({ selected, buildMode: null }),
  setBuildMode: (buildMode) => set({ buildMode, selected: null }),
  setError: (error) => { set({ error }); if (error) setTimeout(() => set((s) => (s.error === error ? { error: '' } : {})), 2600); },
}));
