/* 早上窗台上那摊水 · 核心测试：node --test tests/core.test.cjs
 * 锚点：tests/ref.json（独立 Python 按文字规则重写：露点用二分不用反解、最高湿度逐个整数整夜重跑、临界室外温度二分，300 组）、
 *       默认场景手算、物理常识（单调性）、阈值两侧、边界与非法输入、改法真的重算、导出。 */
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const A = require(path.join(__dirname, '..', 'core.js'));
const REF = JSON.parse(fs.readFileSync(path.join(__dirname, 'ref.json'), 'utf8'));
const D = () => A.defaultState();
const near = (a, b, tol, m) => assert.ok(Math.abs(a - b) <= tol, (m || '') + ' ' + a + ' vs ' + b);

test('默认场景：手算读数、标题、说明', () => {
  const o = A.compute(D()); assert.ok(o.ok, JSON.stringify(o.errors));
  const n = o.ev.n, P = o.P;
  /* 20 °C 饱和水汽压 6.1094·exp(17.625·20/263.04) = 23.334 hPa，×45% = 10.500 hPa → 露点 7.705 °C */
  near(A.es(20), 23.334, 0.001, 'es(20)'); near(n.e, 10.5005, 0.0005, 'e'); near(n.td, 7.705, 0.001, '露点');
  /* 双层 U=2.8：其余热阻 1/2.8 − 0.13 = 0.2271；窗帘 0.30 → 起床时 18 − (18 + 8) × 0.30/0.5271 = 3.20 °C */
  near(n.pts[n.pts.length - 1].ts, 18 - 26 * 0.3 / (0.3 + 1 / 2.8 - 0.13), 1e-9, '起床玻璃');
  assert.equal(P.dur, 510); assert.equal(n.pts.length, 52); assert.equal(n.first, 90); assert.equal(n.wetMin, 420);
  assert.equal(Math.round(n.water), 43); assert.equal(n.frost, false);
  assert.equal(o.ev.rhMax, 32); near(o.ev.toCrit, -0.09, 0.005, '临界室外');
  assert.equal(Math.round(o.ev.rhWake), 51);
  assert.equal(A.headline(o), '北屋这一晚玻璃大约从 00:00 开始起雾，到 07:00 起床时窗上大约有 43 克水（约 43 毫升）。');
  assert.equal(A.explain(o), '睡前 20.0 °C、湿度 45%，屋里空气的露点是 7.7 °C：玻璃比这个温度低就会挂水。普通双层中空加上拉着窗帘，起床时外面 −8.0 °C，玻璃里侧只有 3.2 °C。同样的温度，睡前湿度不超过 32% 整夜都不结露；按起床时的室温和湿度，外面低于 −0.1 °C 玻璃就开始挂水。夜里室温降到 18.0 °C，屋里湿度会从 45% 涨到 51%（水汽没变，空气凉了）。');
  assert.deepEqual(o.actions.map((a) => a.text), [
    '睡前把湿度降到 32%：整夜不结露',
    '窗帘拉开（或离玻璃留缝）：整夜不结露',
    '夜里室温保持 20.0 °C 不降：结露 6 小时 40 分，起床时约 34 克水',
    '换成双层 Low-E（U 1.8）：结露 50 分钟，起床时不到 1 克水']);
});

test('与独立 Python 实现逐组对拍（300 组）', () => {
  assert.equal(REF.cases.length, 300);
  const st = REF.stats;
  assert.ok(st.dry >= 60 && st.wet >= 60 && st.frost >= 20 && st.evaporated >= 3, '样本要覆盖不结露/结露/结霜/中途回干：' + JSON.stringify(st));
  for (const c of REF.cases) {
    const o = A.compute(c.state); assert.ok(o.ok, JSON.stringify(o.errors) + JSON.stringify(c.state));
    const n = o.ev.n, x = c.expect, m = JSON.stringify(c.state);
    assert.equal(n.first, x.first, m); assert.equal(n.wetMin, x.wetMin, m); assert.equal(n.frost, x.frost, m);
    near(n.water, x.water, 1e-9 * Math.max(1, x.water), m + ' water'); near(n.peak, x.peak, 1e-9 * Math.max(1, x.peak), m + ' peak');
    near(n.minTs, x.minTs, 1e-9, m); near(n.td, x.td, 1e-9, m);
    assert.equal(o.ev.rhMax, x.rhMax, m); near(o.ev.toCrit, x.toCrit, 1e-6, m + ' toCrit');
  }
});

