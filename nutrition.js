"use strict";
// ================= Iron Log: Food module =================
// Loaded before the main inline script. Uses globals from index.html at call time:
// sb, auth, render, toast, esc, dayKey, fmtDate, sessions, whoopDays, whoopBody, scheduleFor, tab.

const FDC_KEY = "DEMO_KEY"; // api.data.gov key; DEMO_KEY is rate limited (~30 req/hr per IP)
const LIB_ZXING = "https://cdn.jsdelivr.net/npm/@zxing/browser@0.2.1/umd/zxing-browser.min.js";
const LIB_TESS = "https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js";

const MEAL_TYPES = [
  ["breakfast","Breakfast"], ["lunch","Lunch"], ["dinner","Dinner"],
  ["snack","Snacks"], ["pre_workout","Pre-workout"], ["post_workout","Post-workout"]
];
const GOAL_MODES = [
  ["cut","Cut"], ["recomp","Recomp"], ["maintain","Maintain"], ["lean_gain","Lean gain"], ["clinical_hold","Clinical hold"]
];
const NI = { // stroke icons, 24 viewBox, inherit currentColor
  breakfast:'<path d="M4 8h12v6a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5z"/><path d="M16 10h2a2 2 0 0 1 0 4h-2"/><path d="M8 3v2M12 3v2"/>',
  lunch:'<path d="M4 10a8 5.5 0 0 1 16 0z"/><path d="M3 13.5h18"/><path d="M4 16.5h16v.5a2.5 2.5 0 0 1-2.5 2.5h-11A2.5 2.5 0 0 1 4 17z"/>',
  dinner:'<path d="M3 11h18a9 7.5 0 0 1-18 0z"/><path d="M8.5 7.5c0-2 2-2 2-4.5M13.5 7.5c0-2 2-2 2-4.5"/>',
  snack:'<circle cx="12" cy="12" r="9"/><circle cx="9" cy="10" r="1.1"/><circle cx="14.5" cy="14" r="1.1"/><circle cx="14.5" cy="8.5" r=".8"/><circle cx="9" cy="15.5" r=".8"/>',
  pre_workout:'<path d="M13 2 4.5 13.5h6.5l-1 8.5 8.5-11.5H12z"/>',
  post_workout:'<path d="M6.5 7v10M17.5 7v10M3.5 9.5v5M20.5 9.5v5M6.5 12h11"/>',
  flame:'<path d="M12 2.5c1 3 5.5 5 5.5 10.5a5.5 5.5 0 0 1-11 0c0-2.3 1-3.6 2.2-4.6 0 2 1 3.1 2.2 3.1 0-3.3-1.2-6 1.1-9z"/>',
  swap:'<path d="M5 8h13l-3.5-3.5M19 16H6l3.5 3.5"/>',
  dots:'<circle cx="5" cy="12" r="1.6" fill="currentColor"/><circle cx="12" cy="12" r="1.6" fill="currentColor"/><circle cx="19" cy="12" r="1.6" fill="currentColor"/>',
  barcode:'<path d="M4 5v14M7 5v14M10.5 5v14M13 5v14M16.5 5v14M20 5v14"/>',
  label:'<rect x="5" y="3" width="14" height="18" rx="2"/><path d="M8 7h8M8 10.5h8M8 14h5M8 17.5h3"/>',
  pencil:'<path d="M4 20h4L19.5 8.5l-4-4L4 16z"/><path d="M13.5 6.5l4 4"/>',
  back:'<path d="M15 5l-7 7 7 7"/>',
  caret:'<path d="M7 10l5 5 5-5z" fill="currentColor" stroke="none"/>',
  bowl:'<path d="M3 11h18a9 7.5 0 0 1-18 0z"/><path d="M7 7h10"/>',
  plus:'<path d="M12 5v14M5 12h14"/>',
};
const nIcon = (k, s) => '<svg class="nic" width="'+(s||22)+'" height="'+(s||22)+'" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'+(NI[k]||"")+'</svg>';

const nut = {
  day: null, meals: [], goal: null, dexa: null, pnoe: null, recent: [], recipes: [], week: {},
  loadedFor: null, weekFor: null, loading: false,
  view: null,            // null | add | pick | label | recipe
  target: null,          // {kind:"meal", type} | {kind:"recipe"}
  addTab: "recent",      // recent | meals
  results: [], pick: null, qty: "1", unit: "serving",
  manual: { name:"", kcal:"", p:"", c:"", f:"" }, showManual: false,
  label: null,           // {status, form, img, barcode}
  recipe: null,          // draft {id, name, servings, items:[]}
  macroLeft: false, menuFor: null,
  goalEdit: false, draftMode: null, dayTypeOverride: {},
};

(function injectFoodCss(){
  const css = `
  .ntop { display:flex; align-items:center; justify-content:space-between; gap:12px; margin:4px 2px 14px; }
  .ntitle { position:relative; display:flex; align-items:center; gap:4px; color:#fff; font-size:30px; font-weight:900; letter-spacing:-.02em; }
  .ntitle .nic { color:var(--dim); }
  .ntitle input { position:absolute; inset:0; width:100%; height:100%; opacity:0; border:0; font-size:16px; }
  .nburn { display:flex; align-items:center; gap:7px; padding:8px 14px 8px 11px; border-radius:99px; background:rgba(var(--accent-rgb),.14); border:1px solid rgba(var(--accent-rgb),.35); color:#fff; }
  .nburn .nic { color:var(--accent-hi); }
  .nburn b { font-size:16px; } .nburn span { color:var(--dim); font-size:11.5px; font-weight:700; text-transform:uppercase; letter-spacing:.05em; }
  .nweek { display:grid; grid-template-columns:repeat(7,1fr); gap:2px; margin:0 0 14px; }
  .nwd { display:flex; flex-direction:column; align-items:center; gap:6px; padding:4px 0; border:0; background:none; color:var(--dim); font-size:13px; font-weight:700; }
  .nwd .dot { width:5px; height:5px; border-radius:9px; background:transparent; }
  .nwd.sel { color:#fff; } .nwd.sel .dot { background:var(--accent); }
  .nwd.fut { opacity:.35; }
  .nwd svg { display:block; }
  .ncard { border-radius:20px; padding:18px; margin-bottom:12px; background:linear-gradient(145deg,rgba(28,28,28,.92),rgba(17,17,17,.88)); border:1px solid var(--border); position:relative; }
  .ncal .nl { color:var(--dim); font-size:14px; font-weight:700; display:flex; justify-content:space-between; }
  .ncal .nrow { display:flex; justify-content:space-between; align-items:baseline; margin:8px 0 14px; }
  .ncal .big { color:#fff; font-size:28px; font-weight:900; } .ncal .big small { color:var(--dim); font-size:15px; font-weight:700; }
  .ncal .left { color:#fff; font-size:20px; font-weight:800; } .ncal .left small { color:var(--dim); font-size:13px; font-weight:700; margin-left:3px; }
  .ntrack { height:9px; border-radius:99px; background:rgba(255,255,255,.08); overflow:hidden; }
  .nfill { height:100%; border-radius:99px; background:linear-gradient(90deg,var(--accent-deep),var(--accent-hi)); transition:width .5s ease; }
  .over .nfill { background:var(--warn); }
  .nmac { display:grid; grid-template-columns:repeat(3,1fr); gap:14px; padding-top:22px; }
  .nmac .ml { color:var(--dim); font-size:13.5px; font-weight:700; }
  .nmac .mv { color:#fff; font-size:19px; font-weight:900; margin:5px 0 10px; } .nmac .mv small { color:var(--dim); font-size:13px; font-weight:700; }
  .nswap { position:absolute; top:10px; right:10px; width:36px; height:36px; border-radius:99px; border:0; background:rgba(255,255,255,.07); color:var(--text); display:grid; place-items:center; }
  .nsec { display:flex; justify-content:space-between; align-items:center; margin:20px 2px 10px; }
  .nsec h2 { color:#fff; font-size:20px; font-weight:900; margin:0; }
  .nsec button { border:0; background:none; color:var(--accent-hi); font-size:15px; font-weight:800; }
  .nmeal { border-radius:18px; padding:14px 14px 14px 16px; margin-bottom:10px; background:linear-gradient(145deg,rgba(28,28,28,.92),rgba(17,17,17,.88)); border:1px solid var(--border); }
  .nmh { display:flex; align-items:center; gap:14px; }
  .nmh .nic { color:var(--accent-hi); flex:none; }
  .nmh .nmn { flex:1; min-width:0; } .nmh .nmn b { display:block; color:#fff; font-size:17px; font-weight:700; } .nmh .nmn span { color:var(--dim); font-size:12.5px; }
  .ndots { width:40px; height:40px; border:0; border-radius:99px; background:none; color:var(--dim); display:grid; place-items:center; }
  .nlog { min-width:68px; min-height:40px; padding:0 18px; border:0; border-radius:99px; background:rgba(var(--accent-rgb),.18); color:var(--accent-hi); font-size:16px; font-weight:800; }
  .nmenu { display:flex; gap:8px; margin-top:10px; }
  .nmenu button { flex:1; min-height:40px; border-radius:12px; border:1px solid var(--border2); background:rgba(255,255,255,.04); color:var(--text); font-weight:700; font-size:13.5px; }
  .nitem { display:flex; justify-content:space-between; align-items:center; gap:10px; padding:9px 0 0; margin-top:9px; border-top:1px solid rgba(255,255,255,.06); font-size:13.5px; }
  .nitem .nn { min-width:0; } .nitem .nn b { display:block; color:var(--text); font-weight:700; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
  .nitem .nn span { color:var(--dim); font-size:12px; }
  .nitem .nm { text-align:right; white-space:nowrap; font-weight:800; color:#fff; }
  .nhead { display:flex; align-items:center; gap:8px; margin:2px 0 14px; }
  .nhead button.nb { width:42px; height:42px; border-radius:99px; border:0; background:rgba(255,255,255,.07); color:#fff; display:grid; place-items:center; flex:none; }
  .nhead h2 { flex:1; color:#fff; font-size:21px; font-weight:900; margin:0; }
  .ntiles { display:grid; grid-template-columns:repeat(3,1fr); gap:8px; margin-bottom:12px; }
  .ntile { display:flex; flex-direction:column; align-items:center; gap:7px; padding:14px 6px; border-radius:16px; border:1px solid rgba(var(--accent-rgb),.3); background:rgba(var(--accent-rgb),.1); color:#fff; font-size:13px; font-weight:800; }
  .ntile .nic { color:var(--accent-hi); }
  .ninput { width:100%; min-height:46px; padding:0 14px; border-radius:13px; border:1px solid var(--border2); background:rgba(0,0,0,.28); color:var(--text); font-size:16px; }
  .ninput:focus { border-color:var(--accent); outline:none; }
  .nsearch { display:grid; grid-template-columns:1fr auto; gap:8px; }
  .nseg { display:flex; gap:6px; margin:12px 0 4px; }
  .nseg button { flex:1; min-height:38px; border-radius:11px; border:1px solid var(--border2); background:none; color:var(--dim); font-weight:800; font-size:13.5px; }
  .nseg button.on { border-color:var(--accent); background:rgba(var(--accent-rgb),.16); color:#fff; }
  .nres button.nr { display:flex; justify-content:space-between; gap:10px; align-items:center; width:100%; text-align:left; padding:11px 2px; border:0; border-top:1px solid rgba(255,255,255,.06); background:none; color:var(--text); font-size:14px; }
  .nres .nr b { display:block; font-weight:700; } .nres .nr span { color:var(--dim); font-size:12px; } .nres .nr .k { color:#fff; font-weight:800; white-space:nowrap; }
  .nsrc { display:inline-block; margin-left:6px; padding:1px 6px; border-radius:6px; background:rgba(255,255,255,.07); color:var(--dim); font-size:10px; font-weight:800; letter-spacing:.04em; text-transform:uppercase; vertical-align:1px; }
  .ngrid { display:grid; grid-template-columns:1fr 1fr; gap:8px; margin-top:10px; }
  .ngrid .wide { grid-column:1 / -1; }
  .ngrid label { display:block; color:var(--dim); font-size:11px; font-weight:800; text-transform:uppercase; letter-spacing:.06em; margin:0 0 4px 2px; }
  .nmacrow { display:grid; grid-template-columns:repeat(4,1fr); gap:6px; margin-top:12px; text-align:center; }
  .nmacrow div { padding:10px 2px; border-radius:12px; background:rgba(255,255,255,.04); }
  .nmacrow b { display:block; color:#fff; font-size:17px; } .nmacrow span { color:var(--dim); font-size:11px; font-weight:700; text-transform:uppercase; }
  .nwhy { margin-top:8px; color:var(--dim); font-size:12px; line-height:1.5; }
  .nwarn { margin-top:10px; padding:10px 12px; border-radius:12px; background:rgba(251,191,36,.08); color:var(--warn); font-size:12.5px; line-height:1.45; }
  .nbtnrow { display:flex; gap:8px; align-items:center; flex-wrap:wrap; margin-top:14px; }
  .nimg { width:100%; max-height:220px; object-fit:contain; border-radius:12px; margin-top:10px; background:#000; }
  .nrec { display:flex; justify-content:space-between; align-items:center; gap:10px; width:100%; text-align:left; padding:14px 16px; margin-bottom:10px; border-radius:18px; border:1px solid var(--border); background:linear-gradient(145deg,rgba(28,28,28,.92),rgba(17,17,17,.88)); color:var(--text); }
  .nrec .nic { color:var(--accent-hi); }
  .nrec b { display:block; color:#fff; font-size:16px; } .nrec span { color:var(--dim); font-size:12.5px; }
  .nscan { position:fixed; inset:0; z-index:9999; background:#000; display:flex; flex-direction:column; }
  .nscan video { flex:1; width:100%; object-fit:cover; }
  .nscan .guide { position:absolute; left:10%; right:10%; top:36%; height:22%; border:3px solid var(--accent); border-radius:16px; box-shadow:0 0 0 9999px rgba(0,0,0,.45); pointer-events:none; }
  .nscan .bar { position:absolute; left:0; right:0; bottom:0; padding:18px 16px calc(18px + env(safe-area-inset-bottom)); display:grid; gap:10px; background:linear-gradient(transparent,rgba(0,0,0,.85) 30%); }
  .nscan .msg { color:#fff; text-align:center; font-weight:700; }
  .nscan .row { display:grid; grid-template-columns:1fr auto; gap:8px; }
  .nscan .x { min-height:48px; border-radius:13px; border:1px solid rgba(255,255,255,.25); background:rgba(255,255,255,.08); color:#fff; font-weight:800; }
  `;
  try { const s = document.createElement("style"); s.textContent = css; document.head.appendChild(s); } catch(e){}
})();

