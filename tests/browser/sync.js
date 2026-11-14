const { chromium } = require('playwright');
(async()=>{
  const b=await chromium.launch(); let fail=0; const ok=(n,c,x)=>{ if(!c) fail++; console.log((c?'PASS ':'FAIL ')+n+(c?'':' '+JSON.stringify(x))); };
  const uidA='00000000-0000-4000-8000-00000000000a', uidB='00000000-0000-4000-8000-00000000000b';
  const mk=(id,w)=>({id,date:new Date(id).toISOString(),workout:w,entries:{'leg-press':[{w:300,r:8}]}});
  async function run(uid, cloudSessions, local, opts){
    const ctx=await b.newContext({viewport:{width:390,height:844}}); const posts=[]; let mealsFail=!!(opts&&opts.mealsFail), mealCalls=0;
    await ctx.route(/supabase\.co/, async r=>{ const u=new URL(r.request().url()); const m=r.request().method(); let body='[]', status=200;
      if(u.pathname.endsWith('/profiles')) body=JSON.stringify([{user_id:uid,display_name:'T',is_coach:false,program_id:null}]);
      else if(u.pathname.endsWith('/logs')){ if(m==='GET') body=JSON.stringify([{data:{sessions:cloudSessions}}]); else posts.push(JSON.parse(r.request().postData())); }
      else if(u.pathname.endsWith('/meals')){ mealCalls++; if(mealsFail) status=500; }
      else if(u.pathname.includes('/auth/')) body='{}';
      await r.fulfill({status,contentType:'application/json',headers:{'content-range':'0-0/0','access-control-allow-origin':'*'},body}); });
    await ctx.route(/whoop|openfoodfacts|usda|jsdelivr/, r=>r.abort());
    const p=await ctx.newPage(); const errs=[]; p.on('pageerror',e=>errs.push(e.message)); p.on('dialog',d=>d.accept());
    await p.goto('http://localhost:8765/index.html');
    await p.evaluate(([uid,local])=>{ localStorage.setItem('iron-log-auth',JSON.stringify({at:'x.eyJzdWIiOiIwIn0.y',rt:'r',exp:Math.floor(Date.now()/1000)+3600,uid,email:'t@example.com'})); localStorage.setItem('iron-log-local-ok','1'); if(local) localStorage.setItem('iron-log-v1',JSON.stringify(local)); },[uid,local]);
    await p.reload(); await p.waitForTimeout(1800);
    return {ctx,p,posts,errs,mealCalls:()=>mealCalls};
  }
  const t0=Date.parse('2026-11-01T12:00:00Z');
  { // merge: cloud has X, device has Y -> both kept, upload has both
    const r=await run(uidA,[mk(t0,'A')],{owner:uidA,sessions:[mk(t0+86400000,'B')],deloadSkips:[]});
    const ids=await r.p.evaluate(()=>sessions.map(s=>s.id));
    const last=r.posts[r.posts.length-1]; const up=last?last[0].data.sessions.length:0;
    ok('two-device merge keeps both sessions and uploads both', ids.length===2 && up===2 && !r.errs.length, {ids,up,errs:r.errs});
    // save while signed in: pulls first, so a session another device added meanwhile is not overwritten
    await r.ctx.close();
  }
  { // different account's log on this device is set aside, not uploaded
    const r=await run(uidB,[],{owner:uidA,sessions:[mk(t0,'A')],deloadSkips:[]});
    const st=await r.p.evaluate(a=>({n:sessions.length, stash:!!localStorage.getItem('iron-log-stash-'+a)}),uidA);
    const leaked=r.posts.some(x=>x[0].data.sessions.length>0);
    ok('another account\'s local log is stashed, never uploaded', st.n===0 && st.stash && !leaked && !r.errs.length, {st,leaked,errs:r.errs});
    await r.ctx.close();
  }
  { // hostile cloud data is coerced
    const bad={id:"1); alert(1); (",date:new Date(t0).toISOString(),workout:'A',entries:{'Leg Press<img>':[{w:"<b>",r:"8",e:"x"}]}};
    const r=await run(uidA,[bad, mk(t0+5,'A')],null);
    const s=await r.p.evaluate(()=>sessions.map(s=>({id:s.id,keys:Object.keys(s.entries||{}),w:Object.values(s.entries||{})[0]})));
    const clean=s.every(x=>typeof x.id==='number' && x.keys.every(k=>/^[a-z0-9-]+$/.test(k)) && (x.w||[]).every(q=>typeof q.w==='number'&&typeof q.r==='number'));
    ok('cloud data is coerced to numbers and safe keys', clean && !r.errs.length, {s,errs:r.errs});
    await r.ctx.close();
  }
  { // food log failure: error state with retry, no request loop
    const r=await run(uidA,[],null,{mealsFail:true});
    await r.p.evaluate(()=>setTab('food')); await r.p.waitForTimeout(2500);
    const txt=await r.p.evaluate(()=>document.getElementById('main').innerText); const calls=r.mealCalls();
    ok('food log failure shows retry and does not loop', /Try again/.test(txt) && calls<=2 && !r.errs.length, {calls,txt:txt.slice(0,120),errs:r.errs});
    await r.ctx.close();
  }
  await b.close(); console.log(fail?fail+' FAILED':'sync: all passed'); process.exit(fail?1:0);
})();
