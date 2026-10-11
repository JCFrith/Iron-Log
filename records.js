"use strict";
// ================= Iron Log: Health records (DEXA, PNOE, labs) =================
// Loaded after nutrition.js. Uses: nut, nWho, nBody, nUpsertBc, nIcon, nDate, r0, r1, nLoadScript,
// plus index.html globals sb, auth, SUPA, SUPA_KEY, refreshAuth, render, toast, esc, dayKey, tab.

const LIB_PDFJS = "https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.min.js";
const LIB_PDFJS_WORKER = "https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.worker.min.js";
const REC_BUCKET = "health-records";
const REC_KINDS = { dexa:"DEXA scan", pnoe:"PNOE / RMR test", labs:"Lab results" };

// Canonical markers. Order matters: more specific names first so "Hemoglobin A1c" never lands on Hemoglobin.
const LAB_MARKERS = [
  ["a1c","Hemoglobin A1c","Hemoglobin A1c|HEMOGLOBIN A1C|HbA1c|A1C"],
  ["free_testosterone","Free testosterone","Testosterone,?\\s*Free(?:,?\\s*Direct)?|Free Testosterone|TESTOSTERONE,? FREE"],
  ["testosterone","Total testosterone","Testosterone(?:,\\s*Total)?(?:,?\\s*LC/?MS)?(?:\\s*\\(?[A-Z]\\)?)?|TESTOSTERONE(?:,? TOTAL)?"],
  ["estradiol","Estradiol","Estradiol(?:,\\s*Sensitive)?|ESTRADIOL"],
  ["shbg","SHBG","Sex Horm(?:one)? Binding Glob(?:ulin)?|SHBG"],
  ["psa","PSA","Prostate Specific Ag|PSA(?:,?\\s*Total)?"],
  ["cystatin_c","Cystatin C","Cystatin C|CYSTATIN C"],
  ["egfr","eGFR","eGFR(?:\\s*(?:CKD-EPI|If NonAfricn Am|Non-Afr\\. American))?|EGFR"],
  ["bun_creat","BUN/creatinine ratio","BUN/Creatinine Ratio"],
  ["creatinine","Creatinine","Creatinine|CREATININE"],
  ["bun","BUN","BUN|Urea Nitrogen|UREA NITROGEN"],
  ["glucose","Glucose","Glucose|GLUCOSE"],
  ["insulin","Insulin","Insulin|INSULIN"],
  ["sodium","Sodium","Sodium|SODIUM"],
  ["potassium","Potassium","Potassium|POTASSIUM"],
  ["chloride","Chloride","Chloride|CHLORIDE"],
  ["co2","CO2","Carbon Dioxide,?\\s*Total|CARBON DIOXIDE|CO2"],
  ["ionized_calcium","Ionized calcium","Calcium,?\\s*Ionized|Ionized Calcium|CALCIUM,? IONIZED"],
  ["calcium","Calcium","Calcium|CALCIUM"],
  ["protein_total","Total protein","Protein,?\\s*Total|Total Protein|PROTEIN,? TOTAL"],
  ["albumin","Albumin","Albumin|ALBUMIN"],
  ["bilirubin","Bilirubin","Bilirubin,?\\s*Total|Total Bilirubin|BILIRUBIN,? TOTAL"],
  ["alk_phos","Alkaline phosphatase","Alkaline Phosphatase|ALKALINE PHOSPHATASE|Alk Phos"],
  ["ast","AST","AST(?:\\s*\\(SGOT\\))?|SGOT"],
  ["alt","ALT","ALT(?:\\s*\\(SGPT\\))?|SGPT"],
  ["ggt","GGT","GGT|Gamma-Glutamyl Transferase"],
  ["wbc","WBC","WBC|White Blood Cell Count"],
  ["rbc","RBC","RBC|Red Blood Cell Count"],
  ["hemoglobin","Hemoglobin","Hemoglobin|HEMOGLOBIN|HGB|Hgb"],
  ["hematocrit","Hematocrit","Hematocrit|HEMATOCRIT|HCT"],
  ["mcv","MCV","MCV"],
  ["platelets","Platelets","Platelets|Platelet Count|PLT"],
  ["tsh","TSH","TSH"],
  ["free_t4","Free T4","Free T4|T4,?\\s*Free(?:\\s*\\(Direct\\))?|Free Thyroxine"],
  ["free_t3","Free T3","Free T3|T3,?\\s*Free|Triiodothyronine,?\\s*Free"],
  ["cholesterol","Total cholesterol","Cholesterol,?\\s*Total|Total Cholesterol|CHOLESTEROL"],
  ["ldl","LDL","LDL(?:\\s*Chol(?:esterol)?(?:\\s*Calc)?(?:\\s*\\(NIH\\))?)?|LDL-C"],
  ["hdl","HDL","HDL(?:\\s*Chol(?:esterol)?)?|HDL-C"],
  ["triglycerides","Triglycerides","Triglycerides|TRIGLYCERIDES"],
  ["apob","ApoB","Apolipoprotein B|ApoB|APOB"],
  ["hscrp","hs-CRP","C-Reactive Protein,?\\s*Cardiac|hs-?CRP|HS-?CRP|C-Reactive Protein"],
  ["ferritin","Ferritin","Ferritin|FERRITIN"],
  ["iron","Iron","Iron(?:,\\s*(?:Total|Serum))?(?!\\s*Bind)|IRON(?!\\s*BIND)"],
  ["vit_d","Vitamin D","Vitamin D,?\\s*25-?Hydroxy|25-?OH Vitamin D|Vitamin D|VITAMIN D"],
  ["b12","Vitamin B12","Vitamin B-?12|B12"],
  ["pth","PTH","PTH,?\\s*Intact|Intact PTH|Parathyroid Hormone|PTH"],
];
const LAB_NAME = {}; LAB_MARKERS.forEach(([k,n])=>{ LAB_NAME[k] = n; });
const LAB_RX = LAB_MARKERS.map(([k,,src])=>[k, new RegExp("^\\s*(?:"+src+")(?![A-Za-z])\\*?", "")]);

