'use strict';
/* 注入测试：对 core.js 做一处小改动，看核心测试能不能抓到。跑完自动还原。
 * 首轮 22/33。没抓到的 11 个：最高湿度的 floor 与「往下修正」循环互相兜底 → 删循环；「d <= 0 → d < 0」是等价变异（0 分钟同样被 1～16 小时拦下）→ 删变异；
 * 改法前的四个守卫（湿度 ≥1、窗帘已拉上、室温会降、玻璃序号）都被「重算后真能更好才给」覆盖 → 从 core.js 删掉，变异改打在剩下的筛选上；
 * 薄雾标题、「7.05」时间写法、室温不降时不提湿度上涨三处 → 补测。
 * 第二轮 28/29：「rhMax < 当前湿度才试降湿」也是多余守卫（结露时 rhMax 必然小于当前湿度；rhMax=0 时 parse 拒绝）→ 删守卫与变异。 */
const fs=require('fs'),path=require('path'),{execFileSync}=require('child_process');
const F=path.join(__dirname,'../core.js'),src=fs.readFileSync(F,'utf8');
const M=[
["return 6.1094 * Math.exp(17.625 * T / (T + 243.04));","return 6.1094 * Math.exp(17.625 * T / (T + 273.15));"],
["return 243.04 * a / (17.625 - a);","return 243.04 * a / (17.625 + a);"],
["var rsi = P.curtain ? RSI_CURTAIN : RSI, rr = 1 / P.U - RSI;","var rsi = P.curtain ? RSI_CURTAIN : RSI, rr = 1 / P.U;"],
["return ti - (ti - to) * rsi / (rsi + rr);","return ti - (ti - to) * rsi / rr;"],
["var beta = (P.curtain ? HC_CURTAIN : HC) / RHO_CP;","var beta = HC / RHO_CP;"],
["/ (RV * (ts + 273.15)) * 1000","/ (RV * ts) * 1000"],
["var cond = e > es(ts);","var cond = e >= es(ts) - 0.01;"],
["W = Math.max(0, W + g * dt * 60);","W = W + Math.max(0, g) * dt * 60;"],
["var dt = Math.min(STEP, P.dur - t)","var dt = STEP"],
["if (cond) { wetMin += dt; if (ts < 0) frost = true; }","if (cond) { wetMin += dt; if (ts < -1) frost = true; }"],
["var f = t / P.dur, ti = P.ti0 + (P.ti1 - P.ti0) * f","var f = t / P.dur, ti = P.ti0"],
["var e = P.rh / 100 * es(P.ti0)","var e = P.rh / 100 * es(P.ti1)"],
["var x = Math.floor(100 * lo / es(P.ti0));","var x = Math.round(100 * lo / es(P.ti0));"],
["return P.ti1 - (P.ti1 - n.td) / k;","return P.ti0 - (P.ti0 - n.td) / k;"],
["if (d < 60 || d > 960)","if (d > 960)"],
["if (h > 23 || mi > 59) return NaN;",""],
["P.rh = need(st.rh, 'rh', 1, 100,","P.rh = need(st.rh, 'rh', 0, 100,"],
["P.U = P.glass === 'custom' ? need(st.U, 'U', 0.5, 6.5","P.U = P.glass === 'custom' ? need(st.U, 'U', 0, 6.5"],
["return g.U < P.U; })[0];","return g.U <= P.U; })[0];"],
["if ((e2.first === null) || e2.wetMin < n.wetMin || e2.peak < n.peak - 1e-9) {","{"],
["if (n.first === null) return P.name + '这一晚玻璃不会结露","if (n.wetMin === 0) return P.name + '这一晚玻璃不会结露"],
["if (n.water < 0.5) return","if (false) return"],
["if (Number(s) === 0) neg = false;",""],
["P.name = String(st.name == null ? '' : st.name).slice(0, 12).trim()","P.name = String(st.name == null ? '' : st.name).trim()"],
["if (/^[=+\\-@]/.test(x) && !/^-?\\d+(\\.\\d+)?$/.test(x)) x = \"'\" + x;",""],
["s = half(s).replace(/[：.]/g, ':');","s = half(s);"],
["replace(/[−–—]/g, '-')","replace(/[–—]/g, '-')"],
["if (P.ti1 !== P.ti0) s += '夜里室温降到","if (true) s += '夜里室温降到"],
["if (n.water / P.area > 300) s +=","if (n.water / P.area > 3000) s +="],
];
let caught=0;const rows=[];
for(const [a,b] of M){
  if(src.indexOf(a)<0){rows.push('✗ 找不到原文：'+a.slice(0,80));continue;}
  fs.writeFileSync(F,src.replace(a,b));
  let ok=true;try{execFileSync('node',['--test',path.join(__dirname,'core.test.cjs')],{stdio:'pipe',timeout:120000});}catch(e){ok=false;}
  rows.push((ok?'✗ 没抓到':'✓ 抓到')+'：'+a.slice(0,70)+' → '+b.slice(0,70));if(!ok)caught++;
}
fs.writeFileSync(F,src);
console.log(rows.join('\n'));console.log('合计 '+caught+'/'+M.length);
