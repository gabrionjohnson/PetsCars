/**
 * 17-0 — NFL Roster Simulation Game
 *
 * PORT GUIDE: To target a new domain, replace the CONFIG object below.
 * Update: title, tagline, domain, perfectRecord, metrics (name/weight/direction/eraScale),
 * eras array, franchises array, archetypeFilters, and swap players.json with domain data.
 * The simulation engine (peak_score, sigmoid) is generic and needs no changes.
 */

import { useState, useEffect, useRef, useCallback } from 'react';

// ─── GAME CONFIG (Section 1) ─────────────────────────────────────────────────
const CONFIG = {
  title: '17-0',
  tagline: 'Can you build the greatest NFL roster ever assembled?',
  domain: 'NFL',
  perfectRecord: 17,
  storageKey: '17-0_history',

  metrics: [
    { key: 'passing_yards',   name: 'Pass Yds',  weight: 0.25, direction: 'higher' },
    { key: 'rushing_yards',   name: 'Rush Yds',  weight: 0.20, direction: 'higher' },
    { key: 'total_tds',       name: 'Total TDs', weight: 0.25, direction: 'higher' },
    { key: 'turnovers',       name: 'Turnovers', weight: 0.15, direction: 'lower'  },
    { key: 'defensive_stops', name: 'Def Stops', weight: 0.15, direction: 'higher' },
  ],

  eraScale: {
    '1960s': { passing_yards: 2200, rushing_yards: 900,  total_tds: 18, turnovers: 18, defensive_stops: 52 },
    '1970s': { passing_yards: 2600, rushing_yards: 1050, total_tds: 20, turnovers: 17, defensive_stops: 55 },
    '1980s': { passing_yards: 3100, rushing_yards: 1100, total_tds: 22, turnovers: 14, defensive_stops: 62 },
    '1990s': { passing_yards: 3400, rushing_yards: 1050, total_tds: 24, turnovers: 12, defensive_stops: 62 },
    '2000s': { passing_yards: 4000, rushing_yards: 950,  total_tds: 28, turnovers: 10, defensive_stops: 57 },
    '2010s': { passing_yards: 4400, rushing_yards: 900,  total_tds: 32, turnovers:  9, defensive_stops: 56 },
    '2020s': { passing_yards: 4500, rushing_yards: 870,  total_tds: 32, turnovers:  8, defensive_stops: 53 },
  },

  eras: ['1960s','1970s','1980s','1990s','2000s','2010s','2020s'],

  archetypeFilters: [
    { label: 'Pass-First Offense', tag: 'pass-first' },
    { label: 'Run-First Power',    tag: 'run-first' },
    { label: 'Defensive Specialists', tag: 'defensive-specialist' },
    { label: 'Clutch Performers', tag: 'clutch' },
    { label: 'Game Breakers',     tag: 'game-breaker' },
  ],
};

// ─── SIMULATION ENGINE ───────────────────────────────────────────────────────
function normalize(value, metric, era) {
  const scale = CONFIG.eraScale[era]?.[metric.key] ?? 1;
  if (scale === 0) return 1.0;
  if (metric.direction === 'higher') return value / scale;
  return value === 0 ? 1.0 : scale / value;
}

function computePeakScore(player) {
  return CONFIG.metrics.reduce((sum, m) => {
    const n = normalize(player.metrics[m.key] ?? 0, m, player.era);
    return sum + n * m.weight;
  }, 0);
}

function computeTeamStrength(picks) {
  if (!picks.length) return 0;
  const scores = picks.map(p => p.peak_score);
  const base = scores.reduce((a, b) => a + b, 0);
  const weakest = Math.min(...scores);
  const penalty = weakest < 0.80 ? 0.70 : weakest < 0.90 ? 0.85 : 1.0;
  return base * penalty;
}

function projectWins(teamStrength) {
  const maxWins = CONFIG.perfectRecord;
  const midpoint = 7.2;
  const steepness = 3.5;
  const winPct = 1 / (1 + Math.exp(-steepness * (teamStrength - midpoint)));
  const seed = parseInt(new Date().toISOString().slice(0, 10).replace(/-/g, ''));
  const variance = (seed % 7) - 3;
  return Math.min(maxWins, Math.max(0, Math.round(winPct * maxWins) + variance));
}

// ─── HISTORY ─────────────────────────────────────────────────────────────────
function loadHistory() {
  try {
    return JSON.parse(localStorage.getItem(CONFIG.storageKey)) || emptyHistory();
  } catch { return emptyHistory(); }
}
function emptyHistory() {
  return { runs: [], bestRun: null, totalRuns: 0, perfectRuns: 0, favoritePick: null, eraHistory: {} };
}
function saveRun(picks, result, mode, chaosMode, skipsUsed) {
  const h = loadHistory();
  const run = { date: new Date().toISOString(), picks: picks.map(p => ({ name: p.name, era: p.era, team: p.team, peak_score: p.peak_score })), result, mode, chaosMode, skipsUsed };
  h.runs.push(run);
  h.totalRuns = (h.totalRuns || 0) + 1;
  if (result === CONFIG.perfectRecord) h.perfectRuns = (h.perfectRuns || 0) + 1;
  if (!h.bestRun || result > h.bestRun.result) h.bestRun = { result, picks: run.picks, mode };
  const nameCounts = {};
  h.runs.forEach(r => r.picks.forEach(p => { nameCounts[p.name] = (nameCounts[p.name] || 0) + 1; }));
  const fav = Object.entries(nameCounts).sort((a, b) => b[1] - a[1])[0];
  if (fav) h.favoritePick = { name: fav[0], count: fav[1] };
  const eraH = h.eraHistory || {};
  picks.forEach(p => { eraH[p.era] = (eraH[p.era] || 0) + 1; });
  h.eraHistory = eraH;
  localStorage.setItem(CONFIG.storageKey, JSON.stringify(h));
  return h;
}

