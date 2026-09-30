/* Shared immutable lab geometry and challenge definitions. */
(function(root){'use strict';
const Y=1.62;
const STAGES=[
 {title:'01 · Энергия бөлмесі',text:'Екі шамды тізбектей қосыңдар. 12 В беріп, кілтті жабыңдар. Екі ойыншы да құрал орналастырсын немесе сым жалғасын.',type:'series'},
 {title:'02 · Тармақтар бөлмесі',text:'Екі шамды параллель қосыңдар. Екі шамға да 12 В түссін. Әрқайсың құрастыруға қатысыңдар.',type:'parallel'},
 {title:'03 · Токты басқару',text:'Бір шам мен реостатты тізбектей қосыңдар. 12 В кезінде реостатпен токты 0,50 ± 0,03 А етіңдер.',type:'control'}
];
function components(){return [
{id:'B',name:'Қорек көзі',kind:'battery',placed:true,pos:[-2.5,Y,-.65],home:[-2.5,Y,-.65]},
...[1,2,3].map((i)=>({id:'L'+i,name:'Шам '+i,kind:'lamp',r:12,enabled:true,placed:false,pos:[5.5,1.52,-1.95+(i-1)*1.25],home:[5.5,1.52,-1.95+(i-1)*1.25]})),
{id:'K',name:'Кілт',kind:'switch',placed:false,pos:[5.5,1.52,1.5],home:[5.5,1.52,1.5]},
{id:'R1',name:'Реостат',kind:'resistor',r:24,enabled:true,placed:false,pos:[-8.5,1.52,-3.3],home:[-8.5,1.52,-3.3]},
{id:'A',name:'Амперметр',kind:'ammeter',r:.01,enabled:true,placed:false,pos:[-8.5,1.52,-1.7],home:[-8.5,1.52,-1.7]},
{id:'V',name:'Вольтметр',kind:'voltmeter',placed:false,pos:[-8.5,1.52,-.1],home:[-8.5,1.52,-.1]},
{id:'M',name:'Электр моторы',kind:'motor',r:24,enabled:true,placed:false,pos:[-8.5,1.52,1.5],home:[-8.5,1.52,1.5]}
];}
function blocked(x,z){return !Number.isFinite(x)||!Number.isFinite(z)||x< -11.35||x>11.35||z< -9.25||z>10.2||(x> -3.95&&x<3.95&&z> -2.47&&z<1.93)||(x>4.5&&x<6.5&&z> -3&&z<2.21)||(x> -9.55&&x< -7.45&&z> -4.4&&z<2.4)||(z< -7.45&&Math.abs(x)<10.2)||(Math.hypot(x+4.6,z-2.6)<.68);}
function fits(parts,id,pos){return Array.isArray(pos)&&pos.length===3&&pos.every(Number.isFinite)&&pos[0]>=-3.08&&pos[0]<=3.08&&pos[2]>=-1.68&&pos[2]<=1.26&&!parts.some(c=>c.id!==id&&c.placed&&Math.abs(c.pos[0]-pos[0])<(c.kind==='battery'?1.4:1.22)&&Math.abs(c.pos[2]-pos[2])<.84);}
root.LabWorld={Y,STAGES,components,blocked,fits,door:[0,0,9.3]};
if(typeof module!=='undefined')module.exports=root.LabWorld;
})(typeof window!=='undefined'?window:globalThis);
