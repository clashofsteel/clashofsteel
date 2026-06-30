import { useState, useEffect } from 'react';
import troops from '@config/troops.json';

const TROOPS: any = troops;
const fmt = (s: number) => { s = Math.max(0, Math.round(s)); if (s < 60) return s + 's'; const m = Math.floor(s / 60); return m + 'm ' + (s % 60) + 's'; };

export function ArmyPanel({ open, base, onTrain, onClear, onResearch, onFinishTraining, onClose }: {
  open: boolean; base: any; onTrain: (troop: string, count: number) => void; onClear: () => void; onResearch: (troop: string) => void; onFinishTraining: () => void; onClose: () => void;
}) {
  const [qty, setQty] = useState(1);
  const [, setTick] = useState(0);
  useEffect(() => { if (!open) return; const id = setInterval(() => setTick((t) => t + 1), 1000); return () => clearInterval(id); }, [open]);   // live ETA countdown
  const p = base?.player;
  if (!p) return null;
  const army: Record<string, number> = p.army || {};
  const inTraining: Record<string, number> = p.inTraining || {};
  const unlocked: string[] = p.unlockedTroops || [];
  const tlevels: Record<string, number> = p.troopLevels || {};
  const labLevel: number = p.labLevel || 0;
  const free = (p.housingTotal ?? 0) - (p.housingUsed ?? 0);
  const training = Object.values(inTraining).reduce((s, n) => s + Number(n), 0);
  const etaSec = p.trainingDoneAt ? Math.max(0, (p.trainingDoneAt - Date.now()) / 1000) : 0;
  const finishCost = Math.max(1, Math.ceil(etaSec / 2));
  const clamp = (n: number) => Math.max(1, Math.min(99, Math.floor(n) || 1));

  return (
    <div className={'panel army' + (open ? ' open' : '')}>
      <div className="panel-h">
        <span>🤖 Robot Army · 🏠 {p.housingUsed ?? 0}/{p.housingTotal ?? 0}{training ? ` · ⏳ ${training} training` : ''}</span>
        <button className="panel-x" onClick={onClose}>✕</button>
      </div>

      {training > 0 && (
        <div className="train-eta">
          <span>⏱️ All robots ready in <b>{fmt(etaSec)}</b></span>
          <button className="finishbtn" onClick={onFinishTraining}>⚡ Finish now · {finishCost}💠</button>
        </div>
      )}
      {p.housingTotal === 0 && <div className="army-hint">Build a 🤖 <b>Mech Bay</b> to house robots (1 bay = 10 slots).</div>}

      <div className="qtybar">
        <span className="qlabel">Buy ×</span>
        <button className="qstep" onClick={() => setQty((q) => clamp(q - 1))}>−</button>
        <input className="qinput" type="number" min={1} max={99} value={qty} onChange={(e) => setQty(clamp(Number(e.target.value)))} />
        <button className="qstep" onClick={() => setQty((q) => clamp(q + 1))}>+</button>
        {[5, 10, 25].map((n) => <button key={n} className={'qbtn' + (qty === n ? ' on' : '')} onClick={() => setQty(n)}>{n}</button>)}
        <button className="qbtn clear" onClick={onClear}>🗑️ Disband</button>
      </div>

      <div className="cards">
        {Object.keys(TROOPS).map((key) => {
          const t = TROOPS[key];
          const lock = !unlocked.includes(key);
          const cost = (t.trainCost?.elixir || 0) * qty;
          const need = (t.housing || 1) * qty;
          const time = (t.trainTimeSec ?? 5) * qty;
          const noRoom = need > free;
          const poor = p.elixir < cost;
          const dis = lock || noRoom || poor;
          const tl = tlevels[key] || 1;
          const lv = t.levels?.[String(tl)] || t.levels?.['1'] || {};
          const maxLv = Math.max(...Object.keys(t.levels || { 1: 0 }).map(Number));
          const resCost = t.levels?.[String(tl + 1)]?.researchCost?.elixir || 0;
          const maxed = tl >= maxLv;
          const labLocks = tl + 1 > labLevel + 1;            // need a higher Lab
          const canRes = !lock && !maxed && (p.devMode || (labLevel >= 1 && !labLocks && p.elixir >= resCost));
          const buy = () => !dis && onTrain(key, qty);
          return (
            <div key={key} className={'bcard troopcard' + (dis ? ' locked' : '')}>
              <span className="ic" onClick={buy}><img className="ic-img" src={`/models/thumbs/troop_${key}.png`} alt={t.icon} /></span>
              <span className="nm" onClick={buy}>{t.name} <b className="tlv">Lv{tl}</b></span>
              <span className="ct" style={{ opacity: .8 }} onClick={buy}>❤️{lv.hp} ⚔️{lv.dps}</span>
              <span className="ct" onClick={buy}><i className="ic-plasma" />{cost} · 🏠{need}</span>
              <span className="ct time" onClick={buy}>⏱️ {fmt(time)} {qty > 1 ? <small>({t.trainTimeSec}s ea)</small> : ''}</span>
              <span className="ct have" onClick={buy}>{lock ? `🔒 Core Lv ${t.unlockLevel}` : `owned ${army[key] || 0}${inTraining[key] ? ` +${inTraining[key]}⏳` : ''}`}</span>
              <button className={'resbtn' + (canRes ? '' : ' dis')} disabled={!canRes} onClick={() => canRes && onResearch(key)}>
                {lock ? 'Train' : maxed ? '★ Max Lv' : labLevel < 1 ? '🔬 Need Lab' : labLocks ? `🔬 Lab Lv${tl}` : `⬆️ Lv${tl + 1} · 🟣${resCost}`}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
