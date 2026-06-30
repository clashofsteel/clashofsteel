function Stars({ n }: { n: number }) {
  return <span className="cstars">{[0, 1, 2].map((i) => <span key={i} className={'cstar' + (i < n ? ' on' : '')}>★</span>)}</span>;
}

export function CampaignPanel({ open, levels, th, onPlay, onClose }: {
  open: boolean; levels: any[]; th: number; onPlay: (id: number) => void; onClose: () => void;
}) {
  return (
    <div className={'panel campaign' + (open ? ' open' : '')}>
      <div className="panel-h">
        <span>🗺️ Galaxy Campaign — beat levels for guaranteed 💎 + loot</span>
        <button className="panel-x" onClick={onClose}>✕</button>
      </div>
      <div className="cards">
        {(levels || []).map((l) => {
          const cleared = l.stars >= 1;
          const reason = l.unlocked ? '' : (th < l.requiredTH ? `🔒 Core Lv ${l.requiredTH}` : '🔒 clear prev');
          return (
            <button key={l.id} className={'lvlcard' + (l.unlocked ? '' : ' locked') + (cleared ? ' done' : '')}
              onClick={() => l.unlocked && onPlay(l.id)}>
              <span className="lvn">#{l.id}</span>
              <span className="nm">{l.name}</span>
              <Stars n={l.stars} />
              <span className="ct"><i className="ic-gold" />{l.loot.gold} <i className="ic-plasma" />{l.loot.elixir}</span>
              <span className="ct gem">💎 {l.gem}{cleared ? ' ✓' : ''}</span>
              {!l.unlocked && <span className="ct lock">{reason}</span>}
            </button>
          );
        })}
      </div>
    </div>
  );
}