// ---------- helpers ----------
const r0 = n => Math.round(Number(n)||0);
const r1 = n => Math.round((Number(n)||0)*10)/10;
const nNum = n => r0(n).toLocaleString();
const nDate = d => fmtDate(String(d).length===10 ? d+"T12:00:00" : d);
function nDayOffset(day, n){ const d = new Date(day+"T12:00:00"); d.setDate(d.getDate()+n); return dayKey(d); }
function nDayLabel(day){
  const today = dayKey();
  if (day===today) return "Today";
  if (day===nDayOffset(today,-1)) return "Yesterday";
  return new Date(day+"T12:00:00").toLocaleDateString(undefined,{weekday:"short", month:"short", day:"numeric"});
}
function nWeekDays(day){
  const d = new Date(day+"T12:00:00"); const start = nDayOffset(day, -d.getDay());
  return [0,1,2,3,4,5,6].map(i=>nDayOffset(start,i));
}
function nIsTrainingDay(day){
  if (nut.dayTypeOverride[day]) return nut.dayTypeOverride[day]==="train";
  const logged = (typeof sessions!=="undefined" ? sessions : []).some(s=>s && s.workout!=="ACT" && dayKey(new Date(s.date))===day);
  if (logged) return true;
  try { return !!scheduleFor(new Date(day+"T12:00:00").getDay()); } catch(e){ return false; }
}
function nSum(items){
  const t = { kcal:0, p:0, c:0, f:0, fiber:0 };
  (items||[]).forEach(i=>{ t.kcal += +i.kcal||0; t.p += +i.protein_g||0; t.c += +i.carb_g||0; t.f += +i.fat_g||0; t.fiber += +i.fiber_g||0; });
  return t;
}
function nTotals(){ return nSum(nut.meals.flatMap(m=>m.meal_items||[])); }
function nBurned(day){
  const w = (typeof whoopDays!=="undefined" ? whoopDays : []).find(d=>d && d.day===day);
  return w && w.calories>0 ? +w.calories : null;
}
function nTimeout(p, ms){ return Promise.race([p, new Promise((_,rej)=>setTimeout(()=>rej(new Error("timeout")), ms))]); }
const nScripts = {};
function nLoadScript(src, globalName){
  if (globalName && window[globalName]) return Promise.resolve(window[globalName]);
  if (!nScripts[src]) nScripts[src] = new Promise((res, rej)=>{
    const s = document.createElement("script"); s.src = src; s.async = true;
    s.onload = ()=>res(globalName ? window[globalName] : true);
    s.onerror = ()=>{ delete nScripts[src]; rej(new Error("load "+src)); };
    document.head.appendChild(s);
  });
  return nScripts[src];
}
function nTitle(s){ return s.length>3 && s===s.toUpperCase() ? s.toLowerCase().replace(/\b\w/g,c=>c.toUpperCase()) : s; }

// ---------- goal engine ----------
// Inputs: latest DEXA lean mass, measured RMR (PNOE), WHOOP daily calories split by training vs rest days.
function nComputeGoal(mode){
  const why = [];
  const lean = nut.dexa && nut.dexa.lean_mass_lb ? +nut.dexa.lean_mass_lb : null;
  const wt = nut.dexa && nut.dexa.weight_lb ? +nut.dexa.weight_lb
    : (typeof whoopBody!=="undefined" && whoopBody && whoopBody.weight_kg ? whoopBody.weight_kg*2.2046 : null);
  let rmr = nut.pnoe && nut.pnoe.rmr_kcal ? +nut.pnoe.rmr_kcal : null;
  if (rmr) why.push("RMR "+rmr+" kcal (PNOE "+nDate(nut.pnoe.measured_on)+")");
  else if (lean){ rmr = Math.round(370 + 21.6*(lean/2.2046)); why.push("RMR "+rmr+" kcal (Katch-McArdle from DEXA lean mass)"); }
  else if (wt){ rmr = Math.round(wt*11); why.push("RMR "+rmr+" kcal (bodyweight estimate, no DEXA or PNOE on file)"); }
  else { rmr = 2000; why.push("RMR 2000 kcal default. Add a DEXA or PNOE result for real numbers."); }

  const today = dayKey();
  const days = (typeof whoopDays!=="undefined" ? whoopDays : []).filter(d=>d && d.calories>0 && d.day<today).slice(-28);
  const tr = [], rs = [];
  days.forEach(d=>{ (nIsTrainingDay(d.day) ? tr : rs).push(+d.calories); });
  const avg = a => a.length ? a.reduce((x,y)=>x+y,0)/a.length : null;
  let tdeeT = avg(tr), tdeeR = avg(rs);
  const floor = rmr*1.2;
  if (tr.length>=4 && rs.length>=3) why.push("Burn from WHOOP: "+r0(tdeeT)+" training / "+r0(tdeeR)+" rest ("+days.length+" days)");
  else if (days.length>=5){ const all = avg(days.map(d=>+d.calories)); tdeeT = all*1.06; tdeeR = all*0.92;
    why.push("Burn from WHOOP average "+r0(all)+" kcal, split estimated (not enough of each day type yet)"); }
  else { tdeeT = rmr*1.55; tdeeR = rmr*1.35; why.push("Burn estimated from RMR (no recent WHOOP calories)"); }
  tdeeT = Math.max(tdeeT, floor); tdeeR = Math.max(tdeeR, floor);

  const adj = { cut:[-400,-500], recomp:[0,-250], maintain:[0,0], lean_gain:[350,150], clinical_hold:[0,0] }[mode] || [0,0];
  const kcalT = Math.round((tdeeT+adj[0])/10)*10, kcalR = Math.round((tdeeR+adj[1])/10)*10;
  if (adj[0]||adj[1]) why.push("Mode adjustment: "+(adj[0]>=0?"+":"")+adj[0]+" training / "+(adj[1]>=0?"+":"")+adj[1]+" rest");

  let protein, cap = null;
  if (lean){ protein = Math.round(lean * (mode==="cut" ? 1.1 : 1.0)); why.push("Protein "+(mode==="cut"?"1.1":"1.0")+" g per lb DEXA lean mass ("+r1(lean)+" lb)"); }
  else if (wt){ protein = Math.round(wt*0.8); why.push("Protein 0.8 g per lb bodyweight (no DEXA)"); }
  else protein = 160;
  if (mode==="clinical_hold"){
    cap = Math.round(((wt||200)/2.2046)*1.6);
    if (protein > cap) protein = cap;
    why.push("Clinical hold: maintenance calories, protein capped at "+cap+" g (1.6 g/kg). Confirm the cap with your provider.");
  }
  const fat = Math.round((kcalR*0.28)/9);
  const carbT = Math.max(0, Math.round((kcalT - protein*4 - fat*9)/4));
  const carbR = Math.max(0, Math.round((kcalR - protein*4 - fat*9)/4));
  why.push("Fat 28% of rest-day calories; carbs fill the rest, higher on training days");
  return { mode, kcal_train:kcalT, kcal_rest:kcalR, protein_g:protein, carb_g_train:carbT, carb_g_rest:carbR, fat_g:fat, protein_cap_g:cap,
    inputs:{ rmr, lean_lb:lean, weight_lb:wt, tdee_train:r0(tdeeT), tdee_rest:r0(tdeeR), whoop_days:days.length,
             dexa_date: nut.dexa ? nut.dexa.measured_on : null, pnoe_date: nut.pnoe ? nut.pnoe.measured_on : null, why } };
}
function nTargetsFor(day){
  const g = nut.goal; if (!g) return null;
  const train = nIsTrainingDay(day);
  return { train, kcal: train ? g.kcal_train : g.kcal_rest, p: g.protein_g, c: train ? g.carb_g_train : g.carb_g_rest, f: g.fat_g };
}

