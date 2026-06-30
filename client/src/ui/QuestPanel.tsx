export function QuestPanel({ open, quests, onClaim, onClose }: {
  open: boolean; quests: any[]; onClaim: (id: string) => void; onClose: () => void;
}) {
  const rewardEls = (r: any) => <>{r.gold ? <><i className="ic-gold" />{r.gold} </> : ''}{r.elixir ? <><i className="ic-plasma" />{r.elixir} </> : ''}{r.gems ? <>💎{r.gems}</> : ''}</>;
  return (
    <div className={'panel quests' + (open ? ' open' : '')}>
      <div className="panel-h">
        <span>📜 Quests — complete goals for rewards</span>
        <button className="panel-x" onClick={onClose}>✕</button>
      </div>
      <div className="cards">
        {(quests || []).map((q) => {
          const pct = Math.min(100, Math.round((q.progress / q.target) * 100));
          return (
            <div key={q.id} className={'qcard' + (q.claimed ? ' claimed' : q.done ? ' done' : '')}>
              <span className="ic">{q.icon}</span>
              <span className="nm">{q.title}</span>
              <span className="qd">{q.desc}</span>
              <div className="qbar"><div style={{ width: pct + '%' }} /></div>
              <span className="qp">{q.progress}/{q.target}</span>
              <span className="ct gem">{rewardEls(q.reward)}</span>
              {q.claimed
                ? <span className="qclaimed">✓ Claimed</span>
                : <button className={'qbtn' + (q.done ? '' : ' dis')} disabled={!q.done} onClick={() => q.done && onClaim(q.id)}>{q.done ? 'Claim 🎁' : 'In progress'}</button>}
            </div>
          );
        })}
      </div>
    </div>
  );
}
