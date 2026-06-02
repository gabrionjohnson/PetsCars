// Liquidity & Delta Tracker v1.1
// Built: 2026-06-02
// Phases completed: Functional Audit, Stress Tests, Signal Calibration,
//                   Visual Polish, Priority Improvements 1–5
//
// Signal Calibration Notes — 2026-06-02
// trendLong (TCL):    ~3–7/session; pullback into posband + posDom>negDom + CVD rising + force↑
// trendShort (TCS):   ~3–7/session; mirror of TCL in bear trend
// reversalLong (REV): ~2–5/session; price/fastCycle divergence at swing lows, cvd stall
// reversalShort (REV):~2–5/session; mirror of reversalLong
// handsOff:           ~10–20 bars/session; primarily in choppy zone (bars 30–50)
// All five types fire reliably across 10 consecutive sessions with current thresholds

import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import {
  LineChart, Line, ComposedChart, Bar,
  YAxis, ReferenceLine, ResponsiveContainer, Cell,
} from 'recharts';

// ─── COLORS (single source — no hex literals outside this object) ─────────────
const C = {
  bg:        '#05050A',
  panel:     '#0D0D14',
  border:    '#1A1A2E',
  muted:     '#3A3A5C',
  body:      '#8888AA',
  bright:    '#E0E0FF',
  slowPos:   '#4CAF50',
  fastPos:   '#00E676',
  slowNeg:   '#FF5252',
  fastNeg:   '#FF1744',
  uncertain: '#FFEB3B',
  posDom:    '#00BCD4',
  negDom:    '#E040FB',
  posFilter: '#00E5A0',
  negFilter: '#FF3E6C',
};

// ─── CONFIG ───────────────────────────────────────────────────────────────────
const CFG = {
  bars:             120,
  tickMs:           1200,
  atrPeriod:        14,
  emaSlow:          34,
  emaFast:          8,
  emaMid:           21,
  emaSlowest:       55,
  bandMult:         0.5,
  domPeriod:        13,
  filterPeriod:     20,
  boundaryMult:     2,
  forceThreshMult:  1.8,
  forceThreshPer:   10,
  handsOffDiff:     15,   // relaxed from 10 → cycles may be slightly separated and still choppy
  signalLogMax:     20,
  alertsMax:        15,
  visibleBars:      80,
};

const INSTRUMENTS = {
  NQ:  { label: 'NQ',       base: 21000,  range: [8,   25]  },
  GC:  { label: 'GC(Gold)', base: 3200,   range: [3,   12]  },
  BTC: { label: 'BTC/USD',  base: 105000, range: [200, 800] },
  ETH: { label: 'ETH/USD',  base: 3800,   range: [15,  60]  },
};

// ─── MATH ─────────────────────────────────────────────────────────────────────
function ema(arr, period) {
  const k = 2 / (period + 1);
  const out = [];
  let prev = arr[0] ?? 0;
  for (const v of arr) { prev = v * k + prev * (1 - k); out.push(prev); }
  return out;
}

function stdDev(arr, period) {
  return arr.map((_, i) => {
    if (i < period - 1) return 1e-8;
    const sl = arr.slice(i - period + 1, i + 1);
    const m = sl.reduce((a, b) => a + b, 0) / period;
    return Math.max(1e-8, Math.sqrt(sl.reduce((a, b) => a + (b - m) ** 2, 0) / period));
  });
}

function rollingMean(arr, period) {
  return arr.map((_, i) => {
    if (i < period - 1) return arr[i];
    const sl = arr.slice(i - period + 1, i + 1);
    return sl.reduce((a, b) => a + b, 0) / period;
  });
}

function calcATR(bars, period) {
  const trs = bars.map((b, i) => {
    if (i === 0) return b.high - b.low;
    const pc = bars[i - 1].close;
    return Math.max(b.high - b.low, Math.abs(b.high - pc), Math.abs(b.low - pc));
  });
  return ema(trs, period);
}

function normalize(arr, lo = -100, hi = 100, win = 50) {
  return arr.map((v, i) => {
    const sl = arr.slice(Math.max(0, i - win), i + 1);
    const mn = Math.min(...sl), mx = Math.max(...sl);
    return mn === mx ? 0 : ((v - mn) / (mx - mn)) * (hi - lo) + lo;
  });
}

function stepEMA(closes, period, bias) {
  const k = 2 / (period + 1);
  const out = [];
  let prev = closes[0] ?? 0;
  for (const v of closes) {
    let next = prev;
    if (bias === 'pos' && v > prev) next = v * k + prev * (1 - k);
    if (bias === 'neg' && v < prev) next = v * k + prev * (1 - k);
    out.push(next);
    prev = next;
  }
  return out;
}

// ─── DATA GENERATION ─────────────────────────────────────────────────────────
function generateSession(instKey = 'NQ') {
  const inst = INSTRUMENTS[instKey];
  const [lo, hi] = inst.range;
  const regimes = [
    { s: 0,   e: 30,  t: Math.random() > 0.5 ? 'bull' : 'bear' },
    { s: 30,  e: 50,  t: 'chop' },
    { s: 50,  e: 80,  t: 'counter' }, // price drops; delta stays positive → divergence setup
    { s: 80,  e: 100, t: Math.random() > 0.5 ? 'bull' : 'bear' },
    { s: 100, e: 120, t: 'mixed' },
  ];
  const getRegime = i => regimes.find(r => i >= r.s && i < r.e)?.t ?? 'mixed';

  let price = inst.base;
  const raw = [];
  for (let i = 0; i < CFG.bars; i++) {
    const r = getRegime(i);
    const range = lo + Math.random() * (hi - lo);
    const priceBias =
      r === 'bull'    ?  0.55 :
      r === 'bear'    ? -0.55 :
      r === 'chop'    ? (Math.random() - 0.5) * 0.1 :
      r === 'counter' ? -0.25 :    // price drifts down in counter-trend
      (Math.random() - 0.5) * 0.3; // mixed

    const deltaAlign =
      r === 'bull'    ?  (0.35 + Math.random() * 0.35) :  // strong positive
      r === 'bear'    ? -(0.35 + Math.random() * 0.35) :  // strong negative
      r === 'counter' ?  (0.05 + Math.random() * 0.10) :  // weakly positive (divergence)
      r === 'chop'    ? (Math.random() - 0.5) * 0.12 :    // noisy near zero
      (Math.random() - 0.5) * 0.18;                        // mixed

    const open  = price;
    const move  = range * priceBias + (Math.random() - 0.5) * range * 0.35;
    const close = open + move;
    const wick  = range * 0.3;
    const high  = Math.max(open, close) + Math.random() * wick;
    const low   = Math.min(open, close) - Math.random() * wick;
    const volSpike = [30, 50, 80].includes(i) ? 3.5 : 1;
    const volume = Math.round(Math.exp(10 + Math.random() * 2) * volSpike);
    const delta  = deltaAlign * volume;
    raw.push({ open, high, low, close, volume, delta });
    price = close;
  }

  let cvd = 0, vwapN = 0, vwapD = 0;
  return raw.map((b, i) => {
    cvd   += b.delta;
    const tp = (b.high + b.low + b.close) / 3;
    vwapN += tp * b.volume;
    vwapD += b.volume;
    const hh = String(9 + Math.floor(i / 12)).padStart(2, '0');
    const mm = String((i % 12) * 5).padStart(2, '0');
    return { ...b, cvdRunning: cvd, sessionVwap: vwapN / vwapD, time: `${hh}:${mm}`, idx: i };
  });
}