// ---------- data ----------
async function nLoad(force){
  if (!auth) return;
  if (!nut.day) nut.day = dayKey();
  if (!force && nut.loadedFor===nut.day) return;
  nut.loading = true;
  const uid = auth.uid, day = nut.day, wk = nWeekDays(day);
  const needStatic = force || !nut.staticLoaded;
  try {
    const reqs = [
      sb("/rest/v1/meals?select=*,meal_items(*)&user_id=eq."+uid+"&eaten_on=eq."+day+"&order=eaten_at.asc"),
      sb("/rest/v1/nutrition_goals?select=*&user_id=eq."+uid+"&effective_from=lte."+day+"&order=effective_from.desc&limit=1"),
      sb("/rest/v1/nutrition_daily?select=eaten_on,kcal&user_id=eq."+uid+"&eaten_on=gte."+wk[0]+"&eaten_on=lte."+wk[6]),
    ];
    if (needStatic) reqs.push(
      sb("/rest/v1/body_comp?select=*&user_id=eq."+uid+"&order=measured_on.desc&limit=20"),
      sb("/rest/v1/meal_items?select=name,food_id,recipe_id,servings,grams,kcal,protein_g,carb_g,fat_g,fiber_g&user_id=eq."+uid+"&order=created_at.desc&limit=60"),
      sb("/rest/v1/recipes?select=*,recipe_items(*)&user_id=eq."+uid+"&order=updated_at.desc"));
    const [m, g, w, bc, rc, rp] = await Promise.all(reqs);
    if (m.ok){ nut.meals = await m.json(); nut.meals.forEach(x=>(x.meal_items||[]).sort((a,b)=>a.created_at<b.created_at?-1:1)); }
    if (g.ok){ const rows = await g.json(); nut.goal = rows[0]||null; }
    if (w.ok){ nut.week = {}; (await w.json()).forEach(r=>{ nut.week[r.eaten_on] = +r.kcal; }); }
    if (bc && bc.ok){ const rows = await bc.json();
      nut.dexa = rows.find(r=>r.method==="dexa" && r.lean_mass_lb) || null;
      nut.pnoe = rows.find(r=>r.method==="pnoe" && r.rmr_kcal) || null; }
    if (rc && rc.ok){ const rows = await rc.json(), seen = {};
      nut.recent = rows.filter(r=>{ const k=r.name.toLowerCase(); if (seen[k]) return false; seen[k]=1; return true; }).slice(0,12); }
    if (rp && rp.ok){ nut.recipes = await rp.json(); nut.recipes.forEach(r=>(r.recipe_items||[]).sort((a,b)=>a.position-b.position)); }
    if (needStatic) nut.staticLoaded = true;
    nut.loadedFor = day;
  } catch(e){ toast("Couldn’t load food log."); }
  nut.loading = false;
  if (tab==="food") render();
}
function nSetDay(d){
  if (!d || d>dayKey()) return;
  nut.day = d; nut.meals = []; nut.loadedFor = null; nut.menuFor = null; render(); nLoad();
}
function nSyncWeek(){ nut.week[nut.day] = nTotals().kcal; }

async function nEnsureMeal(type){
  let m = nut.meals.find(x=>x.meal_type===type);
  if (m) return m;
  const r = await sb("/rest/v1/meals", { method:"POST", headers:{ Prefer:"return=representation" },
    body:{ user_id:auth.uid, eaten_on:nut.day, meal_type:type } });
  if (!r.ok) throw new Error("meal "+r.status);
  m = (await r.json())[0]; m.meal_items = [];
  nut.meals.push(m);
  return m;
}

// ---------- food objects ----------
// Unified food: {source, source_id, barcode, food_id, recipe_id, name, brand, serving_g, serving_label, per:{kcal,p,c,f,fiber}} where per = one serving.
function nFromPer100(base, per100, servingG, servingLabel){
  const sg = servingG>0 ? servingG : 100;
  const k = sg/100;
  return Object.assign(base, { serving_g: sg, serving_label: servingLabel || (servingG>0 ? null : "100 g"),
    per:{ kcal:+per100.kcal*k, p:+per100.p*k, c:+per100.c*k, f:+per100.f*k, fiber: per100.fiber!=null ? +per100.fiber*k : null } });
}
function nNormUsda(f){
  const by = {};
  (f.foodNutrients||[]).forEach(n=>{ if (n.nutrientNumber!=null) by[String(n.nutrientNumber)] = n.value; if (n.nutrientId!=null) by[n.nutrientId] = n.value; });
  const p = by["203"] ?? by[1003] ?? 0, c = by["205"] ?? by[1005] ?? 0, fat = by["204"] ?? by[1004] ?? 0;
  let kcal = by["208"] ?? by[1008] ?? by["957"] ?? by[2047] ?? by["958"] ?? by[2048];
  if (kcal==null) kcal = p*4 + c*4 + fat*9;
  const u = (f.servingSizeUnit||"").toLowerCase();
  const sg = (u==="g"||u==="grm") && +f.servingSize>0 ? +f.servingSize : null;
  return nFromPer100({ source:"usda", source_id:String(f.fdcId), barcode: f.gtinUpc || null,
    name: nTitle(f.description||"Food"), brand: f.brandOwner || f.brandName || "" },
    { kcal, p, c, f:fat, fiber: by["291"] ?? by[1079] ?? null }, sg, f.householdServingFullText || null);
}
function nNormOff(p){
  const n = p.nutriments||{};
  const kcal = n["energy-kcal_100g"] ?? (n["energy_100g"]!=null ? n["energy_100g"]/4.184 : null);
  if (kcal==null) return null;
  return nFromPer100({ source:"off", source_id:String(p.code||""), barcode: p.code || null,
    name: p.product_name || "Product", brand: (p.brands||"").split(",")[0].trim() },
    { kcal, p:n.proteins_100g||0, c:n.carbohydrates_100g||0, f:n.fat_100g||0, fiber: n.fiber_100g!=null ? n.fiber_100g : null },
    +p.serving_quantity>0 ? +p.serving_quantity : null, p.serving_size || null);
}
function nFromRow(row){
  return { source:row.source, source_id:row.source_id, barcode:row.barcode, food_id:row.id, name:row.name, brand:row.brand||"",
    serving_g: row.serving_g ? +row.serving_g : null, serving_label: row.serving_unit && row.serving_unit!=="serving" ? row.serving_unit : null,
    per:{ kcal:+row.kcal, p:+row.protein_g, c:+row.carb_g, f:+row.fat_g, fiber: row.fiber_g!=null ? +row.fiber_g : null } };
}
function nFromRecipe(rec){
  const t = nSum(rec.recipe_items), s = +rec.servings||1;
  return { source:"recipe", recipe_id:rec.id, name:rec.name, brand:"", serving_g:null, serving_label:"1 meal",
    per:{ kcal:t.kcal/s, p:t.p/s, c:t.c/s, f:t.f/s, fiber:t.fiber/s } };
}
async function nCacheFood(f){
  if (f.food_id || f.source==="recipe") return f.food_id || null;
  try {
    if (f.source_id){
      const q = await sb("/rest/v1/foods?select=id&source=eq."+f.source+"&source_id=eq."+encodeURIComponent(f.source_id)+"&limit=1");
      if (q.ok){ const rows = await q.json(); if (rows[0]) return (f.food_id = rows[0].id); }
    }
    const r = await sb("/rest/v1/foods", { method:"POST", headers:{ Prefer:"return=representation" }, body:{
      barcode: f.barcode || null, source: f.source, source_id: f.source_id || null, name: f.name.slice(0,200), brand: f.brand || null,
      serving_qty:1, serving_unit: f.serving_label || (f.serving_g ? r0(f.serving_g)+" g" : "serving"), serving_g: f.serving_g || null,
      kcal: r1(f.per.kcal), protein_g: r1(f.per.p), carb_g: r1(f.per.c), fat_g: r1(f.per.f),
      fiber_g: f.per.fiber!=null ? r1(f.per.fiber) : null, created_by: auth.uid } });
    if (r.ok){ const rows = await r.json(); if (rows[0]) return (f.food_id = rows[0].id); }
    if (r.status===409 && f.barcode){ // barcode already cached by someone else
      const q = await sb("/rest/v1/foods?select=id&barcode=eq."+encodeURIComponent(f.barcode)+"&limit=1");
      if (q.ok){ const rows = await q.json(); if (rows[0]) return (f.food_id = rows[0].id); }
    }
  } catch(e){}
  return null;
}
function nScaled(f, qty, unit){
  const q = parseFloat(qty)||0;
  const factor = unit==="g" && f.serving_g ? q/f.serving_g : q;
  const grams = unit==="g" ? q : (f.serving_g ? q*f.serving_g : null);
  return { factor, grams: grams!=null ? r1(grams) : null, kcal:r1(f.per.kcal*factor), protein_g:r1(f.per.p*factor), carb_g:r1(f.per.c*factor),
    fat_g:r1(f.per.f*factor), fiber_g: f.per.fiber!=null ? r1(f.per.fiber*factor) : null };
}
function nServingText(f){
  if (f.source==="recipe") return "1 meal";
  if (f.serving_label && f.serving_g) return f.serving_label+" ("+r0(f.serving_g)+" g)";
  return f.serving_label || (f.serving_g ? r0(f.serving_g)+" g" : "1 serving");
}

