/* 早上窗台上那摊水 · 计算核心（core.js）
 * 问题：冬天一觉醒来，窗玻璃上全是水、顺着流到窗台上。这一晚从几点开始起雾，起床时大概积了多少水，
 *       是玻璃、窗帘、室内湿度还是夜里降温造成的；怎么改条件能不结露。
 * 模型（设计选择，页面「怎么算的」写明，不是实测）：
 *   - 只看玻璃中间部分，一维稳态传热：玻璃内表面温度 Ts = Ti − (Ti − To) × Rsi ÷ (Rsi + Rrest)。
 *     Rrest = 1/U − 0.13（U 是玻璃中部传热系数，按常见设计值内表面热阻 0.13 m²K/W 折出）。窗帘拉开 Rsi = 0.13，拉上按 0.30 估。
 *   - 一夜里室外温度从睡前线性降到起床时（假设起床时最冷），室内温度从睡前线性变到起床时；室内空气的水汽压整夜不变（不算人呼吸加湿、不算开窗换气）。
 *   - 饱和水汽压用 Magnus 式（水面）：es(T) = 6.1094 × exp(17.625 T ÷ (T + 243.04)) hPa；露点由同式反解。玻璃低于 0 °C 时结的是霜，页面只标出来，仍按水面公式算。
 *   - 水汽压 e > es(Ts) 就结露。凝结速度粗估：g = β × (e − es(Ts)) × 100 ÷ (461.5 × (Ts + 273.15)) kg/m²·s，
 *     β = hc ÷ (1.2 × 1006)，对流换热 hc 窗帘拉开取 3.0、拉上取 1.0 W/m²K（刘易斯类比）。g < 0 时已有的水往回蒸发，最少到 0。
 *   - 屋里水汽量整夜按睡前不变：等于假设人呼吸、家里的水汽源刚好补上玻璃吸走的那部分；结露很多、房间很小时会高估。
 *   - 每 10 分钟一步（最后一步可短），每步按步首的温度算一次（左端点累加）。水量只是数量级粗估。 */