// ---------- PDF to text lines ----------
async function nPdfLines(file){
  const lib = await nLoadScript(LIB_PDFJS, "pdfjsLib");
  lib.GlobalWorkerOptions.workerSrc = LIB_PDFJS_WORKER;
  const buf = await file.arrayBuffer();
  const head = new Uint8Array(buf.slice(0,4));
  if (head[0]===0x50 && head[1]===0x4B) throw new Error("zip");
  const doc = await lib.getDocument({ data: buf }).promise;
  const lines = [];
  for (let p=1; p<=Math.min(doc.numPages, 40); p++){
    const page = await doc.getPage(p);
    const tc = await page.getTextContent();
    const rows = [];
    tc.items.forEach(it=>{
      if (!it.str || !it.str.trim()) return;
      const x = it.transform[4], y = it.transform[5], h = Math.abs(it.transform[3]) || 8;
      let row = rows.find(r=>Math.abs(r.y - y) <= Math.max(2, h*0.35));
      if (!row){ row = { y, h, items:[] }; rows.push(row); }
      row.items.push({ x, w: it.width || it.str.length*h*0.5, s: it.str, h });
    });
    rows.sort((a,b)=>b.y-a.y);
    rows.forEach(r=>{
      r.items.sort((a,b)=>a.x-b.x);
      let line = "", end = null;
      r.items.forEach(it=>{
        if (end!=null){ const gap = it.x - end; line += gap > it.h*1.2 ? "   " : (gap > it.h*0.15 ? " " : ""); }
        line += it.s; end = it.x + it.w;
      });
      lines.push(line.replace(/\s+$/,""));
    });
    lines.push("");
  }
  return lines;
}