// ─── SHARE CARD CANVAS ───────────────────────────────────────────────────────
function renderShareCard(canvasRef, picks, wins, mode, chaosMode, skipsUsed) {
  const canvas = canvasRef.current;
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const W = 1200, H = 630;
  canvas.width = W; canvas.height = H;
  const perfect = CONFIG.perfectRecord;
  const rc = wins === perfect ? '#FFD700' : wins >= perfect - 2 ? '#00C853' : wins >= Math.floor(perfect * 0.5) ? '#FF6D00' : '#D50000';
  const tc = wins === perfect ? '#000' : '#fff';
  ctx.fillStyle = '#0f0f0f'; ctx.fillRect(0, 0, W, H);
  // header band
  ctx.fillStyle = rc; ctx.fillRect(0, 0, W, 120);
  ctx.fillStyle = tc;
  ctx.font = 'bold 72px Arial Black, Arial'; ctx.textAlign = 'left'; ctx.fillText(CONFIG.title, 40, 88);
  ctx.font = 'bold 80px Arial Black, Arial'; ctx.textAlign = 'right'; ctx.fillText(`${wins}-${perfect - wins}`, W - 40, 92);
  // pick rows
  picks.forEach((p, i) => {
    const y = 130 + i * 80;
    ctx.fillStyle = i % 2 === 0 ? '#1a1a1a' : '#141414'; ctx.fillRect(0, y, W, 80);
    ctx.fillStyle = '#2a2a2a'; ctx.beginPath(); ctx.roundRect(30, y + 18, 68, 28, 6); ctx.fill();
    ctx.fillStyle = '#aaa'; ctx.font = 'bold 13px monospace'; ctx.textAlign = 'center'; ctx.fillText(p.era, 64, y + 37);
    ctx.fillStyle = '#fff'; ctx.font = 'bold 24px Arial'; ctx.textAlign = 'left'; ctx.fillText(p.name, 116, y + 35);
    ctx.fillStyle = '#888'; ctx.font = '14px Arial'; ctx.fillText(p.team, 116, y + 56);
    const bx = 700, bw = 380, bh = 12, by = y + 34;
    const pct = Math.min(1, (p.peak_score || 0) / 2.0);
    const bc = p.peak_score >= 1.3 ? '#00C853' : p.peak_score >= 1.0 ? '#FFD700' : '#D50000';
    ctx.fillStyle = '#2a2a2a'; ctx.fillRect(bx, by, bw, bh);
    ctx.fillStyle = bc; ctx.fillRect(bx, by, bw * pct, bh);
    ctx.fillStyle = '#fff'; ctx.font = 'bold 16px monospace'; ctx.textAlign = 'right'; ctx.fillText((p.peak_score || 0).toFixed(2), W - 40, y + 43);
  });
  // footer
  ctx.fillStyle = '#111'; ctx.fillRect(0, 530, W, 100);
  let bx2 = 40;
  const drawBadge = (text, color) => {
    ctx.font = 'bold 15px Arial';
    const tw = ctx.measureText(text).width;
    ctx.fillStyle = color; ctx.beginPath(); ctx.roundRect(bx2, 548, tw + 24, 32, 7); ctx.fill();
    ctx.fillStyle = '#fff'; ctx.textAlign = 'left'; ctx.fillText(text, bx2 + 12, 569); bx2 += tw + 44;
  };
  if (mode === 'iq') drawBadge('🧠 NFLIQ', '#1565C0');
  if (chaosMode) drawBadge('🔥 Chaos', '#BF360C');
  if (mode === 'iq' && chaosMode) drawBadge('Certified Degenerate', '#4A148C');
  // skip chips
  for (let i = 0; i < 2; i++) {
    ctx.beginPath(); ctx.arc(W / 2 - 22 + i * 44, 564, 13, 0, Math.PI * 2);
    if (i < skipsUsed) { ctx.strokeStyle = '#555'; ctx.lineWidth = 2; ctx.stroke(); }
    else { ctx.fillStyle = '#FFD700'; ctx.fill(); }
  }
  ctx.fillStyle = '#555'; ctx.font = '13px monospace'; ctx.textAlign = 'right'; ctx.fillText('17-0 · nfl roster challenge', W - 40, 572);
}

// ─── AUDIO ───────────────────────────────────────────────────────────────────
let audioCtx = null;
function playClick(freq = 800, dur = 0.04) {
  try {
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    const o = audioCtx.createOscillator(), g = audioCtx.createGain();
    o.connect(g); g.connect(audioCtx.destination);
    o.frequency.value = freq;
    g.gain.setValueAtTime(0.12, audioCtx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + dur);
    o.start(); o.stop(audioCtx.currentTime + dur);
  } catch {}
}

// ─── SLOT HELPERS ────────────────────────────────────────────────────────────
function spinSlot(players, chaosTag, forcedEra = null, attempts = 0) {
  if (attempts > 40 || !players.length) return null;
  const era = forcedEra || CONFIG.eras[Math.floor(Math.random() * CONFIG.eras.length)];
  let pool = players.filter(p => p.era === era);
  if (chaosTag) pool = pool.filter(p => p.archetypes?.includes(chaosTag));
  const franchises = [...new Set(pool.map(p => p.team))];
  if (!franchises.length) return spinSlot(players, chaosTag, null, attempts + 1);
  const franchise = franchises[Math.floor(Math.random() * franchises.length)];
  let cards = pool.filter(p => p.team === franchise);
  if (cards.length < 4) return spinSlot(players, chaosTag, forcedEra, attempts + 1);
  const shuffled = [...cards].sort(() => Math.random() - 0.5).slice(0, 4);
  return { era, franchise, cards: shuffled.map(p => ({ ...p, peak_score: computePeakScore(p) })) };
}