// ---------- logging ----------
async function nLogItem(item){
  try {
    const m = await nEnsureMeal(nut.target.type);
    const r = await sb("/rest/v1/meal_items", { method:"POST", headers:{ Prefer:"return=representation" },
      body: Object.assign({ meal_id:m.id, user_id:auth.uid }, item) });
    if (!r.ok) throw new Error("item "+r.status);
    const row = (await r.json())[0];
    m.meal_items = (m.meal_items||[]).concat([row]);
    nut.recent = [row].concat(nut.recent.filter(x=>x.name.toLowerCase()!==row.name.toLowerCase())).slice(0,12);
    nSyncWeek(); nResetAdd(); toast("Logged "+row.name+"."); render();
  } catch(e){ toast("Couldn’t save that item."); }
}
function nResetAdd(){
  nut.view = nut.target && nut.target.kind==="recipe" ? "recipe" : null;
  if (nut.view!=="recipe"){ nut.target = null; nut.recipe = null; }
  nut.pick = null; nut.qty = "1"; nut.unit = "serving"; nut.results = []; nut.showManual = false; nut.label = null;
  nut.manual = { name:"", kcal:"", p:"", c:"", f:"" };
}
async function nAddFood(f, qty, unit, method){
  const s = nScaled(f, qty, unit);
  if (!(s.factor>0)){ toast("Enter an amount."); return; }
  const name = (f.brand && f.source!=="recipe" ? f.brand+" " : "")+f.name;
  if (nut.target.kind==="recipe"){
    nut.recipe.items.push({ name, food_id: f.food_id || null, qty: r1(parseFloat(qty)), unit: unit==="g" ? "g" : "serving",
      grams: s.grams, kcal:s.kcal, protein_g:s.protein_g, carb_g:s.carb_g, fat_g:s.fat_g, fiber_g:s.fiber_g, _f:f });
    nut.recipe._dirty = true;
    nCacheFood(f).then(id=>{ const it = nut.recipe && nut.recipe.items.find(x=>x._f===f); if (it && id) it.food_id = id; });
    nResetAdd(); render(); return;
  }
  const food_id = await nCacheFood(f);
  nLogItem({ name, food_id, recipe_id: f.recipe_id || null, grams: s.grams, servings: r1(s.factor), kcal:s.kcal, protein_g:s.protein_g,
    carb_g:s.carb_g, fat_g:s.fat_g, fiber_g:s.fiber_g, entry_method: method || "search" });
}
async function nDeleteItem(mealId, itemId){
  const m = nut.meals.find(x=>x.id===mealId); if (!m) return;
  const keep = m.meal_items;
  m.meal_items = keep.filter(i=>i.id!==itemId); nSyncWeek(); render();
  try {
    const r = await sb("/rest/v1/meal_items?id=eq."+itemId, { method:"DELETE" });
    if (!r.ok) throw new Error();
    if (!m.meal_items.length){ await sb("/rest/v1/meals?id=eq."+m.id, { method:"DELETE" }); nut.meals = nut.meals.filter(x=>x.id!==m.id); render(); }
  } catch(e){ m.meal_items = keep; nSyncWeek(); render(); toast("Couldn’t delete."); }
}
async function nClearMeal(type){
  const m = nut.meals.find(x=>x.meal_type===type); nut.menuFor = null;
  if (!m){ render(); return; }
  if (!confirm("Clear everything logged for this meal?")) { render(); return; }
  nut.meals = nut.meals.filter(x=>x!==m); nSyncWeek(); render();
  try { const r = await sb("/rest/v1/meals?id=eq."+m.id, { method:"DELETE" }); if (!r.ok) throw new Error(); }
  catch(e){ nut.meals.push(m); nSyncWeek(); render(); toast("Couldn’t clear."); }
}
async function nSaveGoal(){
  const g = nComputeGoal(nut.draftMode || (nut.goal && nut.goal.mode) || "maintain");
  const body = Object.assign({ user_id:auth.uid, effective_from:dayKey(), set_by:auth.uid }, g);
  try {
    const r = await sb("/rest/v1/nutrition_goals?on_conflict=user_id,effective_from", { method:"POST",
      headers:{ Prefer:"resolution=merge-duplicates,return=representation" }, body });
    if (!r.ok) throw new Error(r.status);
    nut.goal = (await r.json())[0]; nut.goalEdit = false; nut.draftMode = null;
    toast("Targets saved."); render();
  } catch(e){ toast("Couldn’t save targets."); }
}

// ---------- add flow ----------
function nOpenAdd(type){ nut.target = { kind:"meal", type }; nut.view = "add"; nut.addTab = "recent"; nut.results = []; nut.menuFor = null; render();
  try { scrollTo({top:0}); } catch(e){} }
function nOpenIngredient(){ nut.target = { kind:"recipe" }; nut.view = "add"; nut.addTab = "recent"; nut.results = []; render(); }
function nBack(){
  if (nut.view==="pick" || nut.view==="label"){ nut.view = "add"; nut.pick = null; nut.label = null; render(); setTimeout(nPaintResults,0); return; }
  if (nut.view==="add" && nut.target && nut.target.kind==="recipe"){ nut.view = "recipe"; render(); return; }
  if (nut.view==="recipe" && nut.recipe && nut.recipe._dirty && !confirm("Discard changes to this meal?")) return;
  nut.view = null; nut.target = null; nut.recipe = null; nut.pick = null; nut.label = null; render();
}
function nPickFood(f, method){
  nut.pick = f; nut.pickMethod = method || "search";
  if (f.source==="recipe"){ nut.unit = "serving"; nut.qty = "1"; }
  else if (f.serving_g){ nut.unit = "serving"; nut.qty = "1"; }
  else { nut.unit = "serving"; nut.qty = "1"; }
  nut.view = "pick"; render();
}
function nPickResult(i){ const f = nut.results[i]; if (f) nPickFood(f, "search"); }
function nPickRecipe(i){ const r = nut.recipes[i]; if (r) nPickFood(nFromRecipe(r), "recipe"); }
function nAddRecent(i){
  const r = nut.recent[i]; if (!r) return;
  const item = { name:r.name, food_id:r.food_id, recipe_id:r.recipe_id||null, grams:r.grams, servings:r.servings, kcal:r.kcal,
    protein_g:r.protein_g, carb_g:r.carb_g, fat_g:r.fat_g, fiber_g:r.fiber_g };
  if (nut.target.kind==="recipe"){
    nut.recipe.items.push(Object.assign({ qty: r.grams ? r1(r.grams) : (+r.servings||1), unit: r.grams ? "g" : "serving" }, item));
    delete nut.recipe.items[nut.recipe.items.length-1].servings; delete nut.recipe.items[nut.recipe.items.length-1].recipe_id;
    nut.recipe._dirty = true; nResetAdd(); render(); return;
  }
  nLogItem(Object.assign(item, { entry_method:"recent" }));
}
function nConfirmPick(){ if (nut.pick) nAddFood(nut.pick, nut.qty, nut.unit, nut.pickMethod); }
function nAddManual(){
  const m = nut.manual;
  const p = parseFloat(m.p)||0, c = parseFloat(m.c)||0, f = parseFloat(m.f)||0;
  let kcal = parseFloat(m.kcal); if (!(kcal>=0)) kcal = p*4 + c*4 + f*9;
  if (!m.name.trim()){ toast("Name it so you can find it again."); return; }
  if (!(kcal>0)){ toast("Enter calories or macros."); return; }
  const food = { source:"custom", name:m.name.trim().slice(0,200), brand:"", serving_g:null, serving_label:"1 serving", per:{ kcal, p, c, f, fiber:null } };
  if (nut.target.kind==="recipe"){ nAddFood(food, 1, "serving"); return; }
  nLogItem({ name:food.name, servings:1, kcal:r1(kcal), protein_g:r1(p), carb_g:r1(c), fat_g:r1(f), entry_method:"manual" });
}

// ---------- search (USDA + Open Food Facts + your saved foods) ----------
async function nSearch(){
  const el = document.getElementById("nq"); const q = el ? el.value.trim() : "";
  if (q.length<2){ toast("Type at least 2 letters."); return; }
  if (/^\d{8,14}$/.test(q)){ nHandleBarcode(q); return; }
  const box = document.getElementById("nres"); if (box) box.innerHTML = '<p class="statline">Searching…</p>';
  const safe = q.replace(/[^a-zA-Z0-9 ]+/g," ").trim().replace(/\s+/g,"*");
  const mine = sb("/rest/v1/foods?select=*&source=eq.custom&or=(name.ilike.*"+encodeURIComponent(safe)+"*,brand.ilike.*"+encodeURIComponent(safe)+"*)&limit=6")
    .then(r=>r.ok ? r.json() : []).then(rows=>rows.map(nFromRow)).catch(()=>[]);
  const usda = nTimeout(fetch("https://api.nal.usda.gov/fdc/v1/foods/search?api_key="+FDC_KEY+"&pageSize=12&dataType=Foundation,SR%20Legacy,Survey%20(FNDDS),Branded&query="+encodeURIComponent(q)), 9000)
    .then(r=>r.ok ? r.json() : Promise.reject(r.status)).then(d=>(d.foods||[]).map(nNormUsda))
    .catch(e=>{ if (e===429) toast("USDA search limit hit. Try again later or use quick add."); return []; });
  const off = nTimeout(fetch("https://world.openfoodfacts.org/cgi/search.pl?search_simple=1&json=1&page_size=8&fields=code,product_name,brands,nutriments,serving_quantity,serving_size&search_terms="+encodeURIComponent(q)), 9000)
    .then(r=>r.ok ? r.json() : Promise.reject(r.status)).then(d=>(d.products||[]).map(nNormOff).filter(Boolean)).catch(()=>[]);
  const [a, u, b] = await Promise.all([mine, usda, off]);
  nut.results = a.concat(u.filter(x=>!x.brand), u.filter(x=>x.brand), b).filter(x=>x.per.kcal>=0).slice(0,24);
  nPaintResults();
}
function nPaintResults(){
  const box = document.getElementById("nres"); if (!box) return;
  if (!nut.results.length){ box.innerHTML = ""; return; }
  box.innerHTML = nut.results.map((f,i)=>{
    const tag = f.source==="usda" ? "USDA" : f.source==="off" ? "OFF" : "Mine";
    return '<button class="nr" onclick="nPickResult('+i+')"><div><b>'+esc(f.name)+'<span class="nsrc">'+tag+'</span></b>'
      +'<span>'+(f.brand?esc(f.brand)+' · ':'')+esc(nServingText(f))+' · P '+r0(f.per.p)+' C '+r0(f.per.c)+' F '+r0(f.per.f)+'</span></div>'
      +'<span class="k">'+r0(f.per.kcal)+'</span></button>';
  }).join("");
}

// ---------- barcode scanning ----------
let nScanCtl = null;
function nScanClose(){
  try { if (nScanCtl && nScanCtl.stop) nScanCtl.stop(); } catch(e){}
  nScanCtl = null;
  const v = document.querySelector("#nscan video");
  try { if (v && v.srcObject) v.srcObject.getTracks().forEach(t=>t.stop()); } catch(e){}
  const o = document.getElementById("nscan"); if (o) o.remove();
}
async function nScanOpen(){
  nScanClose();
  const o = document.createElement("div"); o.id = "nscan"; o.className = "nscan";
  o.innerHTML = '<video playsinline muted autoplay></video><div class="guide"></div><div class="bar">'
    +'<div class="msg" id="nscanmsg">Starting camera…</div>'
    +'<div class="row"><input class="ninput" id="nscancode" inputmode="numeric" placeholder="Or type the barcode number" onkeydown="if(event.key===\'Enter\')nScanTyped()"><button class="sibtn" onclick="nScanTyped()">Look up</button></div>'
    +'<button class="x" onclick="nScanClose()">Cancel</button></div>';
  document.body.appendChild(o);
  const video = o.querySelector("video"), msg = o.querySelector("#nscanmsg");
  const done = code => { nScanClose(); nHandleBarcode(code); };
  try {
    if ("BarcodeDetector" in window){
      const det = new window.BarcodeDetector({ formats:["ean_13","ean_8","upc_a","upc_e"] });
      const stream = await navigator.mediaDevices.getUserMedia({ video:{ facingMode:"environment" }, audio:false });
      video.srcObject = stream; await video.play();
      msg.textContent = "Point at the barcode";
      let live = true; nScanCtl = { stop(){ live = false; } };
      const tick = async ()=>{
        if (!live || !document.getElementById("nscan")) return;
        try { const r = await det.detect(video); if (r && r[0] && r[0].rawValue){ done(r[0].rawValue); return; } } catch(e){}
        setTimeout(tick, 180);
      };
      tick();
      return;
    }
    const ZX = await nLoadScript(LIB_ZXING, "ZXingBrowser");
    const reader = new ZX.BrowserMultiFormatReader();
    msg.textContent = "Point at the barcode";
    nScanCtl = await reader.decodeFromConstraints({ video:{ facingMode:"environment" } }, video, (res)=>{
      if (res && document.getElementById("nscan")) done(res.getText());
    });
  } catch(e){
    msg.textContent = (e && e.name==="NotAllowedError") ? "Camera access was denied. Allow it in Settings, or type the number below."
      : "Camera unavailable here. Type the barcode number below.";
  }
}
function nScanTyped(){ const el = document.getElementById("nscancode"); const v = el ? el.value.replace(/\D/g,"") : ""; if (v.length<8){ toast("Barcodes are 8 to 14 digits."); return; } nScanClose(); nHandleBarcode(v); }
function nCodeVariants(code){
  const c = String(code).replace(/\D/g,""); const v = [c];
  if (c.length===12) v.push("0"+c);
  if (c.length===13 && c[0]==="0") v.push(c.slice(1));
  return v;
}
async function nLookupBarcode(code){
  const vs = nCodeVariants(code);
  try {
    const r = await sb("/rest/v1/foods?select=*&barcode=in.("+vs.join(",")+")&limit=1");
    if (r.ok){ const rows = await r.json(); if (rows[0]) return nFromRow(rows[0]); }
  } catch(e){}
  for (const v of vs){
    try {
      const r = await nTimeout(fetch("https://world.openfoodfacts.org/api/v2/product/"+v+".json?fields=code,product_name,brands,nutriments,serving_quantity,serving_size"), 8000);
      if (r.ok){ const d = await r.json(); if (d && d.status===1 && d.product){ const f = nNormOff(d.product); if (f){ f.barcode = vs[0]; return f; } } }
    } catch(e){}
  }
  try {
    const r = await nTimeout(fetch("https://api.nal.usda.gov/fdc/v1/foods/search?api_key="+FDC_KEY+"&pageSize=5&dataType=Branded&query="+encodeURIComponent(vs[0])), 8000);
    if (r.ok){ const d = await r.json(); const hit = (d.foods||[]).find(x=>vs.includes(String(x.gtinUpc||"").replace(/\D/g,"")));
      if (hit){ const f = nNormUsda(hit); f.barcode = vs[0]; return f; } }
  } catch(e){}
  return null;
}
async function nHandleBarcode(code){
  toast("Looking up "+code+"…");
  const f = await nLookupBarcode(code);
  if (f){ nPickFood(f, "barcode"); return; }
  nut.label = { status:"idle", barcode:String(code).replace(/\D/g,""), form:null, img:null };
  nut.view = "label"; render();
  toast("Not in the food databases yet. Snap the label and it’s saved for next time.");
}

