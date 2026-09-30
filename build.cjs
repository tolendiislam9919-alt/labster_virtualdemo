'use strict';
const fs=require('node:fs'),path=require('node:path');
const dir=path.join(__dirname,'public');
const scripts=['physics.js','world.js','coop.js','lab.js'].map(name=>'<script>\n'+fs.readFileSync(path.join(dir,name),'utf8').replace(/<\/script/gi,'<\\/script')+'\n</script>').join('\n');
const shell=fs.readFileSync(path.join(dir,'shell.html'),'utf8');
if(!shell.includes('<!--SCRIPTS-->'))throw Error('Missing script marker');
fs.writeFileSync(path.join(dir,'index.html'),shell.replace('<!--SCRIPTS-->',()=>scripts));
console.log('public/index.html updated.');