(function (root) {
  'use strict';
  var STEP = 10;
  var RSI = 0.13, RSI_CURTAIN = 0.30, HC = 3.0, HC_CURTAIN = 1.0, RHO_CP = 1.2 * 1006, RV = 461.5;
  var GLASS = [
    { key: 'single', name: '单层玻璃', U: 5.8 },
    { key: 'double', name: '普通双层中空', U: 2.8 },
    { key: 'lowe', name: '双层 Low-E', U: 1.8 },
    { key: 'triple', name: '三玻两腔', U: 1.0 }
  ];

  function defaultState() {
    return { name: '北屋', glass: 'double', U: '2.8', curtain: 'on', ti0: '20', ti1: '18', rh: '45', to0: '0', to1: '-8', bed: '22:30', wake: '07:00', area: '1.8' };
  }

  function half(s) { return String(s == null ? '' : s).replace(/[\uFF01-\uFF5E]/g, function (ch) { return String.fromCharCode(ch.charCodeAt(0) - 0xFEE0); }).replace(/\u3000/g, ' ').replace(/[\s]/g, ''); }
  function num(s) { s = half(s).replace(/。/g, '.').replace(/[−–—]/g, '-'); return /^-?\d+(\.\d+)?$/.test(s) ? Number(s) : NaN; }
  function clock(s) {
    s = half(s).replace(/[：.]/g, ':');
    var m = /^(\d{1,2}):(\d{2})$/.exec(s); if (!m) return NaN;
    var h = +m[1], mi = +m[2]; if (h > 23 || mi > 59) return NaN;
    return h * 60 + mi;
  }

  function parse(st) {
    var errs = [], P = {};
    st = st && typeof st === 'object' ? st : {};
    function need(v, f, lo, hi, label, unit) {
      var x = num(v);
      if (isNaN(x)) { errs.push({ field: f, message: label + '要填数字' }); return null; }
      if (x < lo || x > hi) { errs.push({ field: f, message: label + '要在 ' + lo + '～' + hi + (unit || '') + ' 之间' }); return null; }
      return x;
    }
    P.name = String(st.name == null ? '' : st.name).slice(0, 12).trim() || '这间屋';
    P.glass = GLASS.some(function (g) { return g.key === st.glass; }) ? st.glass : 'custom';
    P.U = P.glass === 'custom' ? need(st.U, 'U', 0.5, 6.5, '玻璃传热系数 U', ' W/m²K') : GLASS.filter(function (g) { return g.key === P.glass; })[0].U;
    P.curtain = st.curtain === 'on';
    P.ti0 = need(st.ti0, 'ti0', 5, 35, '睡前室温', ' °C');
    P.ti1 = need(st.ti1, 'ti1', 5, 35, '起床时室温', ' °C');
    P.rh = need(st.rh, 'rh', 1, 100, '睡前室内湿度', '%');
    P.to0 = need(st.to0, 'to0', -40, 30, '睡前室外温度', ' °C');
    P.to1 = need(st.to1, 'to1', -40, 30, '起床时室外温度', ' °C');
    P.area = need(st.area, 'area', 0.1, 20, '玻璃面积', ' m²');
    var b = clock(st.bed), w = clock(st.wake);
    if (isNaN(b)) errs.push({ field: 'bed', message: '睡觉时间写成 22:30 这样' });
    if (isNaN(w)) errs.push({ field: 'wake', message: '起床时间写成 07:00 这样' });
    if (!isNaN(b) && !isNaN(w)) {
      var d = w - b; if (d <= 0) d += 1440;
      if (d < 60 || d > 960) errs.push({ field: 'wake', message: '睡觉到起床要在 1～16 小时之间（现在是 ' + fmt(d / 60, 1) + ' 小时）' });
      P.bed = b; P.dur = d;
    }
    return errs.length ? { errors: errs } : { P: P, errors: [] };
  }

  function es(T) { return 6.1094 * Math.exp(17.625 * T / (T + 243.04)); }
  function dew(e) { var a = Math.log(e / 6.1094); return 243.04 * a / (17.625 - a); }
  function surface(P, ti, to) {
    var rsi = P.curtain ? RSI_CURTAIN : RSI, rr = 1 / P.U - RSI;
    return ti - (ti - to) * rsi / (rsi + rr);
  }
  function flux(P, e, ts) {   /* g/m²·s，正 = 凝结，负 = 蒸发能力 */
    var beta = (P.curtain ? HC_CURTAIN : HC) / RHO_CP;
    return beta * (e - es(ts)) * 100 / (RV * (ts + 273.15)) * 1000;
  }
  function hhmm(m) { m = ((Math.round(m) % 1440) + 1440) % 1440; var h = Math.floor(m / 60), mi = m % 60; return (h < 10 ? '0' : '') + h + ':' + (mi < 10 ? '0' : '') + mi; }

  /* 一晚逐步推演 */
  function night(P) {
    var e = P.rh / 100 * es(P.ti0), td = dew(e), pts = [], W = 0, peak = 0, first = null, wetMin = 0, frost = false, minTs = Infinity, minAt = 0;
    var t = 0;
    while (true) {
      var f = t / P.dur, ti = P.ti0 + (P.ti1 - P.ti0) * f, to = P.to0 + (P.to1 - P.to0) * f, ts = surface(P, ti, to);
      var cond = e > es(ts);
      if (cond && first === null) first = t;
      if (ts < minTs) { minTs = ts; minAt = t; }
      var p = { t: t, clock: hhmm(P.bed + t), ti: ti, to: to, ts: ts, rh: 100 * e / es(ti), cond: cond, water: W * P.area };
      pts.push(p);
      if (t >= P.dur) break;
      var dt = Math.min(STEP, P.dur - t), g = flux(P, e, ts);
      if (cond) { wetMin += dt; if (ts < 0) frost = true; }
      W = Math.max(0, W + g * dt * 60);
      if (W * P.area > peak) peak = W * P.area;
      t += dt;
    }
    return { e: e, td: td, pts: pts, water: W * P.area, peak: peak, first: first, wetMin: wetMin, frost: frost, minTs: minTs, minAt: minAt };
  }

  /* 整夜都不结露的最高睡前湿度（整数 %）：e ≤ 整夜最小 es(Ts)。Ts 不随湿度变，所以能直接算。 */
  function rhLimit(P, n) {
    var lo = Infinity; n.pts.forEach(function (p) { var v = es(p.ts); if (v < lo) lo = v; });
    var x = Math.floor(100 * lo / es(P.ti0));
    return Math.min(100, x);
  }
  /* 起床时这样的室温与湿度下，室外低于多少度玻璃开始结露 */
  function outLimit(P, n) {
    var rsi = P.curtain ? RSI_CURTAIN : RSI, k = rsi / (rsi + 1 / P.U - RSI);
    return P.ti1 - (P.ti1 - n.td) / k;
  }

  function evaluate(P) {
    var n = night(P);
    return { n: n, rhMax: rhLimit(P, n), toCrit: outLimit(P, n), tdC: n.td, rhWake: 100 * n.e / es(P.ti1) };
  }

  function glassName(P) { var g = GLASS.filter(function (x) { return x.key === P.glass; })[0]; return g ? g.name : '自填 U=' + fmt(P.U, 1); }

  function applyChange(st, act) {
    var s = JSON.parse(JSON.stringify(st));
    if (act.kind === 'curtain') s.curtain = 'off';
    else if (act.kind === 'glass') { s.glass = act.to; s.U = String(GLASS.filter(function (g) { return g.key === act.to; })[0].U); }
    else if (act.kind === 'rh') s.rh = String(act.to);
    else if (act.kind === 'warm') s.ti1 = s.ti0;
    return s;
  }

  function actions(st, P, ev) {
    var acts = [], n = ev.n;
    if (n.first === null) return acts;
    /* 每条改法都真的重算一遍，只留真能少结露的（已拉开窗帘、室温本来不降、湿度降到 0 不合法等情形会被这一步自然筛掉） */
    function trial(kind, to, text) {
      var a = { kind: kind, to: to }, s2 = applyChange(st, a), q = parse(s2);
      if (!q.P) return;
      var e2 = evaluate(q.P).n;
      if ((e2.first === null) || e2.wetMin < n.wetMin || e2.peak < n.peak - 1e-9) {
        a.id = 'act_' + kind; a.water = e2.water; a.peak = e2.peak; a.wetMin = e2.wetMin; a.first = e2.first;
        a.text = text + '：' + (e2.first === null ? '整夜不结露' : '结露 ' + dur(e2.wetMin) + '，起床时' + waterText(e2.water));
        acts.push(a);
      }
    }
    trial('rh', ev.rhMax, '睡前把湿度降到 ' + ev.rhMax + '%');
    trial('curtain', null, '窗帘拉开（或离玻璃留缝）');
    trial('warm', null, '夜里室温保持 ' + fmt(P.ti0, 1) + ' °C 不降');
    var better = GLASS.filter(function (g) { return g.U < P.U; })[0];
    if (better) trial('glass', better.key, '换成' + better.name + '（U ' + fmt(better.U, 1) + '）');
    return acts;
  }

  function compare(P) {
    var rows = [];
    GLASS.forEach(function (g) {
      [false, true].forEach(function (c) {
        var Q = JSON.parse(JSON.stringify(P)); Q.glass = g.key; Q.U = g.U; Q.curtain = c;
        var n = night(Q);
        rows.push({ glass: g.key, name: g.name, U: g.U, curtain: c, minTs: n.minTs, wetMin: n.wetMin, water: n.water, first: n.first, frost: n.frost, cur: g.key === P.glass && c === P.curtain });
      });
    });
    return rows;
  }

  function compute(st) {
    var q = parse(st);
    if (!q.P) return { ok: false, errors: q.errors };
    var P = q.P, ev = evaluate(P);
    return { ok: true, errors: [], P: P, ev: ev, actions: actions(st, P, ev), table: compare(P) };
  }

  function fmt(x, d) {
    var neg = x < 0, s = Math.abs(x).toFixed(d);
    if (Number(s) === 0) neg = false;
    var p = s.split('.'); p[0] = p[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    return (neg ? '−' : '') + p.join('.');
  }
  function deg(x) { return fmt(x, 1) + ' °C'; }
  function grams(x) { return x < 0.5 ? (x > 0 ? '不到 1' : '0') : fmt(x, 0); }
  function waterText(x) { return x < 0.5 ? (x > 0 ? '不到 1 克水' : '没有积水') : '约 ' + fmt(x, 0) + ' 克水'; }
  function dur(m) { var h = Math.floor(m / 60), mi = m % 60; return h ? h + ' 小时' + (mi ? ' ' + mi + ' 分' : '') : mi + ' 分钟'; }

  function headline(o) {
    var P = o.P, n = o.ev.n, frost = n.frost ? '（玻璃低于 0 °C，会结成霜）' : '';
    if (n.first === null) return P.name + '这一晚玻璃不会结露：最冷时玻璃 ' + deg(n.minTs) + '，还比露点 ' + deg(n.td) + ' 高 ' + fmt(n.minTs - n.td, 1) + ' °C。';
    if (n.wetMin === 0) return P.name + '这一晚玻璃一直没结露，到 ' + hhmm(P.bed + P.dur) + ' 起床那一刻才刚降到露点以下，马上要起雾。';
    var start = n.first === 0 ? '一睡下玻璃就开始起雾' : '玻璃大约从 ' + hhmm(P.bed + n.first) + ' 开始起雾';
    if (n.water < 0.5) return P.name + '这一晚' + start + '，结露 ' + dur(n.wetMin) + '，但积不下多少水，起床时只是一层薄雾' + frost + '。';
    return P.name + '这一晚' + start + '，到 ' + hhmm(P.bed + P.dur) + ' 起床时窗上大约有 ' + grams(n.water) + ' 克' + (n.frost ? '水和霜' : '水（约 ' + grams(n.water) + ' 毫升）') + frost + '。';
  }
  function explain(o) {
    var P = o.P, ev = o.ev, n = ev.n, last = n.pts[n.pts.length - 1];
    var s = '睡前 ' + deg(P.ti0) + '、湿度 ' + fmt(P.rh, 0) + '%，屋里空气的露点是 ' + deg(n.td) + '：玻璃比这个温度低就会挂水。';
    s += glassName(P) + (P.curtain ? '加上拉着窗帘' : '、窗帘拉开') + '，起床时外面 ' + deg(P.to1) + '，玻璃里侧只有 ' + deg(last.ts) + '。';
    if (ev.rhMax >= 1) s += '同样的温度，睡前湿度不超过 ' + ev.rhMax + '% 整夜都不结露';
    else s += '这样的温度下，湿度再低玻璃也会结露';
    s += '；按起床时的室温和湿度，外面低于 ' + deg(ev.toCrit) + ' 玻璃就开始挂水。';
    if (n.water / P.area > 300) s += '每平方米玻璃上 ' + fmt(n.water / P.area, 0) + ' 克已经超出这个粗估能信的范围：屋里的水汽会被窗户吸干、湿度会掉下来，实际会少得多，只当「会非常湿」看。';
    if (P.ti1 !== P.ti0) s += '夜里室温降到 ' + deg(P.ti1) + '，屋里湿度会从 ' + fmt(P.rh, 0) + '% 涨到 ' + fmt(ev.rhWake, 0) + '%（水汽没变，空气凉了）。';
    return s;
  }

  function row(a) { return a.map(csvCell).join(','); }
  function csvCell(v) { var x = String(v); if (/^[=+\-@]/.test(x) && !/^-?\d+(\.\d+)?$/.test(x)) x = "'" + x; return /[",\n\r]/.test(x) ? '"' + x.replace(/"/g, '""') + '"' : x; }
  function toCSV(o, when) {
    var P = o.P, L = [];
    L.push(row(['早上窗台上那摊水', '导出时间', when, '房间', P.name, '玻璃', glassName(P), '窗帘', P.curtain ? '拉上' : '拉开']));
    L.push(row(['时刻', '室外 °C', '室内 °C', '玻璃里侧 °C', '露点 °C', '室内湿度 %', '结露', '窗上水 克']));
    o.ev.n.pts.forEach(function (p) { L.push(row([p.clock, p.to.toFixed(2), p.ti.toFixed(2), p.ts.toFixed(2), o.ev.n.td.toFixed(2), p.rh.toFixed(1), p.cond ? (p.ts < 0 ? '结霜' : '结露') : '', p.water.toFixed(1)])); });
    return L.join('\r\n') + '\r\n';
  }
  function toMD(o, when) {
    var P = o.P, L = [];
    L.push('# 早上窗台上那摊水 · ' + P.name, '', '_导出：' + when + '_', '', '**' + headline(o) + '**', '', explain(o), '');
    L.push('| 条件 | 数值 |', '|---|---|');
    L.push('| 玻璃 | ' + glassName(P) + '（U ' + fmt(P.U, 1) + ' W/m²K），窗帘' + (P.curtain ? '拉上' : '拉开') + ' |');
    L.push('| 睡觉 → 起床 | ' + hhmm(P.bed) + ' → ' + hhmm(P.bed + P.dur) + ' |');
    L.push('| 室温 | ' + deg(P.ti0) + ' → ' + deg(P.ti1) + ' |', '| 室外 | ' + deg(P.to0) + ' → ' + deg(P.to1) + ' |');
    L.push('| 睡前湿度 | ' + fmt(P.rh, 0) + '% |', '| 玻璃面积 | ' + fmt(P.area, 1) + ' m² |', '');
    L.push('| 玻璃 | 窗帘 | 最冷时玻璃 | 结露时长 | 起床时水（克） |', '|---|---|---:|---:|---:|');
    o.table.forEach(function (r) { L.push('| ' + r.name + ' | ' + (r.curtain ? '拉上' : '拉开') + ' | ' + deg(r.minTs) + ' | ' + (r.first === null ? '不结露' : r.wetMin ? dur(r.wetMin) : '刚到') + ' | ' + (r.first !== null && r.water === 0 ? '干了' : grams(r.water)) + ' |'); });
    L.push('');
    o.actions.forEach(function (a) { L.push('- ' + a.text); });
    if (o.actions.length) L.push('');
    L.push('> 一维稳态传热 + Magnus 露点的粗估：只看玻璃中间，不算窗框和边缘（那里更冷、更先挂水），不算人呼吸加湿和开窗。水量只是数量级。默认数字是虚构示例。');
    return L.join('\n') + '\n';
  }

  var api = { GLASS: GLASS, STEP: STEP, defaultState: defaultState, parse: parse, es: es, dew: dew, surface: surface, flux: flux, night: night, rhLimit: rhLimit, outLimit: outLimit,
    evaluate: evaluate, applyChange: applyChange, compare: compare, compute: compute, headline: headline, explain: explain, glassName: glassName,
    fmt: fmt, waterText: waterText, deg: deg, grams: grams, dur: dur, hhmm: hhmm, clock: clock, num: num, toCSV: toCSV, toMD: toMD };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.AppCore = api;
})(typeof window !== 'undefined' ? window : globalThis);
