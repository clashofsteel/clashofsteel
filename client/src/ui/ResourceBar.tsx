import { useEffect, useRef, useState } from 'react';

// a number that pops + floats a "+N" each time it goes up (collect gold/plasma/gems, add troops…)
function ResVal({ v }: { v: number }) {
  const prev = useRef(v);
  const [tick, setTick] = useState(0);
  const [delta, setDelta] = useState(0);
  useEffect(() => { if (v > prev.current) { setDelta(v - prev.current); setTick((t) => t + 1); } prev.current = v; }, [v]);
  return (
    <span className="res-num">
      <span key={tick} className={tick ? 'res-bump' : ''}>{v}</span>
      {delta > 0 && <span key={tick} className="res-float">+{delta}</span>}
    </span>
  );
}

export function ResourceBar({ p }: { p: any }) {
  if (!p) return null;
  const shielded = p.shieldExpiresAt && p.shieldExpiresAt > Date.now();
  const shieldMin = shielded ? Math.ceil((p.shieldExpiresAt - Date.now()) / 60000) : 0;
  return (
    <>
      <div className="brand"><img src="/hero/logo-font.png" alt="CLASH OF STEEL" className="brand-logo" /></div>
      <div className="topbar">
        <div className="res gold"><span className="coin coin-gold" /><ResVal v={p.gold} /><small>/{p.maxGold}</small></div>
        <div className="res elixir"><span className="coin coin-elixir" /><ResVal v={p.elixir} /><small>/{p.maxElixir}</small></div>
        <div className="res gems"><span className="coin coin-gem" /><ResVal v={p.gems} /></div>
        <div className="res tier" title={p.tier ? `${p.tier.name} tier${p.tier.nextAt != null ? ` · ${p.tier.nextAt - (p.trophies ?? 0)} to ${p.tier.nextName}` : ' · MAX'}` : ''}
          style={p.tier ? { color: p.tier.color, borderColor: p.tier.color } : undefined}>
          <span className="ic">{p.tier?.icon || '🏅'}</span>{p.trophies ?? 0}<b className="tiername">{p.tier ? p.tier.name : ''}</b>
        </div>
        <div className="res stars" title="Total stars earned from raids & wars"><span className="ic">⭐</span>{p.totalStars ?? 0}</div>
        <div className="res th">🛰️ Core {p.townHallLevel}</div>
        <div className="res res-builders"><span className="ic">🔧</span>{p.buildersFree}/{p.buildersTotal}</div>
        <div className="res res-housing"><span className="ic">🤖</span><ResVal v={p.housingUsed ?? 0} /><small>/{p.housingTotal ?? 0}</small></div>
        {shielded && <div className="res shield">🛡️ {shieldMin}m</div>}
      </div>
    </>
  );
}