test('最高不结露湿度：两侧各差 1%', () => {
  for (const c of REF.cases.slice(0, 80)) {
    const o = A.compute(c.state), k = o.ev.rhMax;
    if (k >= 1) { const s = Object.assign({}, c.state, { rh: String(k) }); assert.equal(A.compute(s).ev.n.first, null, '取 ' + k + '% 应不结露'); }
    if (k < 100) { const s = Object.assign({}, c.state, { rh: String(k + 1) }); assert.notEqual(A.compute(s).ev.n.first, null, '取 ' + (k + 1) + '% 应结露'); }
  }
});

test('临界室外温度：两侧 0.05 °C', () => {
  const P = A.compute(D()).P, n = A.night(P), t = A.outLimit(P, n);
  const e = n.e;
  assert.ok(e < A.es(A.surface(P, P.ti1, t + 0.05)) && e > A.es(A.surface(P, P.ti1, t - 0.05)));
  /* 室内露点高于室温时（不可能的湿度不允许）→ 测 100%：临界室外 = 室温 − (室温 − 露点)/k 应接近或高于起床室温 */
  const s = Object.assign(D(), { rh: '100', ti1: '20' }), o = A.compute(s); near(o.ev.toCrit, 20, 1e-6);
});

test('物理常识：单调性', () => {
  const base = D();
  const w = (s) => A.compute(Object.assign(D(), s)).ev.n;
  /* 湿度越高、室外越冷、玻璃越差 → 不会更少水 */
  let prev = -1; for (const rh of [30, 40, 45, 50, 60, 70]) { const x = w({ rh: String(rh) }).water; assert.ok(x >= prev - 1e-12, 'rh ' + rh); prev = x; }
  prev = -1; for (const to of [5, 0, -5, -10, -20]) { const x = w({ to1: String(to) }).water; assert.ok(x >= prev - 1e-12, 'to ' + to); prev = x; }
  const t = ['triple', 'lowe', 'double', 'single'].map((g) => w({ glass: g }).minTs); assert.ok(t[0] > t[1] && t[1] > t[2] && t[2] > t[3]);
  /* 拉窗帘玻璃更冷 */
  assert.ok(w({ curtain: 'on' }).minTs < w({ curtain: 'off' }).minTs);
  /* 面积线性 */
  near(w({ area: '3.6' }).water, 2 * w({}).water, 1e-9);
  /* 室内外同温 → 玻璃 = 室温，不结露 */
  const z = w({ to0: '20', to1: '18' }); near(z.minTs, 18, 1e-9); assert.equal(z.first, null);
  assert.equal(base.name, '北屋');
});