// ---------- nutrition label photo (on-device OCR) ----------
function nLabelOpen(){ nut.label = { status:"idle", barcode:null, form:null, img:null }; nut.view = "label"; render(); }
function nLabelPick(capture){
  const i = document.createElement("input"); i.type = "file"; i.accept = "image/*";
  if (capture) i.setAttribute("capture","environment");
  i.onchange = ()=>{ const f = i.files && i.files[0]; if (f) nLabelRun(f); };
  i.click();
}
async function nLoadImage(file){
  const url = URL.createObjectURL(file);
  const img = await new Promise((res, rej)=>{ const im = new Image(); im.onload = ()=>res(im); im.onerror = rej; im.src = url; });
  return { img, url };
}
// Grayscale + binarize. mode "otsu" (global) or "adaptive" (local mean), long side scaled to `target`.
function nPrepCanvas(img, target, mode){
  const L = Math.max(img.naturalWidth, img.naturalHeight), sc = target/L;
  const c = document.createElement("canvas"); c.width = Math.round(img.naturalWidth*sc); c.height = Math.round(img.naturalHeight*sc);
  const x = c.getContext("2d"); x.imageSmoothingQuality = "high"; x.drawImage(img, 0, 0, c.width, c.height);
  const d = x.getImageData(0,0,c.width,c.height), p = d.data, n = p.length/4, g = new Float32Array(n);
  for (let i=0;i<n;i++) g[i] = 0.299*p[i*4]+0.587*p[i*4+1]+0.114*p[i*4+2];
  const set = (i,v)=>{ p[i*4]=p[i*4+1]=p[i*4+2]=v; };
  if (mode==="otsu"){
    const h = new Array(256).fill(0); for (let i=0;i<n;i++) h[g[i]|0]++;
    let sum=0; for (let t=0;t<256;t++) sum+=t*h[t];
    let sB=0, wB=0, best=0, th=128;
    for (let t=0;t<256;t++){ wB+=h[t]; if (!wB) continue; const wF=n-wB; if (!wF) break; sB+=t*h[t];
      const mB=sB/wB, mF=(sum-sB)/wF, b=wB*wF*(mB-mF)*(mB-mF); if (b>best){ best=b; th=t; } }
    for (let i=0;i<n;i++) set(i, g[i]>th ? 255 : 0);
  } else {
    const w=c.width, ht=c.height, I=new Float64Array((w+1)*(ht+1));
    for (let y=0;y<ht;y++){ let row=0; for (let xx=0;xx<w;xx++){ row+=g[y*w+xx]; I[(y+1)*(w+1)+xx+1]=I[y*(w+1)+xx+1]+row; } }
    const r = Math.max(8, Math.round(w/40));
    for (let y=0;y<ht;y++) for (let xx=0;xx<w;xx++){
      const x0=Math.max(0,xx-r), x1=Math.min(w-1,xx+r), y0=Math.max(0,y-r), y1=Math.min(ht-1,y+r);
      const cnt=(x1-x0+1)*(y1-y0+1), sm=I[(y1+1)*(w+1)+x1+1]-I[y0*(w+1)+x1+1]-I[(y1+1)*(w+1)+x0]+I[y0*(w+1)+x0];
      set(y*w+xx, g[y*w+xx] < (sm/cnt)*0.88 ? 0 : 255);
    }
  }
  x.putImageData(d,0,0);
  return c;
}
let nOcrWorker = null;
async function nLabelRun(file){
  const L = nut.label || (nut.label = { barcode:null });
  L.status = "reading"; L.progress = 0; L.img = null; render();
  const texts = [];
  try {
    const { img, url } = await nLoadImage(file);
    L.img = url; render();
    const T = await nLoadScript(LIB_TESS, "Tesseract");
    if (!nOcrWorker) nOcrWorker = await T.createWorker("eng", 1, { logger: m=>{
      if (m && m.status==="recognizing text" && nut.label){ const pass = nut.label._pass||0; nut.label.progress = Math.round((pass + (m.progress||0))/2*100);
        const el = document.getElementById("nlabprog"); if (el) el.textContent = "Reading label\u2026 "+nut.label.progress+"%"; }
    }});
    const target = Math.min(2000, Math.max(1400, Math.max(img.naturalWidth, img.naturalHeight)));
    for (const [i, mode] of [[0,"otsu"],[1,"adaptive"]]){
      L._pass = i;
      const r = await nOcrWorker.recognize(nPrepCanvas(img, target, mode));
      texts.push((r && r.data && r.data.text) || "");
    }
    L.form = nParseLabel(texts); L.raw = texts.join("\n----\n"); L.status = "review";
    const found = ["kcal","fat","carb","protein"].filter(k=>L.form[k]!=="").length;
    if (found<4 || (L.form._est||[]).length || (L.form._check||[]).length) toast("Check the highlighted numbers against the photo.");
  } catch(e){
    L.status = "review"; L.form = L.form || nParseLabel([]);
    toast("Couldn\u2019t read that photo. Enter the numbers from the label.");
  }
  if (nut.view==="label") render();
}
// ---- Nutrition Facts parsing ----
// OCR often reads the unit "g" as 9, q, a, or d ("3g" -> "39"). Each macro keeps its candidate readings,
// then the stated calories pick the combination that adds up (4/4/9 kcal per gram).
function nLabelClean(text){
  let t = String(text||"").replace(/\r/g,"");
  t = t.replace(/(\d)\s*[oO](?=\s*m?g\b)/g,"$10").replace(/\b[oO](?=\s*m?g\b)/g,"0").replace(/\b[oO](?=mg)/g,"0")
       .replace(/\b[lI|](?=\s*m?g\b)/g,"1").replace(/(\d)[lI|](?=\s*m?g\b)/g,"$11").replace(/(\d),(\d)/g,"$1.$2");
  return t;
}
function nTok(numStr, unit){
  const v = parseFloat(numStr); if (!(v>=0) || v>2000) return [];
  if (unit && /^mg$/i.test(unit)) return [];
  if (unit && /^[gqad]$/i.test(unit)) return [{ v, sure:true }];
  if (!unit && /^\d{2,}$/.test(numStr) && numStr.slice(-1)==="9") return [{ v, sure:false }, { v: parseFloat(numStr.slice(0,-1)), sure:false, stripped:true }];
  return [{ v, sure: unit==="9" }];
}
function nLabelTokens(raw){
  const t = nLabelClean(raw), out = { kcal:[], fat:[], carb:[], protein:[], fiber:[], serving_g:[], servings:[], serving_label:"" };
  const U = "\\s*(mg|g|9|q|a|d)?(?![a-z0-9])";
  let m;
  const re = (k, rx)=>{ const r = new RegExp(rx, "gi"); while ((m = r.exec(t))) out[k].push(...nTok(m[1], m[2])); };
  const cal = /calories(?!\s*from)[^\d\n]{0,12}(\d{1,4})/gi; while ((m = cal.exec(t))) out.kcal.push({ v:+m[1], sure:true });
  const calNext = t.match(/calories(?!\s*from)[^\n\d]*\n\s*(\d{1,4})\b/i); if (calNext) out.kcal.push({ v:+calNext[1], sure:false });
  const fat = new RegExp("([a-z]*)\\s*fat[^\\d\\n]{0,4}(\\d+(?:\\.\\d+)?)"+U, "gi");
  while ((m = fat.exec(t))){ if (/sat|trans|poly|mono/i.test(m[1])) continue; out.fat.push(...nTok(m[2], m[3])); }
  re("carb", "carb[a-z.]*[^\\d\\n]{0,4}(\\d+(?:\\.\\d+)?)"+U);
  re("protein", "prot[e\u00e9]in[^\\d\\n]{0,4}(\\d+(?:\\.\\d+)?)"+U);
  re("fiber", "fib(?:er|re)[^\\d\\n]{0,4}(\\d+(?:\\.\\d+)?)"+U);
  const sv = t.match(/serving\s*size[:\s]*([^\n]{1,60})/i);
  if (sv) out.serving_label = sv[1].replace(/\s+/g," ").trim().replace(/\((\d+)9\)/,"($1g)").slice(0,40);
  const pg = /\((\d+(?:\.\d+)?)\s*(g|9)?\s*\)/gi;
  while ((m = pg.exec(sv ? sv[1] : t))){ const n = m[1];
    if (m[2] && /g/i.test(m[2])) out.serving_g.push({ v:+n, sure:true });
    else if (/^\d{2,}$/.test(n) && n.slice(-1)==="9") out.serving_g.push({ v:+n.slice(0,-1), sure:false }); // "(559)" is "(55g)"
    else if (m[2]==="9") out.serving_g.push({ v:+n, sure:false });
  }
  const spc = t.match(/(?:about\s*)?(\d+(?:\.\d+)?)\s*servings?\s*per\b/i) || t.match(/servings?\s*per\s*[a-z]{3,}[:\s]*(?:about\s*)?(\d+(?:\.\d+)?)/i);
  if (spc) out.servings.push({ v:+spc[1], sure:true });
  return out;
}
function nUniq(list){ const seen = {}; return list.filter(c=>{ const k = c.v; if (seen[k]) { if (c.sure) seen[k].sure = true; return false; } seen[k] = c; return true; }); }
function nParseLabel(texts){
  if (!Array.isArray(texts)) texts = [texts];
  const all = { kcal:[], fat:[], carb:[], protein:[], fiber:[], serving_g:[], servings:[], serving_label:"" };
  texts.forEach(tx=>{ const o = nLabelTokens(tx); Object.keys(all).forEach(k=>{ if (k==="serving_label"){ if (!all[k] && o[k]) all[k] = o[k]; } else all[k].push(...o[k]); }); });
  ["kcal","fat","carb","protein","fiber","serving_g","servings"].forEach(k=>{ all[k] = nUniq(all[k]); });
  const est = [];
  const first = list => { const s = list.find(c=>c.sure); return s ? s.v : (list[0] ? list[0].v : null); };
  const K = first(all.kcal);
  const opts = k => all[k].length ? all[k] : [null];
  let best = null;
  if (K!=null){
    for (const f of opts("fat")) for (const c of opts("carb")) for (const p of opts("protein")){
      const vals = { fat:f, carb:c, protein:p }, missing = Object.keys(vals).filter(k=>vals[k]==null);
      const part = (f?9*f.v:0) + (c?4*c.v:0) + (p?4*p.v:0);
      let score = 0, filled = {};
      if (!missing.length) score = Math.abs(part - K);
      else if (missing.length===1){ const w = missing[0]==="fat" ? 9 : 4, d = (K - part)/w;
        if (d < -0.5) score = 1e6 + Math.abs(d); else { filled[missing[0]] = Math.max(0, Math.round(d)); score = 0; } }
      else score = Math.max(0, part - K) + 500;
      score += [f,c,p].filter(x=>x && !x.sure).length * 0.5; // small preference for readings with a clear "g"
      if (!best || score < best.score) best = { score, fat:f?f.v:filled.fat, carb:c?c.v:filled.carb, protein:p?p.v:filled.protein, filled };
    }
  }
  const pick = k => best && best[k]!=null ? best[k] : first(all[k]);
  const out = { name:"", serving_label: all.serving_label, serving_g:"", servings:"", kcal:"", fat:"", carb:"", protein:"", fiber:"" };
  out.kcal = K!=null ? String(K) : "";
  ["fat","carb","protein"].forEach(k=>{ const v = pick(k); out[k] = v!=null ? String(v) : ""; if (best && best.filled && best.filled[k]!=null) est.push(k); });
  const carbV = parseFloat(out.carb);
  const fib = all.fiber.find(c=>!(carbV>=0) || c.v<=carbV) || null; out.fiber = fib ? String(fib.v) : "";
  const sg = first(all.serving_g); out.serving_g = sg!=null ? String(sg) : "";
  const sp = first(all.servings); out.servings = sp!=null ? String(sp) : "";
  if (out.kcal==="" && (out.fat||out.carb||out.protein)){ out.kcal = String(r0((+out.fat||0)*9 + (+out.carb||0)*4 + (+out.protein||0)*4)); est.push("kcal"); }
  out._est = est;
  // Labels round and count fiber/sugar alcohols differently, so only flag a big mismatch
  out._check = best && K && best.score < 1e6 && best.score > Math.max(40, 0.25*K) ? ["kcal","fat","carb","protein"] : [];
  return out;
}
function nLabelField(k, v){ if (nut.label && nut.label.form) nut.label.form[k] = v; }
async function nLabelSave(){
  const L = nut.label, F = L && L.form; if (!F) return;
  if (!F.name.trim()){ toast("Give it a name, like the product on the package."); return; }
  const kcal = parseFloat(F.kcal), p = parseFloat(F.protein)||0, c = parseFloat(F.carb)||0, fat = parseFloat(F.fat)||0;
  if (!(kcal>=0) && !(p||c||fat)){ toast("Enter at least calories or macros."); return; }
  const sg = parseFloat(F.serving_g);
  const food = { source:"custom", source_id:null, barcode: L.barcode || null, name:F.name.trim().slice(0,200), brand:"",
    serving_g: sg>0 ? sg : null, serving_label: F.serving_label || "1 serving",
    per:{ kcal: kcal>=0 ? kcal : p*4+c*4+fat*9, p, c, f:fat, fiber: F.fiber!=="" ? parseFloat(F.fiber)||0 : null } };
  await nCacheFood(food);
  nPickFood(food, "label");
  if (F.servings && nut.target.kind==="recipe"){ nut.qty = F.servings; render(); } // whole package into a batch by default
  toast(L.barcode ? "Saved. Scanning this barcode will find it next time." : "Saved to your foods.");
}