// ─── METRIC BAR ──────────────────────────────────────────────────────────────
function MetricBar({ value, metric, era, hidden }) {
  const n = normalize(value, metric, era);
  const pct = Math.min(100, (n / 2.0) * 100);
  const color = n >= 1.3 ? '#00C853' : n >= 1.0 ? '#FFD700' : '#D50000';
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
      <span style={{ width: 68, fontSize: 10, color: '#666', fontFamily: 'JetBrains Mono, monospace', flexShrink: 0 }}>{metric.name}</span>
      <div style={{ flex: 1, height: 7, background: '#1e1e1e', borderRadius: 4, overflow: 'hidden' }}>
        {!hidden && <div style={{ width: `${pct}%`, height: '100%', background: color, borderRadius: 4 }} />}
      </div>
      {!hidden && <span style={{ width: 46, fontSize: 10, color: '#777', fontFamily: 'monospace', textAlign: 'right' }}>{value}</span>}
    </div>
  );
}

// ─── PLAYER CARD ─────────────────────────────────────────────────────────────
function PlayerCard({ player, onPick, hidden, index }) {
  const [hover, setHover] = useState(false);
  return (
    <div
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      onClick={() => onPick(player)}
      style={{
        background: hover ? '#1c1c1c' : '#131313',
        border: `1px solid ${hover ? '#444' : '#1e1e1e'}`,
        borderRadius: 10,
        padding: '13px 14px',
        cursor: 'pointer',
        transform: hover ? 'translateY(-3px) scale(1.01)' : 'none',
        transition: 'all 0.15s ease',
        animation: `slideUp 0.3s ease ${index * 80}ms both`,
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
        <div>
          <div style={{ fontWeight: 800, fontSize: 15, color: '#fff', fontFamily: 'Barlow Condensed, Anton, Arial Black' }}>{player.name}</div>
          <div style={{ fontSize: 11, color: '#777', marginTop: 1 }}>{player.team}</div>
        </div>
        <span style={{ background: '#1a1a1a', color: '#999', fontSize: 10, padding: '3px 7px', borderRadius: 5, alignSelf: 'flex-start', fontFamily: 'monospace', border: '1px solid #2a2a2a' }}>{player.era}</span>
      </div>
      <div style={{ borderTop: '1px solid #1e1e1e', paddingTop: 7, marginBottom: 8 }}>
        {CONFIG.metrics.map(m => (
          <MetricBar key={m.key} value={player.metrics[m.key] ?? 0} metric={m} era={player.era} hidden={hidden} />
        ))}
      </div>
      {!hidden ? (
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: 10, color: '#555', fontFamily: 'monospace' }}>PEAK</span>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            <span style={{ fontSize: 17, fontWeight: 700, color: '#FFD700', fontFamily: 'monospace' }}>{player.peak_score.toFixed(2)}</span>
            <button style={{ background: '#FFD700', color: '#000', border: 'none', borderRadius: 5, padding: '5px 11px', fontWeight: 800, cursor: 'pointer', fontSize: 12 }}>PICK →</button>
          </div>
        </div>
      ) : (
        <button style={{ width: '100%', background: '#1a1a1a', color: '#aaa', border: '1px solid #333', borderRadius: 6, padding: '7px', fontWeight: 700, cursor: 'pointer', fontSize: 12, marginTop: 2 }}>PICK BLIND →</button>
      )}
    </div>
  );
}

// ─── STRENGTH ARC ────────────────────────────────────────────────────────────
function StrengthArc({ picks }) {
  const maxPossible = 5 * 1.9;
  const strength = computeTeamStrength(picks);
  const pct = Math.min(1, strength / maxPossible);
  const r = 42, cx = 52, cy = 52;
  const circ = 2 * Math.PI * r;
  const arcLen = circ * 0.75;
  const offset = arcLen * (1 - pct);
  const color = pct < 0.4 ? '#D50000' : pct < 0.65 ? '#FFD700' : '#00C853';
  return (
    <svg width={104} height={104} style={{ display: 'block', margin: '0 auto' }}>
      <circle cx={cx} cy={cy} r={r} fill="none" stroke="#1a1a1a" strokeWidth={7} strokeDasharray={`${arcLen} ${circ}`} strokeLinecap="round" transform={`rotate(135 ${cx} ${cy})`} />
      <circle cx={cx} cy={cy} r={r} fill="none" stroke={color} strokeWidth={7} strokeDasharray={`${arcLen} ${circ}`} strokeDashoffset={offset} strokeLinecap="round" transform={`rotate(135 ${cx} ${cy})`} style={{ transition: 'stroke-dashoffset 0.4s ease, stroke 0.4s' }} />
      <text x={cx} y={cy + 5} textAnchor="middle" fill={color} fontSize={14} fontWeight={700} fontFamily="monospace">{strength.toFixed(1)}</text>
    </svg>
  );
}