test('中途回干、起床那一刻才到露点、结霜', () => {
  /* 后半夜外面回暖：先结后干 */
  const o = A.compute(Object.assign(D(), { to0: '-15', to1: '10', rh: '55' }));
  const n = o.ev.n; assert.ok(n.wetMin > 0 && n.peak > n.water);
  /* 只有最后一个点结露 */
  const P = A.compute(D()).P; const q = Object.assign({}, P);
  const last = A.surface(P, P.ti1, P.to1), e = A.es(last) * 1.0000001, rh = 100 * e / A.es(P.ti0);
  const n2 = A.night(Object.assign(q, { rh: rh }));
  assert.equal(n2.first, P.dur); assert.equal(n2.wetMin, 0); assert.equal(n2.water, 0);
  const o2 = { ok: true, P: Object.assign({}, P, { rh: rh }), ev: A.evaluate(Object.assign({}, P, { rh: rh })) };
  assert.match(A.headline(o2), /起床那一刻才刚降到露点以下/);
  /* 结露但积不下水 → 薄雾 */
  const thin = A.compute(Object.assign(D(), { glass: 'lowe' })); assert.ok(thin.ev.n.wetMin > 0 && thin.ev.n.water < 0.5);
  assert.equal(A.headline(thin), '北屋这一晚玻璃大约从 06:10 开始起雾，结露 50 分钟，但积不下多少水，起床时只是一层薄雾。');
  /* 水量离谱时说明里直说粗估不可信 */
  const huge = A.compute(Object.assign(D(), { glass: 'custom', U: '6.5', to0: '-40', to1: '-40', ti0: '35', ti1: '35', rh: '100', area: '20', bed: '18:00', wake: '10:00' }));
  assert.match(A.explain(huge), /每平方米玻璃上 2,419 克已经超出这个粗估能信的范围/); assert.doesNotMatch(A.explain(A.compute(D())), /超出/);
  /* 室温不降时，说明里不提湿度上涨 */
  assert.doesNotMatch(A.explain(A.compute(Object.assign(D(), { ti1: '20' }))), /夜里室温/);
  /* 单层 + 窗帘 + 很冷 → 结霜 */
  const f = A.compute(Object.assign(D(), { glass: 'single', to1: '-15' })); assert.equal(f.ev.n.frost, true); assert.match(A.headline(f), /结成霜/);
  /* 不结露 */
  const d = A.compute(Object.assign(D(), { curtain: 'off' })); assert.equal(d.ev.n.first, null); assert.equal(d.actions.length, 0);
  assert.match(A.headline(d), /^北屋这一晚玻璃不会结露：最冷时玻璃 8\.5 °C，还比露点 7\.7 °C 高 0\.8 °C。$/);
});

test('改法真的重算、只给更好的', () => {
  const st = D(), o = A.compute(st);
  for (const a of o.actions) {
    const o2 = A.compute(A.applyChange(st, a)); assert.ok(o2.ok);
    near(o2.ev.n.water, a.water, 1e-12); assert.equal(o2.ev.n.wetMin, a.wetMin);
    assert.ok(o2.ev.n.first === null || o2.ev.n.wetMin < o.ev.n.wetMin || o2.ev.n.peak < o.ev.n.peak);
  }
  /* 三玻 + 窗帘拉开：没有更好的玻璃，不出换玻璃 */
  const t = A.compute(Object.assign(D(), { glass: 'triple', to1: '-30', rh: '60' })); assert.ok(t.ev.n.wetMin > 0);
  assert.ok(!t.actions.some((a) => a.kind === 'glass'));
  /* 室温不降时不出「保持室温」 */
  const k = A.compute(Object.assign(D(), { ti1: '20' })); assert.ok(!k.actions.some((a) => a.kind === 'warm'));
  /* 室温夜里反而升高：也不出「保持室温」（保持会更冷） */
  const up = A.compute(Object.assign(D(), { ti1: '22' })); assert.ok(up.ev.n.wetMin > 0 && !up.actions.some((a) => a.kind === 'warm'));
  /* 已拉开时不出窗帘 */
  const c = A.compute(Object.assign(D(), { curtain: 'off', glass: 'single' })); assert.ok(c.ev.n.wetMin > 0 && !c.actions.some((a) => a.kind === 'curtain'));
  /* 自填 U：换玻璃选比它好的第一档 */
  const u = A.compute(Object.assign(D(), { glass: 'custom', U: '3.3' })); const g = u.actions.find((a) => a.kind === 'glass'); assert.equal(g.to, 'double');
  /* 湿度再低也结露 → rhMax 0，不给降湿 */
  const z = A.compute(Object.assign(D(), { glass: 'single', to0: '-40', to1: '-40', ti0: '35', ti1: '5' }));
  assert.equal(z.ev.rhMax, 0); assert.ok(!z.actions.some((a) => a.kind === 'rh')); assert.match(A.explain(z), /湿度再低玻璃也会结露/);
});

test('对照表：8 行、当前行标记、和单独算一致', () => {
  const o = A.compute(D()); assert.equal(o.table.length, 8);
  assert.deepEqual(o.table.filter((r) => r.cur).map((r) => r.glass + r.curtain), ['doubletrue']);
  const r = o.table.find((x) => x.cur); near(r.water, o.ev.n.water, 1e-12);
  const s = o.table.find((x) => x.glass === 'single' && !x.curtain), n = A.compute(Object.assign(D(), { glass: 'single', curtain: 'off' })).ev.n;
  near(s.water, n.water, 1e-12); assert.equal(s.wetMin, n.wetMin);
});

