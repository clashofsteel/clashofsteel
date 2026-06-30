function ago(ms: number) {
  const s = Math.max(0, Math.floor((Date.now() - ms) / 1000));
  if (s < 60) return s + 's ago';
  const m = Math.floor(s / 60); if (m < 60) return m + 'm ago';
  const h = Math.floor(m / 60); if (h < 24) return h + 'h ago';
  return Math.floor(h / 24) + 'd ago';
}

export function DefenseLogPanel({ open, raids, onReplay, onClose }: { open: boolean; raids: any[] | null; onReplay: (id: string) => void; onClose: () => void }) {
  return (
    <div className={'panel quests' + (open ? ' open' : '')}>
      <div className="panel-h">
        <span>🛡️ Defense Log — recent raids on your base</span>
        <button className="panel-x" onClick={onClose}>✕</button>
      </div>
      <div className="cards">
        {raids == null ? <div className="ghint">Loading…</div>
          : raids.length === 0 ? <div className="ghint">No one has raided your base yet. Build up those defenses! 🛡️</div>
          : raids.map((r, i) => (
            <div key={r.id || i} className="raidrow">
              <span className="ic">{r.stars >= 2 ? '💥' : r.stars >= 1 ? '⚠️' : '🛡️'}</span>
              <div className="rd-body">
                <b>{r.attackerName}</b>
                <span className="qd">{'⭐'.repeat(r.stars)}{'☆'.repeat(3 - r.stars)} · {r.destruction}% · {r.trophyLoss > 0 && <b className="tloss">−{r.trophyLoss}🏅</b>} {ago(r.at)}</span>
              </div>
              <span className="rd-loot">{r.gold ? <><i className="ic-gold" />{r.gold} </> : ''}{r.elixir ? <><i className="ic-plasma" />{r.elixir}</> : ''}{!r.gold && !r.elixir ? 'defended!' : ''}</span>
              {r.replayable && <button className="replaybtn" onClick={() => onReplay(r.id)}>▶ Watch</button>}
            </div>
          ))}
      </div>
    </div>
  );
}
