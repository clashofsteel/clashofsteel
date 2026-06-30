// Quick reference card so new players (and demo visitors) understand what each building does.
export function HowToPlay({ open, onClose }: { open: boolean; onClose: () => void }) {
  if (!open) return null;
  return (
    <div className="htp-overlay" onClick={onClose}>
      <div className="htp-card" onClick={(e) => e.stopPropagation()}>
        <div className="htp-head">
          <h2>📖 How to Play</h2>
          <button className="htp-x" onClick={onClose}>✕</button>
        </div>
        <p className="htp-goal">🎯 Build your robot base, train an army, then <b>Raid</b> enemies & climb the ranks to <b>Legend 👑</b>.</p>

        <div className="htp-step"><span className="htp-ic">🪙</span><div><b>Collect</b> — tap <b>Collect All</b> to gather the Gold & Plasma your buildings produce.</div></div>
        <div className="htp-step"><span className="htp-ic">🏗️</span><div><b>Build &amp; Upgrade</b> — open the <b>Build</b> menu and place / level up buildings:</div></div>

        <div className="htp-grid">
          <div className="htp-b"><b>⛏️ Gold Mine</b><span>makes Gold</span></div>
          <div className="htp-b"><b>⚡ Plasma Reactor</b><span>makes Plasma</span></div>
          <div className="htp-b"><b>🏦 Storages</b><span>+ resource capacity</span></div>
          <div className="htp-b"><b>🔫 Cannon / Turret</b><span>defend your base</span></div>
          <div className="htp-b"><b>🤖 Mech Bay</b><span>+ army slots (more troops)</span></div>
          <div className="htp-b"><b>👷 Worker House</b><span>+ builders (build faster)</span></div>
          <div className="htp-b"><b>🛰️ Command Core</b><span>upgrade → unlock more</span></div>
          <div className="htp-b"><b>🧪 Research Lab</b><span>level up your troops</span></div>
        </div>

        <div className="htp-step"><span className="htp-ic">⚔️</span><div><b>Train &amp; Raid</b> — train robots in the <b>Army</b> menu, then <b>Raid</b> AI bases or hit <b>War</b> to attack real players for loot &amp; ⭐.</div></div>
        <div className="htp-step"><span className="htp-ic">💎</span><div><b>Gems</b> — speed up builds &amp; training, buy extra builders, or grab a 2× resource boost.</div></div>

        <button className="btn up htp-go" onClick={onClose}>Got it — let's build! 🚀</button>
      </div>
    </div>
  );
}