test('非法输入与边界', () => {
  const bad = (s, f) => { const o = A.compute(Object.assign(D(), s)); assert.equal(o.ok, false); assert.ok(o.errors.some((e) => e.field === f), JSON.stringify(o.errors)); };
  bad({ rh: '' }, 'rh'); bad({ rh: '0' }, 'rh'); bad({ rh: '101' }, 'rh'); bad({ rh: 'abc' }, 'rh');
  bad({ ti0: '40' }, 'ti0'); bad({ to1: '-41' }, 'to1'); bad({ area: '0' }, 'area');
  bad({ glass: 'custom', U: '0.2' }, 'U'); bad({ glass: 'custom', U: '' }, 'U');
  bad({ bed: '25:00' }, 'bed'); bad({ wake: '7点' }, 'wake'); bad({ wake: '22:50' }, 'wake'); bad({ wake: '22:30' }, 'wake'); bad({ bed: '06:00', wake: '23:00' }, 'wake');
  /* 全角、中文冒号、负号写法 */
  const o = A.compute(Object.assign(D(), { to1: '−８', wake: '07：00', rh: '４５' })); assert.ok(o.ok); near(o.ev.n.water, A.compute(D()).ev.n.water, 1e-12);
  /* 跨夜 vs 不跨夜：13:00 → 15:00 午睡 */
  const p = A.compute(Object.assign(D(), { bed: '13:00', wake: '15:00' })); assert.ok(p.ok); assert.equal(p.P.dur, 120);
  /* 最后一步不足 10 分钟 */
  const q = A.compute(Object.assign(D(), { wake: '07:05' })); assert.equal(q.P.dur, 515); const L = q.ev.n.pts; assert.equal(L[L.length - 1].t - L[L.length - 2].t, 5);
  /* 名字截断、空名 */
  assert.equal(A.compute(Object.assign(D(), { name: '一'.repeat(40) })).P.name.length, 12);
  assert.equal(A.compute(Object.assign(D(), { name: '  ' })).P.name, '这间屋');
  assert.equal(A.compute(null).ok, false);
  /* 未知玻璃 key 回落到自填 */
  assert.equal(A.compute(Object.assign(D(), { glass: 'xx', U: '2' })).P.U, 2);
});

test('格式化', () => {
  assert.equal(A.fmt(-0.04, 1), '0.0'); assert.equal(A.fmt(-8, 1), '−8.0'); assert.equal(A.fmt(12345.6, 0), '12,346');
  assert.equal(A.grams(0), '0'); assert.equal(A.grams(0.3), '不到 1'); assert.equal(A.grams(42.6), '43');
  assert.equal(A.waterText(0), '没有积水'); assert.equal(A.waterText(0.2), '不到 1 克水');
  assert.equal(A.dur(50), '50 分钟'); assert.equal(A.dur(420), '7 小时'); assert.equal(A.dur(400), '6 小时 40 分');
  assert.equal(A.clock('7.05'), 425); assert.equal(A.clock('7：05'), 425);
  assert.equal(A.hhmm(1440 + 90), '01:30'); assert.equal(A.clock('7:05'), 425); assert.ok(isNaN(A.clock('7:5')));
});

test('导出 CSV / MD', () => {
  const o = A.compute(Object.assign(D(), { name: '=SUM(A1)' }));
  const csv = A.toCSV(o, '2026-11-18 01:00'), lines = csv.trim().split('\r\n');
  assert.equal(lines.length, 2 + 52); assert.match(lines[0], /'=SUM\(A1\)/);
  assert.match(lines[lines.length - 1], /^07:00,-8\.00,18\.00,3\.20,7\.71,51\.0,结露,42\.6$/);
  const md = A.toMD(o, 'x'); assert.match(md, /^# 早上窗台上那摊水 · =SUM\(A1\)/); assert.match(md, /\| 普通双层中空 \| 拉上 \| 3\.2 °C \| 7 小时 \| 43 \|/);
  assert.match(md, /默认数字是虚构示例/);
});