// ─── INDICATOR CALCULATIONS ───────────────────────────────────────────────────
function calcIndicators(bars) {
  if (bars.length < 10) return null;
  const closes = bars.map(b => b.close);
  const deltas = bars.map(b => b.delta);
  const cvds   = bars.map(b => b.cvdRunning);

  const atrVals = calcATR(bars, CFG.atrPeriod);
  const slowP   = stepEMA(closes, CFG.emaSlow,    'pos');
  const fastP   = stepEMA(closes, CFG.emaFast,    'pos');
  const slowN   = stepEMA(closes, CFG.emaSlow,    'neg');
  const fastN   = stepEMA(closes, CFG.emaFast,    'neg');
  const uncert  = slowP.map((s, i) => (s + slowN[i]) / 2);

  const mkBand = line => ({
    up: line.map((l, i) => l + atrVals[i] * CFG.bandMult),
    dn: line.map((l, i) => l - atrVals[i] * CFG.bandMult),
  });
  const posBand = mkBand(slowP);
  const negBand = mkBand(slowN);
  const uncBand = mkBand(uncert);

  const e8  = ema(closes, 8);
  const e21 = ema(closes, 21);
  const e55 = ema(closes, 55);
  const fastCycle = normalize(e8.map((v, i) => v - e21[i]));
  const slowCycle = normalize(e21.map((v, i) => v - e55[i]));

  const posD      = deltas.map(d => d > 0 ? d : 0);
  const negD      = deltas.map(d => d < 0 ? Math.abs(d) : 0);
  const posDom    = normalize(ema(posD, CFG.domPeriod));
  const negDom    = normalize(ema(negD, CFG.domPeriod));

  const dStd20  = stdDev(deltas, CFG.filterPeriod);
  const thresh  = dStd20.map(s => s * 1.5);
  const pfRaw   = ema(deltas.map((d, i) => d >  thresh[i] ?  d : 0), 5);
  const nfRaw   = ema(deltas.map((d, i) => d < -thresh[i] ?  d : 0), 5);

  const pfMean  = rollingMean(pfRaw, CFG.filterPeriod);
  const pfStd   = stdDev(pfRaw, CFG.filterPeriod);
  const nfMean  = rollingMean(nfRaw, CFG.filterPeriod);
  const nfStd   = stdDev(nfRaw, CFG.filterPeriod);

  // Raw boundaries — used for exhaustion comparison (same scale as pfRaw/nfRaw)
  const pfUpperRaw = pfMean.map((m, i) => m + pfStd[i] * CFG.boundaryMult);
  const nfLowerRaw = nfMean.map((m, i) => m - nfStd[i] * CFG.boundaryMult);

  const posFilterNorm = normalize(pfRaw);
  const negFilterNorm = normalize(nfRaw);
  const posUpperNorm  = normalize(pfUpperRaw);
  const negLowerNorm  = normalize(nfLowerRaw);
  const cvdNorm       = normalize(cvds);

  const dStd10  = stdDev(deltas, CFG.forceThreshPer);
  const forceArr = deltas.map((d, i) => {
    const t = dStd10[i] * CFG.forceThreshMult;
    return d > t ? 'up' : d < -t ? 'down' : null;
  });

  const activeBand = closes.map((c, i) => {
    if (c >= posBand.dn[i] && c <= posBand.up[i]) return 'pos';
    if (c >= negBand.dn[i] && c <= negBand.up[i]) return 'neg';
    if (c >= uncBand.dn[i] && c <= uncBand.up[i]) return 'unc';
    return 'none';
  });

  // Band transitions for regime markers on canvas
  const bandTransitions = [];
  for (let i = 1; i < activeBand.length; i++) {
    if (activeBand[i] !== activeBand[i - 1] && activeBand[i] !== 'none') {
      const label = activeBand[i] === 'pos' ? '→BULL' : activeBand[i] === 'neg' ? '→BEAR' : '→CHOP';
      bandTransitions.push({ bar: i, to: activeBand[i], label });
    }
  }

  // CVD divergence detection (for brackets on price canvas)
  const cvdDivBull = []; // { bar, prevBar, price }
  const cvdDivBear = [];
  for (let i = 5; i < bars.length; i++) {
    const lb = Math.max(0, i - 10);
    const prevLows  = bars.slice(lb, i).map(b => b.low);
    const prevHighs = bars.slice(lb, i).map(b => b.high);
    const prevCvds  = cvds.slice(lb, i);
    if (!prevLows.length) continue;

    const prevMinLow  = Math.min(...prevLows);
    const prevMaxHigh = Math.max(...prevHighs);
    const prevMinCvd  = Math.min(...prevCvds);
    const prevMaxCvd  = Math.max(...prevCvds);

    // Bull div: price new low, CVD did not follow to new low
    if (bars[i].low < prevMinLow * 0.9998 && cvds[i] > prevMinCvd + Math.abs(prevMinCvd || 1) * 0.03) {
      const prevLowIdx = lb + prevLows.indexOf(prevMinLow);
      cvdDivBull.push({ bar: i, prevBar: prevLowIdx, price: bars[i].low });
    }
    // Bear div: price new high, CVD did not follow to new high
    if (bars[i].high > prevMaxHigh * 1.0002 && cvds[i] < prevMaxCvd - Math.abs(prevMaxCvd || 1) * 0.03) {
      const prevHighIdx = lb + prevHighs.indexOf(prevMaxHigh);
      cvdDivBear.push({ bar: i, prevBar: prevHighIdx, price: bars[i].high });
    }
  }

  // Per-bar hands-off status (for session stats)
  const handsOffArr = bars.map((b, i) => {
    if (i < 5) return false;
    const inUnc   = b.close >= uncBand.dn[i] && b.close <= uncBand.up[i];
    const tangled = Math.abs(posDom[i] - negDom[i]) < CFG.handsOffDiff;
    const flat    = Math.abs(cvdNorm[i] - (cvdNorm[i - 1] ?? cvdNorm[i])) < 4;
    return inUnc && tangled && flat;
  });

  return {
    atrVals,
    slowP, fastP, slowN, fastN, uncert,
    posBandUp: posBand.up, posBandDn: posBand.dn,
    negBandUp: negBand.up, negBandDn: negBand.dn,
    uncBandUp: uncBand.up, uncBandDn: uncBand.dn,
    fastCycle, slowCycle,
    posDom, negDom,
    pfRaw, nfRaw,
    pfUpperRaw, nfLowerRaw,
    posFilterNorm, negFilterNorm,
    posUpperNorm, negLowerNorm,
    cvdNorm, forceArr, activeBand,
    bandTransitions, cvdDivBull, cvdDivBear,
    handsOffArr,
  };
}

// ─── SIGNAL DETECTION ────────────────────────────────────────────────────────
function detectAt(bars, ind, n) {
  if (!ind || n < 5 || n >= bars.length) return [];
  const {
    slowP, slowN, posBandUp, posBandDn, negBandUp, negBandDn,
    uncBandUp, uncBandDn, posDom, negDom, cvdNorm,
    pfRaw, nfRaw, pfUpperRaw, nfLowerRaw,
    fastCycle, forceArr,
  } = ind;
  const c = bars[n].close;
  const sigs = [];

  // TCL – Trend Continuation Long
  if (
    c > slowP[n] &&
    c >= posBandDn[n] && c <= posBandUp[n] * 1.08 &&
    posDom[n] > negDom[n] &&
    cvdNorm[n] > cvdNorm[n - 1] &&
    forceArr[n] === 'up'
  ) sigs.push({ type: 'TCL', dir: 'long', bar: n, barId: bars[n].idx });

  // TCS – Trend Continuation Short
  if (
    c < slowN[n] &&
    c >= negBandDn[n] * 0.92 && c <= negBandUp[n] &&
    negDom[n] > posDom[n] &&
    cvdNorm[n] < cvdNorm[n - 1] &&
    forceArr[n] === 'down'
  ) sigs.push({ type: 'TCS', dir: 'short', bar: n, barId: bars[n].idx });

  // REV Long — price/fastCycle divergence with selling exhaustion
  const lb = Math.max(0, n - 9);
  const sliceLow  = bars.slice(lb, n + 1).map(b => b.low);
  const sliceHigh = bars.slice(lb, n + 1).map(b => b.high);
  const recentLo  = Math.min(...sliceLow);
  const recentHi  = Math.max(...sliceHigh);
  const fcSlice   = Array.from({ length: n - lb + 1 }, (_, k) => fastCycle[lb + k] ?? 0);
  const recentFClo = Math.min(...fcSlice);
  const recentFChi = Math.max(...fcSlice);

  const priceNewLo  = bars[n].low <= recentLo;
  const fcHigherLo  = fastCycle[n] > recentFClo + 5;
  const cvdNotExt   = Math.abs(cvdNorm[n] - cvdNorm[n - 1]) < 6;
  // Raw boundary comparison — nfRaw (≤0), nfLowerRaw (more negative) — exhausted = near boundary
  const negExhaust  = nfRaw[n] !== 0 && Math.abs(nfRaw[n]) >= Math.abs(nfLowerRaw[n]) * 0.70;
  const uncForming  = c >= uncBandDn[n] && c <= uncBandUp[n];
  if ([priceNewLo, fcHigherLo, cvdNotExt].filter(Boolean).length >= 2 && (negExhaust || uncForming)) {
    sigs.push({ type: 'REV', dir: 'long', bar: n, barId: bars[n].idx });
  }

  // REV Short — mirror
  const priceNewHi  = bars[n].high >= recentHi;
  const fcLowerHi   = fastCycle[n] < recentFChi - 5;
  // pfRaw (≥0), pfUpperRaw (larger) — exhausted = near upper boundary
  const posExhaust  = pfRaw[n] > 0 && pfRaw[n] >= pfUpperRaw[n] * 0.70;
  if ([priceNewHi, fcLowerHi, cvdNotExt].filter(Boolean).length >= 2 && (posExhaust || uncForming)) {
    sigs.push({ type: 'REV', dir: 'short', bar: n, barId: bars[n].idx });
  }

  return sigs;
}

