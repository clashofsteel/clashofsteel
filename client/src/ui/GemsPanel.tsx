import { useState } from 'react';

export function GemsPanel({ open, data, base, onClaim, onBuyBuilder, onBoost, onClose }: {
  open: boolean; data: any; base: any;
  onClaim: (id: string, kind: 'achievement' | 'daily') => void; onBuyBuilder: () => void; onBoost: () => void; onClose: () => void;
}) {
  const [tab, setTab] = useState<'daily' | 'ach' | 'perks'>('daily');
  const gems = base?.player?.gems ?? 0;
  const owned = base?.player?.gemBuilders ?? 0;
  const costs: number[] = data?.builderCost || [];
  const boost = data?.boost || { gems: 20, hours: 1 };
  const boostActive = !!base?.player?.boostActive;
  const boostLeft = base?.player?.boostExpiresAt ? Math.max(0, Math.round((base.player.boostExpiresAt - Date.now()) / 60000)) : 0;
  const nextBuilderCost = owned < costs.length ? costs[owned] : null;

  const Card = (m: any, kind: 'achievement' | 'daily') => {
    const pct = Math.min(100, Math.round((m.progress / m.target) * 100));
    return (
      <div key={m.id} className={'qcard' + (m.claimed ? ' claimed' : m.done ? ' done' : '')}>
        <span className="ic">{m.icon}</span>
        <span className="nm">{m.title}</span>
        {m.desc && <span className="qd">{m.desc}</span>}
        <div className="qbar"><div style={{ width: pct + '%' }} /></div>
        <span className="qp">{m.progress}/{m.target}</span>
        <span className="ct gem">💎 {m.gems}</span>
        {m.claimed
          ? <span className="qclaimed">✓ Claimed</span>
          : <button className={'qbtn' + (m.done ? '' : ' dis')} disabled={!m.done} onClick={() => m.done && onClaim(m.id, kind)}>{m.done ? 'Claim 💎' : 'In progress'}</button>}
      </div>
    );
  };

  return (
    <div className={'panel quests' + (open ? ' open' : '')}>
      <div className="panel-h">
        <span>💎 Gems — {gems} · earn from missions, spend on perks</span>
        <button className="panel-x" onClick={onClose}>✕</button>
      </div>
      <div className="gtabs">
        <button className={tab === 'daily' ? 'on' : ''} onClick={() => setTab('daily')}>📅 Daily</button>
        <button className={tab === 'ach' ? 'on' : ''} onClick={() => setTab('ach')}>🏆 Achievements</button>
        <button className={tab === 'perks' ? 'on' : ''} onClick={() => setTab('perks')}>⚡ Perks</button>
      </div>

      {tab === 'daily' && <div className="cards">{(data?.daily || []).map((m: any) => Card(m, 'daily'))}<div className="ghint">Resets every day — quick gem top-ups.</div></div>}
      {tab === 'ach' && <div className="cards">{(data?.achievements || []).map((m: any) => Card(m, 'achievement'))}</div>}

      {tab === 'perks' && (
        <div className="cards">
          <div className="perk">
            <span className="ic">👷</span>
            <div className="pk-body">
              <b>Extra Builder</b>
              <span className="qd">Hire a permanent extra builder so you can construct/upgrade more at once. You have {1 + owned} builder(s) from gems baseline + huts.</span>
            </div>
            {nextBuilderCost == null
              ? <span className="qclaimed">★ Max</span>
              : <button className={'qbtn' + (gems >= nextBuilderCost ? '' : ' dis')} disabled={gems < nextBuilderCost} onClick={onBuyBuilder}>💎 {nextBuilderCost}</button>}
          </div>
          <div className="perk">
            <span className="ic">💰</span>
            <div className="pk-body">
              <b>Resource Boost 2×</b>
              <span className="qd">Double Gold & Plasma production for {boost.hours}h.</span>
            </div>
            {boostActive
              ? <span className="qclaimed">⏳ {boostLeft}m left</span>
              : <button className={'qbtn' + (gems >= boost.gems ? '' : ' dis')} disabled={gems < boost.gems} onClick={onBoost}>💎 {boost.gems}</button>}
          </div>
          <div className="perk">
            <span className="ic">⚡</span>
            <div className="pk-body">
              <b>Instant Finish</b>
              <span className="qd">Skip any build / upgrade / training timer instantly — open a building in progress and tap <b>Finish now</b>.</span>
            </div>
            <span className="qclaimed">Active</span>
          </div>
        </div>
      )}
    </div>
  );
}
