/* ELECTRIC LAB — DC resistive network. SI units, ideal source and wires.
   Closed switch and wires are unioned, then Kirchhoff nodal equations are
   solved at 1 V to obtain equivalent resistance independent of supply state. */
(function (root) {
  'use strict';
  function gaussian(A, b) {
    const n = b.length, m = A.map((r,i)=>r.concat(b[i]));
    for(let k=0;k<n;k++) {
      let p=k; for(let i=k+1;i<n;i++) if(Math.abs(m[i][k])>Math.abs(m[p][k])) p=i;
      if(Math.abs(m[p][k])<1e-12) throw Error('Singular circuit');
      [m[k],m[p]]=[m[p],m[k]];
      const d=m[k][k]; for(let j=k;j<=n;j++) m[k][j]/=d;
      for(let i=0;i<n;i++) if(i!==k) { const f=m[i][k]; for(let j=k;j<=n;j++) m[i][j]-=f*m[k][j]; }
    }
    return m.map(r=>r[n]);
  }
  function solve(components, wires, voltage, powered, switchClosed) {
    const parts=components.filter(c=>c.placed), ids=parts.flatMap(c=>[c.id+'a',c.id+'b']);
    const parent=Object.fromEntries(ids.map(id=>[id,id]));
    function find(a){ if(parent[a]===undefined) return null; while(a!==parent[a]) {parent[a]=parent[parent[a]];a=parent[a];} return a; }
    function union(a,b){const x=find(a),y=find(b);if(x!==null&&y!==null)parent[x]=y;}
    for(const w of wires) union(w.a,w.b);
    if(switchClosed && parts.some(c=>c.id==='K')) union('Ka','Kb');
    const p=find('Ba'),n=find('Bb'), empty=Object.fromEntries(components.filter(c=>['lamp','resistor','ammeter','motor','voltmeter'].includes(c.kind)).map(c=>[c.id,{u:0,i:0,p:0,relative:0,floating:false}]));
    if(p===null||n===null) return {short:false,closed:false,req:Infinity,i:0,power:0,u:0,lamps:empty,type:'open',potentials:{}};
    const nodes=[...new Set(ids.map(find))], edges=parts.filter(c=>['lamp','resistor','ammeter','motor'].includes(c.kind)&&c.enabled!==false).map(c=>({id:c.id,a:find(c.id+'a'),b:find(c.id+'b'),r:c.r}));
    if(p===n) return {short:true,closed:false,req:0,i:0,power:0,u:0,lamps:empty,type:'short',potentials:{}};
    const adj=Object.fromEntries(nodes.map(x=>[x,[]]));
    edges.forEach(e=>{adj[e.a].push(e.b);adj[e.b].push(e.a);});
    const reachable=new Set([p,n]),queue=[p,n];
    for(let k=0;k<queue.length;k++) for(const j of adj[queue[k]]) if(!reachable.has(j)){reachable.add(j);queue.push(j);}
    const unknown=nodes.filter(x=>reachable.has(x)&&x!==p&&x!==n),index=Object.fromEntries(unknown.map((x,i)=>[x,i]));
    const A=unknown.map(()=>unknown.map(()=>0)), b=unknown.map(()=>0), v={[p]:1,[n]:0};
    for(const e of edges) if(e.a!==e.b&&reachable.has(e.a)) for(const [x,y] of [[e.a,e.b],[e.b,e.a]]) if(index[x]!==undefined) {
      const k=index[x],g=1/e.r; A[k][k]+=g;
      if(index[y]!==undefined) A[k][index[y]]-=g; else b[k]+=g*v[y];
    }
    gaussian(A,b).forEach((x,i)=>v[unknown[i]]=x);
    let conductance=0; const active=[];
    for(const e of edges) {
      const d=(v[e.a]??0)-(v[e.b]??0),cur=d/e.r;
      if(e.a===p)conductance+=cur;if(e.b===p)conductance-=cur;
      const u=powered?d*voltage:0,i=u/e.r;
      empty[e.id]={u:Math.abs(u),i:Math.abs(i),p:u*i,relative:d/e.r,floating:!reachable.has(e.a)};
      if(Math.abs(cur)>1e-8)active.push(e);
    }
    const closed=conductance>1e-9, req=closed?1/conductance:Infinity;
    let type='open';
    if(active.length===1)type='single';
    else if(active.length>1) {
      if(active.every(e=>(e.a===p&&e.b===n)||(e.a===n&&e.b===p))) type='parallel';
      else {const deg={};active.forEach(e=>{deg[e.a]=(deg[e.a]||0)+1;deg[e.b]=(deg[e.b]||0)+1;});type=deg[p]===1&&deg[n]===1&&Object.entries(deg).every(([k,d])=>k===p||k===n||d===2)?'series':'mixed';}
    }
    const supply=powered?voltage:0,current=closed?supply/req:0;
    for(const c of parts.filter(c=>['lamp','resistor','motor'].includes(c.kind)&&c.enabled===false)) {
      const a=find(c.id+'a'),b=find(c.id+'b');
      empty[c.id]={u:reachable.has(a)&&reachable.has(b)?Math.abs((v[a]??0)-(v[b]??0))*supply:0,i:0,p:0,relative:0,floating:!reachable.has(a)||!reachable.has(b)};
    }
    const potentials=Object.fromEntries(ids.map(id=>[id,reachable.has(find(id))?(v[find(id)]||0)*supply:null]));
    for(const c of parts.filter(c=>c.kind==='voltmeter')) {const a=potentials[c.id+'a'],b=potentials[c.id+'b'];empty[c.id]={u:a===null||b===null?0:Math.abs(a-b),i:0,p:0,floating:a===null||b===null};}
    return {short:false,closed,req,i:current,power:current*supply,u:supply,lamps:empty,type,potentials,active:active.map(e=>e.id)};
  }
  root.CircuitEngine={solve};
})(typeof window!=='undefined'?window:globalThis);
