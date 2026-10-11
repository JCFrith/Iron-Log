"use strict";
// ================= Iron Log: Food module (phase 1) =================
// Loaded before the main inline script. Uses globals from index.html at call time:
// sb, auth, render, toast, esc, dayKey, fmtDate, sessions, whoopDays, scheduleFor, statCell.

const FDC_KEY = "DEMO_KEY"; // api.data.gov key; DEMO_KEY is rate limited (~30 req/hr per IP)
const MEAL_TYPES = [
  ["breakfast","Breakfast"], ["lunch","Lunch"], ["dinner","Dinner"],
  ["snack","Snack"], ["pre_workout","Pre-workout"], ["post_workout","Post-workout"]
];
const GOAL_MODES = [
  ["cut","Cut"], ["recomp","Recomp"], ["maintain","Maintain"], ["lean_gain","Lean gain"], ["clinical_hold","Clinical hold"]
];

const nut = {
  day: null,            // YYYY-MM-DD being viewed
  meals: [],            // meals with meal_items for nut.day
  goal: null,           // active nutrition_goals row
  dexa: null, pnoe: null,
  recent: [],
  loadedFor: null,
  loading: false,
  addFor: null,         // meal_type the add sheet is open for
  results: [],          // normalized search results
  pick: null,           // index into results being sized
  qty: "",
  manual: { name:"", kcal:"", p:"", c:"", f:"" },
  showManual: false,
  goalEdit: false,
  draftMode: null,
  dayTypeOverride: {},  // day -> "train"|"rest"
};

(function injectFoodCss(){
  const css = `
  .nday { display:flex; align-items:center; justify-content:space-between; gap:8px; margin-bottom:12px; }
  .nday button { min-width:44px; min-height:44px; border:1px solid var(--border2); border-radius:12px; background:rgba(255,255,255,.04); color:var(--text); font-size:18px; }
  .nday .nd { text-align:center; }
  .nday .nd b { display:block; font-size:17px; color:#fff; }
  .nday .nd span { color:var(--dim); font-size:12px; }
  .nbar { margin:9px 0; }
  .nbar .nl { display:flex; justify-content:space-between; font-size:13px; margin-bottom:5px; }
  .nbar .nl b { color:#fff; }
  .nbar .nl span { color:var(--dim); }
  .nbar .nt { height:8px; border-radius:99px; background:rgba(255,255,255,.07); overflow:hidden; }
  .nbar .nf { height:100%; border-radius:99px; background:var(--accent); transition:width .5s var(--sp, ease); }
  .nbar.over .nf { background:var(--warn); }
  .nmeal { display:flex; justify-content:space-between; align-items:center; gap:8px; }
  .nmeal h3 { font-size:15px; color:#fff; margin:0; }
  .nmeal .nk { color:var(--dim); font-size:12.5px; }
  .nitem { display:flex; justify-content:space-between; align-items:center; gap:10px; padding:9px 0; border-top:1px solid rgba(255,255,255,.06); font-size:13.5px; }
  .nitem .nn { min-width:0; }
  .nitem .nn b { display:block; color:var(--text); font-weight:700; overflow:hidden; text-overflow:ellipsis; }
  .nitem .nn span { color:var(--dim); font-size:12px; }
  .nitem .nm { text-align:right; white-space:nowrap; font-weight:700; }
  .nsearch { display:grid; grid-template-columns:1fr auto; gap:8px; }
  .nsearch input, .nqty input, .nman input { width:100%; min-height:44px; padding:0 12px; border-radius:12px; border:1px solid var(--border2); background:rgba(0,0,0,.25); color:var(--text); font-size:16px; }
  .nres { margin-top:10px; }
  .nres button { display:block; width:100%; text-align:left; padding:10px 4px; border:0; border-top:1px solid rgba(255,255,255,.06); background:none; color:var(--text); font-size:14px; }
  .nres button b { display:block; font-weight:700; }
  .nres button span { color:var(--dim); font-size:12px; }
  .nqty { display:grid; grid-template-columns:1fr auto; gap:8px; margin-top:10px; align-items:center; }
  .nman { display:grid; grid-template-columns:1fr 1fr; gap:8px; margin-top:10px; }
  .nman input.wide { grid-column:1 / -1; }
  .nsrc { display:inline-block; margin-left:6px; padding:1px 6px; border-radius:6px; background:rgba(255,255,255,.07); color:var(--dim); font-size:10.5px; font-weight:800; letter-spacing:.04em; text-transform:uppercase; }
  .nwhy { margin-top:8px; color:var(--dim); font-size:12px; line-height:1.5; }
  .nwarn { margin-top:8px; padding:9px 11px; border-radius:11px; background:rgba(251,191,36,.08); color:var(--warn); font-size:12.5px; line-height:1.45; }
  `;
  try { const s = document.createElement("style"); s.textContent = css; document.head.appendChild(s); } catch(e){}
})();