// ---------- saved meals (recipes) ----------
function nNewRecipe(){ nut.recipe = { id:null, name:"", servings:"4", items:[], _dirty:false }; nut.view = "recipe"; nut.target = { kind:"recipe" }; render(); }
function nOpenRecipe(i){
  const r = nut.recipes[i]; if (!r) return;
  nut.recipe = { id:r.id, name:r.name, servings:String(+r.servings), items:(r.recipe_items||[]).map(x=>Object.assign({}, x)), _dirty:false };
  nut.view = "recipe"; nut.target = { kind:"recipe" }; render();
}
function nSaveMealAsRecipe(type){
  const m = nut.meals.find(x=>x.meal_type===type); nut.menuFor = null;
  if (!m || !(m.meal_items||[]).length){ toast("Log something first."); render(); return; }
  const label = (MEAL_TYPES.find(x=>x[0]===type)||[0,"Meal"])[1];
  nut.recipe = { id:null, name:label+" "+nDate(nut.day), servings:"1", _dirty:true,
    items: m.meal_items.map(i=>({ name:i.name, food_id:i.food_id, qty: i.grams ? +i.grams : (+i.servings||1), unit: i.grams ? "g" : "serving",
      grams:i.grams, kcal:+i.kcal, protein_g:+i.protein_g, carb_g:+i.carb_g, fat_g:+i.fat_g, fiber_g:i.fiber_g })) };
  nut.view = "recipe"; nut.target = { kind:"recipe" }; render();
}
function nRecipeQty(idx, v){
  const it = nut.recipe.items[idx]; const q = parseFloat(v); if (!it || !(q>0) || !(+it.qty>0)) return;
  const k = q/(+it.qty);
  ["kcal","protein_g","carb_g","fat_g"].forEach(f=>{ it[f] = r1((+it[f]||0)*k); });
  if (it.fiber_g!=null) it.fiber_g = r1(+it.fiber_g*k);
  if (it.grams!=null) it.grams = r1(+it.grams*k);
  it.qty = q; nut.recipe._dirty = true; nPaintRecipeTotals();
  const el = document.getElementById("nrk"+idx); if (el) el.textContent = r0(it.kcal);
}
function nRecipeDel(idx){ nut.recipe.items.splice(idx,1); nut.recipe._dirty = true; render(); }
function nPaintRecipeTotals(){ const el = document.getElementById("nrtot"); if (el) el.innerHTML = nRecipeTotalsHtml(); }
function nRecipeTotalsHtml(){
  const R = nut.recipe, t = nSum(R.items), s = parseFloat(R.servings)>0 ? parseFloat(R.servings) : 1;
  const cell = (v,l)=>'<div><b class="num">'+v+'</b><span>'+l+'</span></div>';
  return '<p class="statline" style="margin-top:0">Per meal (÷ '+r1(s)+')</p>'
    +'<div class="nmacrow">'+cell(nNum(t.kcal/s),"cal")+cell(r0(t.p/s)+"g","protein")+cell(r0(t.c/s)+"g","carbs")+cell(r0(t.f/s)+"g","fat")+'</div>'
    +'<p class="statline">Whole batch: '+nNum(t.kcal)+' cal · P '+r0(t.p)+' C '+r0(t.c)+' F '+r0(t.f)+'</p>';
}
async function nRecipeSave(thenLog){
  const R = nut.recipe; const s = parseFloat(R.servings);
  if (!R.name.trim()){ toast("Name the meal."); return; }
  if (!(s>0)){ toast("How many meals does it make?"); return; }
  if (!R.items.length){ toast("Add at least one ingredient."); return; }
  try {
    let id = R.id;
    if (id){
      const r = await sb("/rest/v1/recipes?id=eq."+id, { method:"PATCH", body:{ name:R.name.trim(), servings:s, updated_at:new Date().toISOString() } });
      if (!r.ok) throw new Error();
      const d = await sb("/rest/v1/recipe_items?recipe_id=eq."+id, { method:"DELETE" }); if (!d.ok) throw new Error();
    } else {
      const r = await sb("/rest/v1/recipes", { method:"POST", headers:{ Prefer:"return=representation" }, body:{ user_id:auth.uid, name:R.name.trim(), servings:s } });
      if (!r.ok) throw new Error(); id = (await r.json())[0].id; R.id = id;
    }
    const rows = R.items.map((it,i)=>({ recipe_id:id, user_id:auth.uid, food_id:it.food_id||null, name:it.name, qty:+it.qty||1, unit:it.unit==="g"?"g":"serving",
      grams:it.grams!=null?+it.grams:null, kcal:+it.kcal||0, protein_g:+it.protein_g||0, carb_g:+it.carb_g||0, fat_g:+it.fat_g||0, fiber_g:it.fiber_g!=null?+it.fiber_g:null, position:i }));
    const ins = await sb("/rest/v1/recipe_items", { method:"POST", headers:{ Prefer:"return=representation" }, body:rows });
    if (!ins.ok) throw new Error();
    const saved = { id, user_id:auth.uid, name:R.name.trim(), servings:s, updated_at:new Date().toISOString(), recipe_items: await ins.json() };
    nut.recipes = [saved].concat(nut.recipes.filter(x=>x.id!==id));
    R._dirty = false;
    toast("Saved "+saved.name+".");
    if (thenLog){ nut.target = { kind:"meal", type: thenLog }; nPickFood(nFromRecipe(saved), "recipe"); return; }
    nut.view = null; nut.target = null; nut.recipe = null; render();
  } catch(e){ toast("Couldn’t save the meal."); }
}
async function nRecipeDelete(){
  const R = nut.recipe; if (!R || !R.id){ nut.view=null; nut.recipe=null; render(); return; }
  if (!confirm("Delete "+R.name+"? Past logs keep their numbers.")) return;
  try { const r = await sb("/rest/v1/recipes?id=eq."+R.id, { method:"DELETE" }); if (!r.ok) throw new Error();
    nut.recipes = nut.recipes.filter(x=>x.id!==R.id); nut.view = null; nut.recipe = null; nut.target = null; render(); toast("Deleted."); }
  catch(e){ toast("Couldn’t delete."); }
}
function nGuessMealType(){
  const h = new Date().getHours();
  return h<10 ? "breakfast" : h<14 ? "lunch" : h<17 ? "snack" : "dinner";
}