// ─── ROSTER SIDEBAR ──────────────────────────────────────────────────────────
function RosterSidebar({ picks, lastDelta }) {
  return (
    <div style={{ width: 210, flexShrink: 0 }}>
      <div style={{ fontSize: 10, color: '#444', fontFamily: 'monospace', marginBottom: 8, letterSpacing: 1.5 }}>ROSTER</div>
      {Array.from({ length: 5 }).map((_, i) => {
        const p = picks[i];
        return (
          <div key={i} style={{ background: p ? '#141414' : '#0b0b0b', border: `1px solid ${p ? '#272727' : '#141414'}`, borderRadius: 7, padding: '9px 11px', marginBottom: 5, minHeight: 46 }}>
            {p ? (
              <>
                <div style={{ fontSize: 12, fontWeight: 700, color: '#fff' }}>{p.name}</div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 2 }}>
                  <span style={{ fontSize: 10, color: '#666' }}>{p.era} · {p.team.split(' ').slice(-1)[0]}</span>
                  <span style={{ fontSize: 10, color: '#FFD700', fontFamily: 'monospace' }}>{p.peak_score.toFixed(2)}</span>
                </div>
              </>
            ) : (
              <div style={{ fontSize: 11, color: '#2a2a2a', fontStyle: 'italic' }}>Pick {i + 1}</div>
            )}
          </div>
        );
      })}
      <div style={{ marginTop: 10 }}>
        <StrengthArc picks={picks} />
        {lastDelta != null && (
          <div style={{ textAlign: 'center', fontSize: 11, color: lastDelta >= 0 ? '#00C853' : '#D50000', fontFamily: 'monospace', marginTop: 3 }}>
            {lastDelta >= 0 ? '+' : ''}{lastDelta.toFixed(2)} strength
          </div>
        )}
      </div>
    </div>
  );
}

// ─── SKIP CHIPS ──────────────────────────────────────────────────────────────
function SkipChips({ chips, onRespin, onEraLock }) {
  return (
    <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginTop: 10 }}>
      <div style={{ display: 'flex', gap: 6 }}>
        {[0, 1].map(i => (
          <div key={i} style={{ width: 26, height: 26, borderRadius: '50%', background: i < chips ? '#FFD700' : 'transparent', border: `2px solid ${i < chips ? '#FFD700' : '#2a2a2a'}`, transition: 'all 0.25s', position: 'relative', flexShrink: 0 }}>
            {i < chips && <div style={{ position: 'absolute', inset: 3, borderRadius: '50%', background: 'radial-gradient(circle at 33% 33%, rgba(255,255,255,0.5) 0%, transparent 70%)' }} />}
          </div>
        ))}
      </div>
      {[{label:'🔄 Respin', fn: onRespin, title:'Re-spin era + franchise'},{label:'🔒 Era Lock', fn: onEraLock, title:'Keep era, re-roll franchise'}].map(({label,fn,title}) => (
        <button key={label} onClick={fn} disabled={chips === 0} title={chips === 0 ? '🚫 No skips left' : title}
          style={{ background: chips > 0 ? '#171717' : '#0d0d0d', color: chips > 0 ? '#ccc' : '#333', border: `1px solid ${chips > 0 ? '#333' : '#1a1a1a'}`, borderRadius: 6, padding: '5px 11px', cursor: chips > 0 ? 'pointer' : 'not-allowed', fontSize: 11, fontWeight: 600, transition: 'all 0.15s' }}>
          {label}
        </button>
      ))}
    </div>
  );
}

// ─── REEL ────────────────────────────────────────────────────────────────────
function Reel({ label, value, locked, spinning }) {
  const chars = '▓▒░▓▒░▓▒░';
  return (
    <div style={{ textAlign: 'center', minWidth: 110, flex: 1 }}>
      <div style={{ fontSize: 9, color: '#444', fontFamily: 'monospace', letterSpacing: 1.5, marginBottom: 4 }}>{label}</div>
      <div style={{ background: '#0d0d0d', border: `1px solid ${locked ? '#FFD700' : '#1e1e1e'}`, borderRadius: 7, padding: '9px 12px', fontSize: 13, fontWeight: 700, color: locked ? '#FFD700' : '#555', fontFamily: 'monospace', minHeight: 40, display: 'flex', alignItems: 'center', justifyContent: 'center', animation: spinning && !locked ? 'reelSpin 0.5s linear infinite' : 'none', transition: 'border-color 0.2s, color 0.2s', overflow: 'hidden', lineHeight: 1.2 }}>
        {spinning && !locked ? chars : (value || '…')}
      </div>
    </div>
  );
}

// ─── SHARE BUTTON ────────────────────────────────────────────────────────────
function ShareBtn({ label, color, border, onClick, delay }) {
  return (
    <button onClick={onClick} style={{ background: color, color: '#fff', border: `1px solid ${border}`, borderRadius: 7, padding: '9px 18px', fontWeight: 700, cursor: 'pointer', fontSize: 13, animation: `slideIn 0.2s ease ${delay}ms both`, fontFamily: 'inherit' }}>
      {label}
    </button>
  );
}

