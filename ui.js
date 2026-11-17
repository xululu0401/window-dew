/* 早上窗台上那摊水 · 界面（ui.js）：所有读数取自 core.js 同一次 compute 的 out */
'use strict';
(function () {
  var A = window.AppCore, KEY = 'window-dew:v1';
  var $ = function (id) { return document.getElementById(id); };
  var FIELDS = ['name', 'glass', 'U', 'area', 'bed', 'wake', 'ti0', 'ti1', 'to0', 'to1', 'rh'];
  var PRESETS = [
    { key: 'def', name: '北屋双层窗', note: '默认（虚构）：北屋普通双层中空玻璃 1.8 m²，拉着窗帘，22:30 睡、07:00 起，室温 20 → 18 °C，湿度 45%，外面 0 → −8 °C。' },
    { key: 'old', name: '老房单层窗', note: '虚构示例：老房单层玻璃，窗帘拉开，其余同默认。', f: function (s) { s.name = '老房卧室'; s.glass = 'single'; s.U = '5.8'; s.curtain = 'off'; } },
    { key: 'dry', name: '开了加湿器', note: '虚构示例：同默认，但开着加湿器，湿度 60%。', f: function (s) { s.rh = '60'; } },
    { key: 'thaw', name: '后半夜回暖', note: '虚构示例：外面从 −15 °C 回暖到 10 °C，前半夜结的水后半夜会干掉一部分。', f: function (s) { s.to0 = '-15'; s.to1 = '10'; s.rh = '55'; } }
  ];
  var state, out, tmr;
  function clone(x) { return JSON.parse(JSON.stringify(x)); }
  function presetState(k) { var s = A.defaultState(), p = PRESETS.filter(function (q) { return q.key === k; })[0]; if (p && p.f) p.f(s); return s; }
  function str(v, n) { return v == null || typeof v === 'object' ? '' : String(v).slice(0, n); }
  function sanitize(s) {
    if (!s || typeof s !== 'object') return null;
    var d = A.defaultState();
    FIELDS.forEach(function (k) { if (k in s) d[k] = str(s[k], k === 'name' ? 12 : 16); });
    d.curtain = s.curtain === 'off' ? 'off' : 'on';
    return d;
  }
  function norm(s) { return JSON.stringify(sanitize(s)); }
  function presetKey(s) { var j = norm(s); for (var i = 0; i < PRESETS.length; i++) if (norm(presetState(PRESETS[i].key)) === j) return PRESETS[i].key; return null; }
  function load() { try { var t = localStorage.getItem(KEY); if (!t) return null; var j = JSON.parse(t); return j && j.state ? sanitize(j.state) : null; } catch (e) { return null; } }
  function save() { try { localStorage.setItem(KEY, JSON.stringify({ v: 1, state: state })); $('saveTag').textContent = '· 已自动存在本机'; } catch (e) { $('saveTag').textContent = '· 这台设备存不了，刷新会丢'; } }
  function esc(t) { return String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
  state = load() || A.defaultState();

  $('glass').innerHTML = A.GLASS.map(function (g) { return '<option value="' + g.key + '">' + g.name + '（U ' + g.U + '）</option>'; }).join('') + '<option value="custom">自己填 U 值</option>';
  function fill() {
    FIELDS.forEach(function (k) { $(k).value = state[k]; });
    if (!A.GLASS.some(function (g) { return g.key === state.glass; })) $('glass').value = 'custom';
    $('uBox').classList.toggle('hide', $('glass').value !== 'custom');
    $('curOn').setAttribute('aria-pressed', String(state.curtain === 'on')); $('curOff').setAttribute('aria-pressed', String(state.curtain !== 'on'));
  }
  FIELDS.forEach(function (k) { $(k).addEventListener('input', function () { state[k] = this.value; if (k === 'glass') { var g = A.GLASS.filter(function (x) { return x.key === state.glass; })[0]; if (g) state.U = String(g.U); fill(); update(); } else schedule(); }); });
  $('glass').addEventListener('change', function () { state.glass = this.value; var g = A.GLASS.filter(function (x) { return x.key === state.glass; })[0]; if (g) state.U = String(g.U); fill(); update(); });
  function schedule() { clearTimeout(tmr); tmr = setTimeout(update, 80); }
  $('curSeg').addEventListener('click', function (e) { var b = e.target.closest('[data-c]'); if (!b) return; state.curtain = b.getAttribute('data-c'); fill(); update(); });
  $('presets').addEventListener('click', function (e) { var b = e.target.closest('[data-p]'); if (!b) return; state = presetState(b.getAttribute('data-p')); fill(); update(); });
  $('acts').addEventListener('click', function (e) {
    var b = e.target.closest('[data-act]'); if (!b || !out.ok) return;
    var a = out.actions.filter(function (x) { return x.id === b.getAttribute('data-act'); })[0]; if (!a) return;
    state = A.applyChange(state, a); fill(); update();
  });
  function markErrors() {
    document.querySelectorAll('.bad').forEach(function (e) { e.classList.remove('bad'); });
    if (!out.ok) out.errors.forEach(function (er) { var el = $(er.field); if (el) el.classList.add('bad'); });
  }
  function renderPresets() {
    var key = presetKey(state);
    $('presets').innerHTML = PRESETS.map(function (p) { return '<button type="button" class="chip" id="preset_' + p.key + '" data-p="' + p.key + '" aria-pressed="' + (key === p.key) + '">' + esc(p.name) + '</button>'; }).join('');
    var cur = PRESETS.filter(function (p) { return p.key === key; })[0];
    $('presetNote').textContent = cur ? cur.note : '你自己改过的条件（默认那组是虚构示例）。';
  }

  /* 窗户插画：雾的浓淡、水珠个数、窗台水洼宽度都按起床时的水量（克/m²） */
  function renderWindow() {
    var curt = state.curtain === 'on';
    $('curtL').style.width = curt ? '30%' : '8%'; $('curtR').style.width = curt ? '30%' : '8%';
    if (!out.ok) { $('fog').style.background = 'rgba(240,246,250,0)'; $('drops').innerHTML = ''; $('pool').style.width = '0'; $('winTag').textContent = '条件没填好，先改标红的地方'; return; }
    var n = out.ev.n, P = out.P, gpm = n.water / P.area, last = n.pts[n.pts.length - 1];
    var fogA = n.first === null ? 0 : Math.min(0.82, 0.3 + gpm / 30);
    $('fog').style.background = n.frost ? 'rgba(250,253,255,' + Math.min(0.9, fogA + 0.08) + ')' : 'rgba(244,248,251,' + fogA + ')';
    $('fog').style.backdropFilter = n.first === null ? 'none' : 'blur(' + Math.min(6, 2 + gpm / 10).toFixed(1) + 'px)';
    var k = Math.min(70, Math.round(gpm * 1.5)), h = '';
    for (var i = 0; i < k; i++) { var x = 2 + (i * 37 % 94), y = 30 + (i * 53 % 62), r = 3 + (i % 3); h += '<i style="position:absolute;left:' + x + '%;top:' + y + '%;width:' + r * 2 + 'px;height:' + (r * 2 + (i % 4) * 3) + 'px;border-radius:' + r + 'px;background:rgba(47,116,181,.75);box-shadow:inset -1px -1px 0 rgba(255,255,255,.6)"></i>'; }
    $('drops').innerHTML = h;
    $('pool').style.width = Math.min(92, gpm * 1.6) + '%';
    $('winTag').textContent = A.hhmm(P.bed + P.dur) + ' 起床时 · 玻璃里侧 ' + A.deg(last.ts) + ' · 露点 ' + A.deg(n.td) + (n.frost ? ' · 结霜' : '') + ' · 窗上 ' + A.waterText(n.water).replace('约 ', '');
  }

  function renderChart() {
    var o = out, n = o.ev.n, P = o.P, pts = n.pts, Wd = 640, Ht = 260, L = 44, R = 22, T = 14, B = 34;
    var vals = []; pts.forEach(function (p) { vals.push(p.ts, p.to); }); vals.push(n.td);
    var lo = Math.floor(Math.min.apply(null, vals) / 5) * 5, hi = Math.ceil(Math.max.apply(null, vals) / 5) * 5; if (hi - lo < 10) hi = lo + 10;
    var X = function (t) { return L + t / P.dur * (Wd - L - R); }, Y = function (v) { return T + (hi - v) / (hi - lo) * (Ht - T - B); };
    var s = '';
    for (var i = 0; i < pts.length - 1; i++) if (pts[i].cond) s += '<rect x="' + X(pts[i].t).toFixed(1) + '" y="' + T + '" width="' + (X(pts[i + 1].t) - X(pts[i].t) + 0.5).toFixed(1) + '" height="' + (Ht - T - B) + '" fill="#cfe2f3"/>';
    var step = (hi - lo) > 30 ? 10 : 5;
    for (var v = lo; v <= hi; v += step) s += '<line x1="' + L + '" x2="' + (Wd - R) + '" y1="' + Y(v).toFixed(1) + '" y2="' + Y(v).toFixed(1) + '" stroke="' + (v === 0 ? '#9aa7b1' : '#e6ebef') + '"/><text x="' + (L - 6) + '" y="' + (Y(v) + 4).toFixed(1) + '" text-anchor="end" font-size="11" fill="#7f8b94">' + A.fmt(v, 0) + '°</text>';
    var hours = []; for (var t = 0; t <= P.dur; t += 10) { var c = (P.bed + t) % 60; if (c === 0) hours.push(t); }
    var every = hours.length > 9 ? 2 : 1;
    hours.forEach(function (t, j) { if (j % every) return; s += '<text x="' + X(t).toFixed(1) + '" y="' + (Ht - 12) + '" text-anchor="middle" font-size="11" fill="#7f8b94">' + A.hhmm(P.bed + t) + '</text>'; });
    function line(key, color, w) { return '<polyline fill="none" stroke="' + color + '" stroke-width="' + w + '" points="' + pts.map(function (p) { return X(p.t).toFixed(1) + ',' + Y(p[key]).toFixed(1); }).join(' ') + '"/>'; }
    s += line('to', '#9aa7b1', 1.5);
    s += '<line x1="' + L + '" x2="' + (Wd - R) + '" y1="' + Y(n.td).toFixed(1) + '" y2="' + Y(n.td).toFixed(1) + '" stroke="#2f74b5" stroke-width="2" stroke-dasharray="6 4"/>';
    s += line('ts', '#c0622f', 2.5);
    if (n.first !== null) s += '<circle cx="' + X(n.first).toFixed(1) + '" cy="' + Y(pts.filter(function (p) { return p.t === n.first; })[0].ts).toFixed(1) + '" r="4.5" fill="#2f74b5"/><text x="' + Math.min(Wd - R - 60, X(n.first) + 6).toFixed(1) + '" y="' + (T + 14) + '" font-size="12" fill="#2f74b5">' + A.hhmm(P.bed + n.first) + ' 起雾</text>';
    $('chart').innerHTML = s;
  }

  function renderTable() {
    var rows = '<tr><th>玻璃</th><th>窗帘</th><th>最冷时玻璃</th><th>结露多久</th><th>起床时水</th></tr>';
    out.table.forEach(function (r) {
      rows += '<tr class="' + (r.cur ? 'cur' : '') + '"><td>' + esc(r.name) + '</td><td>' + (r.curtain ? '拉上' : '拉开') + '</td><td>' + A.deg(r.minTs) + '</td>' +
        (r.first === null ? '<td class="dry">不结露</td><td class="dry">0</td>' : '<td class="w">' + (r.wetMin ? A.dur(r.wetMin) : '刚到') + (r.frost ? ' · 霜' : '') + '</td>' + (r.water === 0 ? '<td class="dry">干了</td>' : '<td class="w">' + A.grams(r.water) + ' 克</td>')) + '</tr>';
    });
    $('cmp').innerHTML = rows;
  }

  function render() {
    var o = out;
    $('errBox').classList.toggle('hide', o.ok); $('okBox').classList.toggle('hide', !o.ok); $('cmpPanel').classList.toggle('hide', !o.ok);
    renderWindow();
    if (!o.ok) { $('errBox').innerHTML = '先改好标红的地方：<ul>' + o.errors.map(function (e) { return '<li>' + esc(e.message) + '</li>'; }).join('') + '</ul>'; return; }
    $('headline').textContent = A.headline(o);
    $('why').textContent = A.explain(o);
    renderChart(); renderTable();
    $('acts').innerHTML = o.actions.length ? o.actions.map(function (a) { return '<button type="button" class="act" id="' + a.id + '" data-act="' + a.id + '">→ ' + esc(a.text) + '</button>'; }).join('')
      : '<span class="muted">' + (o.ev.n.first === null ? '这一晚不结露，不用改。' : '这几样都改不出更少的水了。') + '</span>';
  }
  function update() { clearTimeout(tmr); out = A.compute(state); markErrors(); renderPresets(); render(); save(); }

  function stamp() { var d = new Date(), p = function (x) { return (x < 10 ? '0' : '') + x; }; return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) + ' ' + p(d.getHours()) + ':' + p(d.getMinutes()); }
  function download(name, blob) { var a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click(); setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 1500); }
  function tag() { if (!out.ok) return '待改'; var n = out.ev.n; return n.first === null ? '不结露' : n.water < 0.5 ? '薄雾' : A.grams(n.water).replace(/,/g, '') + '克水'; }
  $('dlCsv').addEventListener('click', function () { if (out.ok) download('早上窗台上那摊水-逐10分钟.csv', new Blob(['\ufeff' + A.toCSV(out, stamp())], { type: 'text/csv;charset=utf-8' })); });
  $('dlMd').addEventListener('click', function () { if (out.ok) download('早上窗台上那摊水-' + tag() + '.md', new Blob([A.toMD(out, stamp())], { type: 'text/markdown;charset=utf-8' })); });
  $('dlJson').addEventListener('click', function () { download('早上窗台上那摊水-备份.json', new Blob([JSON.stringify({ app: '早上窗台上那摊水', slug: 'window-dew', version: 1, exported_at: stamp(), state: state }, null, 2)], { type: 'application/json' })); });
  $('impJson').addEventListener('click', function () { $('impFile').click(); });
  $('impFile').addEventListener('change', function () { var f = this.files && this.files[0]; if (!f) return; var rd = new FileReader(); rd.onload = function () { importText(String(rd.result)); }; rd.readAsText(f); this.value = ''; });
  function importText(t) {
    var s = null;
    try { var j = JSON.parse(t); s = sanitize(j && j.state ? j.state : j); } catch (e) { s = null; }
    if (!s) { $('impMsg').textContent = '这个文件读不出来，没改动。'; return false; }
    $('impMsg').textContent = '已导入。'; state = s; fill(); update(); return true;
  }
  $('reset').addEventListener('click', function () { state = A.defaultState(); $('impMsg').textContent = ''; fill(); update(); });

  /* 结果卡 PNG 1080×1350：文字、曲线与表格取自同一次 out */
  function drawCard() {
    var W = 1080, H = 1350, cv = document.createElement('canvas'); cv.width = W; cv.height = H;
    var g = cv.getContext('2d'), FF = '-apple-system,"PingFang SC","Microsoft YaHei",sans-serif';
    g.fillStyle = '#e9eef1'; g.fillRect(0, 0, W, H); g.fillStyle = '#fbfcfd'; g.fillRect(50, 50, W - 100, H - 100);
    var L = 100, Rr = W - 100, maxW = Rr - L, y = 145;
    function font(size, bold) { g.font = (bold ? '700 ' : '') + size + 'px ' + FF; }
    function clip(t, w) { t = String(t); if (g.measureText(t).width <= w) return t; while (t.length > 1 && g.measureText(t + '…').width > w) t = t.slice(0, -1); return t + '…'; }
    function wrap(t, size, color, bold, lim) {
      font(size, bold); g.fillStyle = color; var cur = '', n = 0;
      var toks = String(t).match(/\d{1,2}:\d{2}[）)。，、；：]?|[0-9.,%+−-]+ ?(?:°C|克|毫升|%|小时|分钟|分)?[）)。，、；：]?|[（(「]?[A-Za-z]+[）)」。，、；：]?|[（(「]?[^\s（(「][）)」。，、；：]?|\s/g) || [];
      for (var i = 0; i < toks.length; i++) { var ch = toks[i]; if (g.measureText(cur + ch).width > maxW && cur) { if (lim && ++n >= lim) { g.fillText(clip(cur + '…', maxW), L, y); y += size * 1.45; return; } g.fillText(cur, L, y); y += size * 1.45; cur = ch.trim() ? ch : ''; } else cur += ch; }
      if (cur) { g.fillText(cur, L, y); y += size * 1.45; }
    }
    font(54, true); g.fillStyle = '#1d2830'; g.fillText('早上窗台上那摊水', L, y); y += 54;
    if (!out.ok) { font(42, true); g.fillStyle = '#a8372b'; g.fillText('还算不了', L, y + 20); y += 90; out.errors.slice(0, 8).forEach(function (e) { wrap('· ' + e.message, 28, '#47545e', false, 2); y += 8; }); y += 30; wrap('改好标红的地方，会自动重算。', 26, '#7f8b94'); return cv; }
    var o = out, P = o.P, n = o.ev.n;
    font(26); g.fillStyle = '#7f8b94'; g.fillText(clip(P.name + ' · ' + A.glassName(P) + ' · 窗帘' + (P.curtain ? '拉上' : '拉开') + ' · ' + A.hhmm(P.bed) + '→' + A.hhmm(P.bed + P.dur) + ' · 外面 ' + A.deg(P.to0) + '→' + A.deg(P.to1), maxW), L, y); y += 56;
    font(30); g.fillStyle = '#47545e'; g.fillText('起床时窗上', L, y); y += 88;
    font(80, true); g.fillStyle = n.first === null ? '#2f6b4f' : '#2f74b5'; g.fillText(clip(n.first === null ? '不结露' : n.water < 0.5 ? '一层薄雾' : '约 ' + A.grams(n.water) + ' 克水', maxW), L, y); y += 50;
    wrap(A.headline(o), 30, '#1d2830', true, 3); y += 10;
    /* 曲线（与页面同口径） */
    var pts = n.pts, cH = 260, cT = y, vals = []; pts.forEach(function (p) { vals.push(p.ts, p.to); }); vals.push(n.td);
    var lo = Math.floor(Math.min.apply(null, vals) / 5) * 5, hi = Math.ceil(Math.max.apply(null, vals) / 5) * 5; if (hi - lo < 10) hi = lo + 10;
    var cx0 = L + 60, cw = maxW - 60, X = function (t) { return cx0 + t / P.dur * cw; }, Yv = function (v) { return cT + (hi - v) / (hi - lo) * cH; };
    for (var i = 0; i < pts.length - 1; i++) if (pts[i].cond) { g.fillStyle = '#cfe2f3'; g.fillRect(X(pts[i].t), cT, X(pts[i + 1].t) - X(pts[i].t) + 0.5, cH); }
    var step = (hi - lo) > 30 ? 10 : 5; font(20); g.textAlign = 'right';
    for (var v = lo; v <= hi; v += step) { g.strokeStyle = v === 0 ? '#9aa7b1' : '#e6ebef'; g.lineWidth = 1; g.beginPath(); g.moveTo(cx0, Yv(v)); g.lineTo(Rr, Yv(v)); g.stroke(); g.fillStyle = '#7f8b94'; g.fillText(A.fmt(v, 0) + '°', cx0 - 8, Yv(v) + 7); }
    g.textAlign = 'left';
    function pl(key, color, w) { g.strokeStyle = color; g.lineWidth = w; g.setLineDash([]); g.beginPath(); pts.forEach(function (p, j) { var a = X(p.t), b = Yv(p[key]); if (j) g.lineTo(a, b); else g.moveTo(a, b); }); g.stroke(); }
    pl('to', '#9aa7b1', 2); g.strokeStyle = '#2f74b5'; g.lineWidth = 3; g.setLineDash([10, 7]); g.beginPath(); g.moveTo(cx0, Yv(n.td)); g.lineTo(Rr, Yv(n.td)); g.stroke(); g.setLineDash([]); pl('ts', '#c0622f', 4);
    y = cT + cH + 34; font(20); g.fillStyle = '#c0622f'; g.fillText('— 玻璃里侧', L, y); g.fillStyle = '#2f74b5'; g.fillText('- - 露点 ' + A.deg(n.td), L + 170, y); g.fillStyle = '#7f8b94'; g.fillText('— 室外    浅蓝底 = 结露时段', L + 400, y);
    y += 48;
    if (o.actions.length) { font(26, true); g.fillStyle = '#1d2830'; g.fillText('改一样试试', L, y); y += 40; o.actions.slice(0, 4).forEach(function (a) { wrap('→ ' + a.text, 25, '#2f4f6a', false, 1); y += 2; }); }
    else wrap(A.explain(o), 24, '#47545e', false, 4);
    /* 剩下的高度放对照表（同一次 out.table），放不下就只放当前玻璃的两行 */
    var rows = o.table, room = Math.floor((H - 150 - y - 30 - 36) / 34);
    if (rows.length > room) rows = rows.filter(function (r) { return r.glass === P.glass; });
    if (!rows.length || rows.length > room) rows = o.table.filter(function (r) { return r.curtain === P.curtain; });   /* 自填 U 时表里没有这一档：放同样窗帘下的四种玻璃 */
    if (rows.length > room) rows = [];
    if (rows.length && rows.length <= room) {
      y += 30; var cx = [L + 10, L + 300, L + 420, Rr - 200, Rr - 10];
      font(20); g.fillStyle = '#7f8b94'; g.fillText('同样一晚换玻璃 / 窗帘', cx[0], y); g.fillText('窗帘', cx[1], y); g.fillText('最冷时玻璃', cx[2], y); g.textAlign = 'right'; g.fillText('结露多久', cx[3], y); g.fillText('起床时水', cx[4], y); g.textAlign = 'left'; y += 36;
      rows.forEach(function (r) {
        if (r.cur) { g.fillStyle = '#fff6dc'; g.fillRect(L, y - 25, maxW, 34); }
        font(22, r.cur); g.fillStyle = '#1d2830'; g.fillText(r.name, cx[0], y); g.fillText(r.curtain ? '拉上' : '拉开', cx[1], y); g.fillText(A.deg(r.minTs), cx[2], y);
        g.textAlign = 'right'; g.fillStyle = r.first === null ? '#2f6b4f' : '#2f74b5';
        g.fillText(r.first === null ? '不结露' : (r.wetMin ? A.dur(r.wetMin) : '刚到') + (r.frost ? '·霜' : ''), cx[3], y); g.fillText(r.first === null ? '0' : r.water === 0 ? '干了' : A.grams(r.water) + ' 克', cx[4], y); g.textAlign = 'left';
        y += 34;
      });
    }
    y = H - 120;
    wrap('只看玻璃中间的粗估：不算窗框窗角（更冷、更先挂水）、呼吸加湿与开窗；水量只是数量级，不是实测。默认数字为虚构示例。', 20, '#7f8b94', false, 2);
    return cv;
  }
  $('dlPng').addEventListener('click', function () { drawCard().toBlob(function (bl) { if (bl) download('早上窗台上那摊水-' + tag() + '-1080x1350.png', bl); }, 'image/png'); });

  window.__wdUi = { state: function () { return clone(state); }, out: function () { return out; }, importText: importText, drawCard: drawCard, storageKey: KEY };
  fill(); update();
})();
