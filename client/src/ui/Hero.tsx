import { useEffect, useState } from 'react';
import { api } from '../api';
import { Brand } from './icons';
import { TICKER, CA, LAUNCH, BUY_URL, SOCIALS } from '../brand';   // edit ../brand.ts to update CA / launch / socials

const DEMO_KEY = 'coc_demo_at';
const DEMO_COOLDOWN_MS = 24 * 60 * 60 * 1000;
const fmtLeft = (ms: number) => { const m = Math.ceil(ms / 60000); return m >= 60 ? `${Math.floor(m / 60)}h ${m % 60}m` : `${m}m`; };

// ---- Solana wallet detection ----
const WALLETS: { id: string; name: string; icon: string; get: () => any; url: string }[] = [
  { id: 'phantom', name: 'Phantom', icon: '👻', get: () => (window as any).phantom?.solana || ((window as any).solana?.isPhantom ? (window as any).solana : null), url: 'https://phantom.app/' },
  { id: 'solflare', name: 'Solflare', icon: '🔆', get: () => (window as any).solflare, url: 'https://solflare.com/' },
  { id: 'backpack', name: 'Backpack', icon: '🎒', get: () => (window as any).backpack, url: 'https://backpack.app/' },
];
const SOCIAL_LINKS = [
  { Comp: Brand.x, label: 'Twitter / X', url: SOCIALS.x },
  { Comp: Brand.telegram, label: 'Telegram', url: SOCIALS.telegram },
  { Comp: Brand.github, label: 'GitHub', url: SOCIALS.github },
];

export function Hero({ onAuth }: { onAuth: (token: string) => void; onGuest?: () => void }) {
  const [busy, setBusy] = useState('');
  const [err, setErr] = useState('');
  const [picker, setPicker] = useState(false);
  const [copied, setCopied] = useState(false);
  const [cooldownLeft, setCooldownLeft] = useState(0);   // ms until demo is available again (0 = available)

  // show the cooldown straight away if this browser already used a demo in the last 24h
  useEffect(() => {
    const at = Number(localStorage.getItem(DEMO_KEY) || 0);
    const left = at ? DEMO_COOLDOWN_MS - (Date.now() - at) : 0;
    if (left > 0) setCooldownLeft(left);
  }, []);

  async function tryDemo() {
    setErr('');
    try {
      setBusy('demo');
      const r = await api.demoAuth();
      localStorage.setItem(DEMO_KEY, String(Date.now()));   // start the 24h clock for this browser
      onAuth(r.token);
    } catch (e: any) {
      const code = e?.body?.error;
      if (code === 'demo_cooldown') {
        const raw = Number(e.body?.retryAfterMs);
        const ms = Number.isFinite(raw) && raw > 0 ? raw : DEMO_COOLDOWN_MS;   // never coerce a 0 into a full 24h
        localStorage.setItem(DEMO_KEY, String(Date.now() - (DEMO_COOLDOWN_MS - ms)));   // sync local clock to the server
        setCooldownLeft(ms);
      } else if (code === 'demo_busy') {
        setErr('Demo is full right now — try again in a bit, or hit PLAY to play for real with Phantom.');
      } else {
        setErr(e?.message || 'Could not start demo');
      }
      setBusy('');
    }
  }

  async function connect(w: typeof WALLETS[number]) {
    setErr('');
    const provider = w.get();
    if (!provider) { window.open(w.url, '_blank'); setErr(`${w.name} not found — install it, then retry.`); return; }
    try {
      setBusy(w.id);
      const res = await provider.connect();
      const address = (res?.publicKey || provider.publicKey)?.toString();
      if (!address) throw new Error('No wallet address');
      const r = await api.walletAuth(address);
      onAuth(r.token);
    } catch (e: any) {
      setErr(e?.message === 'User rejected the request.' ? 'Connection cancelled.' : (e?.message || 'Failed to connect'));
    } finally { setBusy(''); }
  }

  return (
    <div className="hero hero-img">
      <div className="hero-bg" />            {/* lightweight static art background */}
      <div className="hero-vignette" />

      {/* logo — centered at the top */}
      <div className="hero-logo">
        <img className="hero-wordmark" src="/hero/logo-font.png" alt="CLASH OF STEEL" draggable={false} />
      </div>

      {/* centered play lockup */}
      <div className="hero-center">
        <p className="hero-tag">Build your 3D galaxy robot base · train mechs · raid rivals · wage <b>Clan Wars</b>.</p>

        <div className="hero-token">
          <span className="ht-ticker">{TICKER}</span>
          <span className="ht-launch">🚀 Launch {LAUNCH}</span>
          <button className="ht-ca" onClick={() => { navigator.clipboard?.writeText(CA); setCopied(true); setTimeout(() => setCopied(false), 1200); }}>CA: {CA} {copied ? '✓' : '⧉'}</button>
          <a className="ht-buy" href={BUY_URL} target="_blank" rel="noreferrer">Buy {TICKER} ▸</a>
        </div>

        <button className="hero-play" onClick={() => setPicker(true)}>▶ PLAY CLASH OF STEEL</button>

        {cooldownLeft > 0 ? (
          <button className="hero-demo cooldown" disabled title="One demo per day">⏳ Demo used — back in {fmtLeft(cooldownLeft)}</button>
        ) : (
          <button className="hero-demo" disabled={busy === 'demo'} onClick={tryDemo}>
            {busy === 'demo' ? 'Loading demo…' : '🎮 Try Demo — Unlimited Money, 30 min'}
          </button>
        )}
        <div className="hero-demo-note">
          {cooldownLeft > 0
            ? <>You already had your demo today — hit <b>PLAY</b> to play for real with Phantom 👻</>
            : <>No wallet needed · play the real game with <b>unlimited money</b>, guided · 30 min, one per 24h · then connect Phantom to keep your base</>}
        </div>
      </div>

      {/* socials only */}
      <div className="hero-socials-bar">
        {SOCIAL_LINKS.map((s) => <a key={s.label} href={s.url} target="_blank" rel="noreferrer" title={s.label}><s.Comp /></a>)}
      </div>

      {/* wallet connect modal — dimmed backdrop so the choices stand out over the art */}
      {picker && (
        <div className="wallet-overlay" onClick={() => { setPicker(false); setErr(''); }}>
          <div className="wallet-modal" onClick={(e) => e.stopPropagation()}>
            <div className="wm-logo">⚙️</div>
            <div className="wm-title">Connect your Solana wallet</div>
            <div className="wm-sub">Choose a wallet to enter Clash of Steel</div>
            <div className="wallet-list">
              {WALLETS.map((w) => (
                <button key={w.id} className={'wbtn ' + w.id} disabled={!!busy} onClick={() => connect(w)}>
                  <span className="wb-ic">{w.icon}</span>
                  <span className="wb-name">{w.name}</span>
                  <span className="wb-status">{busy === w.id ? 'Connecting…' : '▸'}</span>
                </button>
              ))}
            </div>
            {err && <div className="wm-err">{err}</div>}
            <button className="hero-back" onClick={() => { setPicker(false); setErr(''); }}>← Cancel</button>
          </div>
        </div>
      )}
    </div>
  );
}