// ---------- render ----------
function nRing(pct, state){
  const r = 15, C = 2*Math.PI*r, v = Math.max(0, Math.min(1, pct||0));
  const track = state==="today-empty" ? 'stroke-dasharray="4 4" stroke="rgba(255,255,255,.55)"' : 'stroke="rgba(255,255,255,.16)"';
  return '<svg width="38" height="38" viewBox="0 0 38 38"><circle cx="19" cy="19" r="'+r+'" fill="none" stroke-width="2.6" '+track+'/>'
    + (v>0 ? '<circle cx="19" cy="19" r="'+r+'" fill="none" stroke="'+(pct>1.05?"var(--warn)":"var(--accent)")+'" stroke-width="3" stroke-linecap="round" stroke-dasharray="'+(C*v).toFixed(1)+' '+C.toFixed(1)+'" transform="rotate(-90 19 19)"/>' : '')
    + '</svg>';
}
function renderFood(){
  if (!auth) return '<div class="panel a"><p class="statline">Sign in to track food. Your log syncs to your account so your coach can see it.</p></div>';
  if (!nut.day) nut.day = dayKey();
  if (nut.loadedFor!==nut.day && !nut.loading) setTimeout(()=>nLoad(), 0);
  if (nut.view==="add") return renderFoodAdd();
  if (nut.view==="pick") return renderFoodPick();
  if (nut.view==="label") return renderFoodLabel();
  if (nut.view==="recipe") return renderFoodRecipe();

  const today = dayKey(), burned = nBurned(nut.day);
  let h = '<div class="ntop"><div class="ntitle">'+nDayLabel(nut.day)+nIcon("caret",22)
    +'<input type="date" value="'+nut.day+'" max="'+today+'" onchange="nSetDay(this.value)" aria-label="Pick a day"></div>'
    +'<div class="nburn">'+nIcon("flame",18)+'<b class="num">'+(burned!=null?nNum(burned):"–")+'</b><span>burned</span></div></div>';

  h += '<div class="nweek">';
  const tgDefault = nut.goal ? null : 0;
  nWeekDays(nut.day).forEach(d=>{
    const dt = new Date(d+"T12:00:00"), fut = d>today, sel = d===nut.day;
    const tg = nTargetsFor(d), k = nut.week[d] || 0;
    const pct = tg && tg.kcal ? k/tg.kcal : (k>0 ? 1 : tgDefault);
    const state = d===today && !k ? "today-empty" : "";
    h += '<button class="nwd'+(sel?" sel":"")+(fut?" fut":"")+'"'+(fut?' disabled':' onclick="nSetDay(\''+d+'\')"')+' aria-label="'+dt.toDateString()+'">'
      +'<span class="dot"></span>'+"SMTWTFS"[dt.getDay()]+nRing(pct, state)+'</button>';
  });
  h += '</div>';

  const t = nTotals(), tg = nTargetsFor(nut.day);
  const kT = tg ? tg.kcal : 0, left = kT - t.kcal;
  h += '<div class="ncard ncal'+(kT && t.kcal>kT*1.05?" over":"")+'"><div class="nl"><span>Calories</span>'
    +'<button class="silink" style="font-size:12.5px;padding:0" onclick="nut.dayTypeOverride[nut.day]=nIsTrainingDay(nut.day)?\'rest\':\'train\';render()">'+(nIsTrainingDay(nut.day)?"Training day":"Rest day")+'</button></div>'
    +'<div class="nrow"><span class="big num">'+nNum(t.kcal)+' cal'+(kT?' <small>/ '+nNum(kT)+'</small>':'')+'</span>'
    +(kT?'<span class="left num">'+nNum(Math.abs(left))+'<small>'+(left>=0?"left":"over")+'</small></span>':'')+'</div>'
    +'<div class="ntrack"><div class="nfill" style="width:'+(kT?Math.min(100,t.kcal/kT*100):0)+'%"></div></div></div>';

  const mac = [["Carbs", t.c, tg&&tg.c], ["Fat", t.f, tg&&tg.f], ["Protein", t.p, tg&&tg.p]];
  h += '<div class="ncard"><button class="nswap" onclick="nut.macroLeft=!nut.macroLeft;render()" aria-label="Switch between eaten and remaining">'+nIcon("swap",18)+'</button><div class="nmac">';
  mac.forEach(([l,v,tv])=>{
    const show = nut.macroLeft && tv ? r0(tv-v) : r0(v);
    h += '<div class="'+(tv && v>tv*1.05?"over":"")+'"><div class="ml">'+l+'</div><div class="mv num">'+show+' g'
      +(tv ? ' <small>'+(nut.macroLeft?(tv-v>=0?"left":"over"):'/ '+tv)+'</small>' : '')+'</div>'
      +'<div class="ntrack"><div class="nfill" style="width:'+(tv?Math.min(100,v/tv*100):0)+'%"></div></div></div>';
  });
  h += '</div></div>';
  if (!tg) h += '<p class="statline" style="margin:-2px 4px 6px">No targets yet. Set your goal at the bottom.</p>';

  h += '<div class="nsec"><h2>Meals</h2></div>';
  const training = nIsTrainingDay(nut.day);
  MEAL_TYPES.forEach(([type,label])=>{
    const m = nut.meals.find(x=>x.meal_type===type), items = m ? (m.meal_items||[]) : [];
    if (!items.length && (type==="pre_workout"||type==="post_workout") && !training) return;
    const kc = nSum(items).kcal;
    h += '<div class="nmeal"><div class="nmh">'+nIcon(type,26)+'<div class="nmn"><b>'+label+'</b>'+(items.length?'<span class="num">'+nNum(kc)+' cal</span>':'')+'</div>'
      +'<button class="ndots" onclick="nut.menuFor=nut.menuFor===\''+type+'\'?null:\''+type+'\';render()" aria-label="'+label+' options">'+nIcon("dots",22)+'</button>'
      +'<button class="nlog" onclick="nOpenAdd(\''+type+'\')">Log</button></div>';
    if (nut.menuFor===type) h += '<div class="nmenu"><button onclick="nSaveMealAsRecipe(\''+type+'\')">Save as a meal</button><button onclick="nClearMeal(\''+type+'\')">Clear</button></div>';
    items.forEach(i=>{
      h += '<div class="nitem"><div class="nn"><b>'+esc(i.name)+'</b><span>'+(i.recipe_id && i.servings ? r1(i.servings)+' meal'+(+i.servings===1?'':'s')+' · ' : i.grams ? r0(i.grams)+' g · ' : '')
        +'P '+r0(i.protein_g)+' C '+r0(i.carb_g)+' F '+r0(i.fat_g)+'</span></div>'
        +'<div class="nm num">'+r0(i.kcal)+'<button class="delbtn sm" onclick="nDeleteItem(\''+m.id+'\',\''+i.id+'\')" aria-label="Delete">✕</button></div></div>';
    });
    h += '</div>';
  });

  h += '<div class="nsec"><h2>My meals</h2><button onclick="nNewRecipe()">+ New</button></div>';
  if (!nut.recipes.length) h += '<p class="statline" style="margin:0 4px 6px">Build a batch once (every ingredient, how many meals it makes) and log a meal of it in one tap.</p>';
  nut.recipes.forEach((r,i)=>{
    const f = nFromRecipe(r);
    h += '<button class="nrec" onclick="nOpenRecipe('+i+')"><div><b>'+esc(r.name)+'</b><span class="num">Makes '+r1(r.servings)+' · per meal '+nNum(f.per.kcal)+' cal · P '+r0(f.per.p)+' C '+r0(f.per.c)+' F '+r0(f.per.f)+'</span></div>'+nIcon("bowl",24)+'</button>';
  });

  h += renderFoodGoal();
  return h;
}
function nHead(title){
  return '<div class="nhead"><button class="nb" onclick="nBack()" aria-label="Back">'+nIcon("back",20)+'</button><h2>'+esc(title)+'</h2></div>';
}
function renderFoodAdd(){
  const isRec = nut.target && nut.target.kind==="recipe";
  const label = isRec ? "Add ingredient" : "Log "+((MEAL_TYPES.find(x=>x[0]===(nut.target||{}).type)||[0,"food"])[1]);
  let h = nHead(label);
  h += '<div class="ntiles"><button class="ntile" onclick="nScanOpen()">'+nIcon("barcode",26)+'Scan barcode</button>'
    +'<button class="ntile" onclick="nLabelOpen()">'+nIcon("label",26)+'Label photo</button>'
    +'<button class="ntile" onclick="nut.showManual=!nut.showManual;render()">'+nIcon("pencil",26)+'Quick add</button></div>';
  if (nut.showManual){
    const m = nut.manual;
    h += '<div class="ncard" style="padding:14px"><div class="ngrid" style="margin-top:0"><input class="ninput wide" placeholder="Name" value="'+esc(m.name)+'" oninput="nut.manual.name=this.value">'
      +'<input class="ninput" inputmode="decimal" placeholder="Calories" value="'+esc(m.kcal)+'" oninput="nut.manual.kcal=this.value">'
      +'<input class="ninput" inputmode="decimal" placeholder="Protein g" value="'+esc(m.p)+'" oninput="nut.manual.p=this.value">'
      +'<input class="ninput" inputmode="decimal" placeholder="Carbs g" value="'+esc(m.c)+'" oninput="nut.manual.c=this.value">'
      +'<input class="ninput" inputmode="decimal" placeholder="Fat g" value="'+esc(m.f)+'" oninput="nut.manual.f=this.value"></div>'
      +'<div class="nbtnrow"><button class="sibtn" onclick="nAddManual()">Add</button><span class="statline" style="margin:0">Leave calories blank to calculate from macros.</span></div></div>';
  }
  h += '<div class="nsearch"><input class="ninput" id="nq" type="search" placeholder="Search foods or type a barcode" onkeydown="if(event.key===\'Enter\')nSearch()" enterkeyhint="search">'
    +'<button class="sibtn" onclick="nSearch()">Search</button></div><div class="nres" id="nres"></div>';
  if (!isRec) h += '<div class="nseg"><button class="'+(nut.addTab==="recent"?"on":"")+'" onclick="nut.addTab=\'recent\';render()">Recent</button>'
    +'<button class="'+(nut.addTab==="meals"?"on":"")+'" onclick="nut.addTab=\'meals\';render()">My meals</button></div>';
  else h += '<p class="statline" style="margin:14px 2px 0">Recent</p>';
  h += '<div class="nres">';
  if (!isRec && nut.addTab==="meals"){
    if (!nut.recipes.length) h += '<p class="statline">No saved meals yet. Create one under My meals on the Food tab.</p>';
    nut.recipes.forEach((r,i)=>{ const f = nFromRecipe(r);
      h += '<button class="nr" onclick="nPickRecipe('+i+')"><div><b>'+esc(r.name)+'</b><span>1 of '+r1(r.servings)+' meals · P '+r0(f.per.p)+' C '+r0(f.per.c)+' F '+r0(f.per.f)+'</span></div><span class="k">'+r0(f.per.kcal)+'</span></button>'; });
  } else {
    if (!nut.recent.length) h += '<p class="statline">Foods you log show up here for one-tap re-logging.</p>';
    nut.recent.forEach((r,i)=>{
      h += '<button class="nr" onclick="nAddRecent('+i+')"><div><b>'+esc(r.name)+'</b><span>'+(r.recipe_id && r.servings ? r1(r.servings)+' meal · ' : r.grams ? r0(r.grams)+' g · ' : '')+'P '+r0(r.protein_g)+' C '+r0(r.carb_g)+' F '+r0(r.fat_g)+'</span></div><span class="k">'+r0(r.kcal)+'</span></button>';
    });
  }
  h += '</div>';
  setTimeout(()=>{ if (nut.results.length) nPaintResults(); }, 0);
  return h;
}
function renderFoodPick(){
  const f = nut.pick; if (!f) { nut.view = "add"; return renderFoodAdd(); }
  const isRec = nut.target && nut.target.kind==="recipe";
  let h = nHead(isRec ? "Add ingredient" : "Log "+((MEAL_TYPES.find(x=>x[0]===(nut.target||{}).type)||[0,"food"])[1]));
  const s = nScaled(f, nut.qty, nut.unit);
  const unitLabel = f.source==="recipe" ? "meals" : "servings";
  h += '<div class="ncard"><b style="color:#fff;font-size:18px">'+esc((f.brand && f.source!=="recipe" ? f.brand+" " : "")+f.name)+'</b>'
    +'<p class="statline" style="margin-top:4px">Serving: '+esc(nServingText(f))+' · '+r0(f.per.kcal)+' cal'+(f.barcode?' · barcode '+esc(f.barcode):'')+'</p>'
    +'<div class="nsearch" style="margin-top:12px"><input class="ninput" id="nqty" inputmode="decimal" value="'+esc(nut.qty)+'" oninput="nut.qty=this.value;nPaintPick()" aria-label="Amount">'
    +(f.serving_g && f.source!=="recipe" ? '<div class="nseg" style="margin:0"><button class="'+(nut.unit!=="g"?"on":"")+'" onclick="nSetUnit(\'serving\')">'+unitLabel+'</button><button class="'+(nut.unit==="g"?"on":"")+'" onclick="nSetUnit(\'g\')">grams</button></div>'
      : '<span class="statline" style="margin:0;align-self:center">'+unitLabel+'</span>')+'</div>'
    +'<div class="nmacrow" id="npick">'+nPickCells(s)+'</div>'
    +'<div class="nbtnrow"><button class="sibtn" onclick="nConfirmPick()">'+(isRec?"Add to meal":"Log it")+'</button></div></div>';
  return h;
}
function nPickCells(s){
  const cell = (v,l)=>'<div><b class="num">'+v+'</b><span>'+l+'</span></div>';
  return cell(nNum(s.kcal),"cal")+cell(r0(s.protein_g)+"g","protein")+cell(r0(s.carb_g)+"g","carbs")+cell(r0(s.fat_g)+"g","fat");
}
function nPaintPick(){ const el = document.getElementById("npick"); if (el && nut.pick) el.innerHTML = nPickCells(nScaled(nut.pick, nut.qty, nut.unit)); }
function nSetUnit(u){
  const f = nut.pick; if (!f || u===nut.unit) return;
  const q = parseFloat(nut.qty)||0;
  nut.qty = String(u==="g" ? r0(q*f.serving_g) : r1(q/f.serving_g));
  nut.unit = u; render();
}
function renderFoodLabel(){
  const L = nut.label || {};
  let h = nHead("Nutrition label");
  h += '<div class="ncard">';
  if (L.barcode) h += '<p class="statline" style="margin-top:0">Barcode '+esc(L.barcode)+' wasn’t found. Snap the label and it gets saved under this barcode.</p>';
  if (L.status==="idle" || !L.status){
    h += '<p class="statline" style="margin-top:0">Get the whole Nutrition Facts panel in frame, flat and well lit. Reading happens on your phone, nothing is uploaded.</p>'
      +'<div class="nbtnrow"><button class="sibtn" onclick="nLabelPick(true)">Take photo</button><button class="sibtn" style="background:rgba(255,255,255,.08)" onclick="nLabelPick(false)">Choose photo</button></div>';
    return h + '</div>';
  }
  if (L.img) h += '<img class="nimg" src="'+L.img+'" alt="Label photo">';
  if (L.status==="reading"){
    h += '<p class="statline" id="nlabprog">Reading label… '+(L.progress||0)+'%</p><p class="statline">First scan downloads the reader (about 10 MB), then it’s fast.</p>';
    return h + '</div>';
  }
  const F = L.form || {};
  const est = F._est || [], chk = F._check || [];
  const fld = (k, lab, wide, mode)=>{ const missing = ["kcal","fat","carb","protein"].includes(k) && !F[k];
    const e = est.includes(k) || chk.includes(k) || missing;
    const note = missing ? " \u00B7 not read" : est.includes(k) ? " \u00B7 estimated" : chk.includes(k) ? " \u00B7 check" : "";
    return '<div'+(wide?' class="wide"':'')+'><label'+(e?' style="color:var(--warn)"':'')+'>'+lab+note+'</label><input class="ninput" '+(mode?'inputmode="'+mode+'"':'')
      +(e?' style="border-color:var(--warn)"':'')+' value="'+esc(F[k]||"")+'" oninput="nLabelField(\''+k+'\',this.value)"></div>'; };
  h += '<p class="statline">Check each number against the photo, then save.</p><div class="ngrid">'
    + fld("name","Name",true) + fld("serving_label","Serving size",false) + fld("serving_g","Serving grams",false,"decimal")
    + fld("kcal","Calories",false,"decimal") + fld("protein","Protein g",false,"decimal") + fld("carb","Carbs g",false,"decimal")
    + fld("fat","Fat g",false,"decimal") + fld("fiber","Fiber g",false,"decimal") + fld("servings","Servings per pack",false,"decimal") + '</div>'
    + '<div class="nbtnrow"><button class="sibtn" onclick="nLabelSave()">Save food</button><button class="silink" onclick="nLabelPick(false)">Try another photo</button></div>';
  return h + '</div>';
}
function renderFoodRecipe(){
  const R = nut.recipe; if (!R){ nut.view = null; return renderFood(); }
  let h = nHead(R.id ? "Edit meal" : "New meal");
  h += '<div class="ncard"><div class="ngrid" style="margin-top:0"><div class="wide"><label>Name</label><input class="ninput" placeholder="Chicken rice bowls" value="'+esc(R.name)+'" oninput="nut.recipe.name=this.value;nut.recipe._dirty=true"></div>'
    +'<div class="wide"><label>Makes how many meals</label><input class="ninput" inputmode="decimal" value="'+esc(R.servings)+'" oninput="nut.recipe.servings=this.value;nut.recipe._dirty=true;nPaintRecipeTotals()"></div></div></div>';
  h += '<div class="ncard" id="nrtot">'+nRecipeTotalsHtml()+'</div>';
  h += '<div class="nsec" style="margin-top:6px"><h2>Ingredients</h2><button onclick="nOpenIngredient()">+ Add</button></div><div class="ncard" style="padding:6px 16px 14px">';
  if (!R.items.length) h += '<p class="statline">Add every ingredient in the batch: scan barcodes, snap labels, or search. Enter the amount you used of each.</p>';
  R.items.forEach((it,i)=>{
    h += '<div class="nitem"><div class="nn"><b>'+esc(it.name)+'</b><span>P '+r0(it.protein_g)+' C '+r0(it.carb_g)+' F '+r0(it.fat_g)+'</span></div>'
      +'<div class="nm" style="display:flex;align-items:center;gap:6px"><input class="ninput" style="width:74px;min-height:38px;padding:0 8px;text-align:right" inputmode="decimal" value="'+esc(r1(it.qty))+'" onchange="nRecipeQty('+i+',this.value)" aria-label="Amount">'
      +'<span class="statline" style="margin:0;width:22px">'+(it.unit==="g"?"g":"sv")+'</span><span class="num" id="nrk'+i+'" style="min-width:38px">'+r0(it.kcal)+'</span>'
      +'<button class="delbtn sm" onclick="nRecipeDel('+i+')" aria-label="Remove">✕</button></div></div>';
  });
  h += '</div><div class="nbtnrow"><button class="sibtn" onclick="nRecipeSave()">Save meal</button>'
    +'<button class="sibtn" style="background:rgba(255,255,255,.08)" onclick="nRecipeSave(nGuessMealType())">Save and log 1 meal</button>'
    +(R.id?'<button class="silink" onclick="nRecipeDelete()">Delete</button>':'')+'</div>';
  return h;
}
function renderFoodGoal(){
  const g = nut.goal;
  let h = '<div class="nsec"><h2>Targets</h2></div><div class="panel a">';
  if (g && !nut.goalEdit){
    const mode = (GOAL_MODES.find(x=>x[0]===g.mode)||[0,g.mode])[1];
    h += '<div class="trendrows" style="margin-top:0">'
      + '<div class="trow"><span class="d">Goal</span><span class="s">'+esc(mode)+' · since '+nDate(g.effective_from)+'</span></div>'
      + '<div class="trow"><span class="d">Calories</span><span class="s num">'+g.kcal_train+' train / '+g.kcal_rest+' rest</span></div>'
      + '<div class="trow"><span class="d">Protein</span><span class="s num">'+g.protein_g+' g'+(g.protein_cap_g?' (cap '+g.protein_cap_g+')':'')+'</span></div>'
      + '<div class="trow"><span class="d">Carbs</span><span class="s num">'+g.carb_g_train+' / '+g.carb_g_rest+' g</span></div>'
      + '<div class="trow"><span class="d">Fat</span><span class="s num">'+g.fat_g+' g</span></div></div>';
    const why = g.inputs && g.inputs.why;
    if (why && why.length) h += '<div class="nwhy">'+why.map(esc).join('<br>')+'</div>';
    if (g.set_by && g.set_by!==auth.uid) h += '<p class="statline">Set by your coach.</p>';
    h += '<div class="nbtnrow"><button class="silink" onclick="nut.goalEdit=true;nut.draftMode=\''+g.mode+'\';render()">Change goal or recalculate</button></div>';
    return h + '</div>';
  }
  const mode = nut.draftMode || (g && g.mode) || null;
  h += '<p class="statline" style="margin-top:0">Pick a goal. Targets come from your latest DEXA lean mass, PNOE resting burn, and WHOOP daily burn.</p>'
    + '<div class="chips">'+GOAL_MODES.map(([k,l])=>'<button class="chip'+(mode===k?" on":"")+'" onclick="nut.draftMode=\''+k+'\';render()">'+l+'</button>').join("")+'</div>';
  if (mode){
    const c = nComputeGoal(mode);
    h += '<div class="trendrows">'
      + '<div class="trow"><span class="d">Calories</span><span class="s num">'+c.kcal_train+' train / '+c.kcal_rest+' rest</span></div>'
      + '<div class="trow"><span class="d">Protein</span><span class="s num">'+c.protein_g+' g</span></div>'
      + '<div class="trow"><span class="d">Carbs</span><span class="s num">'+c.carb_g_train+' / '+c.carb_g_rest+' g</span></div>'
      + '<div class="trow"><span class="d">Fat</span><span class="s num">'+c.fat_g+' g</span></div></div>'
      + '<div class="nwhy">'+c.inputs.why.map(esc).join('<br>')+'</div>';
    if (mode==="lean_gain") h += '<div class="nwarn">A surplus raises training-day calories most. Watch the 4-week scale trend; if you gain more than about 2 lb a month, drop carbs 30 to 50 g.</div>';
    if (!nut.dexa) h += '<div class="nwarn">No DEXA on file. Protein is based on bodyweight until you add a scan.</div>';
    h += '<div class="nbtnrow"><button class="sibtn" onclick="nSaveGoal()">Save targets</button>'
      + (g ? '<button class="silink" onclick="nut.goalEdit=false;nut.draftMode=null;render()">Cancel</button>' : '') + '</div>';
  }
  return h + '</div>';
}
