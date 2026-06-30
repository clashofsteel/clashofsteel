import buildings from '@config/buildings.json';
import townhall from '@config/townhall.json';

const DEF: any = buildings;
const TH: any = townhall;

function fmt(s: number) {
  if (s <= 0) return 'instant';
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), ss = s % 60;
  if (h) return `${h}h ${m}m`; if (m) return `${m}m ${ss}s`; return `${ss}s`;
}

export function BuildingDialog({ b, base, onClose, onUpgrade, onSpeedup, onCollect, onSell }: {
  b: any; base: any; onClose: () => void; onUpgrade: (id: string) => void; onSpeedup: (id: string) => void; onCollect: () => void; onSell: (id: string) => void;
}) {
  const def = DEF[b.type]; if (!def) return null;
  // 90% refund of everything invested (build + upgrades)
  let refG = 0, refE = 0;
  for (let L = 1; L <= Math.max(1, b.level); L++) { const c = def.levels?.[String(L)]?.buildCost || {}; refG += c.gold || 0; refE += c.elixir || 0; }
  refG = Math.floor(refG * 0.9); refE = Math.floor(refE * 0.9);
  const canCollect = def.produces && b.storedAmount >= 1 && b.level >= 1;
  const cur = def.levels?.[String(b.level)] || {};
  const inProgress = !!b.upgradeCompletesAt || b.level < 1;
  const gemCost = b.upgradeCompletesAt ? Math.max(1, Math.ceil(Math.max(0, (b.upgradeCompletesAt - Date.now()) / 1000) / 2)) : 1;

  let next: any = null, capped = false, isTH = b.type === 'town_hall';
  if (isTH) { next = TH[String(b.level + 1)]; }
  else {
    next = def.levels?.[String(b.level + 1)] || null;
    const cap = TH[String(base.player.townHallLevel)]?.maxBuildingLevel?.[b.type] ?? 1;
    if (next && b.level >= cap) capped = true;
  }
  const cost = next?.buildCost || {};
  const afford = base.player.gold >= (cost.gold || 0) && base.player.elixir >= (cost.elixir || 0);
  const haveBuilder = base.player.buildersFree > 0 || (next?.buildTimeSec || 0) === 0;
  const canUp = next && !capped && !inProgress && afford && haveBuilder;

  return (
    <div className="dialog">
      <h3>{def.name} <span className="x" onClick={onClose}>✕</span></h3>
      <div className="row">Level {b.level < 1 ? '🏗️ building…' : b.level} · 🛡️ {cur.hp ?? '—'}</div>
      {def.produces && <div className="row">Produces {def.produces === 'gold' ? <><i className="ic-gold" /> Gold</> : <><i className="ic-plasma" /> Plasma</>} {cur.ratePerHour}/h · stores {cur.capacity}</div>}
      {def.category === 'storage' && <div className="row">Storage +{cur.storageCapacity}</div>}
      {def.category === 'defense' && <div className="row">🎯 DPS {cur.dps}{cur.shots ? ` · ${cur.shots} shots` : ''}</div>}
      {def.house && cur.housing && <div className="row">🤖 Troop housing +{cur.housing}</div>}
      {def.workers && <div className="row">👷 +{def.workers} workers</div>}

      {canCollect && (
        <button className="btn collect" onClick={onCollect}>
          {def.produces === 'gold' ? <i className="ic-gold" /> : <i className="ic-plasma" />} Collect {b.storedAmount}
        </button>
      )}

      {inProgress ? (
        <button className="btn up" onClick={() => onSpeedup(b.id)}>
          ⚡ Finish now<br /><small>{gemCost} 💠 gems</small>
        </button>
      ) : !next || capped ? (
        capped
          ? <button className="btn dis" disabled>🔒 Upgrade Command Core to unlock Lv {b.level + 1}</button>
          : <button className="btn dis" disabled>★ Max level</button>
      ) : (
        <button className={'btn ' + (canUp ? 'up' : 'dis')} disabled={!canUp} onClick={() => onUpgrade(b.id)}>
          ⬆️ Upgrade to Lv {b.level + 1}<br />
          <small>{cost.gold ? <><i className="ic-gold" />{cost.gold} </> : ''}{cost.elixir ? <><i className="ic-plasma" />{cost.elixir} </> : ''}· ⏱️ {fmt(next.buildTimeSec)}{!haveBuilder ? ' · 👷 busy' : ''}</small>
        </button>
      )}
      {b.type !== 'town_hall' && b.level >= 1 && (
        <button className="btn sell" onClick={() => { if (confirm(`Sell ${def.name}? You get back ${refG ? '🪙' + refG + ' ' : ''}${refE ? '🟣' + refE : ''}`)) onSell(b.id); }}>
          💰 Sell <small>refund {refG ? <><i className="ic-gold" />{refG} </> : ''}{refE ? <><i className="ic-plasma" />{refE}</> : ''}</small>
        </button>
      )}
      {b.type !== 'town_hall' && <div className="row" style={{ opacity: .6, marginTop: 6 }}>✋ Drag to move</div>}
    </div>
  );
}