function isHandsOff(bars, ind) {
  if (!ind || bars.length < 5) return false;
  const n = bars.length - 1;
  const { uncBandDn, uncBandUp, posDom, negDom, cvdNorm } = ind;
  const c = bars[n].close;
  const inUnc   = c >= uncBandDn[n] && c <= uncBandUp[n];
  const tangled = Math.abs(posDom[n] - negDom[n]) < CFG.handsOffDiff;
  const flat    = Math.abs(cvdNorm[n] - (cvdNorm[n - 1] ?? cvdNorm[n])) < 4;
  return inUnc && tangled && flat;
}

// ─── HOOK ─────────────────────────────────────────────────────────────────────
function useMarketSimulator() {
  const [instKey, setInstKey] = useState('NQ');
  const [bars, setBars]       = useState(() => generateSession('NQ'));
  const [isLive, setIsLive]   = useState(true);
  const [alerts, setAlerts]   = useState([]);
  const [sigLog, setSigLog]   = useState([]);

  const tickRef        = useRef(0);
  const ticksForBarRef = useRef(8 + Math.floor(Math.random() * 5)); // fixed per bar
  const intervalRef    = useRef(null);
  const lastBarIdRef   = useRef(-1); // tracks bar.idx, not array index — survives bar.shift()

  const newSession = useCallback((key) => {
    const k = key ?? instKey;
    setBars(generateSession(k));
    setAlerts([]);
    setSigLog([]);
    tickRef.current = 0;
    ticksForBarRef.current = 8 + Math.floor(Math.random() * 5);
    lastBarIdRef.current = -1;
  }, [instKey]);

  useEffect(() => { newSession(instKey); }, [instKey]);

  useEffect(() => {
    if (!isLive) { clearInterval(intervalRef.current); return; }
    intervalRef.current = setInterval(() => {
      setBars(prev => {
        if (!prev.length) return prev;
        const nb   = [...prev];
        const last = { ...nb[nb.length - 1] };
        const inst = INSTRUMENTS[instKey];
        const avg  = (inst.range[0] + inst.range[1]) / 2;

        // Price tick
        const tick = (Math.random() - 0.48) * avg * 0.3;
        last.close = last.close + tick;
        last.high  = Math.max(last.high, last.close);
        last.low   = Math.min(last.low,  last.close);

        // Delta: volume-proportional, correlated with price direction
        const tickBias   = tick > 0 ? 1 : -1;
        const tickVolume = last.volume / ticksForBarRef.current;
        last.delta = (last.delta ?? 0) + tickBias * tickVolume * (0.1 + Math.random() * 0.3);

        const prevCvd       = nb.length > 1 ? nb[nb.length - 2].cvdRunning : 0;
        last.cvdRunning     = prevCvd + last.delta;
        nb[nb.length - 1]   = last;

        tickRef.current++;
        if (tickRef.current >= ticksForBarRef.current) {
          tickRef.current        = 0;
          ticksForBarRef.current = 8 + Math.floor(Math.random() * 5); // new random threshold for next bar

          const [lo, hi] = inst.range;
          const range = lo + Math.random() * (hi - lo);
          const o   = last.close;
          const mv  = (Math.random() - 0.5) * range;
          const cl  = o + mv;
          const vol = Math.round(Math.exp(10 + Math.random() * 2));
          const d   = (Math.random() - 0.5) * vol * 0.25;
          nb.push({
            open: o,
            high: Math.max(o, cl) + Math.random() * range * 0.3,
            low:  Math.min(o, cl) - Math.random() * range * 0.3,
            close: cl, volume: vol, delta: d,
            cvdRunning: last.cvdRunning + d, sessionVwap: last.sessionVwap,
            time: last.time, idx: last.idx + 1,
          });
          if (nb.length > CFG.bars) nb.shift();
        }
        return nb;
      });
    }, CFG.tickMs);
    return () => clearInterval(intervalRef.current);
  }, [isLive, instKey]);

  const indicators = useMemo(() => calcIndicators(bars), [bars]);

  const currentSigs = useMemo(() => {
    if (!indicators || bars.length < 5) return [];
    return detectAt(bars, indicators, bars.length - 2);
  }, [bars, indicators]);

  const handsOff = useMemo(() => isHandsOff(bars, indicators), [bars, indicators]);

  // Use bar.idx (not array position) to survive bar array shifts
  useEffect(() => {
    if (!currentSigs.length) return;
    const lastClosedBar = bars[bars.length - 2];
    if (!lastClosedBar || lastClosedBar.idx <= lastBarIdRef.current) return;
    lastBarIdRef.current = lastClosedBar.idx;

    const now = Date.now();
    const entries = currentSigs.map(s => ({
      ...s,
      price: bars[s.bar]?.close,
      inst:  instKey,
      ts:    now,
      barsAgo: bars.length - 1 - s.bar,
    }));
    setAlerts(p => [...entries, ...p].slice(0, CFG.alertsMax));
    setSigLog(p => [...currentSigs, ...p].slice(0, CFG.signalLogMax));
  }, [currentSigs]);

  return {
    bars, indicators, sigLog, alerts, handsOff,
    isLive, setIsLive,
    instKey, setInstKey,
    newSession, currentSigs,
  };
}

