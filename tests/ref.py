"""早上窗台上那摊水 · 独立参考实现（按 core.js 顶部文字规则重写，不读 core.js）。
- 时间轴：先列出所有步首时刻（0,10,20,…,<dur）再加 dur，逐段累加。
- 最高不结露湿度：不用闭式，从 100% 往下逐个整数整夜重跑，第一个「包括起床那一刻在内一次都没结露」的就是。
- 结露临界室外温度：二分（60 轮），而不是反解。
输出 tests/ref.json：300 组随机 state + 期望字段。"""
import json, math, random, os

GLASS = {'single': 5.8, 'double': 2.8, 'lowe': 1.8, 'triple': 1.0}

def es(T):
    return 6.1094 * math.exp(17.625 * T / (T + 243.04))

def dewpoint(e):
    lo, hi = -80.0, 60.0
    for _ in range(200):
        mid = (lo + hi) / 2
        if es(mid) < e: lo = mid
        else: hi = mid
    return (lo + hi) / 2

def ts_of(U, curtain, ti, to):
    rsi = 0.30 if curtain else 0.13
    return ti - (ti - to) * rsi / (rsi + (1 / U - 0.13))

def run(c, rh):
    U, cur, dur = c['U'], c['curtain'], c['dur']
    e = rh / 100 * es(c['ti0'])
    hc = 1.0 if cur else 3.0
    beta = hc / (1.2 * 1006)
    starts = list(range(0, dur, 10))
    W = 0.0; peak = 0.0; first = None; wet = 0; frost = False; mints = None
    for i, t in enumerate(starts + [dur]):
        f = t / dur
        ti = c['ti0'] + (c['ti1'] - c['ti0']) * f
        to = c['to0'] + (c['to1'] - c['to0']) * f
        ts = ts_of(U, cur, ti, to)
        if mints is None or ts < mints: mints = ts
        cond = e > es(ts)
        if cond and first is None: first = t
        if t == dur: break
        dt = min(10, dur - t)
        if cond:
            wet += dt
            if ts < 0: frost = True
        g = beta * (e - es(ts)) * 100 / (461.5 * (ts + 273.15)) * 1000
        W = max(0.0, W + g * dt * 60)
        peak = max(peak, W * c['area'])
    return dict(water=W * c['area'], peak=peak, first=first, wetMin=wet, frost=frost, minTs=mints, td=dewpoint(e))

def case(rng):
    g = rng.choice(list(GLASS) + ['custom'])
    U = round(rng.uniform(0.6, 6.4), 1) if g == 'custom' else GLASS[g]
    cur = rng.random() < 0.5
    ti0 = rng.randint(14, 26); ti1 = ti0 - rng.choice([0, 0, 1, 2, 3, 4, -2, -4])
    to0 = rng.randint(-15, 8); to1 = to0 - rng.randint(0, 10) if rng.random() < 0.75 else to0 + rng.randint(1, 8)
    rh = rng.randint(20, 75)
    bh = rng.choice([21, 22, 23, 0]); bm = rng.choice([0, 15, 30, 45])
    dur = rng.randint(6, 54) * 10 + rng.choice([0, 0, 5])
    area = round(rng.uniform(0.5, 4.0), 1)
    wake = (bh * 60 + bm + dur) % 1440
    st = dict(name='屋', glass=g, U=str(U), curtain='on' if cur else 'off', ti0=str(ti0), ti1=str(ti1), rh=str(rh), to0=str(to0), to1=str(to1),
              bed='%02d:%02d' % (bh, bm), wake='%02d:%02d' % (wake // 60, wake % 60), area=str(area))
    c = dict(U=U, curtain=cur, ti0=ti0, ti1=ti1, to0=to0, to1=to1, dur=dur, area=area)
    r = run(c, rh)
    rhmax = 0
    for x in range(100, 0, -1):
        if run(c, x)['first'] is None: rhmax = x; break
    lo, hi = -200.0, 40.0
    e = rh / 100 * es(ti0)
    for _ in range(80):
        mid = (lo + hi) / 2
        if es(ts_of(U, cur, ti1, mid)) < e: lo = mid
        else: hi = mid
    r['rhMax'] = rhmax; r['toCrit'] = (lo + hi) / 2
    return st, r

rng = random.Random(20261118)
cases = []; stats = dict(dry=0, wet=0, frost=0, rh_zero=0, evaporated=0)
while len(cases) < 300:
    st, r = case(rng)
    cases.append(dict(state=st, expect=r))
    stats['dry' if r['wetMin'] == 0 else 'wet'] += 1
    stats['frost'] += r['frost']
    stats['rh_zero'] += r['rhMax'] == 0
    stats['evaporated'] += (r['wetMin'] > 0 and r['water'] < r['peak'] - 1e-9)
json.dump(dict(seed=20261118, stats=stats, cases=cases), open(os.path.join(os.path.dirname(__file__), 'ref.json'), 'w'), ensure_ascii=False)
print(stats)