// ---------- helpers ----------
const r0 = n => Math.round(Number(n)||0);
const r1 = n => Math.round((Number(n)||0)*10)/10;
const nDate = d => fmtDate(String(d).length===10 ? d+"T12:00:00" : d); // date-only strings parse as UTC otherwise
function nDayOffset(day, n){
  const d = new Date(day+"T12:00:00"); d.setDate(d.getDate()+n); return dayKey(d);
}
function nDayLabel(day){
  const today = dayKey();
  if (day===today) return "Today";
  if (day===nDayOffset(today,-1)) return "Yesterday";
  return new Date(day+"T12:00:00").toLocaleDateString(undefined,{weekday:"short", month:"short", day:"numeric"});
}
function nIsTrainingDay(day){
  if (nut.dayTypeOverride[day]) return nut.dayTypeOverride[day]==="train";
  const logged = (typeof sessions!=="undefined" ? sessions : []).some(s=>s && s.workout!=="ACT" && dayKey(new Date(s.date))===day);
  if (logged) return true;
  const dow = new Date(day+"T12:00:00").getDay();
  try { return !!scheduleFor(dow); } catch(e){ return false; }
}
function nTotals(){
  const t = { kcal:0, p:0, c:0, f:0, fiber:0 };
  nut.meals.forEach(m=>(m.meal_items||[]).forEach(i=>{
    t.kcal += +i.kcal||0; t.p += +i.protein_g||0; t.c += +i.carb_g||0; t.f += +i.fat_g||0; t.fiber += +i.fiber_g||0;
  }));
  return t;
}
function nMealTotals(m){
  return (m.meal_items||[]).reduce((a,i)=>a+(+i.kcal||0),0);
}

