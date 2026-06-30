import buildings from '@config/buildings.json';
import townhall from '@config/townhall.json';

const DEF: any = buildings;
const TH: any = townhall;
const ICON: Record<string, string> = {
  cannon: '🔫', archer_tower: '🗼', mortar: '💥', wall: '🛡️',
  gold_mine: '⛏️', elixir_collector: '🔬', gold_storage: '🏦', elixir_storage: '🔋', army_camp: '🤖', builders_hut: '👷', lab: '🧪',
};
// types that have a rendered 3D-model icon (PNG in /models/thumbs/)
const GLB_ICON = new Set(['cannon', 'archer_tower', 'mortar', 'wall', 'gold_mine', 'elixir_collector', 'gold_storage', 'elixir_storage', 'army_camp', 'builders_hut']);
const ORDER = ['cannon', 'archer_tower', 'mortar', 'wall', 'gold_mine', 'gold_storage', 'elixir_collector', 'elixir_storage', 'army_camp', 'builders_hut', 'lab'];

export function BuildMenu({ open, base, selected, onPick, onClose }: { open: boolean; base: any; selected: string | null; onPick: (t: string) => void; onClose: () => void }) {
  const th = TH[String(base?.player.townHallLevel || 1)];
  const counts: Record<string, number> = {};
  base?.buildings.forEach((b: any) => { counts[b.type] = (counts[b.type] || 0) + 1; });

  return (
    <div className={'panel' + (open ? ' open' : '')}>
      <div className="panel-h">
        <span>🏗️ Construct · 🛰️ Core {base?.player.townHallLevel}</span>
        <button className="panel-x" onClick={onClose}>✕</button>
      </div>
      <div className="cards">
        {ORDER.map((type) => {
          const def = DEF[type]; if (!def) return null;
          const lv1 = def.levels?.['1'] || {};
          const limit = th?.maxBuildings?.[type] ?? 0;
          const have = counts[type] || 0;
          const locked = have >= limit;
          const cost = lv1.buildCost || {};
          const note = limit === 0 ? '🔒 Core Lv up' : (locked ? `max ${limit}` : `${have}/${limit}`);
          return (
            <button key={type} className={'bcard' + (selected === type ? ' sel' : '') + (locked ? ' locked' : '')}
              onClick={() => !locked && onPick(type)}>
              <span className="ic">{GLB_ICON.has(type) ? <img className="ic-img" src={`/models/thumbs/${type}.png`} alt="" /> : ICON[type]}</span>
              <span className="nm">{def.name}</span>
              <span className="ct">{cost.gold ? <><i className="ic-gold" />{cost.gold} </> : ''}{cost.elixir ? <><i className="ic-plasma" />{cost.elixir}</> : ''}</span>
              {lv1.buildTimeSec > 0 && <span className="ct time">⏱️ {lv1.buildTimeSec}s</span>}
              <span className="ct" style={{ opacity: .6 }}>{note}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
