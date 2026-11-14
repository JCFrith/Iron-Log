const { chromium } = require('playwright');
(async()=>{const b=await chromium.launch();let fail=0;const ok=(n,c,x)=>{if(!c)fail++;console.log((c?'PASS ':'FAIL ')+n+(c?'':' '+JSON.stringify(x)));};
const uid='00000000-0000-4000-8000-00000000000a';
async function run(local, draft, now){
  const ctx=await b.newContext();const posts=[];
  await ctx.route(/supabase\.co/, async r=>{const u=new URL(r.request().url());const m=r.request().method();let body='[]';
    if(u.pathname.endsWith('/profiles')) body=JSON.stringify([{user_id:uid,display_name:'T',is_coach:false,program_id:null}]);
    else if(u.pathname.endsWith('/logs')){ if(m==='GET') body=JSON.stringify([{data:{sessions:local}}]); else posts.push(JSON.parse(r.request().postData())); }
    else if(u.pathname.includes('/auth/')) body='{}';
    await r.fulfill({status:200,contentType:'application/json',headers:{'access-control-allow-origin':'*'},body});});
  await ctx.route(/whoop|openfoodfacts|usda|jsdelivr/, r=>r.abort());
  const p=await ctx.newPage();const errs=[];p.on('pageerror',e=>errs.push(e.message));
  await p.clock.setFixedTime(new Date(now));
  await p.goto('http://localhost:8765/index.html');
  await p.evaluate(([uid,local,draft])=>{localStorage.setItem('iron-log-auth',JSON.stringify({at:'x.eyJzdWIiOiIwIn0.y',rt:'r',exp:Math.floor(Date.now()/1000)+3600,uid,email:'t@example.com'}));localStorage.setItem('iron-log-local-ok','1');localStorage.setItem('iron-log-v1',JSON.stringify({sessions:local,deloadSkips:[]}));localStorage.setItem('iron-log-draft',JSON.stringify(draft));},[uid,local,draft]);
  await p.reload();await p.waitForTimeout(2000);
  const st=await p.evaluate(()=>({n:sessions.length,rec:sessions.filter(s=>s.recovered).map(s=>({w:s.workout,d:s.date,k:Object.keys(s.entries),mins:s.mins})),draft:localStorage.getItem('iron-log-draft'),toast:(document.querySelector('.toast')||{}).textContent||''}));
  await ctx.close(); return {st,posts,errs};
}
const morning=new Date('2026-11-13T09:15:00').getTime();
const old=[{id:1,date:new Date('2026-11-04T10:23:00').toISOString(),workout:'C',entries:{'leg-press':[{w:300,r:8}]}}];
const draft={t:morning,day:'2026-11-13',workoutId:'B',values:{'hip-thrust':[{w:'135',r:'12'},{w:'135',r:'12'},{w:'135',r:''}],'leg-extension':[{w:'',r:''}]},subs:{},sessionNote:'felt good',wkStart:morning-30*60000};
let r=await run(old, draft, '2026-11-13T23:30:00');
const up=r.posts.length?r.posts[r.posts.length-1][0].data.sessions.length:0;
ok('stale unsaved draft is saved as a session and uploaded', r.st.n===2 && r.st.rec.length===1 && r.st.rec[0].k.join()==='hip-thrust' && r.st.rec[0].mins===30 && up===2 && !r.st.draft && !r.errs.length, {st:r.st,up,errs:r.errs});
const saved=old.concat([{id:2,date:new Date('2026-11-13T09:20:00').toISOString(),workout:'B',entries:{'hip-thrust':[{w:135,r:12},{w:135,r:12}]}}]);
r=await run(saved, draft, '2026-11-13T23:30:00');
ok('stale draft that was already saved is not duplicated', r.st.n===2 && r.st.rec.length===0 && !r.errs.length, {st:r.st,errs:r.errs});
r=await run(old, Object.assign({},draft,{t:new Date('2026-11-13T23:10:00').getTime()}), '2026-11-13T23:30:00');
ok('draft edited 20 minutes ago is restored, not saved yet', r.st.n===1 && r.st.rec.length===0 && !!r.st.draft && !r.errs.length, {st:r.st,errs:r.errs});
r=await run(old, Object.assign({},draft,{t:new Date('2026-11-13T20:00:00').getTime()}), '2026-11-13T23:30:00');
ok('draft idle 3.5 hours is restored and auto-saved at 8 PM', r.st.n===2 && /auto-saved/.test(r.st.toast) && !r.errs.length, {st:r.st,errs:r.errs});
await b.close();console.log(fail?fail+' FAILED':'recovery: all passed');process.exit(fail?1:0);})();
