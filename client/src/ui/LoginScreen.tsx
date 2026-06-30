import { useState } from 'react';
import { api, setToken } from '../api';

export function LoginScreen({ onAuth, onBack }: { onAuth: (token: string) => void; onBack?: () => void }) {
  const [mode, setMode] = useState<'register' | 'login'>('register');
  const [u, setU] = useState('');
  const [p, setP] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit() {
    setErr(''); setBusy(true);
    try {
      const r = mode === 'register' ? await api.register(u, p) : await api.login(u, p);
      setToken(r.token); onAuth(r.token);
    } catch (e: any) { setErr(e.message || 'Failed'); }
    finally { setBusy(false); }
  }

  return (
    <div className="login">
      <div className="login-card">
        <h1>🛡️ <b>CLASH OF STEEL</b></h1>
        <p>{mode === 'register' ? 'Deploy your galaxy robot base 🌌' : 'Welcome back, Commander'}</p>
        <input placeholder="Username" value={u} onChange={(e) => setU(e.target.value)} maxLength={20} />
        <input placeholder="Password" type="password" value={p} onChange={(e) => setP(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && submit()} maxLength={64} />
        <div className="err">{err}</div>
        <button className="btn go" onClick={submit} disabled={busy}>
          {busy ? '…' : mode === 'register' ? '🏰 Create Village' : '▶ Enter Village'}
        </button>
        <button className="alt" onClick={() => { setMode(mode === 'register' ? 'login' : 'register'); setErr(''); }}>
          {mode === 'register' ? 'I already have a base — Log in' : 'New here? Create a base'}
        </button>
        {onBack && <button className="alt" onClick={onBack}>← Back to wallet login</button>}
      </div>
    </div>
  );
}