// ---------- parsers ----------
const MONTHS = {jan:1,feb:2,mar:3,apr:4,may:5,jun:6,jul:7,aug:8,sep:9,oct:10,nov:11,dec:12};
function nIso(y,m,d){ y=+y; if (y<100) y+=2000; return y+"-"+String(+m).padStart(2,"0")+"-"+String(+d).padStart(2,"0"); }
function nFindDate(text, labels){
  for (const lab of labels){
    const m = text.match(new RegExp(lab+"[:\\s]*([A-Za-z]{3,9})\\.?\\s+(\\d{1,2}),?\\s+(\\d{4})", "i"));
    if (m && MONTHS[m[1].slice(0,3).toLowerCase()]) return nIso(m[3], MONTHS[m[1].slice(0,3).toLowerCase()], m[2]);
    const n = text.match(new RegExp(lab+"[:\\s]*(\\d{1,2})/(\\d{1,2})/(\\d{2,4})", "i"));
    if (n) return nIso(n[3], n[1], n[2]);
  }
  return "";
}
function nParseDexa(lines){
  const t = lines.join("\n"), out = { date:"", wt:"", lean:"", fat:"", bf:"", vat:"", trunk:"", bmc:"" };
  out.date = nFindDate(t, ["Scan Date","Measured","Exam Date","Date of Scan","Date"]);
  const num = "(\\d+(?:\\.\\d+)?)";
  const lbRow = t.match(new RegExp("^\\s*Total\\s+"+num+"\\s+"+num+"\\s+"+num+"\\s+"+num+"(?!\\s+\\d{3,})", "m"));
  const gRow = t.match(new RegExp("^\\s*Total\\s+"+num+"\\s+"+num+"\\s+"+num+"\\s+"+num+"\\s+"+num+"\\s+"+num+"\\s*$", "m"));
  const G = 453.592;
  if (gRow && +gRow[3] > 1000){ // Hologic grams table: BMC, Fat, Lean, Lean+BMC, Total, %Fat
    out.bmc = String(r1(+gRow[1]/G)); out.fat = String(r1(+gRow[2]/G)); out.lean = String(r1(+gRow[3]/G));
    out.wt = String(r1(+gRow[5]/G)); out.bf = String(+gRow[6]);
  }
  if (lbRow && +lbRow[3] > 60 && +lbRow[3] < 700){ // lb table: Fat, Lean+BMC, Total, %Fat
    if (!out.fat) out.fat = lbRow[1];
    if (!out.wt) out.wt = lbRow[3];
    if (!out.bf) out.bf = lbRow[4];
    if (!out.lean) out.lean = String(r1(+lbRow[2] * 0.956)); // remove ~4.4% bone mineral when no grams table
  }
  const leanTrend = t.match(/Total Lean Mass Results[\s\S]{0,400}?\d{2}\/\d{2}\/\d{4}\s+\d{1,3}\s+(\d{2,3}\.\d+)/);
  if (leanTrend) out.lean = leanTrend[1];
  if (!out.bf){ const m = t.match(/(?:Total Body\s*%\s*Fat|Body Fat\s*%?|%\s*Fat)[^\d\n]{0,20}(\d{1,2}\.\d)/i); if (m) out.bf = m[1]; }
  if (!out.lean){ const m = t.match(/Lean(?:\s*Mass|\s*Tissue)?\s*\(?lbs?\)?[^\d\n]{0,10}(\d{2,3}\.\d)/i); if (m) out.lean = m[1]; }
  const vat = t.match(/Est\.?\s*VAT Mass\s*\(g\)\s*(\d+(?:\.\d+)?)/i) || t.match(/VAT Mass[^\d\n]{0,12}(\d+(?:\.\d+)?)\s*g/i);
  if (vat) out.vat = String(r1(+vat[1]/G));
  const trunk = t.match(new RegExp("^\\s*Trunk\\s+"+num+"\\s+"+num+"\\s+"+num, "m"));
  if (trunk && +trunk[1] < 150) out.trunk = trunk[1];
  return out;
}
function nParsePnoe(lines){
  const t = lines.join("\n"), out = { date:"", rmr:"", wt:"" };
  out.date = nFindDate(t, ["Test Date","Date of test","Date","Tested"]);
  const m = t.match(/(?:RMR|Resting Metabolic Rate|Resting Energy Expenditure|REE)[^\d\n]{0,40}(\d{1,2},?\d{3})\s*(?:kcal|cal|Kcal|KCAL)/)
    || t.match(/(\d{1,2},?\d{3})\s*(?:kcal|cal)(?:\/day)?[^\n]{0,30}(?:RMR|resting)/i)
    || t.match(/(?:RMR|Resting Metabolic Rate)[^\d\n]{0,40}(\d{4})/i);
  if (m) out.rmr = m[1].replace(",","");
  const w = t.match(/Weight[:\s]*(\d{2,3}(?:\.\d)?)\s*(lb|lbs|kg)/i);
  if (w) out.wt = w[2].toLowerCase()==="kg" ? String(r1(+w[1]*2.2046)) : w[1];
  return out;
}
function nParseLabs(lines){
  const all = lines.join("\n");
  const date = nFindDate(all, ["Date Collected","Date and time collected","Collected","Collection Date","Drawn","Date"]);
  // Merge LabCorp-style wraps: a name-only line followed by a line that starts with the value.
  const L = [];
  for (let i=0;i<lines.length;i++){
    const a = lines[i], b = lines[i+1];
    if (b!=null && /^\s*[A-Za-z][A-Za-z ,()\/.+-]*?(?:\s+0\d)?\s*$/.test(a) && /^\s*[<>]?\d/.test(b) && !/Result:/i.test(b)){ L.push(a+"  "+b.trim()); i++; }
    else L.push(a);
  }
  const rows = [], seen = {};
  const push = r => { if (!seen[r.marker]){ seen[r.marker] = 1; rows.push(r); } };
  for (let i=0;i<L.length;i++){
    const line = L[i];
    let key = null, rest = null;
    for (const [k, rx] of LAB_RX){ const m = line.match(rx); if (m){ key = k; rest = line.slice(m[0].length); break; } }
    if (!key) continue;
    // VA / portal block: name alone, then "Result: v unit", then "Reference range: a - b"
    if (!/\d/.test(rest)){
      const nx = L.slice(i+1, i+5).join("\n");
      const r = nx.match(/Result:\s*([<>]?\s*\d[\d.,]*)\s*(H|L|High|Low)?\s*([^\n]*)/i);
      if (r){
        const rr = nx.match(/Reference range:\s*([\d.]+)\s*-\s*([\d.]+)/i) || nx.match(/Reference range:\s*([<>])\s*=?\s*([\d.]+)/i);
        push(nLabRow(key, r[1], r[2], (r[3]||"").trim(), rr));
      }
      continue;
    }
    // Table row: [lab code] value [flag] [previous value + date] [unit] [range]
    let s = rest.replace(/^\s*\([^)]{0,30}\)/, "").replace(/^\s*0\d\s+(?=[<>]?\d)/, "");
    const vm = s.match(/^\s*([<>]?\s*\d[\d.,]*)\s*(High|Low|H|L)?(?![A-Za-z])/);
    if (!vm) continue;
    s = s.slice(vm[0].length);
    const rr = s.match(/([\d.]+)\s*-\s*([\d.]+)\s*$/) || s.match(/([<>])\s*=?\s*([\d.]+)\s*$/);
    const mid = rr ? s.slice(0, rr.index) : s;
    const unit = (mid.split(/\s+/).filter(x=>x && /[A-Za-z%\/]/.test(x) && !/^\d{1,2}\/\d{1,2}\/\d{2,4}$/.test(x) && !/^(High|Low|H|L|Final)$/i.test(x))[0]) || "";
    push(nLabRow(key, vm[1], vm[2], unit, rr));
  }
  return { date, rows };
}
function nLabRow(key, val, flag, unit, rr){
  const v = String(val).replace(/\s|,/g,"");
  const num = parseFloat(v.replace(/^[<>]/,""));
  const row = { marker:key, name:LAB_NAME[key]||key, value: isNaN(num) ? "" : String(num), value_text: /^[<>]/.test(v) ? v : "", unit: (unit||"").slice(0,24), ref_low:"", ref_high:"", flag:"" };
  if (rr){ if (rr[1]==="<"){ row.ref_high = rr[2]; } else if (rr[1]===">"){ row.ref_low = rr[2]; } else { row.ref_low = rr[1]; row.ref_high = rr[2]; } }
  const f = (flag||"").toUpperCase()[0];
  if (f==="H" || f==="L") row.flag = f;
  else if (!isNaN(num)){ if (row.ref_high!=="" && num > +row.ref_high) row.flag = "H"; else if (row.ref_low!=="" && num < +row.ref_low) row.flag = "L"; }
  return row;
}