// ---------- goal engine ----------
// Inputs: latest DEXA lean mass, measured RMR (PNOE), WHOOP daily calories split by training vs rest days.
function nComputeGoal(mode){
  const why = [];
  const lean = nut.dexa && nut.dexa.lean_mass_lb ? +nut.dexa.lean_mass_lb : null;
  const wt = nut.dexa && nut.dexa.weight_lb ? +nut.dexa.weight_lb
    : (typeof whoopBody!=="undefined" && whoopBody && whoopBody.weight_kg ? whoopBody.weight_kg*2.2046 : null);

  // Resting energy
  let rmr = nut.pnoe && nut.pnoe.rmr_kcal ? +nut.pnoe.rmr_kcal : null;
  if (rmr) why.push("RMR "+rmr+" kcal (PNOE "+nDate(nut.pnoe.measured_on)+")");
  else if (lean){ rmr = Math.round(370 + 21.6*(lean/2.2046)); why.push("RMR "+rmr+" kcal (Katch-McArdle from DEXA lean mass)"); }
  else if (wt){ rmr = Math.round(wt*11); why.push("RMR "+rmr+" kcal (bodyweight estimate, no DEXA or PNOE on file)"); }
  else { rmr = 2000; why.push("RMR 2000 kcal default. Add a DEXA or PNOE result for real numbers."); }

  // Total expenditure from WHOOP, split by day type, last 28 complete days
  const today = dayKey();
  const days = (typeof whoopDays!=="undefined" ? whoopDays : []).filter(d=>d && d.calories>0 && d.day<today).slice(-28);
  const tr = [], rs = [];
  days.forEach(d=>{ (nIsTrainingDay(d.day) ? tr : rs).push(+d.calories); });
  const avg = a => a.length ? a.reduce((x,y)=>x+y,0)/a.length : null;
  let tdeeT = avg(tr), tdeeR = avg(rs);
  const floor = rmr*1.2;
  if (tr.length>=4 && rs.length>=3){
    why.push("Burn from WHOOP: "+r0(tdeeT)+" training / "+r0(tdeeR)+" rest ("+days.length+" days)");
  } else if (days.length>=5){
    const all = avg(days.map(d=>+d.calories));
    tdeeT = all*1.06; tdeeR = all*0.92;
    why.push("Burn from WHOOP average "+r0(all)+" kcal, split estimated (not enough of each day type yet)");
  } else {
    tdeeT = rmr*1.55; tdeeR = rmr*1.35;
    why.push("Burn estimated from RMR (no recent WHOOP calories)");
  }
  tdeeT = Math.max(tdeeT, floor); tdeeR = Math.max(tdeeR, floor);

  // Energy target by mode
  const adj = { cut:[-400,-500], recomp:[0,-250], maintain:[0,0], lean_gain:[350,150], clinical_hold:[0,0] }[mode] || [0,0];
  const kcalT = Math.round((tdeeT+adj[0])/10)*10, kcalR = Math.round((tdeeR+adj[1])/10)*10;
  if (adj[0]||adj[1]) why.push("Mode adjustment: "+(adj[0]>=0?"+":"")+adj[0]+" training / "+(adj[1]>=0?"+":"")+adj[1]+" rest");

  // Protein
  let protein, cap = null;
  if (lean){
    protein = Math.round(lean * (mode==="cut" ? 1.1 : 1.0));
    why.push("Protein "+(mode==="cut"?"1.1":"1.0")+" g per lb DEXA lean mass ("+r1(lean)+" lb)");
  } else if (wt){ protein = Math.round(wt*0.8); why.push("Protein 0.8 g per lb bodyweight (no DEXA)"); }
  else protein = 160;
  if (mode==="clinical_hold"){
    const kg = (wt||200)/2.2046;
    cap = Math.round(kg*1.6);
    if (protein > cap){ protein = cap; }
    why.push("Clinical hold: maintenance calories, protein capped at "+cap+" g (1.6 g/kg). Confirm the cap with your provider.");
  }

  // Fat and carbs
  const fat = Math.round((kcalR*0.28)/9);
  const carbT = Math.max(0, Math.round((kcalT - protein*4 - fat*9)/4));
  const carbR = Math.max(0, Math.round((kcalR - protein*4 - fat*9)/4));
  why.push("Fat 28% of rest-day calories; carbs fill the rest, higher on training days");

  return {
    mode, kcal_train:kcalT, kcal_rest:kcalR, protein_g:protein, carb_g_train:carbT, carb_g_rest:carbR, fat_g:fat,
    protein_cap_g:cap,
    inputs:{ rmr, lean_lb:lean, weight_lb:wt, tdee_train:r0(tdeeT), tdee_rest:r0(tdeeR), whoop_days:days.length,
             dexa_date: nut.dexa ? nut.dexa.measured_on : null, pnoe_date: nut.pnoe ? nut.pnoe.measured_on : null, why }
  };
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
  const uid = auth.uid, day = nut.day;
  try {
    const [m, g, bc, rc] = await Promise.all([
      sb("/rest/v1/meals?select=*,meal_items(*)&user_id=eq."+uid+"&eaten_on=eq."+day+"&order=eaten_at.asc"),
      sb("/rest/v1/nutrition_goals?select=*&user_id=eq."+uid+"&effective_from=lte."+day+"&order=effective_from.desc&limit=1"),
      sb("/rest/v1/body_comp?select=*&user_id=eq."+uid+"&order=measured_on.desc&limit=20"),
      sb("/rest/v1/meal_items?select=name,food_id,servings,grams,kcal,protein_g,carb_g,fat_g,fiber_g&user_id=eq."+uid+"&order=created_at.desc&limit=60"),
    ]);
    if (m.ok) nut.meals = await m.json();
    if (g.ok){ const rows = await g.json(); nut.goal = rows[0]||null; }
    if (bc.ok){
      const rows = await bc.json();
      nut.dexa = rows.find(r=>r.method==="dexa" && r.lean_mass_lb) || null;
      nut.pnoe = rows.find(r=>r.method==="pnoe" && r.rmr_kcal) || null;
    }
    if (rc.ok){
      const rows = await rc.json(), seen = {};
      nut.recent = rows.filter(r=>{ const k=r.name.toLowerCase(); if (seen[k]) return false; seen[k]=1; return true; }).slice(0,10);
    }
    nut.loadedFor = day;
  } catch(e){ toast("Couldn’t load food log."); }
  nut.loading = false;
  if (tab==="food") render();
}
function nGo(n){ nut.day = nDayOffset(nut.day||dayKey(), n); nut.addFor=null; nut.meals=[]; nut.loadedFor=null; render(); nLoad(); }

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
async function nCacheFood(f){
  if (f.food_id) return f.food_id;
  if (!f.source_id) return null;
  try {
    const q = await sb("/rest/v1/foods?select=id&source=eq."+f.source+"&source_id=eq."+encodeURIComponent(f.source_id)+"&limit=1");
    if (q.ok){ const rows = await q.json(); if (rows[0]) return rows[0].id; }
    const r = await sb("/rest/v1/foods", { method:"POST", headers:{ Prefer:"return=representation" }, body:{
      barcode:f.barcode||null, source:f.source, source_id:f.source_id, name:f.name.slice(0,200), brand:f.brand||null,
      serving_qty:1, serving_unit: f.serving_label || (f.serving_g ? f.serving_g+" g" : "100 g"), serving_g: f.serving_g || 100,
      kcal: r1(f.per100.kcal*(f.serving_g||100)/100), protein_g: r1(f.per100.p*(f.serving_g||100)/100),
      carb_g: r1(f.per100.c*(f.serving_g||100)/100), fat_g: r1(f.per100.f*(f.serving_g||100)/100),
      fiber_g: f.per100.fiber!=null ? r1(f.per100.fiber*(f.serving_g||100)/100) : null, created_by: auth.uid } });
    if (r.ok){ const rows = await r.json(); return rows[0] ? rows[0].id : null; }
  } catch(e){}
  return null;
}
async function nAddItem(item){
  try {
    const m = await nEnsureMeal(nut.addFor);
    const r = await sb("/rest/v1/meal_items", { method:"POST", headers:{ Prefer:"return=representation" },
      body: Object.assign({ meal_id:m.id, user_id:auth.uid }, item) });
    if (!r.ok) throw new Error("item "+r.status);
    const row = (await r.json())[0];
    m.meal_items = (m.meal_items||[]).concat([row]);
    nut.recent = [row].concat(nut.recent.filter(x=>x.name.toLowerCase()!==row.name.toLowerCase())).slice(0,10);
    nut.pick = null; nut.qty = ""; nut.results = []; nut.addFor = null; nut.showManual = false;
    nut.manual = { name:"", kcal:"", p:"", c:"", f:"" };
    toast("Added "+row.name+".");
    render();
  } catch(e){ toast("Couldn’t save that item."); }
}
async function nDeleteItem(mealId, itemId){
  const m = nut.meals.find(x=>x.id===mealId); if (!m) return;
  const keep = m.meal_items;
  m.meal_items = keep.filter(i=>i.id!==itemId); render();
  try {
    const r = await sb("/rest/v1/meal_items?id=eq."+itemId, { method:"DELETE" });
    if (!r.ok) throw new Error();
    if (!m.meal_items.length){
      await sb("/rest/v1/meals?id=eq."+m.id, { method:"DELETE" });
      nut.meals = nut.meals.filter(x=>x.id!==m.id); render();
    }
  } catch(e){ m.meal_items = keep; render(); toast("Couldn’t delete."); }
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

// ---------- food search (USDA FoodData Central + Open Food Facts) ----------
function nNormUsda(f){
  const by = {};
  (f.foodNutrients||[]).forEach(n=>{ by[n.nutrientNumber||n.nutrientId] = n.value; by[n.nutrientId] = n.value; });
  const p = by["203"] ?? by[1003] ?? 0, c = by["205"] ?? by[1005] ?? 0, fat = by["204"] ?? by[1004] ?? 0;
  let kcal = by["208"] ?? by[1008] ?? by["957"] ?? by[2047] ?? by["958"] ?? by[2048];
  if (kcal==null) kcal = p*4 + c*4 + fat*9;
  const g = (f.servingSizeUnit||"").toLowerCase()==="g" || (f.servingSizeUnit||"").toLowerCase()==="grm" ? +f.servingSize : null;
  return {
    source:"usda", source_id:String(f.fdcId), barcode: f.gtinUpc || null,
    name: nTitle(f.description||"Food"), brand: f.brandOwner || f.brandName || "",
    per100:{ kcal:+kcal, p:+p, c:+c, f:+fat, fiber: by["291"] ?? by[1079] ?? null },
    serving_g: g || null, serving_label: f.householdServingFullText || null
  };
}
function nNormOff(p){
  const n = p.nutriments||{};
  const kcal = n["energy-kcal_100g"] ?? (n["energy_100g"]!=null ? n["energy_100g"]/4.184 : null);
  if (kcal==null) return null;
  return {
    source:"off", source_id:String(p.code||""), barcode: p.code || null,
    name: p.product_name || "Product", brand: (p.brands||"").split(",")[0],
    per100:{ kcal:+kcal, p:+(n.proteins_100g||0), c:+(n.carbohydrates_100g||0), f:+(n.fat_100g||0), fiber: n.fiber_100g!=null ? +n.fiber_100g : null },
    serving_g: p.serving_quantity ? +p.serving_quantity : null, serving_label: p.serving_size || null
  };
}
function nTitle(s){ return s.length>3 && s===s.toUpperCase() ? s.toLowerCase().replace(/\b\w/g,c=>c.toUpperCase()) : s; }
function nTimeout(p, ms){ return Promise.race([p, new Promise((_,rej)=>setTimeout(()=>rej(new Error("timeout")), ms))]); }

async function nSearch(){
  const el = document.getElementById("nq"); const q = el ? el.value.trim() : "";
  if (q.length<2){ toast("Type at least 2 letters."); return; }
  const box = document.getElementById("nres"); if (box) box.innerHTML = '<p class="statline">Searching…</p>';
  const usda = nTimeout(fetch("https://api.nal.usda.gov/fdc/v1/foods/search?api_key="+FDC_KEY+"&pageSize=12&dataType=Foundation,SR%20Legacy,Survey%20(FNDDS),Branded&query="+encodeURIComponent(q)), 9000)
    .then(r=>r.ok ? r.json() : Promise.reject(r.status)).then(d=>(d.foods||[]).map(nNormUsda)).catch(e=>{ if (e===429) toast("USDA search limit hit. Try again later or use quick add."); return []; });
  const off = nTimeout(fetch("https://world.openfoodfacts.org/cgi/search.pl?search_simple=1&json=1&page_size=8&fields=code,product_name,brands,nutriments,serving_quantity,serving_size&search_terms="+encodeURIComponent(q)), 9000)
    .then(r=>r.ok ? r.json() : Promise.reject(r.status)).then(d=>(d.products||[]).map(nNormOff).filter(Boolean)).catch(()=>[]);
  const [a, b] = await Promise.all([usda, off]);
  // Whole foods first (USDA generic), then branded, then OFF
  const generic = a.filter(x=>!x.brand), branded = a.filter(x=>x.brand);
  nut.results = generic.concat(branded, b).filter(x=>x.per100.kcal>=0).slice(0,20);
  nut.pick = null;
  nPaintResults();
}
function nPaintResults(){
  const box = document.getElementById("nres"); if (!box) return;
  if (!nut.results.length){ box.innerHTML = '<p class="statline">No matches. Try simpler words, or use quick add.</p>'; return; }
  box.innerHTML = nut.results.map((f,i)=>{
    const sg = f.serving_g || 100;
    const k = r0(f.per100.kcal*sg/100);
    return '<button onclick="nPick('+i+')"><b>'+esc(f.name)+'<span class="nsrc">'+(f.source==="usda"?"USDA":"OFF")+'</span></b>'
      +'<span>'+(f.brand?esc(f.brand)+' · ':'')+k+' kcal per '+(f.serving_label?esc(f.serving_label)+' ('+r0(sg)+' g)':r0(sg)+' g')
      +' · P '+r0(f.per100.p*sg/100)+' C '+r0(f.per100.c*sg/100)+' F '+r0(f.per100.f*sg/100)+'</span></button>';
  }).join("");
}
function nPick(i){ nut.pick = i; const f = nut.results[i]; nut.qty = String(r0(f.serving_g || 100)); render(); }
function nMacrosFor(f, grams){
  const k = grams/100;
  return { kcal:r1(f.per100.kcal*k), protein_g:r1(f.per100.p*k), carb_g:r1(f.per100.c*k), fat_g:r1(f.per100.f*k),
           fiber_g: f.per100.fiber!=null ? r1(f.per100.fiber*k) : null };
}
async function nConfirmPick(){
  const f = nut.results[nut.pick]; const grams = parseFloat(nut.qty);
  if (!f || !(grams>0)){ toast("Enter grams."); return; }
  const food_id = await nCacheFood(f);
  const base = f.serving_g || 100;
  nAddItem(Object.assign({ name: (f.brand ? f.brand+" " : "")+f.name, food_id, grams:r1(grams), servings:r1(grams/base), entry_method:"search" }, nMacrosFor(f, grams)));
}
function nAddRecent(i){
  const r = nut.recent[i]; if (!r) return;
  nAddItem({ name:r.name, food_id:r.food_id, grams:r.grams, servings:r.servings, kcal:r.kcal, protein_g:r.protein_g, carb_g:r.carb_g, fat_g:r.fat_g, fiber_g:r.fiber_g, entry_method:"recent" });
}
function nAddManual(){
  const m = nut.manual;
  const p = parseFloat(m.p)||0, c = parseFloat(m.c)||0, f = parseFloat(m.f)||0;
  let kcal = parseFloat(m.kcal);
  if (!(kcal>=0)) kcal = p*4 + c*4 + f*9;
  if (!m.name.trim()){ toast("Name it so you can find it again."); return; }
  if (!(kcal>0)){ toast("Enter calories or macros."); return; }
  nAddItem({ name:m.name.trim().slice(0,200), servings:1, kcal:r1(kcal), protein_g:r1(p), carb_g:r1(c), fat_g:r1(f), entry_method:"manual" });
}
function nOpenAdd(type){ nut.addFor = type; nut.results = []; nut.pick = null; nut.showManual = false; render();
  setTimeout(()=>{ const el = document.getElementById("nq"); if (el) el.focus(); }, 60); }
function nCloseAdd(){ nut.addFor = null; nut.pick = null; nut.results = []; render(); }
function nToggleDayType(){
  const cur = nIsTrainingDay(nut.day);
  nut.dayTypeOverride[nut.day] = cur ? "rest" : "train"; render();
}

// ---------- render ----------
function nBar(label, have, target, unit){
  const pct = target>0 ? Math.min(100, have/target*100) : 0;
  const over = target>0 && have > target*1.05;
  return '<div class="nbar'+(over?" over":"")+'"><div class="nl"><b>'+label+'</b><span class="num">'+r0(have)+' / '+(target||"–")+' '+unit
    +(target? ' · '+(target-have>=0 ? r0(target-have)+' left' : r0(have-target)+' over') : '')+'</span></div>'
    +'<div class="nt"><div class="nf" style="width:'+pct+'%"></div></div></div>';
}
function renderFood(){
  if (!auth) return '<div class="panel a"><p class="statline">Sign in to track food. Your log syncs to your account so your coach can see it.</p></div>';
  if (!nut.day) nut.day = dayKey();
  if (nut.loadedFor!==nut.day && !nut.loading) setTimeout(()=>nLoad(), 0);

  let h = '<div class="nday"><button onclick="nGo(-1)" aria-label="Previous day">‹</button>'
    +'<div class="nd"><b>'+nDayLabel(nut.day)+'</b><span>'+(nIsTrainingDay(nut.day)?"Training day":"Rest day")
    +' · <button class="silink" style="min-width:0;min-height:0;border:0;background:none;font-size:12px" onclick="nToggleDayType()">switch</button></span></div>'
    +'<button onclick="nGo(1)" aria-label="Next day"'+(nut.day>=dayKey()?' disabled style="opacity:.35"':'')+'>›</button></div>';

  // Add sheet takes over the view while open
  if (nut.addFor) return h + renderFoodAdd();

  const t = nTotals(), tg = nTargetsFor(nut.day);
  h += '<div class="panel a">';
  if (tg){
    h += nBar("Calories", t.kcal, tg.kcal, "kcal") + nBar("Protein", t.p, tg.p, "g") + nBar("Carbs", t.c, tg.c, "g") + nBar("Fat", t.f, tg.f, "g");
  } else {
    h += '<div class="bmetrics" style="margin:0">'+statCell("kcal", r0(t.kcal))+statCell("Protein", r0(t.p)+"g")+statCell("Carbs", r0(t.c)+"g")+'</div>'
      +'<p class="statline">No targets yet. Set a goal below and Iron Log builds them from your DEXA, PNOE, and WHOOP data.</p>';
  }
  if (nut.loading && nut.loadedFor!==nut.day) h += '<p class="statline">Loading…</p>';
  h += '</div>';

  MEAL_TYPES.forEach(([type,label])=>{
    const m = nut.meals.find(x=>x.meal_type===type);
    const items = m ? (m.meal_items||[]) : [];
    if (!items.length && (type==="pre_workout"||type==="post_workout") && !nIsTrainingDay(nut.day)) return;
    h += '<div class="panel a"><div class="nmeal"><div><h3>'+label+'</h3>'+(items.length?'<span class="nk num">'+r0(nMealTotals(m))+' kcal</span>':'')+'</div>'
      +'<button class="sibtn sm" onclick="nOpenAdd(\''+type+'\')">+ Add</button></div>';
    items.forEach(i=>{
      h += '<div class="nitem"><div class="nn"><b>'+esc(i.name)+'</b><span>'+(i.grams?r0(i.grams)+' g · ':'')+'P '+r0(i.protein_g)+' C '+r0(i.carb_g)+' F '+r0(i.fat_g)+'</span></div>'
        +'<div class="nm num">'+r0(i.kcal)+'<button class="delbtn sm" onclick="nDeleteItem(\''+m.id+'\',\''+i.id+'\')" aria-label="Delete">✕</button></div></div>';
    });
    h += '</div>';
  });

  h += renderFoodGoal();
  return h;
}
function renderFoodAdd(){
  const label = (MEAL_TYPES.find(x=>x[0]===nut.addFor)||[0,"Meal"])[1];
  let h = '<div class="panel a"><div class="nmeal"><h3>Add to '+label+'</h3><button class="silink" onclick="nCloseAdd()">Done</button></div>';
  if (nut.pick!=null && nut.results[nut.pick]){
    const f = nut.results[nut.pick], g = parseFloat(nut.qty)||0, mm = nMacrosFor(f, g);
    h += '<p style="margin-top:10px;font-weight:700">'+esc((f.brand?f.brand+" ":"")+f.name)+'</p>'
      + (f.serving_label ? '<p class="statline" style="margin-top:2px">Serving: '+esc(f.serving_label)+(f.serving_g?' = '+r0(f.serving_g)+' g':'')+'</p>' : '')
      + '<div class="nqty"><input id="nqty" inputmode="decimal" value="'+esc(nut.qty)+'" oninput="nut.qty=this.value;nPaintPick()" aria-label="Grams"><span class="statline" style="margin:0">grams</span></div>'
      + '<p class="statline" id="npick">'+r0(mm.kcal)+' kcal · P '+r0(mm.protein_g)+' C '+r0(mm.carb_g)+' F '+r0(mm.fat_g)+'</p>'
      + '<div class="chips"><button class="sibtn" onclick="nConfirmPick()">Add</button><button class="silink" onclick="nut.pick=null;render();setTimeout(nPaintResults,0)">Back to results</button></div>';
    return h + '</div>';
  }
  h += '<div class="nsearch" style="margin-top:10px"><input id="nq" type="search" placeholder="Search foods (chicken breast, oats…)" onkeydown="if(event.key===\'Enter\')nSearch()" enterkeyhint="search">'
    +'<button class="sibtn" onclick="nSearch()">Search</button></div><div class="nres" id="nres"></div>';
  if (nut.recent.length){
    h += '<p class="statline" style="margin-top:14px">Recent</p><div class="chips" style="margin-top:6px">'
      + nut.recent.map((r,i)=>'<button class="chip" onclick="nAddRecent('+i+')">'+esc(r.name.length>28?r.name.slice(0,27)+"…":r.name)+' <span class="num" style="color:var(--dim)">'+r0(r.kcal)+'</span></button>').join("")
      + '</div>';
  }
  h += '<div style="margin-top:14px"><button class="silink" onclick="nut.showManual=!nut.showManual;render()">'+(nut.showManual?"Hide quick add":"Quick add (enter macros yourself)")+'</button></div>';
  if (nut.showManual){
    const m = nut.manual;
    h += '<div class="nman"><input class="wide" placeholder="Name" value="'+esc(m.name)+'" oninput="nut.manual.name=this.value">'
      +'<input inputmode="decimal" placeholder="Calories (optional)" value="'+esc(m.kcal)+'" oninput="nut.manual.kcal=this.value">'
      +'<input inputmode="decimal" placeholder="Protein g" value="'+esc(m.p)+'" oninput="nut.manual.p=this.value">'
      +'<input inputmode="decimal" placeholder="Carbs g" value="'+esc(m.c)+'" oninput="nut.manual.c=this.value">'
      +'<input inputmode="decimal" placeholder="Fat g" value="'+esc(m.f)+'" oninput="nut.manual.f=this.value"></div>'
      +'<div class="chips"><button class="sibtn" onclick="nAddManual()">Add</button></div>'
      +'<p class="statline">Leave calories blank to calculate from macros.</p>';
  }
  setTimeout(()=>{ if (nut.results.length) nPaintResults(); }, 0);
  return h + '</div>';
}
function nPaintPick(){
  const f = nut.results[nut.pick], el = document.getElementById("npick"); if (!f || !el) return;
  const mm = nMacrosFor(f, parseFloat(nut.qty)||0);
  el.textContent = r0(mm.kcal)+" kcal · P "+r0(mm.protein_g)+" C "+r0(mm.carb_g)+" F "+r0(mm.fat_g);
}
function renderFoodGoal(){
  const g = nut.goal;
  let h = '<h2 class="sect disp a">Targets</h2><div class="panel a">';
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
    h += '<div class="chips"><button class="silink" onclick="nut.goalEdit=true;nut.draftMode=\''+g.mode+'\';render()">Change goal or recalculate</button></div>';
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
    h += '<div class="chips"><button class="sibtn" onclick="nSaveGoal()">Save targets</button>'
      + (g ? '<button class="silink" onclick="nut.goalEdit=false;nut.draftMode=null;render()">Cancel</button>' : '') + '</div>';
  }
  return h + '</div>';
}
