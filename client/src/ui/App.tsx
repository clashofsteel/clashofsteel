import { useEffect, useRef, useState } from 'react';
import { api, clearToken } from '../api';
import { useStore } from '../store';
import { Scene } from '../game/scene';
import buildings from '@config/buildings.json';
import { LoginScreen } from './LoginScreen';
import { Hero } from './Hero';
import { ResourceBar } from './ResourceBar';
import { BuildMenu } from './BuildMenu';
import { BuildingDialog } from './BuildingDialog';
import { ArmyPanel } from './ArmyPanel';
import { CampaignPanel } from './CampaignPanel';
import { QuestPanel } from './QuestPanel';
import { GemsPanel } from './GemsPanel';
import { DefenseLogPanel } from './DefenseLogPanel';
import { LeaderboardPanel } from './LeaderboardPanel';
import { ClanPanel } from './ClanPanel';
import { Icon } from './icons';
import { BattleHUD } from './BattleHUD';
import { TutorialOverlay } from './TutorialOverlay';
import { HowToPlay } from './HowToPlay';
import { LoadingScreen } from './LoadingScreen';
import { sfx } from '../sfx';

const DEF: any = buildings;

// live "everything finishes in Xs" chip — counts down army training + building upgrades
function TotalEta({ allDoneAt }: { allDoneAt: number }) {
  const [, setTick] = useState(0);
  useEffect(() => { const id = setInterval(() => setTick((t) => t + 1), 1000); return () => clearInterval(id); }, []);
  const left = allDoneAt ? (allDoneAt - Date.now()) / 1000 : 0;
  if (left <= 0) return null;
  const s = Math.round(left), fmt = s < 60 ? s + 's' : Math.floor(s / 60) + 'm ' + (s % 60) + 's';
  return <div className="total-eta">⏱️ Everything ready in <b>{fmt}</b></div>;
}

// demo countdown ribbon — shows the remaining time of a 20-min full-level demo; fires onExpire at 0
function DemoBanner({ expiresAt, onExpire }: { expiresAt: number; onExpire: () => void }) {
  const [, setTick] = useState(0);
  useEffect(() => { const id = setInterval(() => setTick((t) => t + 1), 1000); return () => clearInterval(id); }, []);
  const left = Math.max(0, expiresAt - Date.now());
  useEffect(() => { if (left <= 0) onExpire(); }, [left]);
  const s = Math.floor(left / 1000), mm = Math.floor(s / 60), ss = s % 60;
  return (
    <div className={'demo-banner' + (s <= 60 ? ' urgent' : '')}>
      🎮 DEMO · Unlimited Money — <b>{mm}:{String(ss).padStart(2, '0')}</b> left
      <span className="db-note">connect Phantom to keep your own base</span>
    </div>
  );
}

export function App() {
  const token = useStore((s) => s.token);
  const setToken = useStore((s) => s.setToken);
  const [guest, setGuest] = useState(false);
  const [splash, setSplash] = useState(false);
  const [splashClosing, setSplashClosing] = useState(false);
  const pendingTok = useRef('');

  // on auth: play the Clash-style loading splash for ~3.2s, THEN enter the game
  const auth = (t: string) => {
    pendingTok.current = t;
    setSplash(true);
    setTimeout(() => setSplashClosing(true), 2700);
    setTimeout(() => { setSplash(false); setSplashClosing(false); setToken(pendingTok.current); }, 3200);
  };

  // music: hero track (sound1) on the landing, in-game track (sound2) once you're playing.
  // autoplay is blocked until a gesture, so prime audio on the first click anywhere.
  useEffect(() => {
    const prime = () => sfx.unlock();
    window.addEventListener('pointerdown', prime, { once: true });
    return () => window.removeEventListener('pointerdown', prime);
  }, []);
  useEffect(() => { sfx.setMusicMode(token ? 'game' : 'hero'); }, [token]);
  // every button gives a soft tactile blip (on top of any action-specific sound)
  useEffect(() => {
    const press = (e: any) => { if (e.target?.closest?.('button')) sfx.press(); };
    document.addEventListener('click', press);
    return () => document.removeEventListener('click', press);
  }, []);

  if (splash) return <LoadingScreen closing={splashClosing} />;
  if (!token) return guest
    ? <LoginScreen onAuth={auth} onBack={() => setGuest(false)} />
    : <Hero onAuth={auth} onGuest={() => setGuest(true)} />;
  return <Game />;
}