// ---------- data ----------
async function nRecLoad(force){
  const W = nWho(); if (!W || !W.uid) return;
  if (!force && nut.rec && nut.rec.uid===W.uid) return;
  nut.rec = { uid:W.uid, loading:true, records:[], labs:[] }; render();
  try {
    const [hr, lr, bc] = await Promise.all([
      sb("/rest/v1/health_records?select=*&user_id=eq."+W.uid+"&order=record_date.desc"),
      sb("/rest/v1/lab_results?select=*&user_id=eq."+W.uid+"&order=drawn_on.desc&limit=2000"),
      sb("/rest/v1/body_comp?select=*&user_id=eq."+W.uid+"&order=measured_on.desc&limit=60"),
    ]);
    if (!nut.rec || nut.rec.uid!==W.uid) return;
    nut.rec.records = hr.ok ? await hr.json() : [];
    nut.rec.labs = lr.ok ? await lr.json() : [];
    if (bc.ok){ const rows = await bc.json(); W.bc.length = 0; rows.forEach(r=>W.bc.push(r)); }
  } catch(e){ toast("Couldn’t load health records."); }
  if (nut.rec) nut.rec.loading = false;
  render();
}
function nRecOpen(kind){
  if (!nut.coachUid && typeof tab!=="undefined" && tab!=="progress"){ try { setTab("progress"); } catch(e){} }
  nut.records = true; nut.recUp = null; nut.bcForm = null;
  if (kind) nRecStart(kind);
  render(); nRecLoad(); try { scrollTo({top:0}); } catch(e){}
}
function nRecClose(){ nut.records = false; nut.recUp = null; render(); }

