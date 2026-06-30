// Guided first-play tutorial. step: 1 welcome · 2 collect · 3 build · 4 train · 5 attack · 6 done
const STEPS: Record<number, { n: number; title: string; body: string; cta: string }> = {
  2: { n: 1, title: '💰 Collect Gold', body: 'Your resources are produced automatically. Press the 🪙 Collect All button (bottom-right) to bank them.', cta: 'Press 🪙 Collect All' },
  3: { n: 2, title: '🏗️ Build a Defense', body: 'Open 🏗️ Build, pick a Laser Turret, then tap a green tile on the field to place it.', cta: 'Open 🏗️ Build → place it' },
  4: { n: 3, title: '🤖 Train Robots', body: 'Open 🤖 Army and buy a few Fighters (costs 🟣 Plasma). They train in a few seconds.', cta: 'Open 🤖 Army → train Fighters' },
  5: { n: 4, title: '🗺️ Attack an Outpost!', body: 'Open 🗺️ Campaign and raid "Scrap Outpost". Deploy troops by tapping the field, destroy ≥50% to win + earn 💎!', cta: 'Open 🗺️ Campaign → win' },
};

export function TutorialOverlay({ step, reward, onStart, onSkip, onFinish }: {
  step: number; reward: any; onStart: () => void; onSkip: () => void; onFinish: () => void;
}) {
  if (step === 1) {
    return (
      <div className="tut-greet">
        <img className="tut-greet-char" src="/hero/robot.png" alt="" draggable={false} />
        <div className="tut-greet-bubble">
          <h2>👋 Hello, Commander!</h2>
          <p>I'm <b>STEEL-1</b>, your mentor. Let's learn the 4 steps to dominate: <b>collect → build → train → attack</b>. Every action earns you points!</p>
          <div className="tut-greet-btns">
            <button className="btn up" onClick={onStart}>Start training ▶</button>
            <button className="tut-skip" onClick={onSkip}>Skip</button>
          </div>
        </div>
      </div>
    );
  }
  if (step === 6) {
    return (
      <div className="tut-modal">
        <div className="tut-card">
          <h2>🎉 Great — training complete!</h2>
          <p>You've got the loop down. Here's your starter reward:</p>
          {reward && <div className="tut-reward"><i className="ic-gold" /> +{reward.gold} &nbsp; <i className="ic-plasma" /> +{reward.elixir} &nbsp; 💎 +{reward.gems}</div>}
          <p style={{ opacity: .8, fontSize: 13 }}>Next: farm the 🗺️ Campaign and raid other players in ⚔️ Raid. Happy building!</p>
          <button className="btn up" onClick={onFinish}>Play! 🚀</button>
        </div>
      </div>
    );
  }
  const s = STEPS[step]; if (!s) return null;
  return (
    <div className="tut-banner">
      <span className="tut-step">Step {s.n}/4</span>
      <div className="tut-text"><b>{s.title}</b><span>{s.body}</span></div>
      <span className="tut-cta">👉 {s.cta}</span>
      <button className="tut-skip" onClick={onSkip}>Skip</button>
    </div>
  );
}