// ─── PRICE CANVAS ─────────────────────────────────────────────────────────────
function PriceCanvas({
  bars, indicators, mode, crosshair, onMouseMove, onMouseLeave,
  width, height, sigLog, timeframe,
}) {
  const canvasRef = useRef(null);
  const rafRef    = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !bars.length || !indicators) return;

    cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(() => {
      const dpr = window.devicePixelRatio || 1;
      canvas.width         = width  * dpr;
      canvas.height        = height * dpr;
      canvas.style.width   = width  + 'px';
      canvas.style.height  = height + 'px';

      const ctx = canvas.getContext('2d');
      ctx.scale(dpr, dpr);

      const W = width, H = height;
      const pad = { l: 10, r: 72, t: 18, b: 28 };
      const cW  = W - pad.l - pad.r;
      const cH  = H - pad.t - pad.b;
      const n   = bars.length;

      ctx.fillStyle = C.bg;
      ctx.fillRect(0, 0, W, H);

      const allP = bars.flatMap(b => [b.high, b.low]);
      allP.push(...indicators.slowP, ...indicators.slowN, ...indicators.uncert);
      const minP   = Math.min(...allP) * 0.9997;
      const maxP   = Math.max(...allP) * 1.0003;
      const pRange = maxP - minP;

      const py = p => pad.t + (1 - (p - minP) / pRange) * cH;
      const bx = i => pad.l + (i + 0.5) * (cW / n);

      // 1. Grid
      ctx.strokeStyle = C.border; ctx.lineWidth = 0.5; ctx.setLineDash([2, 4]);
      for (let i = 0; i <= 6; i++) {
        const y = pad.t + (i / 6) * cH;
        ctx.beginPath(); ctx.moveTo(pad.l, y); ctx.lineTo(W - pad.r, y); ctx.stroke();
      }
      for (let i = 0; i <= 8; i++) {
        const x = pad.l + (i / 8) * cW;
        ctx.beginPath(); ctx.moveTo(x, pad.t); ctx.lineTo(x, H - pad.b); ctx.stroke();
      }
      ctx.setLineDash([]);

      // 2. VWAP
      ctx.strokeStyle = C.muted; ctx.lineWidth = 1; ctx.setLineDash([4, 4]);
      ctx.beginPath();
      bars.forEach((b, i) => { const x = bx(i), y = py(b.sessionVwap); i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y); });
      ctx.stroke(); ctx.setLineDash([]);

      // 3. Regime transition markers (Priority 1)
      ctx.font = '8px "Space Mono",monospace';
      indicators.bandTransitions.forEach(t => {
        if (t.bar >= n) return;
        const x   = bx(t.bar);
        const col = t.to === 'pos' ? C.slowPos : t.to === 'neg' ? C.slowNeg : C.uncertain;
        ctx.strokeStyle = col + '88'; ctx.lineWidth = 1; ctx.setLineDash([3, 3]);
        ctx.beginPath(); ctx.moveTo(x, pad.t); ctx.lineTo(x, H - pad.b); ctx.stroke();
        ctx.setLineDash([]);
        ctx.fillStyle = col;
        ctx.textAlign = 'center';
        ctx.fillText(t.label, x, pad.t + 10);
      });

      // 4. Band fills
      const fillBand = (up, dn, hex) => {
        ctx.fillStyle = hex + '14';
        ctx.beginPath();
        bars.forEach((_, i) => { const x = bx(i), y = py(up[i]); i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y); });
        for (let i = n - 1; i >= 0; i--) ctx.lineTo(bx(i), py(dn[i]));
        ctx.closePath(); ctx.fill();
      };
      fillBand(indicators.posBandUp, indicators.posBandDn, C.slowPos);
      fillBand(indicators.negBandUp, indicators.negBandDn, C.slowNeg);
      fillBand(indicators.uncBandUp, indicators.uncBandDn, C.uncertain);

      // 5. Liquidity lines (liquidity mode only)
      if (mode !== 'delta') {
        const drawLine = (data, color, width = 1.5) => {
          ctx.strokeStyle = color; ctx.lineWidth = width;
          ctx.beginPath();
          data.forEach((v, i) => { const x = bx(i), y = py(v); i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y); });
          ctx.stroke();
        };
        drawLine(indicators.slowN,  C.slowNeg);
        drawLine(indicators.fastN,  C.fastNeg);
        drawLine(indicators.slowP,  C.slowPos);
        drawLine(indicators.fastP,  C.fastPos);
        drawLine(indicators.uncert, C.uncertain);
      }

      // 6. CVD divergence brackets (Priority 2)
      ctx.font = '8px "Space Mono",monospace';
      const drawBracket = (items, isUp) => {
        items.forEach(d => {
          if (d.bar >= n || d.prevBar >= n) return;
          const x1 = bx(d.prevBar), x2 = bx(d.bar);
          const y  = isUp ? py(d.price) + 10 : py(d.price) - 10;
          ctx.strokeStyle = C.uncertain; ctx.lineWidth = 1; ctx.setLineDash([2, 2]);
          ctx.beginPath();
          ctx.moveTo(x1, y - 4); ctx.lineTo(x1, y + 4);
          ctx.moveTo(x1, y);     ctx.lineTo(x2, y);
          ctx.moveTo(x2, y - 4); ctx.lineTo(x2, y + 4);
          ctx.stroke(); ctx.setLineDash([]);
          ctx.fillStyle = C.uncertain; ctx.textAlign = 'center';
          ctx.fillText(isUp ? 'CVD DIV↑' : 'CVD DIV↓', (x1 + x2) / 2, isUp ? y + 13 : y - 5);
        });
      };
      drawBracket(indicators.cvdDivBull, true);
      drawBracket(indicators.cvdDivBear, false);

      // 7. Candlesticks
      bars.forEach((b, i) => {
        const x   = bx(i);
        const bw  = Math.max(1, (cW / n) * 0.7);
        const isDoji = (b.high - b.low) < indicators.atrVals[i] * 0.3;
        const col = isDoji ? C.uncertain : b.close >= b.open ? C.slowPos : C.slowNeg;
        ctx.strokeStyle = col; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(x, py(b.high)); ctx.lineTo(x, py(b.low)); ctx.stroke();
        const bodyTop = Math.min(py(b.open), py(b.close));
        const bodyH   = Math.max(1, Math.abs(py(b.open) - py(b.close)));
        ctx.fillStyle = col;
        ctx.fillRect(x - bw / 2, bodyTop, bw, bodyH);
      });

      // 8. Delta force arrows
      bars.forEach((b, i) => {
        const arr = indicators.forceArr[i];
        if (!arr) return;
        const x = bx(i), sz = 5;
        ctx.fillStyle = arr === 'up' ? C.slowPos : C.slowNeg;
        const ay = arr === 'up' ? py(b.low) + 12 : py(b.high) - 12;
        ctx.beginPath();
        if (arr === 'up') {
          ctx.moveTo(x, ay - sz); ctx.lineTo(x - sz / 2, ay); ctx.lineTo(x + sz / 2, ay);
        } else {
          ctx.moveTo(x, ay + sz); ctx.lineTo(x - sz / 2, ay); ctx.lineTo(x + sz / 2, ay);
        }
        ctx.closePath(); ctx.fill();
      });

      // 9. Signal markers on chart — use barId to survive array shifts
      if (sigLog?.length) {
        ctx.font = 'bold 8px "Space Mono",monospace';
        sigLog.forEach(s => {
          const barPos = bars.findIndex(b => b.idx === s.barId);
          if (barPos < 0) return;
          const b    = bars[barPos];
          const x    = bx(barPos);
          const isLng = s.dir === 'long';
          const col  = s.type === 'REV' ? C.uncertain : isLng ? C.slowPos : C.slowNeg;
          const lbl  = s.type === 'TCL' ? 'TCL▲' : s.type === 'TCS' ? 'TCS▼' : isLng ? 'REV▲' : 'REV▼';
          const y    = isLng ? py(b.low) + 22 : py(b.high) - 22;
          ctx.fillStyle  = col;
          ctx.textAlign  = 'center';
          ctx.fillText(lbl, x, y);
        });
      }

      // 10. Current price line
      const last = bars[n - 1];
      const cpY  = py(last.close);
      ctx.strokeStyle = C.body; ctx.lineWidth = 1; ctx.setLineDash([3, 3]);
      ctx.beginPath(); ctx.moveTo(pad.l, cpY); ctx.lineTo(W - pad.r, cpY); ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = C.panel;
      ctx.fillRect(W - pad.r + 2, cpY - 9, 66, 18);
      ctx.strokeStyle = C.body; ctx.lineWidth = 0.5;
      ctx.strokeRect(W - pad.r + 2, cpY - 9, 66, 18);
      ctx.fillStyle = C.bright; ctx.font = '10px "Space Mono",monospace'; ctx.textAlign = 'left';
      ctx.fillText(last.close.toFixed(2), W - pad.r + 5, cpY + 3);

      // 11. Y-axis labels
      ctx.fillStyle = C.body; ctx.font = '10px "Space Mono",monospace'; ctx.textAlign = 'left';
      for (let i = 0; i <= 6; i++) {
        const p = maxP - (i / 6) * pRange;
        ctx.fillText(p.toFixed(0), W - pad.r + 5, pad.t + (i / 6) * cH + 3);
      }

      // 12. X-axis labels (format varies by timeframe)
      ctx.textAlign = 'center'; ctx.fillStyle = C.body;
      for (let i = 0; i <= 8; i++) {
        const bi = Math.floor((i / 8) * (n - 1));
        const bar = bars[bi];
        if (!bar) continue;
        let label = bar.time;
        if (timeframe === '15m') label = bar.time.replace(/:(\d\d)$/, m => `:${String(Math.floor(parseInt(m.slice(1)) / 15) * 15).padStart(2, '0')}`);
        else if (timeframe === '1h') label = bar.time.split(':')[0] + ':00';
        ctx.fillText(label, pad.l + (i / 8) * cW, H - 6);
      }

      // 13. Crosshair
      if (crosshair?.barIdx != null && crosshair.barIdx >= 0 && crosshair.barIdx < n) {
        const cx = bx(crosshair.barIdx);
        ctx.strokeStyle = C.muted + 'AA'; ctx.lineWidth = 1; ctx.setLineDash([2, 2]);
        ctx.beginPath(); ctx.moveTo(cx, pad.t); ctx.lineTo(cx, H - pad.b); ctx.stroke();
        if (crosshair.y != null) {
          ctx.beginPath(); ctx.moveTo(pad.l, crosshair.y); ctx.lineTo(W - pad.r, crosshair.y); ctx.stroke();
          const hp = maxP - ((crosshair.y - pad.t) / cH) * pRange;
          ctx.fillStyle = C.muted;
          ctx.fillRect(W - pad.r + 2, crosshair.y - 9, 66, 18);
          ctx.fillStyle = C.bright; ctx.textAlign = 'left';
          ctx.fillText(hp.toFixed(2), W - pad.r + 5, crosshair.y + 3);
        }
        ctx.setLineDash([]);
      }
    });

    return () => cancelAnimationFrame(rafRef.current);
  }, [bars, indicators, mode, crosshair, width, height, sigLog, timeframe]);

  const handleMouseMove = e => {
    const canvas = canvasRef.current;
    if (!canvas || !bars.length) return;
    const rect = canvas.getBoundingClientRect();
    const mx   = e.clientX - rect.left, my = e.clientY - rect.top;
    const pad  = { l: 10, r: 72 };
    const cW   = width - pad.l - pad.r;
    const barIdx = Math.max(0, Math.min(bars.length - 1, Math.floor((mx - pad.l) / (cW / bars.length))));
    onMouseMove({ x: mx, y: my, barIdx });
  };

  return (
    <canvas
      ref={canvasRef}
      width={width}
      height={height}
      onMouseMove={handleMouseMove}
      onMouseLeave={onMouseLeave}
      style={{ display: 'block', cursor: 'crosshair' }}
    />
  );
}