// ---------- upload flow ----------
function nRecStart(kind){ nut.recUp = { kind, status:"choose", file:null, form:null, rows:[], img:null }; render(); }
function nRecPick(){ nPickFile("application/pdf,image/*", false, nRecFile); }
function nRecManual(){ const U = nut.recUp; U.status = "review"; nRecBlank(U); render(); }
function nRecBlank(U){
  if (U.kind==="dexa") U.form = Object.assign({ date:"", wt:"", lean:"", fat:"", bf:"", vat:"", trunk:"", bmc:"" }, U.form||{});
  else if (U.kind==="pnoe") U.form = Object.assign({ date:"", rmr:"", wt:"" }, U.form||{});
  else { U.form = Object.assign({ date:"", title:"" }, U.form||{}); if (!U.rows.length) U.rows = [nBlankLab()]; }
  if (!U.form.date) U.form.date = dayKey();
}
function nBlankLab(){ return { marker:"", name:"", value:"", value_text:"", unit:"", ref_low:"", ref_high:"", flag:"" }; }
async function nRecFile(file){
  const U = nut.recUp; if (!U) return;
  if (file.size > 25*1024*1024){ toast("That file is over 25 MB."); return; }
  U.file = file; U.status = "reading"; U.parsed = false; render();
  const isPdf = file.type==="application/pdf" || /\.pdf$/i.test(file.name);
  if (isPdf){
    try {
      const lines = await nPdfLines(file);
      if (U.kind==="dexa") U.form = nParseDexa(lines);
      else if (U.kind==="pnoe") U.form = nParsePnoe(lines);
      else { const p = nParseLabs(lines); U.form = { date:p.date, title:"" }; U.rows = p.rows; }
      U.parsed = true;
      const got = U.kind==="labs" ? U.rows.length : Object.values(U.form).filter(Boolean).length;
      toast(got ? "Read "+got+(U.kind==="labs"?" results":" values")+". Check them against the report." : "Couldn’t find numbers in that PDF. Enter them below.");
    } catch(e){
      toast(e && e.message==="zip" ? "That file is a zip archive, not a PDF. Export it as a PDF and try again." : "Couldn’t read that PDF. Enter the numbers below; the file still gets saved.");
    }
  } else {
    try { U.img = URL.createObjectURL(file); } catch(e){}
  }
  nRecBlank(U); U.status = "review"; render();
}
function nRecSet(k, v){ if (nut.recUp && nut.recUp.form) nut.recUp.form[k] = v; }
function nLabSet(i, k, v){
  const r = nut.recUp && nut.recUp.rows[i]; if (!r) return;
  r[k] = v;
  if (k==="marker"){ r.name = LAB_NAME[v] || r.name; render(); }
}
function nLabAdd(){ nut.recUp.rows.push(nBlankLab()); render(); }
function nLabDel(i){ nut.recUp.rows.splice(i,1); render(); }
async function nRecUploadFile(W, kind, file, date){
  if (auth && auth.exp - 60 < Math.floor(Date.now()/1000)) await refreshAuth();
  const ext = (file.name.match(/\.[A-Za-z0-9]{1,5}$/)||[""])[0].toLowerCase() || (file.type==="application/pdf"?".pdf":".jpg");
  const safe = file.name.replace(/\.[^.]+$/,"").replace(/[^A-Za-z0-9_-]+/g,"-").slice(0,40) || kind;
  const path = W.uid+"/"+kind+"/"+(date||dayKey())+"-"+Math.random().toString(36).slice(2,8)+"-"+safe+ext;
  const r = await fetch(SUPA+"/storage/v1/object/"+REC_BUCKET+"/"+path, { method:"POST",
    headers:{ apikey:SUPA_KEY, Authorization:"Bearer "+auth.at, "content-type": file.type || "application/octet-stream", "x-upsert":"false" }, body:file });
  if (!r.ok) throw new Error("upload "+r.status);
  return path;
}
async function nRecSave(){
  const U = nut.recUp, W = nWho(); if (!U || !U.form) return;
  const F = U.form, date = F.date;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || date > dayKey()){ toast("Enter the date of the scan or draw."); return; }
  let bcRow = null, labRows = [];
  if (U.kind==="dexa"){
    const wt = parseFloat(F.wt), lean = parseFloat(F.lean), bf = parseFloat(F.bf), fat = parseFloat(F.fat);
    if (!(wt>70)){ toast("Enter total mass in pounds."); return; }
    if (!(lean>40) && !(bf>2)){ toast("Enter lean mass or body fat %."); return; }
    bcRow = { method:"dexa", measured_on:date, weight_lb:r1(wt),
      lean_mass_lb: lean>40 ? r1(lean) : r1(wt*(1-bf/100)*0.956),
      body_fat_pct: bf>2 ? r1(bf) : (fat>0 ? r1(fat/wt*100) : null),
      fat_mass_lb: fat>0 ? r1(fat) : (bf>2 ? r1(wt*bf/100) : null),
      vat_lb: parseFloat(F.vat)>0 ? r1(+F.vat) : null, trunk_fat_lb: parseFloat(F.trunk)>0 ? r1(+F.trunk) : null,
      bmc_lb: parseFloat(F.bmc)>0 ? r1(+F.bmc) : null, source_file: U.file ? U.file.name.slice(0,120) : null };
  } else if (U.kind==="pnoe"){
    const rmr = parseInt(F.rmr,10), wt = parseFloat(F.wt);
    if (!(rmr>=900 && rmr<=4500)){ toast("Enter resting burn in kcal per day."); return; }
    bcRow = { method:"pnoe", measured_on:date, rmr_kcal:rmr, weight_lb: wt>70 ? r1(wt) : null, source_file: U.file ? U.file.name.slice(0,120) : null };
  } else {
    labRows = U.rows.filter(r=>(r.marker||r.name) && (r.value!=="" || r.value_text));
    if (!labRows.length && !U.file){ toast("Add at least one result, or attach the report."); return; }
    const bad = labRows.find(r=>r.value!=="" && isNaN(parseFloat(r.value)));
    if (bad){ toast("Check the value for "+(bad.name||bad.marker)+"."); return; }
  }
  U.status = "saving"; render();
  let path = null;
  try {
    if (U.file) path = await nRecUploadFile(W, U.kind, U.file, date);
    let bc = null;
    if (bcRow) bc = await nUpsertBc(bcRow);
    const rec = { user_id:W.uid, kind:U.kind, record_date:date, uploaded_by:auth.uid, body_comp_id: bc ? bc.id : null,
      title: U.kind==="labs" ? ((F.title||"").trim() || (labRows.length ? labRows.length+" results" : "Lab report")) : REC_KINDS[U.kind],
      file_path: path, file_name: U.file ? U.file.name.slice(0,160) : null, file_size: U.file ? U.file.size : null, mime: U.file ? (U.file.type||null) : null };
    const r = await sb("/rest/v1/health_records", { method:"POST", headers:{ Prefer:"return=representation" }, body:rec });
    if (!r.ok) throw new Error("record");
    const saved = (await r.json())[0];
    if (labRows.length){
      const body = labRows.map(x=>{
        const v = parseFloat(x.value);
        const row = { user_id:W.uid, record_id:saved.id, drawn_on:date, marker: x.marker || ("custom:"+x.name.trim().toLowerCase().slice(0,40)),
          value: isNaN(v) ? null : v, value_text: x.value_text || null, unit: x.unit || null,
          ref_low: x.ref_low!=="" && !isNaN(parseFloat(x.ref_low)) ? parseFloat(x.ref_low) : null,
          ref_high: x.ref_high!=="" && !isNaN(parseFloat(x.ref_high)) ? parseFloat(x.ref_high) : null, flag: null };
        if (row.value!=null){ if (row.ref_high!=null && row.value > row.ref_high) row.flag = "H"; else if (row.ref_low!=null && row.value < row.ref_low) row.flag = "L"; }
        if (!row.flag && (x.flag==="H"||x.flag==="L")) row.flag = x.flag;
        return row;
      });
      const lr = await sb("/rest/v1/lab_results", { method:"POST", headers:{ Prefer:"return=representation" }, body });
      if (!lr.ok) throw new Error("labs");
      nut.rec.labs = (await lr.json()).concat(nut.rec.labs);
    }
    nut.rec.records.unshift(saved); nut.rec.records.sort((a,b)=>a.record_date<b.record_date?1:-1);
    nut.recUp = null;
    if (bcRow && !nut.coachUid && nut.goal && !(nut.goal.set_by && nut.goal.set_by!==auth.uid)) nut.goalEdit = true;
    toast(bcRow ? "Saved. Your targets can now use it; recalculate on the Food tab." : "Lab results saved.");
    render();
  } catch(e){
    if (path){ try { await fetch(SUPA+"/storage/v1/object/"+REC_BUCKET+"/"+path, { method:"DELETE", headers:{ apikey:SUPA_KEY, Authorization:"Bearer "+auth.at } }); } catch(_){} }
    U.status = "review"; render(); toast("Couldn’t save. Check your connection and try again.");
  }
}
async function nRecView(path){
  const w = window.open("", "_blank");
  try {
    if (auth && auth.exp - 60 < Math.floor(Date.now()/1000)) await refreshAuth();
    const r = await fetch(SUPA+"/storage/v1/object/sign/"+REC_BUCKET+"/"+path, { method:"POST",
      headers:{ apikey:SUPA_KEY, Authorization:"Bearer "+auth.at, "content-type":"application/json" }, body: JSON.stringify({ expiresIn:600 }) });
    if (!r.ok) throw new Error();
    const d = await r.json(); const url = SUPA+"/storage/v1"+(d.signedURL||d.signedUrl);
    if (w) w.location = url; else location.href = url;
  } catch(e){ if (w) w.close(); toast("Couldn’t open the file."); }
}
async function nRecDelete(id){
  const R = nut.rec, rec = R.records.find(x=>x.id===id); if (!rec) return;
  if (!confirm("Delete this "+(REC_KINDS[rec.kind]||"record")+" from "+nDate(rec.record_date)+"? This removes the file"+(rec.kind==="labs"?" and its results":" and its numbers")+".")) return;
  try {
    const r = await sb("/rest/v1/health_records?id=eq."+id, { method:"DELETE" }); if (!r.ok) throw new Error();
    if (rec.body_comp_id){ await sb("/rest/v1/body_comp?id=eq."+rec.body_comp_id, { method:"DELETE" }); const W = nWho(); const i = W.bc.findIndex(x=>x.id===rec.body_comp_id); if (i>=0) W.bc.splice(i,1); }
    if (rec.file_path) await fetch(SUPA+"/storage/v1/object/"+REC_BUCKET+"/"+rec.file_path, { method:"DELETE", headers:{ apikey:SUPA_KEY, Authorization:"Bearer "+auth.at } });
    R.records = R.records.filter(x=>x.id!==id); R.labs = R.labs.filter(x=>x.record_id!==id);
    render(); toast("Deleted.");
  } catch(e){ toast("Couldn’t delete."); }
}