// ─── STYLES ──────────────────────────────────────────────────────────────────
const S = {
  page: { minHeight: '100vh', background: '#0f0f0f', color: '#fff', display: 'flex', fontFamily: "'DM Sans','Helvetica Neue',Arial,sans-serif" },
  centered: { alignItems: 'center', justifyContent: 'center' },
  titleHuge: { fontSize: 'clamp(72px,14vw,130px)', fontWeight: 900, lineHeight: 1, fontFamily: 'Barlow Condensed,Anton,Arial Black,Arial', color: '#FFD700', letterSpacing: -2, marginBottom: 14 },
  titleSmall: { fontSize: 26, fontWeight: 900, fontFamily: 'Barlow Condensed,Arial Black,Arial', color: '#FFD700', letterSpacing: 1 },
  tagline: { fontSize: 15, color: '#777', marginBottom: 22, lineHeight: 1.6 },
  nudge: { background: '#12120a', border: '1px solid #2a2a00', borderRadius: 7, padding: '9px 14px', fontSize: 12, color: '#999', marginBottom: 14 },
  historyRow: { display: 'flex', justifyContent: 'space-between', padding: '4px 0', borderBottom: '1px solid #141414' },
  modeBtn: { borderRadius: 7, padding: '9px 16px', fontWeight: 700, cursor: 'pointer', fontSize: 13, fontFamily: 'inherit' },
  ctaPrimary: { background: '#FFD700', color: '#000', border: 'none', borderRadius: 9, padding: '13px 30px', fontSize: 17, fontWeight: 900, cursor: 'pointer', fontFamily: 'Barlow Condensed,Arial Black,Arial', letterSpacing: 1 },
  ctaSecondary: { background: 'transparent', color: '#ccc', border: '1px solid #333', borderRadius: 9, padding: '13px 28px', fontSize: 15, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' },
  badge: { color: '#fff', fontSize: 11, padding: '3px 9px', borderRadius: 5, fontWeight: 700 },
  slotBox: { background: '#0d0d0d', border: '1px solid #1a1a1a', borderRadius: 10, padding: '18px' },
  resultMsg: { fontSize: 20, color: '#bbb', marginTop: 10, marginBottom: 18, fontWeight: 600 },
  weakestBox: { display: 'flex', gap: 10, justifyContent: 'center', alignItems: 'center', background: '#140a0a', border: '1px solid #2a1010', borderRadius: 7, padding: '9px 18px', marginBottom: 14 },
};

// ─── APP ─────────────────────────────────────────────────────────────────────
export default function App() {
  const [screen, setScreen] = useState('intro');
  const [players, setPlayers] = useState([]);
  const [mode, setMode] = useState('classic');
  const [chaosMode, setChaosMode] = useState(false);
  const [chaosTag, setChaosTag] = useState(null);
  const [slot, setSlot] = useState(null);
  const [picks, setPicks] = useState([]);
  const [skipChips, setSkipChips] = useState(2);
  const [skipsUsed, setSkipsUsed] = useState(0);
  const [spinning, setSpinning] = useState(false);
  const [reelLocked, setReelLocked] = useState([false, false]);
  const [reshuffling, setReshuffling] = useState(false);
  const [wins, setWins] = useState(0);
  const [gameLog, setGameLog] = useState([]);
  const [simDone, setSimDone] = useState(false);
  const [history, setHistory] = useState(() => loadHistory());
  const [lastDelta, setLastDelta] = useState(null);
  const [shake, setShake] = useState(false);
  const [goldFlash, setGoldFlash] = useState(false);
  const [displayWins, setDisplayWins] = useState(0);
  const canvasRef = useRef(null);
  const touchStartX = useRef(null);
  const screenRef = useRef('intro');
  const playersRef = useRef([]);
  const modeRef = useRef('classic');
  const chaosModeRef = useRef(false);
  const chaosTagRef = useRef(null);
  const skipsUsedRef = useRef(0);
  const picksRef = useRef([]);

  // keep refs in sync
  useEffect(() => { screenRef.current = screen; }, [screen]);
  useEffect(() => { playersRef.current = players; }, [players]);
  useEffect(() => { modeRef.current = mode; }, [mode]);
  useEffect(() => { chaosModeRef.current = chaosMode; }, [chaosMode]);
  useEffect(() => { chaosTagRef.current = chaosTag; }, [chaosTag]);
  useEffect(() => { skipsUsedRef.current = skipsUsed; }, [skipsUsed]);
  useEffect(() => { picksRef.current = picks; }, [picks]);

  useEffect(() => { fetch(`${import.meta.env.BASE_URL}players.json`).then(r => r.json()).then(setPlayers); }, []);

  // confetti on perfect
  useEffect(() => {
    if (goldFlash && window.confetti) {
      window.confetti({ particleCount: 180, spread: 70, origin: { y: 0.55 } });
      const t = setTimeout(() => window.confetti({ particleCount: 80, spread: 50, origin: { y: 0.3 } }), 700);
      return () => clearTimeout(t);
    }
  }, [goldFlash]);

  // keyboard shortcut
  useEffect(() => {
    const fn = (e) => {
      if ((e.key === 'Enter' || e.key === ' ') && screenRef.current === 'result') {
        e.preventDefault();
        triggerRestart();
      }
    };
    window.addEventListener('keydown', fn);
    return () => window.removeEventListener('keydown', fn);
  }, []);

  // swipe
  useEffect(() => {
    const onStart = (e) => { touchStartX.current = e.touches[0].clientX; };
    const onEnd = (e) => {
      if (touchStartX.current !== null && screenRef.current === 'result') {
        if (e.changedTouches[0].clientX - touchStartX.current < -60) triggerRestart();
      }
      touchStartX.current = null;
    };
    window.addEventListener('touchstart', onStart);
    window.addEventListener('touchend', onEnd);
    return () => { window.removeEventListener('touchstart', onStart); window.removeEventListener('touchend', onEnd); };
  }, []);

  // render share card when result is shown
  useEffect(() => {
    if (screen === 'result' && picksRef.current.length === 5) {
      setTimeout(() => renderShareCard(canvasRef, picksRef.current, wins, modeRef.current, chaosModeRef.current, skipsUsedRef.current), 200);
    }
  }, [screen, wins]);

  const doSpin = useCallback((forcedEra = null) => {
    const pl = playersRef.current;
    const ct = chaosModeRef.current ? chaosTagRef.current : null;
    setSpinning(true);
    setReelLocked([false, false]);
    setSlot(null);
    setTimeout(() => setReelLocked(prev => [true, prev[1]]), 600);
    setTimeout(() => {
      playClick(800, 0.04);
      setReelLocked([true, true]);
      setSpinning(false);
      const result = spinSlot(pl, ct, forcedEra);
      if (!result) {
        setReshuffling(true);
        setTimeout(() => { setReshuffling(false); doSpin(forcedEra); }, 500);
      } else {
        setSlot(result);
      }
    }, 820);
  }, []);

  const startDraft = useCallback((preservedPicks = []) => {
    setPicks(preservedPicks);
    picksRef.current = preservedPicks;
    setSkipChips(2);
    setSkipsUsed(0);
    skipsUsedRef.current = 0;
    setLastDelta(null);
    setSlot(null);
    setScreen('draft');
    setTimeout(() => doSpin(), 80);
  }, [doSpin]);

  const triggerRestart = useCallback(() => {
    setWins(0); setGameLog([]); setSimDone(false); setGoldFlash(false); setDisplayWins(0);
    startDraft([]);
  }, [startDraft]);

  const handleRespin = () => {
    if (skipChips < 1) return;
    playClick(600, 0.06); setSkipChips(c => c - 1); setSkipsUsed(s => s + 1); doSpin();
  };
  const handleEraLock = () => {
    if (skipChips < 1 || !slot) return;
    playClick(600, 0.06); setSkipChips(c => c - 1); setSkipsUsed(s => s + 1); doSpin(slot.era);
  };

  const handlePick = useCallback((player) => {
    playClick(1000, 0.05);
    const prev = picksRef.current;
    const prevStrength = computeTeamStrength(prev);
    const newPicks = [...prev, player];
    const newStrength = computeTeamStrength(newPicks);
    setLastDelta(newPicks.length > 1 ? newStrength - prevStrength : null);
    setPicks(newPicks);
    picksRef.current = newPicks;
    if (newPicks.length >= 5) {
      setScreen('simulate');
      runSim(newPicks);
    } else {
      setSlot(null);
      setTimeout(() => doSpin(), 100);
    }
  }, [doSpin]);

  const runSim = (finalPicks) => {
    const totalW = projectWins(computeTeamStrength(finalPicks));
    const log = [];
    let wc = 0;
    setGameLog([]); setSimDone(false); setDisplayWins(0);
    let i = 0;
    const tick = () => {
      if (i >= CONFIG.perfectRecord) {
        setSimDone(true);
        let d = 0;
        const iv = setInterval(() => {
          d++;
          setDisplayWins(d);
          if (d >= totalW) {
            clearInterval(iv);
            if (totalW === CONFIG.perfectRecord) { setGoldFlash(true); setTimeout(() => setGoldFlash(false), 1500); }
            const h = saveRun(finalPicks, totalW, modeRef.current, chaosModeRef.current, skipsUsedRef.current);
            setHistory(h);
            setWins(totalW);
            setTimeout(() => setScreen('result'), 900);
          }
        }, Math.max(30, 800 / Math.max(1, totalW)));
        return;
      }
      const isW = i < totalW;
      const nearMiss = wc >= CONFIG.perfectRecord - 3 && totalW < CONFIG.perfectRecord;
      const delay = nearMiss ? 220 : 60;
      log.push(isW ? 'W' : 'L');
      if (isW) wc++;
      setGameLog([...log]);
      if (!isW) { setShake(true); setTimeout(() => setShake(false), 320); }
      i++;
      setTimeout(tick, delay);
    };
    setTimeout(tick, 400);
  };

  const handleSwapWeakest = () => {
    const weakest = picks.reduce((min, p) => p.peak_score < min.peak_score ? p : min);
    const preserved = picks.filter(p => p !== weakest);
    setWins(0); setGameLog([]); setSimDone(false); setGoldFlash(false); setDisplayWins(0);
    startDraft(preserved);
  };

  const perfect = CONFIG.perfectRecord;
  const isPerf = wins === perfect;
  const isNearMiss = !isPerf && wins >= perfect - 2;
  const isMidRange = !isPerf && !isNearMiss && wins >= Math.floor(perfect * 0.5);
  const weakestPick = picks.length ? picks.reduce((min, p) => p.peak_score < min.peak_score ? p : min) : null;
  const favCallout = history.favoritePick?.count > 1 && picks.some(p => p.name === history.favoritePick?.name);
  const eraBlindSpot = history.totalRuns >= 5 ? CONFIG.eras.find(e => !history.eraHistory?.[e]) : null;

  const shareText = () => {
    const names = picks.map(p => p.name);
    const last = names.pop();
    const taunt = mode === 'iq' && chaosMode ? "Didn't look once. Chaos rules applied. Try me." : mode === 'iq' ? 'No stats. Pure knowledge.' : chaosMode ? 'Hardest mode. No excuses.' : '';
    return `${wins}-${perfect - wins} — ${names.join(', ')} and ${last}.\n${taunt ? taunt + '\n' : ''}Can you beat ${wins}-${perfect - wins}? #17zero`;
  };

  // ── INTRO ─────────────────────────────────────────────────────────────────
  if (screen === 'intro') {
    const pb = history.bestRun;
    return (
      <div style={{ ...S.page, ...S.centered }}>
        <div style={{ maxWidth: 520, width: '100%', textAlign: 'center', padding: '0 20px' }}>
          <div style={S.titleHuge}>{CONFIG.title}</div>
          <div style={S.tagline}>
            {pb ? (
              <><span style={{ color: '#FFD700', fontWeight: 700 }}>Your best: {pb.result}-{perfect - pb.result}</span> · {history.totalRuns} run{history.totalRuns !== 1 ? 's' : ''}. Beat it.</>
            ) : CONFIG.tagline}
          </div>
          {eraBlindSpot && (
            <div style={S.nudge}>You've never drafted a <b style={{ color: '#FFD700' }}>{eraBlindSpot}</b> player. Scared?</div>
          )}
          {history.runs.length > 0 && (
            <div style={{ background: '#0b0b0b', border: '1px solid #1a1a1a', borderRadius: 8, padding: '10px 14px', marginBottom: 18, textAlign: 'left' }}>
              {history.runs.slice(-5).reverse().map((r, i) => (
                <div key={i} style={S.historyRow}>
                  <span style={{ color: r.result === perfect ? '#FFD700' : '#bbb', fontFamily: 'monospace', fontWeight: 700, fontSize: 13 }}>{r.result}-{perfect - r.result}</span>
                  <span style={{ color: '#444', fontSize: 11 }}>{r.mode}{r.chaosMode ? ' 🔥' : ''} · {new Date(r.date).toLocaleDateString()}</span>
                </div>
              ))}
            </div>
          )}
          <div style={{ display: 'flex', gap: 10, justifyContent: 'center', marginBottom: 12 }}>
            {['classic','iq'].map(m => (
              <button key={m} onClick={() => setMode(m)} style={{ ...S.modeBtn, background: mode === m ? '#FFD700' : '#141414', color: mode === m ? '#000' : '#888', border: `1px solid ${mode === m ? '#FFD700' : '#222'}` }}>
                {m === 'classic' ? '📋 Classic' : '🧠 NFLIQ (Blind)'}
              </button>
            ))}
            <button onClick={() => setChaosMode(c => !c)} style={{ ...S.modeBtn, background: chaosMode ? '#BF360C' : '#141414', color: chaosMode ? '#fff' : '#888', border: `1px solid ${chaosMode ? '#BF360C' : '#222'}` }}>
              🔥 Chaos
            </button>
          </div>
          {chaosMode && (
            <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap', justifyContent: 'center', marginBottom: 14 }}>
              {CONFIG.archetypeFilters.map(f => (
                <button key={f.tag} onClick={() => setChaosTag(t => t === f.tag ? null : f.tag)} style={{ ...S.modeBtn, fontSize: 11, padding: '5px 10px', background: chaosTag === f.tag ? '#222' : '#0d0d0d', border: `1px solid ${chaosTag === f.tag ? '#666' : '#222'}`, color: chaosTag === f.tag ? '#fff' : '#666' }}>
                  {f.label}
                </button>
              ))}
            </div>
          )}
          <button onClick={() => startDraft()} disabled={!players.length} style={{ ...S.ctaPrimary, width: '100%', marginTop: 8 }}>
            {players.length ? 'DRAFT YOUR ROSTER →' : 'Loading…'}
          </button>
        </div>
      </div>
    );
  }

  // ── DRAFT ─────────────────────────────────────────────────────────────────
  if (screen === 'draft') {
    return (
      <div style={{ ...S.page, flexDirection: 'row', gap: 20, padding: '20px 24px', alignItems: 'flex-start', justifyContent: 'center' }}>
        <RosterSidebar picks={picks} lastDelta={lastDelta} />
        <div style={{ flex: 1, maxWidth: 580, minWidth: 0 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 14 }}>
            <div>
              <div style={{ fontSize: 10, color: '#444', fontFamily: 'monospace', letterSpacing: 1.5, marginBottom: 2 }}>PICK {picks.length + 1} OF 5</div>
              <div style={S.titleSmall}>{CONFIG.title}</div>
            </div>
            <div style={{ display: 'flex', gap: 6 }}>
              {mode === 'iq' && <span style={{ ...S.badge, background: '#1565C0' }}>🧠 NFLIQ</span>}
              {chaosMode && <span style={{ ...S.badge, background: '#BF360C' }}>🔥 Chaos</span>}
            </div>
          </div>
          <div style={S.slotBox}>
            <div style={{ display: 'flex', gap: 10 }}>
              <Reel label="ERA" value={slot?.era} locked={reelLocked[0]} spinning={spinning} />
              <Reel label="FRANCHISE" value={slot?.franchise} locked={reelLocked[1]} spinning={spinning} />
              {chaosMode && chaosTag && (
                <Reel label="ARCHETYPE" value={CONFIG.archetypeFilters.find(f => f.tag === chaosTag)?.label} locked spinning={false} />
              )}
            </div>
            {reshuffling && <div style={{ textAlign: 'center', color: '#555', fontSize: 11, marginTop: 8, fontFamily: 'monospace' }}>reshuffling…</div>}
          </div>
          <SkipChips chips={skipChips} onRespin={handleRespin} onEraLock={handleEraLock} />
          {slot && !spinning && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 14 }}>
              {slot.cards.map((p, i) => (
                <PlayerCard key={p.id} player={p} onPick={handlePick} hidden={mode === 'iq'} index={i} />
              ))}
            </div>
          )}
          {spinning && !slot && (
            <div style={{ textAlign: 'center', padding: '30px 0', color: '#333', fontFamily: 'monospace' }}>spinning…</div>
          )}
        </div>
      </div>
    );
  }

  // ── SIMULATE ──────────────────────────────────────────────────────────────
  if (screen === 'simulate') {
    const wCount = gameLog.filter(g => g === 'W').length;
    const lCount = gameLog.filter(g => g === 'L').length;
    return (
      <div style={{ ...S.page, ...S.centered }}>
        <div style={{ textAlign: 'center', maxWidth: 500 }}>
          <div style={{ fontSize: 11, color: '#444', fontFamily: 'monospace', letterSpacing: 2, marginBottom: 8 }}>SIMULATING SEASON</div>
          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', justifyContent: 'center', margin: '20px 0', animation: shake ? 'shake 0.3s ease' : 'none' }}>
            {gameLog.map((g, i) => (
              <div key={i} style={{ width: 26, height: 26, borderRadius: 4, background: g === 'W' ? '#00C853' : '#D50000', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, color: '#fff', fontFamily: 'monospace', animation: i === gameLog.length - 1 ? 'flashIn 0.12s ease' : 'none' }}>
                {g}
              </div>
            ))}
            {Array.from({ length: Math.max(0, CONFIG.perfectRecord - gameLog.length) }).map((_, i) => (
              <div key={`e${i}`} style={{ width: 26, height: 26, borderRadius: 4, background: '#111', border: '1px solid #1a1a1a' }} />
            ))}
          </div>
          <div style={{ fontFamily: 'monospace', fontSize: 38, fontWeight: 700 }}>
            <span style={{ color: '#00C853' }}>{wCount}</span>
            <span style={{ color: '#333' }}> - </span>
            <span style={{ color: '#D50000' }}>{lCount}</span>
          </div>
          {simDone && <div style={{ marginTop: 16, fontSize: 13, color: '#555', fontFamily: 'monospace' }}>Final record: {displayWins}-{perfect - displayWins}</div>}
        </div>
      </div>
    );
  }

  // ── RESULT ────────────────────────────────────────────────────────────────
  if (screen === 'result') {
    const losses = perfect - wins;
    const resColor = isPerf ? '#FFD700' : isNearMiss ? '#00C853' : isMidRange ? '#FF6D00' : '#D50000';
    return (
      <div style={{ ...S.page, ...S.centered, padding: '20px', flexDirection: 'column', position: 'relative', overflow: 'hidden' }}>
        {goldFlash && <div style={{ position: 'fixed', inset: 0, background: '#FFD70022', pointerEvents: 'none', animation: 'goldPulse 1.2s ease' }} />}
        <div style={{ maxWidth: 620, width: '100%', textAlign: 'center' }}>
          <div style={{ fontSize: 'clamp(64px,12vw,96px)', fontWeight: 900, lineHeight: 1, fontFamily: 'Barlow Condensed,Arial Black,Arial', color: resColor, animation: 'countUp 0.8s ease' }}>
            {wins}-{losses}
          </div>
          <div style={S.resultMsg}>
            {isPerf && 'UNTOUCHABLE. Share it.'}
            {isNearMiss && `Game ${wins + 1}. One bad quarter. One more try?`}
            {isMidRange && weakestPick && `Not bad. But ${weakestPick.name} cost you wins.`}
            {!isPerf && !isNearMiss && !isMidRange && weakestPick && `Rough. ${weakestPick.name} was the anchor. Go again?`}
          </div>
          {weakestPick && !isPerf && (
            <div style={S.weakestBox}>
              <span style={{ fontSize: 10, color: '#555', fontFamily: 'monospace' }}>WEAKEST LINK</span>
              <span style={{ fontWeight: 700, color: '#FFD700' }}>{weakestPick.name}</span>
              <span style={{ fontSize: 11, color: '#444', fontFamily: 'monospace' }}>{weakestPick.peak_score.toFixed(2)}</span>
            </div>
          )}
          {favCallout && (
            <div style={S.nudge}>{history.favoritePick.name} again. You keep coming back. {history.favoritePick.count}× selected.</div>
          )}
          <div style={{ margin: '16px 0', animation: 'cardReveal 0.25s ease' }}>
            <canvas ref={canvasRef} style={{ width: '100%', maxWidth: 580, borderRadius: 9, display: 'block', margin: '0 auto', boxShadow: '0 6px 36px rgba(0,0,0,0.7)' }} />
          </div>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'center', flexWrap: 'wrap', marginBottom: 16 }}>
            <ShareBtn label="𝕏 Tweet" color="#111" border="#333" onClick={() => window.open(`https://twitter.com/intent/tweet?text=${encodeURIComponent(shareText())}`, '_blank')} delay={0} />
            <ShareBtn label="📋 Copy" color="#1a1a1a" border="#333" onClick={() => navigator.clipboard?.writeText(shareText())} delay={100} />
            <ShareBtn label="⬇ PNG" color="#1a1a1a" border="#333" onClick={() => { const a = document.createElement('a'); a.download = '17-0.png'; a.href = canvasRef.current?.toDataURL() || ''; a.click(); }} delay={200} />
          </div>
          <div style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap' }}>
            {isPerf ? (
              <>
                <button style={S.ctaPrimary} onClick={() => navigator.clipboard?.writeText(shareText())}>Share →</button>
                <button style={S.ctaSecondary} onClick={triggerRestart}>Run It Back</button>
              </>
            ) : isNearMiss ? (
              <>
                <button style={S.ctaPrimary} onClick={triggerRestart}>Try Again</button>
                <button style={S.ctaSecondary} onClick={() => navigator.clipboard?.writeText(shareText())}>Share</button>
              </>
            ) : isMidRange && weakestPick ? (
              <>
                <button style={S.ctaPrimary} onClick={handleSwapWeakest}>Swap {weakestPick.name} →</button>
                <button style={S.ctaSecondary} onClick={triggerRestart}>Full Restart</button>
              </>
            ) : (
              <button style={S.ctaPrimary} onClick={triggerRestart}>Go Again →</button>
            )}
          </div>
          <div style={{ marginTop: 10, fontSize: 10, color: '#2a2a2a', fontFamily: 'monospace' }}>ENTER · SPACE · swipe left to restart</div>
        </div>
      </div>
    );
  }

  return null;
}