// ─── TOOLTIP ──────────────────────────────────────────────────────────────────
function Tooltip({ bar, barIdx, indicators, x, y, cw }) {
  if (!bar) return null;
  const left   = x > cw / 2 ? x - 198 : x + 14;
  const top    = Math.min(Math.max(y - 10, 4), 220);
  const dc     = bar.delta > 0 ? C.slowPos : C.slowNeg;
  const cc     = bar.cvdRunning > 0 ? C.slowPos : C.slowNeg;
  const band   = indicators?.activeBand?.[barIdx];
  const regime = band === 'pos' ? 'In Positive Band'
    : band === 'neg' ? 'In Negative Band'
    : band === 'unc' ? 'In Uncertain Band'
    : bar.close > (indicators?.slowP?.[barIdx] ?? 0) ? 'Above Slow Pos Line'
    : bar.close < (indicators?.slowN?.[barIdx] ?? 0) ? 'Below Slow Neg Line'
    : 'Between Lines';

  return (
    <div style={{ position:'absolute', left, top, background:C.panel, border:`1px solid ${C.border}`, borderRadius:2, padding:'8px 12px', pointerEvents:'none', zIndex:100, minWidth:180 }}>
      <div style={{ fontFamily:'"Space Mono",monospace', fontSize:10, color:C.body, marginBottom:3 }}>Bar #{barIdx} | {bar.time}</div>
      <div style={{ fontFamily:'"Space Mono",monospace', fontSize:10, color:C.bright }}>O:{bar.open.toFixed(2)} H:{bar.high.toFixed(2)} L:{bar.low.toFixed(2)} C:{bar.close.toFixed(2)}</div>
      <div style={{ fontFamily:'"Space Mono",monospace', fontSize:10, color:C.body,   marginTop:2 }}>VOL: {bar.volume.toLocaleString()}</div>
      <div style={{ fontFamily:'"Space Mono",monospace', fontSize:10, color:dc,       marginTop:2 }}>Δ: {bar.delta > 0 ? '+' : ''}{bar.delta.toFixed(0)}</div>
      <div style={{ fontFamily:'"Space Mono",monospace', fontSize:10, color:cc,       marginTop:2 }}>CVD: {bar.cvdRunning > 0 ? '+' : ''}{bar.cvdRunning.toFixed(0)}</div>
      <div style={{ fontFamily:'"Space Mono",monospace', fontSize:10, color:C.uncertain, marginTop:4, borderTop:`1px solid ${C.border}`, paddingTop:4 }}>{regime}</div>
    </div>
  );
}

// ─── LIQUIDITY OSCILLATOR ─────────────────────────────────────────────────────
const DivDot = ({ cx, cy, payload, type }) => {
  if (!payload || (type === 'bull' && payload.divBullY == null) || (type === 'bear' && payload.divBearY == null)) return null;
  const sz = 5;
  const points = type === 'bull'
    ? `${cx},${cy - sz} ${cx - sz},${cy + sz} ${cx + sz},${cy + sz}`
    : `${cx},${cy + sz} ${cx - sz},${cy - sz} ${cx + sz},${cy - sz}`;
  return <polygon points={points} fill={C.uncertain} />;
};