// ---------- render ----------
function renderRecordsCard(){
  if (!auth) return "";
  const W = nWho(), bc = W.bc || [];
  const last = m => bc.filter(r=>r.method===m).sort((a,b)=>a.measured_on<b.measured_on?1:-1)[0];
  const d = last("dexa"), p = last("pnoe");
  const labs = nut.rec && nut.rec.uid===W.uid ? nut.rec.records.filter(r=>r.kind==="labs")[0] : null;
  const flagged = nut.rec && nut.rec.uid===W.uid ? nLatestLabs().filter(x=>x.flag).length : 0;
  if (!nut.rec || nut.rec.uid!==W.uid) setTimeout(()=>nRecLoad(), 0);
  const cell = (l, v)=>'<div class="bm"><span class="v num" style="font-size:15px">'+v+'</span><span class="l">'+l+'</span></div>';
  return '<h2 class="sect disp a">Health records</h2><div class="panel a">'
    + '<div class="bmetrics" style="margin:0 0 10px">'+cell("Last DEXA", d ? nDate(d.measured_on) : "None")+cell("Last PNOE", p ? nDate(p.measured_on) : "None")
    + cell("Last labs", labs ? nDate(labs.record_date) : "None")+'</div>'
    + (flagged ? '<p class="statline" style="margin-top:0;color:var(--warn)">'+flagged+' lab marker'+(flagged===1?'':'s')+' out of range (latest result for each)</p>' : '')
    + '<div class="nbtnrow" style="margin-top:4px"><button class="sibtn" onclick="nRecOpen()">Upload or view records</button></div></div>';
}
function nLatestLabs(){
  const by = {};
  ((nut.rec && nut.rec.labs) || []).forEach(x=>{ (by[x.marker] = by[x.marker] || []).push(x); });
  return Object.keys(by).map(k=>{
    const list = by[k].sort((a,b)=>a.drawn_on<b.drawn_on?1:-1);
    return Object.assign({}, list[0], { prev: list[1] || null, n: list.length });
  }).sort((a,b)=>{
    const ia = LAB_MARKERS.findIndex(m=>m[0]===a.marker), ib = LAB_MARKERS.findIndex(m=>m[0]===b.marker);
    return (a.flag?0:1)-(b.flag?0:1) || (ia<0?999:ia)-(ib<0?999:ib);
  });
}
function nLabLabel(m){ return LAB_NAME[m] || String(m).replace(/^custom:/,"").replace(/\b\w/g,c=>c.toUpperCase()); }
function renderRecords(){
  const W = nWho(), self = W.self, R = nut.rec;
  let h = '<div class="nhead"><button class="nb" onclick="nRecClose()" aria-label="Back">'+nIcon("back",20)+'</button><h2>'+(self?"Health records":esc(nut.coach.name.split(" ")[0])+"’s records")+'</h2></div>';
  if (nut.recUp) return h + renderRecUpload();
  h += '<p class="statline" style="margin:-4px 2px 12px">Upload a PDF or photo of the report. PDFs are read automatically; you check the numbers before saving. Files are private to '+(self?"you and your coach":"the athlete and coaches")+'.</p>';
  h += '<div class="ntiles">'
    + '<button class="ntile" onclick="nRecStart(\'dexa\')">'+nIcon("post_workout",26)+'DEXA scan</button>'
    + '<button class="ntile" onclick="nRecStart(\'pnoe\')">'+nIcon("flame",26)+'PNOE / RMR</button>'
    + '<button class="ntile" onclick="nRecStart(\'labs\')">'+nIcon("label",26)+'Lab results</button></div>';
  if (!R || R.uid!==W.uid || R.loading) return h + '<p class="statline">Loading…</p>';

  // Lab markers, flagged first
  const latest = nLatestLabs();
  if (latest.length){
    h += '<div class="nsec"><h2>Lab markers</h2></div><div class="panel a"><div class="trendrows" style="margin-top:0">';
    latest.slice(0, nut.recAllLabs ? 200 : 12).forEach(x=>{
      const v = x.value_text || (x.value!=null ? String(+x.value) : "–");
      const rng = x.ref_low!=null && x.ref_high!=null ? +x.ref_low+"–"+(+x.ref_high) : x.ref_high!=null ? "<"+(+x.ref_high) : x.ref_low!=null ? ">"+(+x.ref_low) : "";
      let tr = "";
      if (x.prev && x.prev.value!=null && x.value!=null){ const dlt = +x.value - +x.prev.value; tr = ' <span class="statline" style="margin:0;font-weight:600">'+(dlt>0?"▲":dlt<0?"▼":"–")+' from '+(+x.prev.value)+'</span>'; }
      h += '<div class="trow"><span class="d">'+esc(nLabLabel(x.marker))+'<br><span style="font-size:11px">'+nDate(x.drawn_on)+(rng?' · ref '+rng:'')+'</span></span>'
        + '<span class="s num"'+(x.flag?' style="color:var(--warn)"':'')+'>'+esc(v)+(x.unit?' <span style="color:var(--dim);font-weight:600">'+esc(x.unit)+'</span>':'')+(x.flag?' '+x.flag:'')+tr+'</span></div>';
    });
    h += '</div>'+(latest.length>12 ? '<button class="silink" onclick="nut.recAllLabs=!nut.recAllLabs;render()">'+(nut.recAllLabs?"Show fewer":"Show all "+latest.length)+'</button>' : '')+'</div>';
  }

  // Body composition and metabolism history
  const recByBc = {}; R.records.forEach(r=>{ if (r.body_comp_id) recByBc[r.body_comp_id] = r; });
  const scans = (W.bc||[]).filter(r=>r.method==="dexa"||r.method==="pnoe"||r.method==="estimate").sort((a,b)=>a.measured_on<b.measured_on?1:-1);
  h += '<div class="nsec"><h2>Scans and tests</h2></div><div class="panel a">';
  if (!scans.length) h += '<p class="statline" style="margin-top:0">No DEXA, PNOE, or body fat entries yet.</p>';
  scans.forEach(s=>{
    const rec = recByBc[s.id];
    const parts = [];
    if (s.weight_lb) parts.push(r1(s.weight_lb)+" lb");
    if (s.body_fat_pct) parts.push(r1(s.body_fat_pct)+"% BF");
    if (s.lean_mass_lb) parts.push(r1(s.lean_mass_lb)+" lean");
    if (s.rmr_kcal) parts.push(s.rmr_kcal+" kcal RMR");
    h += '<div class="trow"><span class="d">'+nDate(s.measured_on)+' · '+({dexa:"DEXA",pnoe:"PNOE",estimate:"Body fat est."}[s.method])+'</span><span class="s num">'+esc(parts.join(" · "))
      + (rec && rec.file_path ? ' <button class="silink" style="margin-left:6px" onclick="nRecView(\''+esc(rec.file_path)+'\')">File</button>' : '')
      + ' <button class="delbtn sm" onclick="'+(rec ? 'nRecDelete(\''+rec.id+'\')' : 'nBcDelete(\''+s.id+'\')')+'" aria-label="Delete">✕</button></span></div>';
  });
  h += '<div class="nbtnrow"><button class="silink" onclick="nut.bcForm={method:\'estimate\',date:dayKey(),wt:\'\',lean:\'\',bf:\'\',rmr:\'\'};render()">Add a body fat % estimate (no scan)</button></div>';
  if (nut.bcForm) h += renderBcForm();
  h += '</div>';

  // Lab reports
  const labRecs = R.records.filter(r=>r.kind==="labs");
  h += '<div class="nsec"><h2>Lab reports</h2></div><div class="panel a">';
  if (!labRecs.length) h += '<p class="statline" style="margin-top:0">No lab reports yet.</p>';
  labRecs.forEach(r=>{
    const n = R.labs.filter(x=>x.record_id===r.id).length, fl = R.labs.filter(x=>x.record_id===r.id && x.flag).length;
    h += '<div class="trow"><span class="d">'+nDate(r.record_date)+' · '+esc(r.title||"Labs")+'</span><span class="s num">'+n+' result'+(n===1?'':'s')+(fl?' · <span style="color:var(--warn)">'+fl+' flagged</span>':'')
      + (r.file_path ? ' <button class="silink" style="margin-left:6px" onclick="nRecView(\''+esc(r.file_path)+'\')">File</button>' : '')
      + ' <button class="delbtn sm" onclick="nRecDelete(\''+r.id+'\')" aria-label="Delete">✕</button></span></div>';
  });
  h += '</div>';
  return h;
}
function renderRecUpload(){
  const U = nut.recUp;
  let h = '<div class="ncard"><b style="color:#fff;font-size:18px">'+REC_KINDS[U.kind]+'</b>';
  if (U.status==="choose"){
    const tip = { dexa:"Upload the full scan report PDF from the clinic. Iron Log reads total mass, lean mass, fat, and visceral fat.",
      pnoe:"Upload the PNOE or metabolic test report. Iron Log reads your measured resting burn (RMR).",
      labs:"Upload the lab report PDF (LabCorp, Quest, VA, and most portals). Iron Log reads common markers like kidney, blood counts, hormones, lipids, and A1c." }[U.kind];
    return h + '<p class="statline">'+tip+'</p><div class="nbtnrow"><button class="sibtn" onclick="nRecPick()">Choose PDF or photo</button>'
      + '<button class="silink" onclick="nRecManual()">Enter numbers without a file</button><button class="silink" onclick="nut.recUp=null;render()">Cancel</button></div></div>';
  }
  if (U.status==="reading") return h + '<p class="statline">Reading '+esc(U.file?U.file.name:"file")+'…</p></div>';
  if (U.status==="saving") return h + '<p class="statline">Saving…</p></div>';
  if (U.file) h += '<p class="statline">'+esc(U.file.name)+(U.parsed?' · numbers read from the PDF':(U.img?' · photo attached, enter the numbers':''))+'</p>';
  if (U.img) h += '<img class="nimg" src="'+U.img+'" alt="Report">';
  const F = U.form;
  const fld = (k, lab, ph, mode)=>{ const miss = U.parsed && !F[k];
    return '<div><label'+(miss?' style="color:var(--warn)"':'')+'>'+lab+(miss?' · not read':'')+'</label><input class="ninput" inputmode="'+(mode||"decimal")+'" placeholder="'+(ph||"")+'" value="'+esc(F[k]||"")+'" oninput="nRecSet(\''+k+'\',this.value)"></div>'; };
  h += '<div class="ngrid"><div class="wide"><label>'+(U.kind==="labs"?"Date drawn":"Date measured")+'</label><input class="ninput" type="date" max="'+dayKey()+'" value="'+esc(F.date||"")+'" onchange="nRecSet(\'date\',this.value)"></div>';
  if (U.kind==="dexa"){
    h += fld("wt","Total mass lb","210.4") + fld("lean","Lean mass lb","174.6") + fld("fat","Fat mass lb","27.7") + fld("bf","Body fat %","13.2")
      + fld("vat","Visceral fat lb (VAT)","0.9") + fld("trunk","Trunk fat lb","15.1") + '</div>'
      + '<p class="statline">Lean mass excludes bone. Use the measured total mass from the scan, not the weight typed in at check-in.</p>';
  } else if (U.kind==="pnoe"){
    h += fld("rmr","Resting burn kcal/day","2365","numeric") + fld("wt","Weight lb (optional)") + '</div>';
  } else {
    h += '<div class="wide"><label>Label (optional)</label><input class="ninput" placeholder="Quarterly panel" value="'+esc(F.title||"")+'" oninput="nRecSet(\'title\',this.value)"></div></div>';
    h += '<p class="statline">'+(U.rows.length ? U.rows.length+' result'+(U.rows.length===1?'':'s')+'. Fix anything that doesn’t match the report.' : 'Add the results you care about.')+'</p>';
    const opts = '<option value="">Other…</option>'+LAB_MARKERS.map(([k,n])=>'<option value="'+k+'">'+esc(n)+'</option>').join("");
    U.rows.forEach((r,i)=>{
      const out = r.flag ? ' style="border-color:var(--warn)"' : '';
      h += '<div class="ncard" style="padding:10px;margin:8px 0;background:rgba(255,255,255,.03)">'
        + '<div class="nsearch" style="grid-template-columns:1fr auto"><select class="ninput" onchange="nLabSet('+i+',\'marker\',this.value)">'+opts.replace('value="'+r.marker+'"','value="'+r.marker+'" selected')+'</select>'
        + '<button class="delbtn sm" style="min-width:44px;min-height:44px" onclick="nLabDel('+i+')" aria-label="Remove">✕</button></div>'
        + (r.marker ? '' : '<input class="ninput" style="margin-top:6px" placeholder="Marker name" value="'+esc(r.name||"")+'" oninput="nLabSet('+i+',\'name\',this.value)">')
        + '<div class="ngrid" style="grid-template-columns:1fr 1fr 1fr 1fr;margin-top:6px">'
        + '<input class="ninput"'+out+' inputmode="decimal" placeholder="Value" value="'+esc(r.value_text||r.value||"")+'" oninput="nLabSet('+i+',\'value\',this.value.replace(/^[<>]/,\'\'));nLabSet('+i+',\'value_text\',/^[<>]/.test(this.value)?this.value:\'\')">'
        + '<input class="ninput" placeholder="Unit" value="'+esc(r.unit||"")+'" oninput="nLabSet('+i+',\'unit\',this.value)">'
        + '<input class="ninput" inputmode="decimal" placeholder="Low" value="'+esc(r.ref_low||"")+'" oninput="nLabSet('+i+',\'ref_low\',this.value)">'
        + '<input class="ninput" inputmode="decimal" placeholder="High" value="'+esc(r.ref_high||"")+'" oninput="nLabSet('+i+',\'ref_high\',this.value)"></div></div>';
    });
    h += '<button class="silink" onclick="nLabAdd()">+ Add a result</button>';
  }
  return h + '<div class="nbtnrow"><button class="sibtn" onclick="nRecSave()">Save</button><button class="silink" onclick="nut.recUp=null;render()">Cancel</button></div></div>';
}
