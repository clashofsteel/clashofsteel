import { useState } from 'react';

function Stars({ n }: { n: number }) {
  return <span className="cstars">{[0, 1, 2].map((i) => <span key={i} className={'cstar' + (i < n ? ' on' : '')}>★</span>)}</span>;
}

export function ClanPanel({ open, clan, clans, onCreate, onJoin, onLeave, onChat, onWarStart, onWarAttack, onClose }: {
  open: boolean; clan: any; clans: any[];
  onCreate: (n: string, t: string, d: string) => void; onJoin: (id: string) => void; onLeave: () => void;
  onChat: (t: string) => void; onWarStart: () => void; onWarAttack: (idx: number) => void; onClose: () => void;
}) {
  const [tab, setTab] = useState<'members' | 'chat' | 'war'>('members');
  const [name, setName] = useState(''); const [tag, setTag] = useState('');
  const [msg, setMsg] = useState('');

  if (!clan) {
    return (
      <div className={'panel clan' + (open ? ' open' : '')}>
        <div className="panel-h"><span>👥 Clans — join forces & fight wars</span><button className="panel-x" onClick={onClose}>✕</button></div>
        <div className="clan-create">
          <input placeholder="New clan name" value={name} maxLength={20} onChange={(e) => setName(e.target.value)} />
          <input placeholder="TAG" value={tag} maxLength={6} onChange={(e) => setTag(e.target.value)} style={{ width: 90 }} />
          <button className="qbtn" onClick={() => name.trim().length >= 3 && onCreate(name, tag, '')}>Create</button>
        </div>
        <div className="cards">
          {(clans || []).map((c) => (
            <div key={c.id} className="clancard">
              <span className="nm">{c.name} <small>[{c.tag}]</small></span>
              <span className="ct">👥 {c.members} · 🏆 {c.points} · ⚔️ {c.warWins}W</span>
              <button className="qbtn" onClick={() => onJoin(c.id)}>Join</button>
            </div>
          ))}
          {(!clans || !clans.length) && <div className="army-hint">No clans yet — create the first one above!</div>}
        </div>
      </div>
    );
  }

  const war = clan.war;
  return (
    <div className={'panel clan' + (open ? ' open' : '')}>
      <div className="panel-h">
        <span>👥 {clan.name} <small>[{clan.tag}]</small> · 🏆 {clan.points} · ⚔️ {clan.warWins}W</span>
        <span style={{ display: 'flex', gap: 8 }}>
          <button className="qbtn clear" onClick={onLeave}>Leave</button>
          <button className="panel-x" onClick={onClose}>✕</button>
        </span>
      </div>
      <div className="clan-tabs">
        <button className={'ctab' + (tab === 'members' ? ' on' : '')} onClick={() => setTab('members')}>👤 Members ({clan.members.length})</button>
        <button className={'ctab' + (tab === 'chat' ? ' on' : '')} onClick={() => setTab('chat')}>💬 Chat</button>
        <button className={'ctab' + (tab === 'war' ? ' on' : '')} onClick={() => setTab('war')}>⚔️ War{war && !war.ended ? ' 🔴' : ''}</button>
      </div>

      {tab === 'members' && (
        <div className="clan-members">
          {clan.members.map((m: any, i: number) => (
            <div key={i} className="memrow"><span>{m.role === 'leader' ? '👑' : '🤖'} {m.username}</span><span className="ct">🛰️ {m.th} · 🏅 {m.trophies}</span></div>
          ))}
        </div>
      )}

      {tab === 'chat' && (
        <div className="clan-chat">
          <div className="chatlog">
            {clan.chat.length ? clan.chat.map((m: any, i: number) => <div key={i}><b>{m.username}:</b> {m.text}</div>) : <div className="army-hint">No messages yet — say hi! 👋</div>}
          </div>
          <div className="chatbar">
            <input placeholder="Message…" value={msg} maxLength={200} onChange={(e) => setMsg(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && msg.trim()) { onChat(msg); setMsg(''); } }} />
            <button className="qbtn" onClick={() => { if (msg.trim()) { onChat(msg); setMsg(''); } }}>Send</button>
          </div>
        </div>
      )}

      {tab === 'war' && (
        <div className="clan-war">
          {!war ? (
            clan.isLeader
              ? <div><div className="army-hint">Declare war on a rival clan to raid their bases for war stars + clan points.</div><button className="qbtn" onClick={onWarStart}>⚔️ Declare War</button></div>
              : <div className="army-hint">Waiting for your leader to declare war…</div>
          ) : (
            <>
              <div className="war-score">
                vs <b>{war.enemyName}</b> — ⭐ {war.starsEarned}/{war.starsGoal} &nbsp;·&nbsp; enemy ⭐ {war.enemyStars}
                {war.ended && (war.won ? ' · 🏆 WAR WON!' : ' · 💥 War lost')}
                {clan.isLeader && war.ended && <button className="qbtn" style={{ marginLeft: 8 }} onClick={onWarStart}>New War</button>}
              </div>
              <div className="cards">
                {war.bases.map((b: any) => (
                  <button key={b.idx} className={'lvlcard' + (b.attackedBy ? ' done' : '') + (b.attackedBy || war.ended ? ' locked' : '')}
                    disabled={!!b.attackedBy || war.ended} onClick={() => !b.attackedBy && !war.ended && onWarAttack(b.idx)}>
                    <span className="lvn">#{b.idx + 1}</span>
                    <span className="nm">{b.name.replace(war.enemyName + ' ', '')}</span>
                    <Stars n={b.stars} />
                    <span className="ct">{b.attackedBy ? `✓ ${b.attackedBy}` : '⚔️ Attack'}</span>
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