function LiquidityOscillator({ bars, indicators }) {
  const data = useMemo(() => {
    if (!indicators || !bars.length) return [];
    const { fastCycle, slowCycle } = indicators;
    const vis = bars.slice(-CFG.visibleBars);
    const off = bars.length - vis.length;
    return vis.map((b, i) => {
      const idx = i + off;
      const fc  = fastCycle[idx] ?? 0;
      const sc  = slowCycle[idx] ?? 0;

      // Divergence: price new low + fastCycle higher low → bull div
      const lb       = Math.max(0, idx - 10);
      const prevLows  = bars.slice(lb, idx).map(bb => bb.low);
      const prevHighs = bars.slice(lb, idx).map(bb => bb.high);
      const prevFClo  = fastCycle.slice(lb, idx);
      const prevFChi  = fastCycle.slice(lb, idx);
      const hasBullDiv = prevLows.length > 0
        && b.low < Math.min(...prevLows)
        && fc > Math.min(...prevFClo) + 5
        && fc < -15;
      const hasBearDiv = prevHighs.length > 0
        && b.high > Math.max(...prevHighs)
        && fc < Math.max(...prevFChi) - 5
        && fc > 15;

      return {
        i,
        fcPos: fc >= 0 ? fc : null, fcNeg: fc < 0 ? fc : null,
        scPos: sc >= 0 ? sc : null, scNeg: sc < 0 ? sc : null,
        divBullY: hasBullDiv ? -88 : null,
        divBearY: hasBearDiv ?  88 : null,
      };
    });
  }, [bars, indicators]);

  if (!data.length) return null;
  return (
    <div style={{ height:140, background:C.panel, borderTop:`1px solid ${C.border}`, position:'relative' }}>
      <div style={{ position:'absolute', top:4, left:8, fontFamily:'"Bebas Neue",sans-serif', fontSize:11, letterSpacing:'0.1em', color:C.body, zIndex:1 }}>
        LIQUIDITY OSCILLATOR
      </div>
      <ResponsiveContainer width="100%" height={140}>
        <LineChart data={data} margin={{ top:20, right:8, bottom:8, left:28 }}>
          <YAxis domain={[-100,100]} ticks={[-100,-50,0,50,100]} tick={{ fontSize:9, fill:C.muted, fontFamily:'"Space Mono",monospace' }} width={28} />
          <ReferenceLine y={0} stroke={C.muted} strokeDasharray="3 3" />
          <Line dataKey="fcPos" dot={false} activeDot={false} stroke={C.slowPos}      strokeWidth={1.5} isAnimationActive={false} connectNulls={false} />
          <Line dataKey="fcNeg" dot={false} activeDot={false} stroke={C.slowNeg}      strokeWidth={1.5} isAnimationActive={false} connectNulls={false} />
          <Line dataKey="scPos" dot={false} activeDot={false} stroke={C.slowPos+'99'} strokeWidth={1.5} isAnimationActive={false} connectNulls={false} />
          <Line dataKey="scNeg" dot={false} activeDot={false} stroke={C.slowNeg+'99'} strokeWidth={1.5} isAnimationActive={false} connectNulls={false} />
          <Line dataKey="divBullY" dot={<DivDot type="bull" />} activeDot={false} stroke="none" isAnimationActive={false} />
          <Line dataKey="divBearY" dot={<DivDot type="bear" />} activeDot={false} stroke="none" isAnimationActive={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

// ─── DELTA ENGINE PANEL ───────────────────────────────────────────────────────
const CrossoverDot = ({ cx, cy, payload }) => {
  if (!payload?.crossover) return null;
  const col  = payload.crossover === 'pos-over-neg' ? C.posDom : C.negDom;
  const sz   = 5;
  return <polygon points={`${cx},${cy - sz} ${cx + sz},${cy} ${cx},${cy + sz} ${cx - sz},${cy}`} fill={col} />;
};

function DeltaEnginePanel({ bars, indicators }) {
  const { data, exhaustion } = useMemo(() => {
    if (!indicators || !bars.length) return { data: [], exhaustion: { pos: 0, neg: 0 } };
    const { cvdNorm, posFilterNorm, negFilterNorm, posUpperNorm, negLowerNorm, posDom, negDom, pfRaw, nfRaw, pfUpperRaw, nfLowerRaw } = indicators;
    const vis = bars.slice(-CFG.visibleBars);
    const off = bars.length - vis.length;

    // Compute exhaustion proximity from raw values (same scale)
    const n        = bars.length - 1;
    const pfNow    = pfRaw[n] ?? 0;
    const pfUpper  = pfUpperRaw[n] ?? 0;
    const nfNow    = nfRaw[n] ?? 0;
    const nfLower  = nfLowerRaw[n] ?? 0;
    const posGap   = Math.max(0, pfUpper - pfNow);
    const posProx  = pfUpper > 1e-8 ? Math.max(0, 1 - posGap / (pfUpper * 0.2)) : 0;
    const negGap   = Math.max(0, nfNow - nfLower);
    const negScale = Math.max(Math.abs(nfLower), 1e-8);
    const negProx  = Math.max(0, 1 - negGap / (negScale * 0.2));

    const d = vis.map((_, i) => {
      const idx = i + off;
      // Detect dominant cycle crossovers
      let crossover = null;
      if (idx > 0) {
        const pp = posDom[idx - 1], cp = posDom[idx];
        const pn = negDom[idx - 1], cn = negDom[idx];
        if (pp <= pn && cp > cn) crossover = 'pos-over-neg';
        else if (pp >= pn && cp < cn) crossover = 'neg-over-pos';
      }
      return {
        i,
        cvdVal: cvdNorm[idx] ?? 0,
        pf: posFilterNorm[idx] ?? 0,
        nf: negFilterNorm[idx] ?? 0,
        pu: posUpperNorm[idx]  ?? 0,
        nl: negLowerNorm[idx]  ?? 0,
        pd: posDom[idx] ?? 0,
        nd: negDom[idx] ?? 0,
        crossover,
      };
    });
    return { data: d, exhaustion: { pos: posProx, neg: negProx } };
  }, [bars, indicators]);

  if (!data.length) return null;
  return (
    <div style={{ height:140, background:C.panel, borderTop:`1px solid ${C.border}`, position:'relative' }}>
      <div style={{ position:'absolute', top:4, left:8, fontFamily:'"Bebas Neue",sans-serif', fontSize:11, letterSpacing:'0.1em', color:C.body, zIndex:1 }}>DELTA ENGINE</div>

      {/* Priority 4 — Delta exhaustion gradient overlays */}
      {exhaustion.pos > 0.05 && (
        <div style={{ position:'absolute', inset:0, background:`linear-gradient(to bottom, rgba(0,229,160,${(0.07 * exhaustion.pos).toFixed(3)}), transparent)`, pointerEvents:'none', zIndex:0 }} />
      )}
      {exhaustion.neg > 0.05 && (
        <div style={{ position:'absolute', inset:0, background:`linear-gradient(to top, rgba(255,62,108,${(0.07 * exhaustion.neg).toFixed(3)}), transparent)`, pointerEvents:'none', zIndex:0 }} />
      )}

      <ResponsiveContainer width="100%" height={140}>
        <ComposedChart data={data} margin={{ top:20, right:8, bottom:8, left:28 }}>
          <YAxis domain={[-100,100]} ticks={[-100,-50,0,50,100]} tick={{ fontSize:9, fill:C.muted, fontFamily:'"Space Mono",monospace' }} width={28} />
          <ReferenceLine y={0} stroke={C.muted} strokeDasharray="3 3" />
          <Bar dataKey="cvdVal" isAnimationActive={false} maxBarSize={6}>
            {data.map((d, i) => <Cell key={i} fill={d.cvdVal >= 0 ? C.slowPos : C.slowNeg} fillOpacity={0.4} />)}
          </Bar>
          <Line dataKey="pf" dot={false} stroke={C.posFilter} strokeWidth={1.5} isAnimationActive={false} />
          <Line dataKey="nf" dot={false} stroke={C.negFilter} strokeWidth={1.5} isAnimationActive={false} />
          <Line dataKey="pu" dot={false} stroke={C.posFilter} strokeWidth={1}   strokeDasharray="3 3" strokeOpacity={0.5} isAnimationActive={false} />
          <Line dataKey="nl" dot={false} stroke={C.negFilter} strokeWidth={1}   strokeDasharray="3 3" strokeOpacity={0.5} isAnimationActive={false} />
          <Line dataKey="pd" dot={<CrossoverDot />} activeDot={false} stroke={C.posDom} strokeWidth={2} isAnimationActive={false} />
          <Line dataKey="nd" dot={false} activeDot={false} stroke={C.negDom} strokeWidth={2} isAnimationActive={false} />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

// ─── ALERTS PANEL ─────────────────────────────────────────────────────────────
function AlertsPanel({ alerts, onClear }) {
  const label = a => ({ TCL:'TREND LONG', TCS:'TREND SHORT', REV: a.dir === 'long' ? 'REVERSAL LONG' : 'REVERSAL SHORT' }[a.type] ?? a.type);
  const col   = a => a.dir === 'long' ? C.posFilter : C.negFilter;

  return (
    <div style={{ width:220, flexShrink:0, background:C.bg, borderLeft:`1px solid ${C.border}`, display:'flex', flexDirection:'column', overflow:'hidden' }}>
      <div style={{ padding:'8px 10px', borderBottom:`1px solid ${C.border}` }}>
        <span style={{ fontFamily:'"Bebas Neue",sans-serif', fontSize:13, letterSpacing:'0.1em', color:C.bright }}>ALERTS</span>
      </div>
      <div style={{ padding:'5px 8px', borderBottom:`1px solid ${C.border}` }}>
        <div style={{ fontFamily:'"Space Mono",monospace', fontSize:9, color:C.posFilter }}>BULLISH DELTA LIQUIDITY</div>
        <div style={{ fontFamily:'"Space Mono",monospace', fontSize:9, color:C.negFilter, marginTop:2 }}>BEARISH DELTA LIQUIDITY</div>
      </div>
      <div style={{ flex:1, overflowY:'auto', padding:'4px 6px' }}>
        {!alerts.length && <div style={{ fontFamily:'"Space Mono",monospace', fontSize:9, color:C.muted, padding:'8px 4px' }}>Scanning…</div>}
        {alerts.map((a, i) => (
          <div key={`${a.barId}-${a.type}-${i}`} style={{ borderLeft:`3px solid ${col(a)}`, background:C.panel, padding:'6px 8px', marginBottom:4, animation:'aFade 0.4s ease-out' }}>
            <div style={{ fontFamily:'"Bebas Neue",sans-serif', fontSize:11, letterSpacing:'0.05em', color:col(a) }}>{label(a)}</div>
            <div style={{ fontFamily:'"Space Mono",monospace', fontSize:9, color:C.body }}>{a.inst}</div>
            <div style={{ fontFamily:'"Space Mono",monospace', fontSize:10, color:C.bright }}>{a.price?.toFixed(2)}</div>
            <div style={{ fontFamily:'"Space Mono",monospace', fontSize:9, color:C.muted }}>{a.barsAgo === 0 ? 'just now' : `${a.barsAgo} bars ago`}</div>
          </div>
        ))}
      </div>
      <button onClick={onClear} style={{ margin:8, padding:'4px 8px', background:'transparent', border:`1px solid ${C.muted}`, color:C.body, fontFamily:'"Bebas Neue",sans-serif', fontSize:11, letterSpacing:'0.1em', cursor:'pointer' }}>CLEAR</button>
    </div>
  );
}

// ─── SIGNAL LOG ───────────────────────────────────────────────────────────────
function SignalLog({ sigLog }) {
  const col = s => ({ TCL:C.slowPos, TCS:C.slowNeg, REV:C.uncertain }[s.type] ?? C.body);
  const lbl = s => ({ TCL:'TCL▲', TCS:'TCS▼', REV: s.dir === 'long' ? 'REV▲' : 'REV▼' }[s.type] ?? s.type);
  return (
    <div style={{ display:'flex', overflowX:'auto', padding:'0 8px', gap:5, background:C.panel, borderTop:`1px solid ${C.border}`, height:32, alignItems:'center', scrollbarWidth:'none' }}>
      {!sigLog.length
        ? <span style={{ fontFamily:'"Space Mono",monospace', fontSize:9, color:C.muted }}>No signals yet</span>
        : sigLog.map((s, i) => (
          <div key={i} style={{ display:'flex', alignItems:'center', gap:4, padding:'2px 7px', border:`1px solid ${col(s)}`, borderRadius:2, flexShrink:0 }}>
            <span style={{ fontFamily:'"Space Mono",monospace', fontSize:9, color:col(s) }}>{lbl(s)}</span>
            <span style={{ fontFamily:'"Space Mono",monospace', fontSize:9, color:C.muted }}>#{s.barId ?? s.bar}</span>
          </div>
        ))
      }
    </div>
  );
}

// ─── SESSION STATS (Priority 3) ───────────────────────────────────────────────
function SessionStats({ sigLog, indicators, bars }) {
  const stats = useMemo(() => {
    const tcl   = sigLog.filter(s => s.type === 'TCL').length;
    const tcs   = sigLog.filter(s => s.type === 'TCS').length;
    const revL  = sigLog.filter(s => s.type === 'REV' && s.dir === 'long').length;
    const revS  = sigLog.filter(s => s.type === 'REV' && s.dir === 'short').length;
    const hoBar = indicators?.handsOffArr?.filter(Boolean).length ?? 0;

    let bullB = 0, bearB = 0, chopB = 0;
    indicators?.activeBand?.forEach(b => {
      if (b === 'pos') bullB++;
      else if (b === 'neg') bearB++;
      else if (b === 'unc') chopB++;
    });
    const total = Math.max(bars.length, 1);
    return {
      tcl, tcs, revL, revS, hoBar,
      bull: Math.round(bullB / total * 100),
      bear: Math.round(bearB / total * 100),
      chop: Math.round(chopB / total * 100),
    };
  }, [sigLog, indicators, bars]);

  return (
    <div style={{ display:'flex', alignItems:'center', padding:'0 10px', height:26, background:C.bg, borderTop:`1px solid ${C.border}`, gap:14, flexShrink:0, overflowX:'auto', scrollbarWidth:'none' }}>
      <span style={{ fontFamily:'"Space Mono",monospace', fontSize:9, color:C.muted, flexShrink:0 }}>
        TCL:<span style={{ color:C.slowPos }}>{stats.tcl}</span>
        {'  '}TCS:<span style={{ color:C.slowNeg }}>{stats.tcs}</span>
        {'  '}REV↑:<span style={{ color:C.uncertain }}>{stats.revL}</span>
        {'  '}REV↓:<span style={{ color:C.uncertain }}>{stats.revS}</span>
        {'  '}H/O:<span style={{ color:C.uncertain }}>{stats.hoBar}</span>bars
      </span>
      <span style={{ color:C.muted, flexShrink:0 }} aria-hidden>|</span>
      <span style={{ fontFamily:'"Space Mono",monospace', fontSize:9, color:C.muted, flexShrink:0 }}>
        Regime:{' '}
        <span style={{ color:C.slowPos }}>{stats.bull}%Bull</span>
        {' '}<span style={{ color:C.slowNeg }}>{stats.bear}%Bear</span>
        {' '}<span style={{ color:C.uncertain }}>{stats.chop}%Chop</span>
      </span>
    </div>
  );
}

// ─── REPLAY CONTROLS (Priority 5) ────────────────────────────────────────────
function ReplayControls({ replayIdx, totalBars, onPrev, onNext, onStart, onEnd, onExit }) {
  const btnStyle = (disabled = false) => ({
    padding: '2px 8px',
    background: 'transparent',
    border: `1px solid ${disabled ? C.muted + '55' : C.muted}`,
    color: disabled ? C.muted + '55' : C.body,
    fontFamily: '"Bebas Neue",sans-serif',
    fontSize: 11,
    letterSpacing: '0.1em',
    cursor: disabled ? 'default' : 'pointer',
  });
  return (
    <div style={{ display:'flex', alignItems:'center', padding:'0 10px', height:32, background:C.panel, borderBottom:`1px solid ${C.border}`, gap:6, flexShrink:0 }}>
      <span style={{ fontFamily:'"Bebas Neue",sans-serif', fontSize:11, letterSpacing:'0.1em', color:C.uncertain, marginRight:4 }}>REPLAY</span>
      <button onClick={onStart} style={btnStyle(replayIdx <= 5)}>◀◀ START</button>
      <button onClick={onPrev}  style={btnStyle(replayIdx <= 5)} disabled={replayIdx <= 5}>◀ PREV</button>
      <span style={{ fontFamily:'"Space Mono",monospace', fontSize:10, color:C.bright, minWidth:90, textAlign:'center' }}>
        Bar {replayIdx + 1} / {totalBars}
      </span>
      <button onClick={onNext} style={btnStyle(replayIdx >= totalBars - 1)} disabled={replayIdx >= totalBars - 1}>NEXT ▶</button>
      <button onClick={onEnd}  style={btnStyle(replayIdx >= totalBars - 1)}>END ▶▶</button>
      <div style={{ marginLeft:'auto' }}>
        <button onClick={onExit} style={{ ...btnStyle(), color:C.uncertain, border:`1px solid ${C.uncertain}` }}>EXIT REPLAY</button>
      </div>
    </div>
  );
}

// ─── MAIN APP ─────────────────────────────────────────────────────────────────
export default function LiquidityDeltaTracker() {
  const {
    bars, indicators, sigLog, alerts, handsOff,
    isLive, setIsLive, instKey, setInstKey, newSession, currentSigs,
  } = useMarketSimulator();

  const [mode,         setMode]         = useState('liquidity');
  const [crosshair,    setCrosshair]    = useState({ x:null, y:null, barIdx:null });
  const [showInstMenu, setShowInstMenu] = useState(false);
  const [localAlerts,  setLocalAlerts]  = useState([]);
  const [timeframe,    setTimeframe]    = useState('5m');
  const [replayMode,   setReplayMode]   = useState(false);
  const [replayIdx,    setReplayIdx]    = useState(0);
  const replayBarsRef  = useRef(null);
  const containerRef   = useRef(null);
  const [size,         setSize]         = useState({ w:900, h:600 });

  useEffect(() => { setLocalAlerts(alerts); }, [alerts]);

  useEffect(() => {
    if (!containerRef.current) return;
    const ro = new ResizeObserver(() => {
      if (containerRef.current) setSize({ w: containerRef.current.clientWidth, h: containerRef.current.clientHeight });
    });
    ro.observe(containerRef.current);
    return () => ro.disconnect();
  }, []);

  // Replay mode: compute display bars and indicators from frozen snapshot
  const displayBars = useMemo(() => {
    if (replayMode && replayBarsRef.current) return replayBarsRef.current.slice(0, replayIdx + 1);
    return bars;
  }, [replayMode, replayIdx, bars]);

  const displayIndicators = useMemo(() => calcIndicators(displayBars), [displayBars]);

  const enterReplay = () => {
    replayBarsRef.current = [...bars];
    setReplayIdx(bars.length - 1);
    setReplayMode(true);
    setIsLive(false);
  };

  const exitReplay = () => {
    replayBarsRef.current = null;
    setReplayMode(false);
  };

  const lastBar = displayBars[displayBars.length - 1];

  const regimeBadge = useMemo(() => {
    if (handsOff) return { label:'CHOPPY', color:C.uncertain, pulse:true };
    if (!currentSigs.length) return { label:'SCANNING', color:C.muted, pulse:false };
    const s = currentSigs[currentSigs.length - 1];
    if (s.type === 'TCL') return { label:'TRENDING ↑', color:C.slowPos, pulse:false };
    if (s.type === 'TCS') return { label:'TRENDING ↓', color:C.slowNeg, pulse:false };
    return { label:'REVERSAL ↕', color:C.uncertain, pulse:false };
  }, [handsOff, currentSigs]);

  const stats = useMemo(() => {
    if (!lastBar || displayBars.length < 2) return { chgPct:0, vol:0, cvd:0 };
    const chgPct = ((lastBar.close - displayBars[0].open) / displayBars[0].open) * 100;
    const vol    = displayBars.reduce((s, b) => s + b.volume, 0);
    return { chgPct, vol, cvd: lastBar.cvdRunning };
  }, [displayBars, lastBar]);

  const canvasH = Math.max(200, size.h - 140 - 140 - 32 - 26 - 36 - 44 - (replayMode ? 32 : 0));
  const canvasW = Math.max(300, size.w - 220);

  return (
    <div style={{ width:'100vw', height:'100vh', background:C.bg, display:'flex', flexDirection:'column', overflow:'hidden' }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Space+Mono:wght@400;700&family=Bebas+Neue&display=swap');
        *{box-sizing:border-box;margin:0;padding:0;}
        ::-webkit-scrollbar{width:4px;height:4px;}
        ::-webkit-scrollbar-track{background:${C.bg};}
        ::-webkit-scrollbar-thumb{background:${C.muted};}
        @keyframes pulse{0%,100%{opacity:1;}50%{opacity:0.3;}}
        @keyframes aFade{0%{opacity:0;transform:translateX(8px);}100%{opacity:1;transform:translateX(0);}}
        button:hover:not(:disabled){filter:brightness(1.2);}
      `}</style>

      {/* ── HEADER ── */}
      <div style={{ display:'flex', alignItems:'center', padding:'0 14px', height:44, background:C.panel, borderBottom:`1px solid ${C.border}`, gap:18, flexShrink:0 }}>
        {/* Instrument selector */}
        <div style={{ position:'relative' }}>
          <button onClick={() => setShowInstMenu(v => !v)} style={{ background:'transparent', border:`1px solid ${C.muted}`, color:C.bright, fontFamily:'"Bebas Neue",sans-serif', fontSize:13, letterSpacing:'0.1em', padding:'2px 8px', cursor:'pointer' }}>
            {INSTRUMENTS[instKey].label} ▾
          </button>
          {showInstMenu && (
            <div style={{ position:'absolute', top:'100%', left:0, background:C.panel, border:`1px solid ${C.border}`, zIndex:200, minWidth:110 }}>
              {Object.entries(INSTRUMENTS).map(([k, v]) => (
                <div key={k} onClick={() => { setInstKey(k); setShowInstMenu(false); }}
                  style={{ padding:'6px 14px', cursor:'pointer', fontFamily:'"Bebas Neue",sans-serif', fontSize:13, letterSpacing:'0.1em', color: k === instKey ? C.bright : C.body, background: k === instKey ? C.border : 'transparent' }}>
                  {v.label}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Stats blocks */}
        {[
          { val: lastBar?.close?.toFixed(2) ?? '--',  lbl:'LAST',        color:C.bright },
          { val: `${stats.chgPct >= 0 ? '+' : ''}${stats.chgPct.toFixed(2)}%`, lbl:'SESSION CHG', color: stats.chgPct >= 0 ? C.slowPos : C.slowNeg },
          { val: `${(stats.vol / 1000).toFixed(0)}K`, lbl:'SESSION VOL', color:C.body },
          { val: `${stats.cvd >= 0 ? '+' : ''}${stats.cvd.toFixed(0)}`, lbl:'NET CVD',     color: stats.cvd >= 0 ? C.slowPos : C.slowNeg },
        ].map((s, i) => (
          <div key={i}>
            <div style={{ fontFamily:'"Space Mono",monospace', fontSize:13, color:s.color }}>{s.val}</div>
            <div style={{ fontFamily:'"Bebas Neue",sans-serif', fontSize:9, letterSpacing:'0.1em', color:C.muted }}>{s.lbl}</div>
          </div>
        ))}

        {/* Regime badge */}
        <div style={{ padding:'2px 10px', border:`1px solid ${regimeBadge.color}`, color:regimeBadge.color, fontFamily:'"Bebas Neue",sans-serif', fontSize:11, letterSpacing:'0.1em', animation: regimeBadge.pulse ? 'pulse 2s infinite' : 'none' }}>
          {regimeBadge.label}
        </div>

        {/* Live / Replay / Pause */}
        <div style={{ marginLeft:'auto', display:'flex', gap:6, alignItems:'center' }}>
          {!replayMode && (
            <button onClick={enterReplay} style={{ padding:'2px 10px', background:'transparent', border:`1px solid ${C.muted}`, color:C.muted, fontFamily:'"Bebas Neue",sans-serif', fontSize:11, letterSpacing:'0.1em', cursor:'pointer' }}>
              REPLAY
            </button>
          )}
          <button onClick={() => setIsLive(v => !v)} style={{ padding:'2px 10px', background: isLive ? C.slowPos+'22' : 'transparent', border:`1px solid ${isLive ? C.slowPos : C.muted}`, color: isLive ? C.slowPos : C.muted, fontFamily:'"Bebas Neue",sans-serif', fontSize:11, letterSpacing:'0.1em', cursor:'pointer', display:'flex', alignItems:'center', gap:6 }}>
            <span style={{ width:6, height:6, borderRadius:'50%', background: isLive ? C.slowPos : C.muted, display:'inline-block', animation: isLive ? 'pulse 1s infinite' : 'none' }} />
            {isLive ? 'LIVE' : 'PAUSED'}
          </button>
        </div>
      </div>

      {/* ── CONTROL PANEL ── */}
      <div style={{ display:'flex', alignItems:'center', padding:'0 10px', height:36, background:C.bg, borderBottom:`1px solid ${C.border}`, gap:6, flexShrink:0 }}>
        {[
          { label:'LIQUIDITY MODE', val:'liquidity', col:C.slowPos },
          { label:'DELTA MODE',     val:'delta',     col:C.posDom  },
        ].map(btn => (
          <button key={btn.val} onClick={() => setMode(btn.val)} style={{ padding:'2px 10px', background: mode === btn.val ? btn.col+'22' : 'transparent', border:`1px solid ${mode === btn.val ? btn.col : C.muted}`, color: mode === btn.val ? btn.col : C.body, fontFamily:'"Bebas Neue",sans-serif', fontSize:11, letterSpacing:'0.1em', cursor:'pointer' }}>
            {btn.label}
          </button>
        ))}
        <div style={{ width:1, height:18, background:C.border, margin:'0 3px' }} />
        <button onClick={() => newSession()} style={{ padding:'2px 10px', background:'transparent', border:`1px solid ${C.muted}`, color:C.body, fontFamily:'"Bebas Neue",sans-serif', fontSize:11, letterSpacing:'0.1em', cursor:'pointer' }}>NEW SESSION</button>
        <button onClick={() => setIsLive(v => !v)} style={{ padding:'2px 10px', background:'transparent', border:`1px solid ${C.muted}`, color:C.body, fontFamily:'"Bebas Neue",sans-serif', fontSize:11, letterSpacing:'0.1em', cursor:'pointer' }}>
          {isLive ? '⏸ PAUSE' : '▶ LIVE'}
        </button>
        <div style={{ marginLeft:8, display:'flex', gap:4 }}>
          {['5m','15m','1h'].map(tf => (
            <button key={tf} onClick={() => setTimeframe(tf)} style={{ padding:'1px 7px', border:`1px solid ${timeframe === tf ? C.body : C.border}`, color: timeframe === tf ? C.bright : C.muted, fontFamily:'"Space Mono",monospace', fontSize:9, background:'transparent', cursor:'pointer' }}>{tf}</button>
          ))}
        </div>
      </div>

      {/* ── REPLAY CONTROLS (Priority 5) ── */}
      {replayMode && (
        <ReplayControls
          replayIdx={replayIdx}
          totalBars={replayBarsRef.current?.length ?? 0}
          onStart={() => setReplayIdx(5)}
          onPrev={() => setReplayIdx(i => Math.max(5, i - 1))}
          onNext={() => setReplayIdx(i => Math.min((replayBarsRef.current?.length ?? 1) - 1, i + 1))}
          onEnd={() => setReplayIdx((replayBarsRef.current?.length ?? 1) - 1)}
          onExit={exitReplay}
        />
      )}

      {/* ── MAIN CONTENT ── */}
      <div style={{ flex:1, display:'flex', overflow:'hidden', minHeight:0 }}>
        {/* Chart column */}
        <div style={{ flex:1, display:'flex', flexDirection:'column', overflow:'hidden', position:'relative' }} ref={containerRef}>

          {/* Canvas */}
          <div style={{ flex:1, position:'relative', minHeight:0 }}>
            <PriceCanvas
              bars={displayBars}
              indicators={displayIndicators}
              mode={mode}
              crosshair={crosshair}
              onMouseMove={c => setCrosshair(c)}
              onMouseLeave={() => setCrosshair({ x:null, y:null, barIdx:null })}
              width={canvasW}
              height={canvasH}
              sigLog={sigLog}
              timeframe={timeframe}
            />

            {/* Hands-Off overlay */}
            {handsOff && !replayMode && (
              <div style={{ position:'absolute', top:0, left:0, width:canvasW, height:canvasH, background:'rgba(255,235,59,0.04)', border:`2px solid ${C.uncertain}`, display:'flex', alignItems:'center', justifyContent:'center', pointerEvents:'none', animation:'pulse 2s infinite' }}>
                <div style={{ fontFamily:'"Bebas Neue",sans-serif', fontSize:28, letterSpacing:'0.3em', color:C.uncertain }}>⚠ HANDS OFF</div>
              </div>
            )}

            {/* Tooltip */}
            {crosshair.barIdx != null && displayBars[crosshair.barIdx] && (
              <Tooltip
                bar={displayBars[crosshair.barIdx]}
                barIdx={crosshair.barIdx}
                indicators={displayIndicators}
                x={crosshair.x} y={crosshair.y}
                cw={canvasW}
              />
            )}
          </div>

          {/* Lower panels side by side */}
          <div style={{ display:'flex', flexShrink:0 }}>
            <div style={{ flex:1 }}><LiquidityOscillator bars={displayBars} indicators={displayIndicators} /></div>
            <div style={{ flex:1 }}><DeltaEnginePanel bars={displayBars} indicators={displayIndicators} /></div>
          </div>

          {/* Signal log */}
          <SignalLog sigLog={sigLog} />

          {/* Session stats (Priority 3) */}
          <SessionStats sigLog={sigLog} indicators={displayIndicators} bars={displayBars} />
        </div>

        {/* Alerts sidebar */}
        <AlertsPanel alerts={localAlerts} onClear={() => setLocalAlerts([])} />
      </div>
    </div>
  );
}
