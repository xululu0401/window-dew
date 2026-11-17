/* 封面 cover.svg（1200×1200）：曲线与读数来自 core.js 同一次 compute；再用浏览器截成 cover.png。 */
const fs = require('node:fs');
const A = require('./core.js');
const o = A.compute(A.defaultState()), n = o.ev.n, P = o.P;
if (!o.ok || A.grams(n.water) !== '43') throw new Error('默认场景不对');
const F = "-apple-system,'PingFang SC','Microsoft YaHei',sans-serif";
const x0 = 140, w = 920, y0 = 560, h = 330, lo = -10, hi = 10;
const X = (t) => x0 + t / P.dur * w, Y = (v) => y0 + (hi - v) / (hi - lo) * h;
let wet = '';
for (let i = 0; i < n.pts.length - 1; i++) if (n.pts[i].cond) wet += `<rect x="${X(n.pts[i].t).toFixed(1)}" y="${y0}" width="${(X(n.pts[i + 1].t) - X(n.pts[i].t) + 0.6).toFixed(1)}" height="${h}" fill="#cfe2f3"/>`;
const pl = (k, c, sw) => `<polyline fill="none" stroke="${c}" stroke-width="${sw}" points="${n.pts.map((p) => X(p.t).toFixed(1) + ',' + Y(p[k]).toFixed(1)).join(' ')}"/>`;
let grid = '';
for (const v of [-10, -5, 0, 5, 10]) grid += `<line x1="${x0}" x2="${x0 + w}" y1="${Y(v)}" y2="${Y(v)}" stroke="${v === 0 ? '#9aa7b1' : '#e6ebef'}"/><text x="${x0 - 12}" y="${Y(v) + 8}" text-anchor="end" font-family="${F}" font-size="24" fill="#7f8b94">${A.fmt(v, 0)}°</text>`;
const ticks = ['23:00', '01:00', '03:00', '05:00', '07:00'].map((c) => { let t = A.clock(c) - P.bed; if (t < 0) t += 1440; return `<text x="${X(t)}" y="${y0 + h + 36}" text-anchor="middle" font-family="${F}" font-size="24" fill="#7f8b94">${c}</text>`; }).join('');
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="1200" viewBox="0 0 1200 1200">
  <rect width="1200" height="1200" fill="#e9eef1"/>
  <rect x="60" y="60" width="1080" height="1080" rx="18" fill="#fbfcfd"/>
  <text x="140" y="215" font-family="${F}" font-size="104" font-weight="800" fill="#1d2830">早上窗台上那摊水</text>
  <text x="140" y="295" font-family="${F}" font-size="40" fill="#47545e">玻璃几点起雾、积多少水、改哪样能不结露</text>
  <text x="140" y="400" font-family="${F}" font-size="34" fill="#47545e">双层玻璃拉着窗帘：</text>
  <text x="140" y="470" font-family="${F}" font-size="56" font-weight="800" fill="#2f74b5">${A.hhmm(P.bed + n.first)} 起雾，起床时约 ${A.grams(n.water)} 克水</text>
  ${wet}${grid}
  <line x1="${x0}" x2="${x0 + w}" y1="${Y(n.td).toFixed(1)}" y2="${Y(n.td).toFixed(1)}" stroke="#2f74b5" stroke-width="4" stroke-dasharray="14 9"/>
  ${pl('to', '#9aa7b1', 3)}${pl('ts', '#c0622f', 6)}
  <text x="${x0 + w - 10}" y="${Y(n.td) - 14}" text-anchor="end" font-family="${F}" font-size="26" fill="#2f74b5">露点 ${A.deg(n.td)}</text>
  <text x="${x0 + w - 10}" y="${Y(n.pts[n.pts.length - 1].ts) + 40}" text-anchor="end" font-family="${F}" font-size="26" fill="#c0622f">玻璃里侧 ${A.deg(n.pts[n.pts.length - 1].ts)}</text>
  ${ticks}
  <text x="140" y="1010" font-family="${F}" font-size="32" fill="#2f6b4f">把窗帘拉开：整夜不结露</text>
  <text x="140" y="1095" font-family="${F}" font-size="24" fill="#7f8b94">只看玻璃中间的粗估，不是实测 · 温度湿度为虚构示例</text>
</svg>`;
fs.writeFileSync('cover.svg', svg);
fs.writeFileSync('/tmp/cover99.html', '<!DOCTYPE html><html><head><meta charset="utf-8"><style>html,body{margin:0}</style></head><body>' + svg + '</body></html>');
console.log('cover.svg', svg.length);