function Game() {
  const elRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<Scene | null>(null);
  const [panel, setPanel] = useState<'none' | 'build' | 'army' | 'campaign' | 'quests' | 'gems' | 'defense' | 'clan' | 'leaderboard'>('none');
  const [leaderboard, setLeaderboard] = useState<any | null>(null);
  const [gemData, setGemData] = useState<any>(null);
  const [raidLog, setRaidLog] = useState<any[] | null>(null);
  const [raidMenu, setRaidMenu] = useState(false);
  const [warMatch, setWarMatch] = useState<any | null>(null);   // found PvP opponent (preview before attacking)
  const [warSearching, setWarSearching] = useState(false);
  const [orbit, setOrbit] = useState(false);
  const [replayMode, setReplayMode] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [musicOff, setMusicOff] = useState(false);
  const [sfxOff, setSfxOff] = useState(false);
  const [showNameModal, setShowNameModal] = useState(false);
  const [nameInput, setNameInput] = useState('');
  const namePrompted = useRef(false);
  const [campaignLevels, setCampaignLevels] = useState<any[]>([]);
  const [questList, setQuestList] = useState<any[]>([]);
  const [clanData, setClanData] = useState<any>(null);
  const [clanList, setClanList] = useState<any[]>([]);
  const [inBattle, setInBattle] = useState(false);
  const [battleHud, setBattleHud] = useState<any>(null);
  const [battleResult, setBattleResult] = useState<any>(null);
  const [opponent, setOpponent] = useState<any>(null);
  const battling = useRef(false);
  const battleId = useRef<string | null>(null);
  const pendingBase = useRef<any>(null);
  const [tutStep, setTutStep] = useState(0);       // 0 off · 1 welcome · 2 collect · 3 build · 4 train · 5 attack · 6 done
  const [demoOver, setDemoOver] = useState(false); // demo's 30 min is up → lock-out modal
  const [showHelp, setShowHelp] = useState(false); // How-to-Play card
  const [tutReward, setTutReward] = useState<any>(null);
  const [rewardModal, setRewardModal] = useState<any>(null);
  const tutInit = useRef(false);

  const base = useStore((s) => s.base);
  const selected = useStore((s) => s.selected);
  const buildMode = useStore((s) => s.buildMode);
  const error = useStore((s) => s.error);
  const { setBase, setSelected, setBuildMode, setError } = useStore.getState();

  function applyBase(b: any) {
    setBase(b);
    if (sceneRef.current) sceneRef.current.troopLevels = b?.player?.troopLevels || {};   // leveled troop stats in battle
    sceneRef.current?.setState(b);
    const sel = useStore.getState().selected;
    if (sel) { const fresh = b.buildings.find((x: any) => x.id === sel.id); setSelected(fresh || null); }
  }
  const refresh = () => { if (battling.current) return; api.base().then(applyBase).catch((e) => { if (e?.body?.error === 'demo_expired') setDemoOver(true); else setError(e.message); }); };

  useEffect(() => {
    let alive = true;
    (async () => {
      const sc = new Scene();
      await sc.init(elRef.current!);
      if (!alive) return;
      sceneRef.current = sc;
      sc.onOrbit = (on) => setOrbit(on);   // keep the 360° button in sync when a manual drag stops the spin
      sc.onPlace = (type, x, y) => { api.build(type, x, y).then((b) => { sfx.build(); applyBase(b); setTimeout(refresh, 3300); setTutStep((s) => (s === 3 ? 4 : s)); }).catch((e) => setError(e.message)); };
      sc.onMove = (b, x, y) => { api.move(b.id, x, y).then((bb) => { sfx.build(); applyBase(bb); }).catch((e) => { setError(e.message); refresh(); }); };   // drag-to-relocate
      sc.onSelect = (b) => setSelected(b);   // every building opens its info dialog
      sc.onCollect = (id?: string) => collect(id);   // tap the floating amount over a producer to collect just that one
      refresh();
    })();
    const prime = () => sfx.unlock();
    window.addEventListener('pointerdown', prime, { once: true });   // resume audio on first gesture
    const poll = setInterval(refresh, 5000);
    return () => { alive = false; clearInterval(poll); window.removeEventListener('pointerdown', prime); };
  }, []);

  // demo lock-out — the server flags demoExpired once the 30 min elapses (polled every 5s)
  useEffect(() => { if (base?.player?.demoExpired) setDemoOver(true); }, [base]);
  // show How-to-Play once per browser, the first time the base loads
  useEffect(() => { if (base?.player && !localStorage.getItem('coc_help_seen')) { localStorage.setItem('coc_help_seen', '1'); setShowHelp(true); } }, [base]);
  // first login with no base name (real accounts only) → ask them to name their base
  useEffect(() => {
    if (!namePrompted.current && base?.player && !base.player.displayName && !base.player.demoExpiresAt) {
      namePrompted.current = true; setNameInput(''); setShowNameModal(true);
    }
  }, [base]);
  const saveName = () => api.setName(nameInput.trim()).then((b) => { applyBase(b); setShowNameModal(false); }).catch((e) => setError(e.message));

  // start the tutorial once for a brand-new player
  useEffect(() => {
    if (!tutInit.current && base?.player) {
      tutInit.current = true;
      if (base.player.tutorialDone === false) setTutStep(1);
    }
  }, [base]);
  // on reaching the final step, grant the one-time reward
  useEffect(() => {
    if (tutStep === 6 && !tutReward) {
      api.tutorialClaim().then((res) => { sfx.reward(); setTutReward(res.reward || { gold: 1000, elixir: 1000, gems: 15 }); applyBase(res); })
        .catch(() => setTutReward({ gold: 1000, elixir: 1000, gems: 15 }));
    }
  }, [tutStep]);

  useEffect(() => { sceneRef.current?.setBuildMode(buildMode); }, [buildMode]);
  useEffect(() => { if (panel !== 'clan') return; const t = setInterval(loadClan, 3000); return () => clearInterval(t); }, [panel]);
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape' && !inBattle) { setBuildMode(null); setSelected(null); setPanel('none'); } };
    window.addEventListener('keydown', h); return () => window.removeEventListener('keydown', h);
  }, [inBattle]);

  const pick = (t: string) => { setBuildMode(buildMode === t ? null : t); };
  const upgrade = (id: string) => api.upgrade(id).then((b) => { applyBase(b); setTimeout(refresh, 3300); }).catch((e) => setError(e.message));
  const speedup = (id: string) => api.speedup(id).then(applyBase).catch((e) => setError(e.message));
  const collect = (id?: string) => api.collect(id).then((b) => { sfx.collect(); applyBase(b); setTutStep((s) => (s === 2 ? 3 : s)); if (b.storageFull?.gold || b.storageFull?.elixir) setError(`⚠️ ${b.storageFull.gold ? 'Gold' : 'Plasma'} storage full — build or upgrade a ${b.storageFull.gold ? 'Gold' : 'Plasma'} Storage to hold more.`); }).catch((e) => setError(e.message));
  const sell = (id: string) => api.sell(id).then((b) => { sfx.collect(); applyBase(b); setSelected(null); }).catch((e) => setError(e.message));
  const train = (troop: string, count: number) => api.train(troop, count).then((b) => { applyBase(b); setTimeout(refresh, 2300); setTutStep((s) => (s === 4 ? 5 : s)); }).catch((e) => setError(e.message));
  const research = (troop: string) => api.research(troop).then((b) => { sfx.reward(); applyBase(b); }).catch((e) => setError(e.message));
  const finishTraining = () => api.trainFinish().then((b) => { sfx.reward(); applyBase(b); }).catch((e) => setError(e.message));
  const clearArmy = () => api.armyClear().then(applyBase).catch((e) => setError(e.message));
  const claimDaily = () => api.dailyClaim().then((res) => { sfx.reward(); applyBase(res); setRewardModal({ title: '🎁 Daily Reward!', sub: 'Your daily login reward is in.', reward: res.reward }); }).catch((e) => setError(e.message));
  const loadQuests = () => api.questsList().then((r) => setQuestList(r.quests)).catch(() => {});
  const claimQuest = (id: string) => api.questsClaim(id).then((res) => { sfx.reward(); applyBase(res); setRewardModal({ title: '📜 Quest Complete!', sub: 'Reward claimed.', reward: res.reward }); loadQuests(); }).catch((e) => setError(e.message));
  const loadGems = () => api.gemsMissions().then(setGemData).catch(() => {});
  const claimGem = (id: string, kind: 'achievement' | 'daily') => api.gemsClaim(id, kind).then((res) => { sfx.reward(); applyBase(res); setRewardModal({ title: '💎 Reward Claimed!', sub: 'Gems added to your stash.', reward: res.reward }); loadGems(); }).catch((e) => setError(e.message));
  const buyBuilder = () => api.gemsBuilder().then((b) => { sfx.build(); applyBase(b); }).catch((e) => setError(e.message));
  const boostRes = () => api.gemsBoost().then((b) => { sfx.reward(); applyBase(b); }).catch((e) => setError(e.message));
  const loadDefenseLog = () => { setRaidLog(null); api.defenseLog().then((r) => setRaidLog(r.raids)).catch(() => setRaidLog([])); };
  const loadLeaderboard = () => { setLeaderboard(null); api.leaderboard().then(setLeaderboard).catch(() => setLeaderboard({ top: [] })); };
  const toggleOrbit = () => { const sc = sceneRef.current; if (!sc) return; const v = !orbit; setOrbit(v); sc.autoOrbit = v; };
  const resetView = () => { sceneRef.current?.resetCamera(); setOrbit(false); };   // back to default camera
  const godMode = () => api.devGod().then((b) => { sfx.reward(); applyBase(b); }).catch((e) => setError(e.message));
  const loadCampaign = () => api.campaignList().then((r) => setCampaignLevels(r.levels)).catch(() => {});
  const loadClan = () => api.clanMe().then((r) => setClanData(r.clan)).catch(() => {});
  const loadClanList = () => api.clanList().then((r) => setClanList(r.clans)).catch(() => {});
  const createClan = (n: string, t: string, d: string) => api.clanCreate(n, t, d).then((r) => { sfx.reward(); setClanData(r.clan); refresh(); }).catch((e) => setError(e.message));
  const joinClan = (id: string) => api.clanJoin(id).then((r) => { setClanData(r.clan); refresh(); }).catch((e) => setError(e.message));
  const leaveClan = () => api.clanLeave().then((r) => { setClanData(r.clan); loadClanList(); refresh(); }).catch((e) => setError(e.message));
  const chatClan = (text: string) => api.clanChat(text).then((r) => setClanData(r.clan)).catch((e) => setError(e.message));
  const warStart = () => api.clanWarStart().then((r) => setClanData(r.clan)).catch((e) => setError(e.message));
  const warAttack = (idx: number) => api.clanWarAttack(idx).then(beginBattle).catch((e) => setError(e.message));
  const toggle = (p: 'build' | 'army' | 'campaign' | 'quests' | 'gems' | 'defense' | 'clan' | 'leaderboard') => {
    const next = panel === p ? 'none' : p;
    setPanel(next); setBuildMode(null); setSelected(null);
    if (next === 'campaign') loadCampaign();
    if (next === 'quests') loadQuests();
    if (next === 'gems') loadGems();
    if (next === 'defense') loadDefenseLog();
    if (next === 'leaderboard') loadLeaderboard();
    if (next === 'clan') { loadClan(); loadClanList(); }
  };

  // ---- battle flow (shared by PvP find + campaign) ----
  const beginBattle = (info: any) => {
    const sc = sceneRef.current; if (!sc) return;
    sfx.setMusicMode('war');   // thrilling battle music
    sc.autoOrbit = false; setOrbit(false);   // stop 360° camera before a fight
    battleId.current = info.battleId;
    battling.current = true;
    setPanel('none'); setBuildMode(null); setSelected(null);
    setBattleResult(null); setOpponent(info.opponent || null);
    setBattleHud({ pct: 0, stars: 0, onField: 0, remaining: info.army, deployType: Object.keys(info.army)[0] || null, timeLeft: 120 });
    setInBattle(true);
    sc.onBattleUpdate = (s) => setBattleHud(s);
    sc.onBattleEnd = async (r) => {
      try {
        const res = await api.attackResolve(battleId.current!, r.stars, r.destructionPct, r.troopsUsed);
        pendingBase.current = res;
        setBattleResult(res.result);
        const st = res.result?.stars || 0;
        if (st > 0) { sfx.win(); for (let i = 0; i < st; i++) setTimeout(() => sfx.star(i), 350 + i * 260); }
        else sfx.lose();
        if (res.result?.gemWon > 0) setTimeout(() => sfx.reward(), 900);
        if (res.result?.campaign && res.result.stars >= 1) setTutStep((s) => (s === 5 ? 6 : s));
      } catch (e: any) { setError(e.message); closeResult(); }
    };
    sc.startBattle(info.enemy, info.army);
  };
  // ---- defense replay: watch how your base was attacked (attacker army auto-deploys, no loot) ----
  const beginReplay = (data: any) => {
    const sc = sceneRef.current; if (!sc) return;
    sfx.setMusicMode('war');
    sc.autoOrbit = false; setOrbit(false);
    battling.current = true; battleId.current = null;
    setPanel('none'); setBuildMode(null); setSelected(null); setBattleResult(null);
    setReplayMode(true); setOpponent({ username: data.attackerName + ' — REPLAY', trophies: 0 });
    setBattleHud({ pct: 0, stars: 0, onField: 0, remaining: data.army, deployType: null, timeLeft: 120 });
    setInBattle(true);
    sc.troopLevels = {};   // attacker troops at base level (representative replay)
    sc.onBattleUpdate = (s) => setBattleHud(s);
    sc.onBattleEnd = () => setBattleResult({ replay: true, stars: data.stars, destructionPct: data.destructionPct });
    sc.startBattle(data.enemy, data.army, { replay: true, troopsTeam: 'enemy' });
  };
  const watchReplay = (raidId: string) => api.defenseReplay(raidId).then(beginReplay).catch((e) => setError(e.message));
  const attack = () => { setRaidMenu(false); api.attackFind().then(beginBattle).catch((e) => setError(e.message)); };
  // ---- WAR: find a real opponent (matched by trophies), preview, then attack ----
  const findWar = () => { setRaidMenu(false); setWarMatch(null); setWarSearching(true); api.attackFind().then((m) => { setWarMatch(m); setWarSearching(false); }).catch((e) => { setWarSearching(false); setError(e.message); }); };
  const warPlayer = (id: string) => { setPanel('none'); setWarMatch(null); setWarSearching(true); api.attackPlayer(id).then((m) => { setWarMatch(m); setWarSearching(false); }).catch((e) => { setWarSearching(false); setError(e.message); }); };   // War a chosen leaderboard base (scout then attack)
  const startWar = () => { const m = warMatch; setWarMatch(null); if (m) beginBattle(m); };
  const raidLevel = (lvl: 'easy' | 'normal' | 'expert' | 'legend') => { setRaidMenu(false); api.attackLevel(lvl).then(beginBattle).catch((e) => setError(e.message)); };
  const attackCampaign = (levelId: number) => api.campaignAttack(levelId).then(beginBattle).catch((e) => setError(e.message));
  const closeResult = () => {
    sfx.setMusicMode('game');   // back to the in-game track
    sceneRef.current?.endBattle();
    battling.current = false;
    setInBattle(false); setBattleHud(null); setBattleResult(null); setReplayMode(false);
    if (pendingBase.current) { applyBase(pendingBase.current); pendingBase.current = null; } else refresh();
    loadCampaign();   // refresh stars/unlocks after a campaign fight
    loadClan();       // refresh war board after a war attack
  };

  return (
    <>
      <div ref={elRef} style={{ position: 'fixed', inset: 0 }} />

      {base?.player?.demoExpiresAt && !demoOver && <DemoBanner expiresAt={base.player.demoExpiresAt} onExpire={() => setDemoOver(true)} />}

      <button className="mutebtn" title="Settings (music & sound)" onClick={() => setShowSettings((v) => !v)}>⚙️</button>
      {showSettings && (
        <div className="settings-pop" onClick={(e) => e.stopPropagation()}>
          <div className="set-title">Settings</div>
          <label className="set-row">
            <span>🎵 Music</span>
            <button className={'set-toggle' + (musicOff ? '' : ' on')} onClick={() => { const off = !musicOff; setMusicOff(off); sfx.setMusicMuted(off); }}>{musicOff ? 'OFF' : 'ON'}</button>
          </label>
          <label className="set-row">
            <span>🔊 Sound Effects</span>
            <button className={'set-toggle' + (sfxOff ? '' : ' on')} onClick={() => { const off = !sfxOff; setSfxOff(off); sfx.setSfxMuted(off); }}>{sfxOff ? 'OFF' : 'ON'}</button>
          </label>
          {!base?.player?.demoExpiresAt && (
            <button className="set-rename" onClick={() => { setNameInput(base?.player?.displayName || ''); setShowSettings(false); setShowNameModal(true); }}>✏️ Rename base</button>
          )}
        </div>
      )}
      {!inBattle && <div className="camctrls">
        <button className="orbitbtn help" title="How to play" onClick={() => setShowHelp(true)}><span className="htp-emoji">📖</span><span>How to Play</span></button>
        <button className={'orbitbtn' + (orbit ? ' on' : '')} title="360° camera: auto-orbit your base. Drag with the mouse to look around manually." onClick={toggleOrbit}><Icon.camera /><span>{orbit ? '360° ON' : '360° View'}</span></button>
        <button className="orbitbtn reset" title="Reset the camera back to the default view" onClick={resetView}><Icon.reset /><span>Default</span></button>
      </div>}
      {import.meta.env.DEV && <button className={'devbtn' + (base?.player?.devMode ? ' on' : '')} title="Dev god mode: unlimited resources + build anything" onClick={godMode}>🛠️ {base?.player?.devMode ? 'GOD ON' : 'DEV'}</button>}
      {!inBattle && <>
        <ResourceBar p={base?.player} />
        <div className="dock">
          <button className={'dockbtn' + (panel === 'build' ? ' on' : '') + (tutStep === 3 ? ' tut-glow' : '')} onClick={() => toggle('build')}><Icon.build /><span>Build</span></button>
          <button className={'dockbtn' + (panel === 'army' ? ' on' : '') + (tutStep === 4 ? ' tut-glow' : '')} onClick={() => toggle('army')}><Icon.army /><span>Army</span></button>
          <button className={'dockbtn campaign' + (panel === 'campaign' ? ' on' : '') + (tutStep === 5 ? ' tut-glow' : '')} onClick={() => toggle('campaign')}><Icon.campaign /><span>Campaign</span></button>
          <button className="dockbtn attack" onClick={() => setRaidMenu(true)}><Icon.raid /><span>Raid</span></button>
          <button className="dockbtn war" onClick={findWar}><Icon.war /><span>War</span></button>
          <button className={'dockbtn' + (panel === 'quests' ? ' on' : '')} onClick={() => toggle('quests')}><Icon.quests /><span>Quests</span>{base?.player?.questsClaimable > 0 && <i className="badge">{base.player.questsClaimable}</i>}</button>
          <button className={'dockbtn' + (panel === 'gems' ? ' on' : '')} onClick={() => toggle('gems')}><Icon.gems /><span>Gems</span></button>
          <button className={'dockbtn' + (panel === 'defense' ? ' on' : '') + (base?.player?.newRaids > 0 ? ' alert' : '')} onClick={() => toggle('defense')}><Icon.defense /><span>Defense</span>{base?.player?.newRaids > 0 && <i className="badge red">{base.player.newRaids}</i>}</button>
          <button className={'dockbtn' + (panel === 'leaderboard' ? ' on' : '')} onClick={() => toggle('leaderboard')}><Icon.trophy /><span>Ranks</span></button>
          <button className={'dockbtn' + (panel === 'clan' ? ' on' : '')} onClick={() => toggle('clan')}><Icon.clan /><span>Clan</span></button>
          <button className="dockbtn" onClick={() => { clearToken(); location.reload(); }}><Icon.logout /><span>Logout</span></button>
        </div>
        <div className="topactions">
          <button className={'collectbtn' + (tutStep === 2 ? ' tut-glow' : '')} onClick={collect}><span className="coin coin-gold" /> Collect All</button>
          {base?.player?.dailyReady && <button className="dailybtn" onClick={claimDaily}>🎁 Daily Reward</button>}
        </div>
        {base?.player?.newRaids > 0 && panel !== 'defense' && (
          <button className="raid-alert" onClick={() => toggle('defense')}>🛡️ Your base was raided {base.player.newRaids}× — tap to watch the replay ▸</button>
        )}
        {base?.player?.allDoneAt > Date.now() && <TotalEta allDoneAt={base.player.allDoneAt} />}

        {raidMenu && (
          <div className="raid-bg" onClick={() => setRaidMenu(false)}>
            <div className="raid-menu" onClick={(e) => e.stopPropagation()}>
              <div className="raid-title">⚔️ Choose Your Raid</div>
              <div className="raid-sub">Win a raid to earn ⭐ stars (20% = 1★ · 50% = 2★ · 100% = 3★). Harder tier = more walls, a tougher robot army & bigger ⭐ point bonus.</div>
              <div className="raid-grid">
                {[
                  { k: 'easy', ic: '🤖', nm: 'Easy', ds: 'Few walls · no guards', b: 4, c: '#4ade80' },
                  { k: 'normal', ic: '⚔️', nm: 'Normal', ds: 'Full wall ring + guards', b: 10, c: '#38bdf8' },
                  { k: 'expert', ic: '🔥', nm: 'Expert', ds: 'Full ring + air guard', b: 18, c: '#f59e0b' },
                  { k: 'legend', ic: '💀', nm: 'Legend', ds: 'Double walls + sky army', b: 30, c: '#f43f5e' },
                ].map((l) => (
                  <button key={l.k} className="raid-card" style={{ borderColor: l.c }} onClick={() => raidLevel(l.k as any)}>
                    <span className="rc-ic">{l.ic}</span>
                    <span className="rc-nm" style={{ color: l.c }}>{l.nm}</span>
                    <span className="rc-ds">{l.ds}</span>
                    <span className="rc-bonus" style={{ color: l.c }}>⭐ +{l.b} pts/star</span>
                  </button>
                ))}
              </div>
              <button className="raid-pvp" onClick={findWar}>🗡️ War — attack a real player ▸</button>
              <button className="raid-close" onClick={() => setRaidMenu(false)}>✕ Cancel</button>
            </div>
          </div>
        )}

        {(warSearching || warMatch) && (
          <div className="raid-bg" onClick={() => { setWarMatch(null); setWarSearching(false); }}>
            <div className="war-modal" onClick={(e) => e.stopPropagation()}>
              <div className="war-h">🗡️ War — attack a real player</div>
              {warSearching || !warMatch ? (
                <div className="war-search"><span className="war-spin" /> Searching for a fair match…</div>
              ) : (<>
                <div className="war-opp">
                  <div className="wo-avatar">{warMatch.pvp ? '🤖' : '🛸'}</div>
                  <div className="wo-info">
                    <div className="wo-name">{warMatch.opponent?.username || 'Unknown'}{!warMatch.pvp && ' (AI)'}</div>
                    <div className="wo-meta">
                      {warMatch.opponent?.tier && <span style={{ color: warMatch.opponent.tier.color }}>{warMatch.opponent.tier.icon} {warMatch.opponent.tier.name}</span>}
                      <span>⭐ {warMatch.opponent?.trophies ?? 0}</span>
                      {warMatch.opponent?.th != null && <span>🛰️ Core {warMatch.opponent.th}</span>}
                    </div>
                  </div>
                </div>
                {!warMatch.pvp && <div className="war-note">No live players free right now — practice vs an AI base.</div>}
                <div className="war-loot">
                  <span className="wl-h">💰 Loot up for grabs</span>
                  <span><i className="ic-gold" /> {warMatch.loot?.gold ?? 0}</span>
                  <span><i className="ic-plasma" /> {warMatch.loot?.elixir ?? 0}</span>
                </div>
                <div className="war-actions">
                  <button className="war-attack" onClick={startWar}>⚔️ Attack!</button>
                  <button className="war-next" onClick={findWar}>🔄 Next</button>
                </div>
              </>)}
              <button className="raid-close" onClick={() => { setWarMatch(null); setWarSearching(false); }}>✕ Cancel</button>
            </div>
          </div>
        )}

        <BuildMenu open={panel === 'build'} base={base} selected={buildMode} onPick={pick} onClose={() => setPanel('none')} />
        <ArmyPanel open={panel === 'army'} base={base} onTrain={train} onClear={clearArmy} onResearch={research} onFinishTraining={finishTraining} onClose={() => setPanel('none')} />
        <CampaignPanel open={panel === 'campaign'} levels={campaignLevels} th={base?.player.townHallLevel || 1} onPlay={attackCampaign} onClose={() => setPanel('none')} />
        <QuestPanel open={panel === 'quests'} quests={questList} onClaim={claimQuest} onClose={() => setPanel('none')} />
        <GemsPanel open={panel === 'gems'} data={gemData} base={base} onClaim={claimGem} onBuyBuilder={buyBuilder} onBoost={boostRes} onClose={() => setPanel('none')} />
        <DefenseLogPanel open={panel === 'defense'} raids={raidLog} onReplay={watchReplay} onClose={() => setPanel('none')} />
        <LeaderboardPanel open={panel === 'leaderboard'} data={leaderboard} onClose={() => setPanel('none')} onWar={warPlayer} />
        <ClanPanel open={panel === 'clan'} clan={clanData} clans={clanList}
          onCreate={createClan} onJoin={joinClan} onLeave={leaveClan} onChat={chatClan}
          onWarStart={warStart} onWarAttack={warAttack} onClose={() => setPanel('none')} />

        {buildMode && (
          <div className="build-hint">
            Placing <b>{DEF[buildMode]?.name}</b> — tap glowing tiles 🟩
            <button className="hint-x" onClick={() => setBuildMode(null)}>✕ Done</button>
          </div>
        )}
        {selected && !buildMode && (
          <BuildingDialog b={selected} base={base} onClose={() => setSelected(null)} onUpgrade={upgrade} onSpeedup={speedup} onCollect={collect} onSell={sell} />
        )}
      </>}

      {inBattle && (
        <BattleHUD hud={battleHud} result={battleResult} opponent={opponent} replay={replayMode}
          onDeploy={(t) => { sceneRef.current?.setDeployType(t); setBattleHud((h: any) => ({ ...h, deployType: t })); }}
          onEnd={() => sceneRef.current?.finishBattle()}
          onResultClose={closeResult} />
      )}

      {!inBattle && tutStep > 0 && (
        <TutorialOverlay step={tutStep} reward={tutReward}
          onStart={() => setTutStep(2)}
          onSkip={() => { api.tutorialClaim().then(applyBase).catch(() => {}); setTutStep(0); }}
          onFinish={() => setTutStep(0)} />
      )}

      {rewardModal && (
        <div className="tut-modal">
          <div className="tut-card">
            <h2>{rewardModal.title}</h2>
            <p>{rewardModal.sub}</p>
            <div className="tut-reward">
              {rewardModal.reward?.gold ? <><i className="ic-gold" /> +{rewardModal.reward.gold}&nbsp;&nbsp;</> : null}
              {rewardModal.reward?.elixir ? <><i className="ic-plasma" /> +{rewardModal.reward.elixir}&nbsp;&nbsp;</> : null}
              {rewardModal.reward?.gems ? <>💎 +{rewardModal.reward.gems}</> : null}
            </div>
            <button className="btn up" onClick={() => setRewardModal(null)}>Awesome! 🎉</button>
          </div>
        </div>
      )}

      {demoOver && (
        <div className="demo-lock">
          <div className="demo-lock-card">
            <div className="dl-ic">⏰</div>
            <h2>Demo Over</h2>
            <p>Your 30-minute demo has ended. You played the real game with <b>unlimited money</b> — now make a base that's truly yours.</p>
            <p className="dl-cta">The demo unlocks again in <b>24 hours</b> — but you can connect <b>Phantom</b> right now to start your <b>own</b> base and keep every bit of progress. 🚀</p>
            <button className="btn up" onClick={() => { clearToken(); location.reload(); }}>👻 Connect Phantom &amp; Play for Real</button>
            <button className="dl-home" onClick={() => { clearToken(); location.reload(); }}>← Back to Home</button>
          </div>
        </div>
      )}

      <HowToPlay open={showHelp} onClose={() => setShowHelp(false)} />

      {showNameModal && (
        <div className="tut-modal">
          <div className="tut-card">
            <h2>🛡️ Name your base</h2>
            <p>Give your commander a name — it shows on your <b>Command Core</b> instead of your wallet address.</p>
            <input className="name-input" value={nameInput} onChange={(e) => setNameInput(e.target.value)} maxLength={16}
              placeholder="e.g. Steel Vanguard" autoFocus
              onKeyDown={(e) => { if (e.key === 'Enter' && nameInput.trim().length >= 2) saveName(); }} />
            <button className="btn up" disabled={nameInput.trim().length < 2} onClick={saveName}>Save name 🚀</button>
            {base?.player?.displayName && <button className="dl-home" onClick={() => setShowNameModal(false)}>Cancel</button>}
          </div>
        </div>
      )}

      {error && <div className="toast">{error}</div>}
    </>
  );
}
