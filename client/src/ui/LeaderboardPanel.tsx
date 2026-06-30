// Global trophy leaderboard + the 5-tier rank ladder. Each base shows its level, army & raid record,
// and a War button so you can scout, then attack a real player straight from the board.
const ARMY_ICON: Record<string, string> = { barbarian: '⚔️', archer: '🏹', wizard: '🔥', giant: '🦾', dragon: '✈️' };

export function LeaderboardPanel({ open, data, onClose, onWar }: { open: boolean; data: any | null; onClose: () => void; onWar?: (id: string) => void }) {
  const me = data?.me;
  const tiers: any[] = data?.tiers || [];
  return (
    <div className={'panel quests' + (open ? ' open' : '')}>
      <div className="panel-h">
        <span>🏆 Leaderboard — scout bases & declare War</span>
        <button className="panel-x" onClick={onClose}>✕</button>
      </div>

      {me && (
        <div className="lb-me">
          <span className="lb-rank">#{me.rank}</span>
          <span className="lb-tier" style={{ color: me.tier.color }}>{me.tier.icon} {me.tier.name}</span>
          <span className="lb-tro">⭐ {me.trophies}</span>
          {me.tier.nextAt != null
            ? <span className="lb-next">{me.tier.nextAt - me.trophies} to {me.tier.nextName}</span>
            : <span className="lb-next">MAX TIER 👑</span>}
        </div>
      )}

      {/* tier ladder */}
      <div className="lb-tiers">
        {tiers.map((t, i) => (
          <div key={i} className={'lb-tierchip' + (me && me.tier.index === i ? ' on' : '')} style={{ borderColor: t.color }}>
            <span style={{ color: t.color }}>{t.icon} {t.name}</span>
            <small>{t.min}+</small>
          </div>
        ))}
      </div>

      <div className="cards">
        {data == null ? <div className="ghint">Loading…</div>
          : (data.top || []).length === 0 ? <div className="ghint">No commanders ranked yet.</div>
          : data.top.map((p: any) => {
            const army = Object.entries(p.army || {}).filter(([, n]) => Number(n) > 0);
            return (
              <div key={p.id} className={'lbrow lbrow-x' + (p.me ? ' me' : '')}>
                <div className="lbx-top">
                  <span className={'lb-pos' + (p.rank <= 3 ? ' top' : '')}>{p.rank <= 3 ? ['🥇', '🥈', '🥉'][p.rank - 1] : '#' + p.rank}</span>
                  <div className="rd-body">
                    <b>{p.username}{p.me ? ' (you)' : ''}</b>
                    <span className="qd" style={{ color: p.tier.color }}>{p.tier.icon} {p.tier.name} · 🛰️ Core {p.th} · ⭐ {p.trophies}</span>
                  </div>
                  {!p.me && onWar && <button className="lb-war" onClick={() => onWar(p.id)}>⚔️ War</button>}
                </div>
                <div className="lbx-meta">
                  <span className="lbx-army" title="Army">🤖 {p.armyCount || 0}{army.length ? ' · ' + army.map(([t, n]) => `${ARMY_ICON[t] || '🔹'}${n}`).join(' ') : ''}</span>
                  <span className="lbx-rec" title="Attacks made · times raided">⚔️{p.attacks || 0} 🛡️{p.defenses || 0}</span>
                  <span className="lbx-stars" title="3★ / 2★ / 1★ wins">⭐⭐⭐{p.win3 || 0} · ⭐⭐{p.win2 || 0} · ⭐{p.win1 || 0}</span>
                </div>
              </div>
            );
          })}
      </div>
    </div>
  );
}
