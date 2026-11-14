const { chromium } = require('playwright');
(async()=>{const b=await chromium.launch();let fail=0;const ok=(n,c,x)=>{if(!c)fail++;console.log((c?'PASS ':'FAIL ')+n+(c?'':' '+JSON.stringify(x)));};
const uid='00000000-0000-4000-8000-00000000000a';
const ctx=await b.newContext();const posts=[];
await ctx.route(/supabase\.co/, async r=>{const u=new URL(r.request().url());const m=r.request().method();let body='[]';
  if(u.pathname.endsWith('/profiles')) body=JSON.stringify([{user_id:uid,display_name:'T',is_coach:false,program_id:null}]);
  else if(u.pathname.endsWith('/logs')){ if(m==='GET') body=JSON.stringify([{data:{sessions:[]}}]); else posts.push(JSON.parse(r.request().postData())); }
  else if(u.pathname.includes('/auth/')) body='{}';
  await r.fulfill({status:200,contentType:'application/json',headers:{'access-control-allow-origin':'*'},body});});
await ctx.route(/whoop|openfoodfacts|usda|jsdelivr/, r=>r.abort());
const p=await ctx.newPage();const errs=[];p.on('pageerror',e=>errs.push(e.message));p.on('dialog',d=>{errs.push('DIALOG '+d.message());d.dismiss();});
await p.clock.install({time:new Date('2026-11-13T08:00:00')});
await p.goto('http://localhost:8765/index.html');
await p.evaluate(uid=>{localStorage.setItem('iron-log-auth',JSON.stringify({at:'x.eyJzdWIiOiIwIn0.y',rt:'r',exp:Math.floor(Date.now()/1000)+86400,uid,email:'t@example.com'}));localStorage.setItem('iron-log-local-ok','1');},uid);
await p.reload(); await p.clock.runFor(4000);
// log two sets on the first lift, then walk away
const ex=await p.evaluate(()=>{const e=effEx(workoutId)[0]; bump(e.id,0,'w',100); bump(e.id,0,'r',8); bump(e.id,1,'w',100); bump(e.id,1,'r',8); return e.id;});
await p.clock.runFor(30*60000);
let st=await p.evaluate(()=>sessions.length);
ok('no auto-save at 30 minutes', st===0, {st});
await p.clock.runFor(32*60000);
st=await p.evaluate(()=>({n:sessions.length,auto:sessions.map(s=>s.auto),date:sessions[0]&&sessions[0].date,sid:savedSid}));
const up=posts.length?posts[posts.length-1][0].data.sessions.length:0;
ok('auto-saves after an hour idle, dated at the last edit, and uploads', st.n===1 && st.auto[0]===true && new Date(st.date).getHours()===8 && up===1, {st,up});
// nothing new: no second save
await p.clock.runFor(70*60000);
st=await p.evaluate(()=>sessions.length);
ok('no repeat saves when nothing changed', st===1, {st});
// comes back, adds a set, walks away again -> same session updated, no prompt
await p.evaluate(ex=>{ensureRows(ex); if(values[ex].length<3) addSet(ex); bump(ex,2,'w',100); bump(ex,2,'r',7);},ex);
await p.clock.runFor(62*60000);
st=await p.evaluate(ex=>({n:sessions.length,sets:sessions[0].entries[ex].length,rev:sessions[0].rev}),ex);
ok('later edits update the same session', st.n===1 && st.sets===3 && st.rev===1, {st});
// manual save after that: updates, no dialog
await p.evaluate(ex=>{bump(ex,2,'r',1); saveSession();},ex);
st=await p.evaluate(ex=>({n:sessions.length,sets:sessions[0].entries[ex].map(s=>s.r).join('/')}),ex);
ok('tapping Save afterward updates it without asking', st.n===1 && st.sets==='8/8/8' && !errs.some(e=>e.startsWith('DIALOG')), {st,errs});
ok('no page errors', !errs.filter(e=>!e.startsWith('DIALOG')).length, errs);
await b.close();console.log(fail?fail+' FAILED':'idle: all passed');process.exit(fail?1:0);})();
