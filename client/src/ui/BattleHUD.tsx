import troops from '@config/troops.json';

const TROOPS: any = troops;

function Stars({ n }: { n: number }) {
  return <span className="stars">{[0, 1, 2].map((i) => <span key={i} className={'star' + (i < n ? ' on' : '')}>★</span>)}</span>;
}

export function BattleHUD({ hud, result, opponent, replay, onDeploy, onEnd, onResultClose }: {
  hud: any; result: any; opponent: any; replay?: boolean; onDeploy: (t: string) => void; onEnd: () => void; onResultClose: () => void;
}) {
  if (result) {
    if (replay || result.replay) {
      return (
        <div className="battle-result">
          <div className="br-card">
            <h2>🎬 Replay finished</h2>
            {opponent && <div className="br-opp">{opponent.username}</div>}
            <div className="br-stars"><Stars n={result.stars || 0} /></div>
            <div className="br-pct">{Math.round((result.destructionPct ?? result.pct ?? 0) * 100)}% of your base was destroyed</div>
            <button className="btn up" onClick={onResultClose}>Return to base ▶</button>
          </div>
        </div>
      );
    }
    const win = result.stars > 0;
    return (
      <div className="battle-result">
        <div className="br-card">
          <h2>{win ? '🏆 VICTORY' : '💥 DEFEAT'}</h2>
          {opponent && <div className="br-opp">vs {opponent.username}</div>}
          <div className="br-stars"><Stars n={result.stars} /></div>
          <div className="br-pct">{Math.round(result.pct * 100)}% destroyed</div>
          <div className="br-loot">
            <span><i className="ic-gold" /> +{result.goldWon}</span>
            <span><i className="ic-plasma" /> +{result.elixWon}</span>
            {result.gemWon > 0 && <span>💎 +{result.gemWon}</span>}
            {result.trophies > 0 && <span>🏅 +{result.trophies}</span>}
          </div>
          {result.gemWon > 0 && <div className="br-opp">⭐ First clear bonus!</div>}
          <button className="btn up" onClick={onResultClose}>Return to base ▶</button>
        </div>
      </div>
    );
  }
  if (!hud) return null;
  const remaining: Record<string, number> = hud.remaining || {};
  const keys = Object.keys(remaining);
  const tleft = Math.ceil(hud.timeLeft || 0);

  return (
    <>
      <div className="battle-top">
        {opponent && <span className="bt-opp">{replay ? '🎬' : '⚔️'} {opponent.username}</span>}
        <Stars n={hud.stars} />
        <span className="bt-pct">{Math.round((hud.pct || 0) * 100)}%</span>
        <span className="bt-time">⏱️ {tleft}s</span>
        <button className="bt-end" onClick={onEnd}>{replay ? '✕ Exit' : '🏳️ End'}</button>
      </div>

      {replay ? (
        <div className="battle-hint">🎬 Replay — watch how your base was attacked (your units green · attacker yellow)</div>
      ) : (<>
        <div className="battle-tray">
          {keys.length === 0
            ? <div className="bt-hint">{hud.onField > 0 ? 'Robots fighting… ⚔️' : 'No robots left — End to finish'}</div>
            : keys.map((t) => (
              <button key={t} className={'troopbtn' + (hud.deployType === t ? ' on' : '')} onClick={() => onDeploy(t)}>
                <span className="ic">{TROOPS[t]?.icon}</span>
                <span className="nm">{TROOPS[t]?.name}</span>
                <span className="ct">×{remaining[t]}</span>
              </button>
            ))}
        </div>
        <div className="battle-hint">Tap the battlefield to deploy 🤖 {hud.deployType ? TROOPS[hud.deployType]?.name : ''}</div>
      </>)}
    </>
  );
}
