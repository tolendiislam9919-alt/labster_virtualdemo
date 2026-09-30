#!/usr/bin/env node
/* Электр Lab Co-op. Node.js 18+; standard library only; no npm install. */
'use strict';
const http=require('node:http'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),os=require('node:os');
const World=require('./public/world.js');require('./public/physics.js');const QR=require('./qr.cjs');
const PORT=Number(process.env.PORT||8080),HOST=process.env.HOST||'0.0.0.0',PUBLIC_URL=(process.env.PUBLIC_URL||'').replace(/\/$/,'');
const rooms=new Map(),TTL=2*60*60*1000,MAX_ROOMS=60;const uid=(n=16)=>crypto.randomBytes(n).toString('base64url');
class GameError extends Error{constructor(status,message,code){super(message);this.status=status;this.code=code||'invalid';}}
const bad=(m,code)=>{throw new GameError(400,m,code);};
function solve(r){return CircuitEngine.solve(r.parts,r.wires,r.voltage,r.powered,r.switchClosed);}
function challenge(r){const s=solve(r),lamps=r.parts.filter(c=>c.kind==='lamp'&&c.placed&&s.lamps[c.id].i>.001);const close=(a,b,t=.03)=>Math.abs(a-b)<=t;let electrical=false;
if(!s.short&&r.powered&&r.switchClosed&&CircuitEngine.solve(r.parts,r.wires,r.voltage,r.powered,false).i<.001&&r.parts.find(c=>c.id==='K').placed&&close(r.voltage,12,.001)){
 if(r.stage===0)electrical=lamps.length===2&&lamps.every(c=>close(s.lamps[c.id].i,s.i,.005))&&close(lamps.reduce((a,c)=>a+s.lamps[c.id].u,0),s.u,.05);
 if(r.stage===1)electrical=lamps.length===2&&lamps.every(c=>close(s.lamps[c.id].u,12,.05))&&close(lamps.reduce((a,c)=>a+s.lamps[c.id].i,0),s.i,.005);
 if(r.stage===2){const rr=r.parts.find(c=>c.id==='R1');electrical=lamps.length===1&&rr.placed&&s.lamps.R1.i>.001&&close(s.lamps.R1.i,s.i,.005)&&close(s.i,.5)&&close(s.lamps[lamps[0].id].i,s.i,.005);}
}
const both=r.players.length===2&&r.players.every(p=>r.contributions.has(p.id));return {electrical,both,ok:electrical&&both,contributors:[...r.contributions],title:World.STAGES[r.stage].title,text:World.STAGES[r.stage].text};}
function publicPlayers(r){return r.players.map(p=>({id:p.id,name:p.name,present:!!p.stream,pos:p.pos,yaw:p.yaw,pitch:p.pitch,held:p.held,ready:r.ready.has(p.id)}));}
function state(r){return {room:r.id,revision:r.revision,epoch:r.epoch,stage:r.stage,finished:r.finished,parts:r.parts,wires:r.wires,voltage:r.voltage,powered:r.powered,switchClosed:r.switchClosed,players:publicPlayers(r),goal:challenge(r),event:r.event,expiresAt:r.expiresAt};}
function push(p,type,data){if(!p.stream||p.stream.writableEnded)return;try{if(p.stream.writableLength>250000){p.stream.destroy();return;}p.stream.write(`event: ${type}\ndata: ${JSON.stringify(data)}\n\n`);}catch{p.stream?.destroy();}}
function broadcast(r,kind='state'){const data=kind==='poses'?{epoch:r.epoch,players:publicPlayers(r)}:state(r);r.players.forEach(p=>push(p,kind,data));}
function changed(r,kind,actor){r.revision++;r.event={seq:r.revision,kind,actor};r.lastUsed=Date.now();broadcast(r);}
function newRoom(base){if(rooms.size>=MAX_ROOMS)throw new GameError(503,'Бөлмелер саны шектеуге жетті. Кейінірек қайталап көріңіз.');const id=uid(),now=Date.now(),r={id,hostToken:uid(24),base,createdAt:now,lastUsed:now,expiresAt:now+TTL,players:[],parts:World.components(),wires:[],wireSerial:0,voltage:12,powered:false,switchClosed:false,stage:0,epoch:1,revision:0,finished:false,ready:new Set(),contributions:new Set(),event:{seq:0,kind:'start',actor:null}};rooms.set(id,r);return r;}
function getRoom(id){const r=rooms.get(id);if(!r||Date.now()>r.expiresAt)throw new GameError(404,'Бұл QR сессиясы аяқталған. Жаңа QR жасаңыз.','expired');return r;}
function authenticate(r,token){const p=r.players.find(p=>p.token===token);if(!p)throw new GameError(401,'Ойыншы сессиясы табылмады. QR арқылы қайта кіріңіз.','unauthorized');return p;}
function join(r,token){if(token){const p=r.players.find(p=>p.token===token);if(p)return p;}
if(r.players.length>=2)throw new GameError(409,'Бұл QR бойынша екі орын да алынған. Үшінші ойыншы кіре алмайды.','room_full');const id='p'+(r.players.length+1),p={id,token:uid(24),name:'Ойыншы '+(r.players.length+1),pos:[r.players.length?1.0:-1.0,0,4.5],yaw:0,pitch:-.16,held:null,stream:null,lastPose:Date.now(),lastAction:0,seen:new Map(),connection:0};r.players.push(p);changed(r,'join',id);return p;}
function requirePart(r,id){const c=r.parts.find(c=>c.id===id);if(!c)bad('Құрал табылмады.');return c;}
function requireNear(p,c,range=6.5){if(Math.hypot(p.pos[0]-c.pos[0],p.pos[2]-c.pos[2])>range)bad('Алдымен құралға жақындаңыз.');}
function requireTerm(r,id){if(typeof id!=='string'||!/^[A-Z][A-Z0-9]*[ab]$/.test(id))bad('Клемма дұрыс емес.');const c=requirePart(r,id.slice(0,-1));if(!c.placed)bad('Құрал алдымен үстелде тұруы керек.');return c;}
function pose(r,p,a){const now=Date.now();if(now-p.lastPose<45)return;const pos=a.pos;if(!Array.isArray(pos)||pos.length!==3||!pos.every(Number.isFinite)||World.blocked(pos[0],pos[2]))bad('Қозғалыс аймағы жарамсыз.');const max=Math.min(1,Math.max(.1,(now-p.lastPose)/1000))*4.3+.45;if(Math.hypot(pos[0]-p.pos[0],pos[2]-p.pos[2])>max)bad('Қозғалыс тым жылдам.');for(let t=.1;t<=1;t+=.1)if(World.blocked(p.pos[0]+(pos[0]-p.pos[0])*t,p.pos[2]+(pos[2]-p.pos[2])*t))bad('Үстел арқылы жүруге болмайды.');p.pos=[pos[0],0,pos[2]];p.yaw=Number.isFinite(a.yaw)?a.yaw% (Math.PI*2):p.yaw;p.pitch=Number.isFinite(a.pitch)?Math.max(-1.18,Math.min(1.15,a.pitch)):p.pitch;p.lastPose=now;r.lastUsed=now;broadcast(r,'poses');}
function action(r,p,a){if(a.epoch!==r.epoch)throw new GameError(409,'Бөлме ауысты. Деректер жаңартылды.','stale_epoch');const type=a.type,d=a.data||{};if(type==='pose'){pose(r,p,d);return;}
if(!p.stream)throw new GameError(409,'Ойынға қосылу қалпына келгенше күтіңіз.','offline');
if(type==='ready'){
 if(r.finished)return;
 const g=challenge(r);if(!g.ok)bad('Алдымен тізбекті аяқтап, екеуің де құрастыруға қатысыңдар.');if(p.held)bad('Алдымен қолдағы құралды қойыңыз.');if(Math.hypot(p.pos[0],p.pos[2]-9.3)>2.3)bad('Жасыл есікке жақындаңыз.');r.ready.add(p.id);
 if(r.players.length===2&&r.players.every(x=>x.stream&&r.ready.has(x.id)&&!x.held&&Math.hypot(x.pos[0],x.pos[2]-9.3)<2.3)){
  if(r.stage===2){r.finished=true;changed(r,'win',p.id);return;}
  r.stage++;r.epoch++;r.parts=World.components();r.wires=[];r.wireSerial=0;r.powered=false;r.voltage=12;r.switchClosed=false;r.ready.clear();r.contributions.clear();r.players.forEach((x,i)=>{x.held=null;x.pos=[i?1:-1,0,4.5];x.yaw=0;x.pitch=-.16;x.lastPose=Date.now();});changed(r,'door',p.id);return;
 }changed(r,'ready',p.id);return;
}
let contribution=false;
switch(type){
 case 'pickup':{const c=requirePart(r,d.id);if(c.id==='B')bad('Қорек көзі үстелде бекітілген.');if(p.held)bad('Қолыңыздағы құралды алдымен қойыңыз.');if(c.carrier)throw new GameError(409,'Бұл құрал серіктесіңіздің қолында.','busy');requireNear(p,c,c.placed?6.5:2.25);r.wires=r.wires.filter(w=>!w.a.startsWith(c.id)&&!w.b.startsWith(c.id));c.placed=false;c.carrier=p.id;p.held=c.id;break;}
 case 'place':{if(!p.held)bad('Қолыңызда құрал жоқ.');const c=requirePart(r,p.held),pos=[d.x,World.Y,d.z];if(!World.fits(r.parts,c.id,pos))bad('Үстелдегі бос орынды таңдаңыз.');requireNear(p,{pos},6.5);c.pos=pos;c.placed=true;c.carrier=null;p.held=null;contribution=true;break;}
 case 'move':{const c=requirePart(r,d.id);if(c.id==='B'||!c.placed||c.carrier)bad('Бұл құралды қазір жылжыту мүмкін емес.');const pos=[d.x,World.Y,d.z];if(!World.fits(r.parts,c.id,pos))bad('Орында басқа құрал бар.');requireNear(p,c);requireNear(p,{pos});c.pos=pos;break;}
 case 'return':{const c=requirePart(r,d.id);if(c.id==='B'||(c.carrier&&c.carrier!==p.id))bad('Бұл құралды қайтара алмайсыз.');if(c.carrier!==p.id)requireNear(p,c);r.wires=r.wires.filter(w=>!w.a.startsWith(c.id)&&!w.b.startsWith(c.id));c.placed=false;c.carrier=null;c.pos=[...c.home];if(p.held===c.id)p.held=null;break;}
 case 'connect':{const ca=requireTerm(r,d.a),cb=requireTerm(r,d.b);requireNear(p,ca);requireNear(p,cb);if(d.a===d.b)bad('Екі әртүрлі клемманы таңдаңыз.');if(r.wires.some(w=>(w.a===d.a&&w.b===d.b)||(w.a===d.b&&w.b===d.a)))bad('Бұл сым жалғанған.');if(r.wires.length>=30)bad('30 сымнан артық қосылмайды.');r.wires.push({a:d.a,b:d.b,id:++r.wireSerial});contribution=true;break;}
 case 'removeWire':{const w=r.wires.find(w=>w.id===d.id);if(!w)bad('Сым табылмады.');requireNear(p,requireTerm(r,w.a));r.wires=r.wires.filter(item=>item!==w);break;}
 case 'clear':requireNear(p,requirePart(r,'B'));r.wires=[];r.powered=false;break;
 case 'power':requireNear(p,requirePart(r,'B'));r.powered=!r.powered;break;
 case 'switch':{const c=requirePart(r,'K');if(!c.placed)bad('Алдымен кілтті үстелге қойыңыз.');requireNear(p,c);r.switchClosed=!r.switchClosed;break;}
 case 'voltage':requireNear(p,requirePart(r,'B'));if(!Number.isInteger(d.value)||d.value<1||d.value>24)bad('Кернеу 1–24 В болуы керек.');r.voltage=d.value;break;
 case 'resistance':{const c=requirePart(r,d.id);if(!['lamp','resistor','motor'].includes(c.kind)||!Number.isInteger(d.value)||d.value<3||d.value>60)bad('Кедергі 3–60 Ом болуы керек.');requireNear(p,c);c.r=d.value;break;}
 case 'break':{const c=requirePart(r,d.id);if(!['lamp','resistor','motor'].includes(c.kind)||typeof d.enabled!=='boolean')bad('Бұл құралды үзу мүмкін емес.');requireNear(p,c);c.enabled=d.enabled;break;}
 default:bad('Белгісіз әрекет.');
}
if(contribution)r.contributions.add(p.id);r.ready.clear();changed(r,type,p.id);
}
function localURLs(port){const ips=[];let interfaces;try{interfaces=os.networkInterfaces();}catch{return ips;}for(const arr of Object.values(interfaces))for(const a of arr||[])if(a.family==='IPv4'&&!a.internal&&!a.address.startsWith('169.254.'))ips.push(`http://${a.address}:${port}`);return ips;}
function json(res,status,obj){res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(JSON.stringify(obj));}
async function body(req){let b='';for await(const chunk of req){b+=chunk;if(b.length>16000)throw new GameError(413,'Сұрау тым үлкен.');}try{return JSON.parse(b||'{}');}catch{bad('JSON қате.');}}
function sameOrigin(req){const origin=req.headers.origin;if(!origin)return true;const host=req.headers.host;try{return new URL(origin).host===host||!!PUBLIC_URL&&new URL(origin).origin===new URL(PUBLIC_URL).origin;}catch{return false;}}
const staticFiles={'/':'index.html','/index.html':'index.html','/physics.js':'physics.js','/world.js':'world.js','/lab.js':'lab.js','/coop.js':'coop.js'};
const server=http.createServer(async(req,res)=>{try{
 const url=new URL(req.url,'http://localhost'),q=url.searchParams;
 if(req.method==='POST'&&!sameOrigin(req))throw new GameError(403,'Басқа сайттан келген сұрау қабылданбайды.');
 if(req.method==='GET'&&url.pathname==='/api/info')return json(res,200,{ok:true,lan:localURLs(PORT),publicURL:PUBLIC_URL,maxPlayers:2,ttlMinutes:120});
 if(req.method==='POST'&&url.pathname==='/api/rooms'){
  const d=await body(req);let base=PUBLIC_URL||String(d.base||'');let parsed;try{parsed=new URL(base);}catch{bad('Мекенжай жарамсыз.');}if(!['http:','https:'].includes(parsed.protocol)||parsed.username||parsed.password||parsed.search||parsed.hash)bad('Мекенжай жарамсыз.');base=parsed.origin;
  if(!PUBLIC_URL){const allowed=new Set([req.headers.host,...localURLs(PORT).map(u=>new URL(u).host)]);if(!allowed.has(parsed.host))bad('Компьютердің көрсетілген желілік мекенжайын таңдаңыз.');}
  if(Buffer.byteLength(base+'/?room='+'x'.repeat(22))>106)bad('QR үшін қысқарақ домен керек.');const r=newRoom(base),joinURL=base+'/?room='+r.id;QR.matrix(joinURL);return json(res,201,{room:r.id,hostToken:r.hostToken,joinURL,qr:'/api/qr?room='+r.id});
 }
 if(req.method==='GET'&&url.pathname==='/api/qr'){const r=getRoom(q.get('room'));res.writeHead(200,{'Content-Type':'image/svg+xml','Cache-Control':'no-store'});return res.end(QR.svg(r.base+'/?room='+r.id));}
 if(req.method==='GET'&&url.pathname==='/api/lobby'){const r=getRoom(q.get('room'));if(q.get('host')!==r.hostToken)throw new GameError(401,'Рұқсат жоқ.');return json(res,200,{players:publicPlayers(r),stage:r.stage,finished:r.finished,expiresAt:r.expiresAt});}
 if(req.method==='POST'&&url.pathname==='/api/join'){const d=await body(req),r=getRoom(d.room),p=join(r,d.token);return json(res,200,{token:p.token,playerId:p.id,state:state(r)});}
 if(req.method==='GET'&&url.pathname==='/api/events'){
  const r=getRoom(q.get('room')),p=authenticate(r,q.get('token'));if(p.stream){push(p,'replaced',{message:'Осы орын басқа бетте ашылды.'});p.stream.end();}const serial=++p.connection;p.stream=res;p.lastPose=Date.now();
  res.writeHead(200,{'Content-Type':'text/event-stream; charset=utf-8','Cache-Control':'no-cache, no-transform','Connection':'keep-alive','X-Accel-Buffering':'no'});res.write('retry: 1500\n\n');changed(r,'presence',p.id);
  req.on('close',()=>{if(p.connection!==serial)return;p.stream=null;r.ready.delete(p.id);changed(r,'presence',p.id);const timer=setTimeout(()=>{if(!p.stream&&p.held){const c=requirePart(r,p.held);c.carrier=null;c.pos=[...c.home];c.placed=false;p.held=null;changed(r,'return',p.id);}},10000);timer.unref();});return;
 }
 if(req.method==='GET'&&url.pathname==='/api/state'){const r=getRoom(q.get('room'));authenticate(r,req.headers.authorization?.replace(/^Bearer /,''));return json(res,200,state(r));}
 if(req.method==='POST'&&url.pathname==='/api/action'){
  const d=await body(req),r=getRoom(d.room),p=authenticate(r,req.headers.authorization?.replace(/^Bearer /,''));if(d.requestId&&p.seen.has(d.requestId))return json(res,200,{ok:true,state:state(r)});
  action(r,p,d);if(d.requestId&&d.type!=='pose'){p.seen.set(d.requestId,true);if(p.seen.size>80)p.seen.delete(p.seen.keys().next().value);}return json(res,200,d.type==='pose'?{ok:true}:{ok:true,state:state(r)});
 }
 if(req.method==='GET'&&url.pathname==='/health')return json(res,200,{ok:true});
 if(req.method==='GET'&&staticFiles[url.pathname]){const file=path.join(__dirname,'public',staticFiles[url.pathname]),type=file.endsWith('.html')?'text/html':'text/javascript';res.writeHead(200,{'Content-Type':type+'; charset=utf-8','Cache-Control':'no-cache','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer'});return fs.createReadStream(file).pipe(res);}
 json(res,404,{error:'Бет табылмады.'});
}catch(e){if(!res.headersSent)json(res,e.status||500,{error:e.status?e.message:'Сервер қатесі.',code:e.code||'server_error'});else res.end();if(!e.status)console.error(e.message);}});
server.requestTimeout=20000;server.headersTimeout=15000;
const cleanup=setInterval(()=>{const now=Date.now();for(const [id,r]of rooms){if(now>r.expiresAt){r.players.forEach(p=>{push(p,'expired',{});p.stream?.end();});rooms.delete(id);}else r.players.forEach(p=>{if(p.stream)p.stream.write(': heartbeat\n\n');});}},15000);cleanup.unref();
if(require.main===module)server.listen(PORT,HOST,()=>{console.log('\nЭЛЕКТР LAB · ЕКІ ОЙЫНШЫ\n');console.log(`Компьютерде ашу: http://localhost:${PORT}`);localURLs(PORT).forEach(u=>console.log('Телефонға арналған желі: '+u));console.log('\nЕкі телефон мен компьютер бір Wi-Fi желісінде болсын.\nБраузерде «QR жасау» батырмасын басыңыз.\nТоқтату: Ctrl+C\n');});
module.exports={server,rooms,newRoom,join,state,action,challenge,World};
