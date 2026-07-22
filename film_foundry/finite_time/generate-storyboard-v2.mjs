import { createHash } from 'node:crypto';
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const sourcePath = resolve(process.argv[2] ?? join(here, 'farm-to-lake.manifest.json'));
const editPath = resolve(process.argv[3] ?? join(here, 'farm-to-lake.edit-plan.v2.json'));
const narrationPath = resolve(process.argv[4] ?? join(here, 'farm-to-lake.narration.v2.txt'));
const out = resolve(process.argv[5] ?? join(here, 'dist', 'farm-to-lake-storyboard-v2'));
const source = JSON.parse(readFileSync(sourcePath, 'utf8'));
const edit = JSON.parse(readFileSync(editPath, 'utf8'));

const fail = (message) => { throw new Error(`FINITE TIME storyboard v2: ${message}`); };
const hash = (value) => createHash('sha256').update(value).digest('hex');
const esc = (value) => String(value).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[c]);
const available = (command) => spawnSync(command, ['--version'], { stdio: 'ignore' }).status === 0;
const wrap = (value, width = 54, max = 4) => {
  const lines = []; let line = '';
  for (const word of String(value).split(/\s+/)) {
    if (`${line} ${word}`.trim().length > width && line) { lines.push(line); line = word; } else line = `${line} ${word}`.trim();
  }
  if (line) lines.push(line); return lines.slice(0, max);
};
const timecode = (seconds) => {
  const ms = Math.round(seconds * 1000); const h = Math.floor(ms / 3600000); const m = Math.floor((ms % 3600000) / 60000); const s = Math.floor((ms % 60000) / 1000);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')},${String(ms % 1000).padStart(3, '0')}`;
};
const narration = new Map(readFileSync(narrationPath, 'utf8').split(/\r?\n/).filter((line) => line && !line.startsWith('#')).map((line) => {
  const at = line.indexOf('|'); if (at < 1) fail(`invalid narration line ${line}`); return [line.slice(0, at), line.slice(at + 1)];
}));

if (source.schemaVersion !== 'finite-time-no-spend-animatic-v1' || edit.schemaVersion !== 'finite-time-edit-plan-v2') fail('schema mismatch');
if (source.providerSpendAuthorized || source.finalRenderingAuthorized || edit.providerSpendAuthorized || edit.finalRenderingAuthorized) fail('authorization must remain false');
if (process.env.ASSET_RENDERER_MODE === 'provider' || process.env.ASSET_FORGE_REQUIRE_PROVIDER === '1') fail('provider mode prohibited');
const shots = source.shots.map((shot) => ({ ...shot, durationSeconds: edit.shotDurations[shot.id], scratchNarration: narration.get(shot.id) }));
if (shots.length !== 30 || shots.some((shot) => !shot.durationSeconds || !shot.scratchNarration)) fail('incomplete 30-shot v2 authority');
const duration = shots.reduce((sum, shot) => sum + shot.durationSeconds, 0);
if (duration !== 180 || new Set(shots.map((shot) => shot.durationSeconds)).size < 5) fail('v2 timing invalid');

const P = { ink:'#17202b', paper:'#eee9df', panel:'#f9f6ef', blue:'#2f668e', red:'#b5423c', green:'#4d7656', gold:'#b38a42', water:'#6d9fbd', gray:'#708090' };
const line = (x1,y1,x2,y2,color=P.ink,w=7,dash='') => `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${color}" stroke-width="${w}" stroke-linecap="round"${dash?` stroke-dasharray="${dash}"`:''}/>`;
const rect = (x,y,w,h,fill='none',stroke=P.ink,sw=7,rx=0) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${rx}" fill="${fill}" stroke="${stroke}" stroke-width="${sw}"/>`;
const circle = (x,y,r,fill='none',stroke=P.ink,sw=7) => `<circle cx="${x}" cy="${y}" r="${r}" fill="${fill}" stroke="${stroke}" stroke-width="${sw}"/>`;
const ellipse = (x,y,rx,ry,fill='none',stroke=P.ink,sw=7) => `<ellipse cx="${x}" cy="${y}" rx="${rx}" ry="${ry}" fill="${fill}" stroke="${stroke}" stroke-width="${sw}"/>`;
const path = (d,fill='none',stroke=P.ink,sw=7,dash='') => `<path d="${d}" fill="${fill}" stroke="${stroke}" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round"${dash?` stroke-dasharray="${dash}"`:''}/>`;
const text = (x,y,value,size=28,color=P.ink,anchor='middle',weight=600) => `<text x="${x}" y="${y}" fill="${color}" font-family="Arial, sans-serif" font-size="${size}" font-weight="${weight}" text-anchor="${anchor}">${esc(value)}</text>`;
const arrow = (x1,y1,x2,y2,label) => `${line(x1,y1,x2,y2,P.red,6,'14 10')}${path(`M ${x2} ${y2} l -22 -13 M ${x2} ${y2} l -13 22`,'none',P.red,6)}${text((x1+x2)/2,(y1+y2)/2-15,label,22,P.red)}`;
const person = (x,y,s=1,pose='stand') => `${circle(x,y-95*s,25*s,P.panel,P.ink,6*s)}${line(x,y-65*s,x,y,P.ink,7*s)}${pose==='reach'?line(x,y-45*s,x+80*s,y-80*s,P.ink,6*s):line(x-48*s,y-40*s,x+48*s,y-40*s,P.ink,6*s)}${line(x,y,x-38*s,y+75*s,P.ink,7*s)}${line(x,y,x+(pose==='slide'?75:38)*s,y+75*s,P.ink,7*s)}`;
const cow = (x,y,s=1) => `${ellipse(x,y,105*s,53*s,P.panel,P.ink,7*s)}${circle(x+115*s,y-18*s,38*s,P.panel,P.ink,7*s)}${line(x-62*s,y+38*s,x-70*s,y+118*s,P.ink,7*s)}${line(x+45*s,y+38*s,x+52*s,y+118*s,P.ink,7*s)}${path(`M ${x-100*s} ${y-20*s} Q ${x-150*s} ${y-70*s} ${x-170*s} ${y-15*s}`,'none',P.ink,6*s)}`;
const house = (x,y,s=1) => `${path(`M ${x-120*s} ${y} L ${x} ${y-100*s} L ${x+120*s} ${y} Z`,P.panel,P.ink,7*s)}${rect(x-100*s,y,200*s,130*s,P.panel,P.ink,7*s)}${rect(x-28*s,y+55*s,56*s,75*s,'none',P.ink,6*s)}`;
const truck = (x,y,s=1) => `${path(`M ${x-190*s} ${y+50*s} L ${x-165*s} ${y-20*s} L ${x-100*s} ${y-90*s} L ${x+55*s} ${y-90*s} L ${x+115*s} ${y-25*s} L ${x+200*s} ${y-25*s} L ${x+220*s} ${y+50*s} Z`,'#c4514c',P.ink,7*s)}${circle(x-105*s,y+55*s,38*s,P.panel,P.ink,7*s)}${circle(x+130*s,y+55*s,38*s,P.panel,P.ink,7*s)}${rect(x-85*s,y-75*s,110*s,55*s,'#d8e7ef',P.ink,5*s)}`;
const boat = (x,y,s=1) => `${path(`M ${x-220*s} ${y} Q ${x} ${y+70*s} ${x+230*s} ${y} L ${x+160*s} ${y+78*s} L ${x-145*s} ${y+78*s} Z`,'#f7f5ed',P.ink,7*s)}${line(x-125*s,y+34*s,x+140*s,y+34*s,P.blue,12*s)}${path(`M ${x-75*s} ${y} L ${x-10*s} ${y-75*s} L ${x+105*s} ${y-75*s} L ${x+150*s} ${y}`,'#d8e7ef',P.ink,7*s)}`;
const waves = (y,count=4) => Array.from({length:count},(_,i)=>path(`M 100 ${y+i*34} Q 260 ${y-25+i*34} 420 ${y+i*34} T 740 ${y+i*34} T 1060 ${y+i*34} T 1820 ${y+i*34}`,'none',P.water,8)).join('');

function board(shot,index) {
  const phase=index%3; const scene=shot.sceneId; const b=[];
  if (scene==='scene-land-before-water') {
    if(phase===0)b.push(ellipse(820,500,190,100,'#b9d7df',P.blue),house(420,420,.8),rect(1240,330,260,150,P.panel),path('M 60 760 C 430 690 840 720 1160 620 S 1640 520 1860 610','none',P.gray,12,'24 18'),text(820,505,'POND',25,P.blue),text(1370,415,'DAIRY',24),arrow(1700,230,1120,430,'AERIAL PUSH'));
    if(phase===1)b.push(rect(980,260,520,310,'#fff'),text(1240,320,'WHITE MILKING BAY',30),cow(500,560,.72),cow(760,560,.72),cow(1020,560,.72),arrow(230,650,1040,520,'CATTLE FLOW'));
    if(phase===2)b.push(rect(210,240,330,470,P.panel),rect(320,410,110,300),person(380,600,.8),house(1480,420,.55),cow(1100,560,.55),text(380,200,'CHILD POV',28),arrow(600,500,1210,450,'LOOK OUT'));
  } else if (scene==='scene-ice-and-cow') {
    b.push(path('M 100 750 L 1600 300','#d8e5ea',P.ink,8));
    if(phase===0)b.push(cow(1190,410,.7),person(820,585,.75,'slide'),arrow(700,670,1190,430,'UPHILL'),text(500,700,'ICE',32,P.blue));
    if(phase===1)b.push(cow(1040,500,1.1),person(620,580,.9,'reach'),line(680,480,850,455,P.red,8),text(760,395,'GENTLE GRIP',25,P.red));
    if(phase===2)b.push(cow(1180,430,.72),person(800,610,.75,'slide'),rect(1430,260,330,300,'#fff6d2'),arrow(720,650,1420,370,'PULL INTO WARM LIGHT'));
  } else if (scene==='scene-farm-work') {
    if(phase===0)b.push(path('M 80 740 Q 480 610 900 740 T 1800 740','none',P.green,12),truck(900,500,.85),circle(1420,430,95,P.panel),text(1420,438,'HAY',28),arrow(320,620,1240,620,'TRACK WITH TRACTOR'));
    if(phase===1){for(let i=0;i<5;i++)b.push(cow(420+i*260,500,.55));b.push(rect(250,250,1400,430,'none',P.gray,6),text(950,235,'PRACTICAL MILKING LINE',30));}
    if(phase===2)b.push(person(640,570,.75,'reach'),path('M 720 520 Q 980 390 1320 520','none',P.gold,15),arrow(1550,360,950,470,'SLOW PUSH'),text(1050,310,'HAY DUST IN SUNLIGHT',28,P.gold));
  } else if (scene==='scene-family-chaos') {
    if(phase===0)b.push(house(960,420,1.15),person(690,650,.75,'reach'),person(1270,650,.75),text(960,260,'OPEN DOOR',30),arrow(500,600,860,560,'WELCOME'));
    if(phase===1)b.push(rect(300,280,1300,450,P.panel),person(520,570,.55),person(810,590,.55),person(1100,570,.55),person(1390,590,.55),path('M 400 640 Q 800 560 1520 650','#d7e0e8',P.blue,6),text(950,240,'EVERYBODY SICK',28));
    if(phase===2)b.push(house(1050,400,.9),path('M 340 670 Q 520 480 700 650 Q 850 790 1030 610','none',P.red,13,'18 12'),circle(360,660,18,P.gold,P.red,5),arrow(350,730,1050,560,'BOUNCE PATH'),person(1420,650,.6));
  } else if (scene==='scene-cat-and-mask') {
    if(phase===0)b.push(rect(280,260,1300,430,P.panel),ellipse(840,555,110,55,P.panel),arrow(600,500,1320,570,'SLIDE'),rect(1370,370,90,230,'#d7c7a5'));
    if(phase===1)b.push(rect(980,250,450,360,'#6b5a49'),rect(1030,310,350,240,'#aab8bc'),ellipse(930,420,100,55,P.panel),arrow(870,300,1110,520,'PAWS LOSE GRIP'),text(1200,650,'OLD TELEVISION',26));
    if(phase===2)b.push(path('M 800 680 Q 710 520 820 410 Q 910 520 1000 390 Q 1110 520 1030 680 Z','#d36b3e',P.red,8),circle(930,410,120,P.panel),circle(890,390,18,P.ink,P.ink),circle(970,390,18,P.ink,P.ink),person(520,610,.75),text(930,760,'MASK BURNED — FEAR RESOLVED',26));
  } else if (scene==='scene-digital-door') {
    if(phase===0)b.push(rect(760,260,560,370,'#4a5360',P.ink,9,20),rect(820,310,440,250,'#9fc5c5'),person(560,650,.65),person(1450,650,.75),arrow(690,500,890,430,'SHARED ATTENTION'));
    if(phase===1)b.push(rect(300,220,1320,520,'#dae6df',P.ink,9,20),circle(680,470,140,'none',P.blue),path('M 940 650 L 1050 350 L 1200 650 Z'),circle(1370,420,95,'none',P.gold),waves(620,2),text(960,285,'ORIGINAL DIGITAL WORLD — NO COPIED ART',24,P.red));
    if(phase===2)b.push(rect(760,260,560,370,'#4a5360',P.ink,9,20),circle(850,400,58,P.panel),circle(1210,400,58,P.panel),path('M 890 440 Q 1030 520 1170 440','none',P.blue,8),text(1040,690,'SHARED DISCOVERY',28));
  } else if (scene==='scene-school-mornings') {
    if(phase===0)b.push(house(420,420,.65),truck(1200,540,1),arrow(1600,430,1050,500,'DOLLY IN'),text(1200,760,'GENERIC RED SHORT-BED TRUCK',25,P.red));
    if(phase===1)b.push(truck(960,580,1.15),person(780,430,.5),person(1110,430,.65),rect(860,430,120,90,'#d7c7a5'),circle(1040,470,34,P.gold),text(960,250,'BREAKFAST + GENERIC GAME PIECE',28));
    if(phase===2)b.push(rect(300,260,540,370,P.panel),text(570,360,'SCHOOL',42),person(650,650,.6),truck(1370,560,.8),arrow(1280,540,1720,540,'TRUCK EXITS FRAME'));
  } else if (scene==='scene-snake-shoe') {
    if(phase===0)b.push(rect(250,240,1400,470,P.panel),person(450,600,.55),ellipse(820,570,170,65,'#b8c7d0'),ellipse(1120,570,170,65,'#b8c7d0'),ellipse(1420,570,170,65,'#b8c7d0'),text(1120,320,'THREE “SLEEPING” COUSINS',28));
    if(phase===1)b.push(person(640,620,.8),path('M 780 610 Q 900 470 1030 600 Q 1140 710 1260 540','none',P.ink,13),rect(730,640,180,90,P.panel),arrow(720,470,920,570,'REVEAL'),text(1030,380,'DEAD SNAKE IN SHOE',28,P.red));
    if(phase===2)b.push(person(720,610,.68),person(1120,560,1),line(780,480,1040,480,P.ink,8),person(1450,650,.5),person(1580,650,.5),text(1120,280,'BROTHER HOLDS HIM AT ARM’S LENGTH',26),arrow(580,650,850,560,'CHILD CHARGES'));
  } else if (scene==='scene-land-to-water') {
    if(phase===0)b.push(path('M 80 700 Q 500 560 900 700 T 1800 700','#a9b994',P.green,8),rect(420,420,250,150,'none',P.gray,6,8),rect(1180,400,300,180,'none',P.gray,6,8),text(950,320,'PRESENT DAY — BUILDINGS GONE',30),text(950,790,'HOLD IN WIND. NO MUSIC.',25,P.red));
    if(phase===1)b.push(path('M 80 730 Q 450 550 820 730','none',P.green,13),waves(590,4),text(960,335,'MATCH DISSOLVE',24,P.red),arrow(650,500,1250,500,'GRASS → WATER'));
    if(phase===2)b.push(waves(520,5),circle(1480,260,90,'#efd27a',P.gold),path('M 80 520 Q 430 350 760 520 T 1440 520 T 1840 520','#77916f',P.green,8),text(960,240,'LAKE O’ THE PINES',44,P.blue),arrow(1670,700,1180,450,'CRANE REVEAL'));
  } else if (scene==='scene-ski-nautique') {
    if(phase===0)b.push(waves(650,3),boat(1040,520,1.15),line(230,700,650,550,P.ink,14),text(1040,290,'GENERIC PERIOD SKI BOAT',28),arrow(250,350,900,460,'PUSH FROM DOCK'));
    if(phase===1)b.push(boat(1280,430,.75),person(600,700,.65),line(650,560,1050,470,P.red,9),path('M 480 760 Q 600 670 720 760','none',P.water,12),text(830,470,'ROPE TENSION',24,P.red),arrow(520,410,1220,370,'DRIVER LOOKS BACK'));
    if(phase===2)b.push(waves(700,3),boat(1450,400,.65),person(720,580,.6),line(780,480,1210,420,P.red,8),path('M 580 680 Q 720 520 860 680','none',P.water,16),arrow(500,400,1160,400,'TRACK ACROSS WATER'),text(950,260,'BODY UP · KNEES SOFT · TRUST',30,P.blue));
  }
  return b.join('');
}

function svg(shot,index,start) {
  const renderLines=(values,x,y,size,gap,color=P.ink,anchor='start',weight=500)=>values.map((v,i)=>text(x,y+i*gap,v,size,color,anchor,weight)).join('');
  return `<?xml version="1.0" encoding="UTF-8"?><svg xmlns="http://www.w3.org/2000/svg" width="1920" height="1080" viewBox="0 0 1920 1080"><rect width="1920" height="1080" fill="${P.paper}"/><rect x="42" y="38" width="1836" height="1004" rx="18" fill="${P.panel}" stroke="${P.ink}" stroke-width="8"/><rect x="70" y="85" width="1780" height="700" rx="12" fill="#fdfbf6" stroke="${P.ink}" stroke-width="5"/>${board(shot,index)}<rect x="70" y="810" width="1780" height="200" rx="12" fill="#e6e0d5" stroke="${P.ink}" stroke-width="5"/>${renderLines(wrap(shot.title,34,2),120,850,34,40,P.ink,'start',700)}${renderLines(wrap(shot.visual,62,3),120,930,23,29,P.gray)}${renderLines(wrap(shot.scratchNarration,72,3),980,865,30,37,P.blue,'start',700)}<text x="1810" y="845" fill="${P.red}" font-family="Arial" font-size="24" font-weight="700" text-anchor="end">SCRATCH NARRATION · TIMING ONLY</text><text x="1810" y="885" fill="${P.ink}" font-family="Arial" font-size="22" text-anchor="end">${shot.id} · ${String(index+1).padStart(2,'0')} / 30</text><text x="1810" y="920" fill="${P.ink}" font-family="Arial" font-size="22" text-anchor="end">${start.toFixed(1)}s → ${(start+shot.durationSeconds).toFixed(1)}s · hold ${shot.durationSeconds}s</text><text x="1810" y="960" fill="${P.red}" font-family="Arial" font-size="20" text-anchor="end">no provider · $0 spend · final rendering not authorized</text><text x="96" y="70" fill="${P.ink}" font-family="Arial" font-size="22" font-weight="700">FINITE TIME · FARM TO LAKE · STORYBOARD ANIMATIC V2</text></svg>`;
}

function writeWav(file,seconds,sample) {
  const rate=48000, samples=Math.floor(rate*seconds), bytes=samples*4, buffer=Buffer.alloc(44+bytes); buffer.write('RIFF',0);buffer.writeUInt32LE(36+bytes,4);buffer.write('WAVE',8);buffer.write('fmt ',12);buffer.writeUInt32LE(16,16);buffer.writeUInt16LE(1,20);buffer.writeUInt16LE(2,22);buffer.writeUInt32LE(rate,24);buffer.writeUInt32LE(rate*4,28);buffer.writeUInt16LE(4,32);buffer.writeUInt16LE(16,34);buffer.write('data',36);buffer.writeUInt32LE(bytes,40);
  let offset=44; for(let i=0;i<samples;i++){const [l,r]=sample(i/rate,i);buffer.writeInt16LE(Math.max(-32768,Math.min(32767,Math.round(l))),offset);buffer.writeInt16LE(Math.max(-32768,Math.min(32767,Math.round(r))),offset+2);offset+=4;} writeFileSync(file,buffer);
}
const starts=[];let total=0;for(const shot of shots){starts.push(total);total+=shot.durationSeconds;}
const locate=(t)=>{for(let i=shots.length-1;i>=0;i--)if(t>=starts[i])return{shot:shots[i],index:i,local:t-starts[i]};return{shot:shots[0],index:0,local:t};};
const noise=(i,seed)=>{let v=(i+seed*2654435761)>>>0;v^=v<<13;v^=v>>>17;v^=v<<5;return((v>>>0)/0xffffffff)*2-1;};
const ambience=(t,i)=>{const{shot,index,local}=locate(t);const seed=parseInt(hash(shot.sceneId).slice(0,8),16)>>>0;const fade=Math.max(0,Math.min(1,local/.35,(shot.durationSeconds-local)/.35));let value=Math.sin(2*Math.PI*(44+seed%55)*t)*140+noise(i,seed)*130;if(/farm|cow/.test(shot.sceneId))value+=Math.sin(2*Math.PI*2.1*t)*180;if(/digital/.test(shot.sceneId))value+=Math.sin(2*Math.PI*220*t)*120;if(/school/.test(shot.sceneId))value+=Math.sin(2*Math.PI*62*t)*170;if(/lake|ski/.test(shot.sceneId))value+=noise(i,seed+7)*260+Math.sin(2*Math.PI*.55*t)*200;if(local>1.1&&local<1.12)value+=650*Math.sin(2*Math.PI*120*local);value*=fade;return[value*(.94+(index%3)*.02),value];};

rmSync(out,{recursive:true,force:true});mkdirSync(join(out,'frames-svg'),{recursive:true});mkdirSync(join(out,'frames-png'),{recursive:true});mkdirSync(join(out,'narration-segments'),{recursive:true});
const concat=[],captions=[],descriptions=[],haptics=[],timeline=[];let cursor=0;
for(const[index,shot]of shots.entries()){const svgName=`${shot.id}.svg`,pngName=`${shot.id}.png`,svgPath=join(out,'frames-svg',svgName),pngPath=join(out,'frames-png',pngName);writeFileSync(svgPath,svg(shot,index,cursor));if(available('rsvg-convert'))execFileSync('rsvg-convert',['-w','1920','-h','1080','-o',pngPath,svgPath]);else writeFileSync(pngPath,readFileSync(svgPath));concat.push(`file '${join('frames-png',pngName).replaceAll("'","'\\''")}'`,`duration ${shot.durationSeconds}`);captions.push(`${index+1}\n${timecode(cursor)} --> ${timecode(cursor+shot.durationSeconds)}\n${shot.scratchNarration}\n`);descriptions.push(`${index+1}\n${timecode(cursor)} --> ${timecode(cursor+shot.durationSeconds)}\n${shot.audioDescription}\n`);for(const cue of shot.haptics)haptics.push({shotId:shot.id,atSeconds:cursor+cue.atSeconds,pattern:cue.pattern,intensity:cue.intensity});timeline.push({...shot,startSeconds:cursor,endSeconds:cursor+shot.durationSeconds,boardSvg:`frames-svg/${svgName}`,boardPng:`frames-png/${pngName}`});cursor+=shot.durationSeconds;}
concat.push(`file '${join('frames-png',`${shots.at(-1).id}.png`)}'`);writeFileSync(join(out,'frames.ffconcat'),`ffconcat version 1.0\n${concat.join('\n')}\n`);writeFileSync(join(out,'captions.srt'),captions.join('\n'));writeFileSync(join(out,'audio-description.srt'),descriptions.join('\n'));writeFileSync(join(out,'haptics.json'),`${JSON.stringify({schemaVersion:'finite-time-haptics-v2',cues:haptics},null,2)}\n`);writeFileSync(join(out,'timeline.json'),`${JSON.stringify({schemaVersion:'finite-time-storyboard-timeline-v2',projectId:source.projectId,chapterId:source.chapterId,sourceManifestSha256:`sha256:${hash(readFileSync(sourcePath))}`,sourceEditPlanSha256:`sha256:${hash(readFileSync(editPath))}`,narrationSha256:`sha256:${hash(readFileSync(narrationPath))}`,renderMode:'deterministic-local-proof',providerSpendAuthorized:false,finalRenderingAuthorized:false,targetDurationSeconds:180,shots:timeline},null,2)}\n`);
writeWav(join(out,'temporary-ambience-foley.wav'),duration,ambience);
let scratchNarrationGenerated=false;if(available('espeak-ng')&&available('ffmpeg')){const list=[];for(const shot of shots){const raw=join(out,'narration-segments',`${shot.id}-raw.wav`),fit=join(out,'narration-segments',`${shot.id}.wav`),words=shot.scratchNarration.split(/\s+/).length,speed=Math.max(135,Math.min(260,Math.ceil(words/Math.max(1,shot.durationSeconds-.6)*60)));execFileSync('espeak-ng',['-v','en-us','-s',String(speed),'-a','150','-w',raw,shot.scratchNarration]);execFileSync('ffmpeg',['-y','-i',raw,'-af',`aresample=48000,aformat=sample_fmts=s16:channel_layouts=stereo,apad=pad_dur=${shot.durationSeconds},atrim=duration=${shot.durationSeconds}`,'-c:a','pcm_s16le',fit],{stdio:'ignore'});list.push(`file '${fit.replaceAll("'","'\\''")}'`);}writeFileSync(join(out,'narration.ffconcat'),`ffconcat version 1.0\n${list.join('\n')}\n`);execFileSync('ffmpeg',['-y','-f','concat','-safe','0','-i',join(out,'narration.ffconcat'),'-c:a','pcm_s16le',join(out,'scratch-narration.wav')],{stdio:'ignore'});execFileSync('ffmpeg',['-y','-i',join(out,'scratch-narration.wav'),'-i',join(out,'temporary-ambience-foley.wav'),'-filter_complex','[0:a]volume=1[n];[1:a]volume=.34[a];[a][n]amix=inputs=2:duration=longest,alimiter=limit=.9[m]','-map','[m]','-c:a','pcm_s16le',join(out,'scratch-mix.wav')],{stdio:'ignore'});scratchNarrationGenerated=true;}else{writeWav(join(out,'scratch-narration.wav'),duration,()=>[0,0]);writeFileSync(join(out,'scratch-mix.wav'),readFileSync(join(out,'temporary-ambience-foley.wav')));}
let mp4Generated=false;if(available('ffmpeg')){execFileSync('ffmpeg',['-y','-f','concat','-safe','0','-i',join(out,'frames.ffconcat'),'-i',join(out,'scratch-mix.wav'),'-vf','fps=24,format=yuv420p','-c:v','libx264','-preset','medium','-crf','18','-c:a','aac','-b:a','192k','-shortest',join(out,'farm-to-lake-storyboard-animatic-v2.mp4')],{stdio:'inherit',cwd:out});mp4Generated=existsSync(join(out,'farm-to-lake-storyboard-animatic-v2.mp4'));}
let contactSheetGenerated=false;if(available('montage')){const pngs=readdirSync(join(out,'frames-png')).filter((name)=>name.endsWith('.png')).sort().map((name)=>join(out,'frames-png',name));execFileSync('montage',[...pngs,'-thumbnail','320x180','-tile','5x6','-geometry','+8+8','-background','#17202b',join(out,'contact-sheet.png')],{stdio:'ignore'});contactSheetGenerated=existsSync(join(out,'contact-sheet.png'));}
const gallery=shots.map((shot)=>`<figure><img src="frames-png/${shot.id}.png" alt="${esc(shot.audioDescription)}"><figcaption><strong>${shot.id} — ${esc(shot.title)} · ${shot.durationSeconds}s</strong><br>${esc(shot.scratchNarration)}<br><small>${esc(shot.visual)}</small></figcaption></figure>`).join('\n');writeFileSync(join(out,'review-gallery.html'),`<!doctype html><html><head><meta charset="utf-8"><title>FINITE TIME Storyboard V2</title><style>body{margin:0;background:#111821;color:#fff;font:16px system-ui}main{max-width:1400px;margin:auto;padding:28px}figure{margin:0 0 40px}img{width:100%;border:1px solid #536170;border-radius:12px}small{color:#aeb9c5}</style></head><body><main><h1>FINITE TIME — Farm to Lake Storyboard Animatic V2</h1><p>30 scene-specific boards · variable 180-second timing · local scratch narration · temporary ambience/Foley · no provider · $0 spend · final rendering not authorized.</p>${gallery}</main></body></html>`);writeFileSync(join(out,'README.md'),'# FINITE TIME — Farm-to-Lake Storyboard Animatic V2\n\nA deterministic offline storyboard artifact, separate from the audited static-card v1. Includes 30 scene-specific boards, variable timing, timing-only local scratch narration, temporary ambience/Foley, captions, audio description, haptics, timeline, contact sheet and review gallery. No provider calls, network, spend, likeness clearance or final-render authorization.\n');
const targets=['README.md','captions.srt','audio-description.srt','haptics.json','timeline.json','frames.ffconcat','temporary-ambience-foley.wav','scratch-narration.wav','scratch-mix.wav','review-gallery.html',...(mp4Generated?['farm-to-lake-storyboard-animatic-v2.mp4']:[]),...(contactSheetGenerated?['contact-sheet.png']:[])];const fileHashes=Object.fromEntries(targets.map((file)=>[file,`sha256:${hash(readFileSync(join(out,file)))}`]));const receipt={schemaVersion:'finite-time-no-spend-storyboard-receipt-v2',projectId:source.projectId,chapterId:source.chapterId,sourceManifestSha256:`sha256:${hash(readFileSync(sourcePath))}`,sourceEditPlanSha256:`sha256:${hash(readFileSync(editPath))}`,narrationSha256:`sha256:${hash(readFileSync(narrationPath))}`,shotCount:30,sceneCount:10,durationSeconds:180,distinctDurations:new Set(shots.map((shot)=>shot.durationSeconds)).size,storyboardVersion:2,sceneSpecificBoards:true,scratchNarrationGenerated,scratchNarrationLabel:'timing-only-not-approved',temporaryAmbienceFoleyGenerated:true,captionsGenerated:true,audioDescriptionGenerated:true,hapticsGenerated:true,contactSheetGenerated,reviewGalleryGenerated:true,renderMode:'deterministic-local-proof',deterministic:true,providerCallsExecuted:0,spendUsd:0,secretsUsed:false,networkRequired:false,finalRenderingAuthorized:false,mp4Generated,fileHashes};writeFileSync(join(out,'receipt.json'),`${JSON.stringify(receipt,null,2)}\n`);writeFileSync(join(out,'sha256sums.txt'),`${Object.entries({...fileHashes,'receipt.json':`sha256:${hash(readFileSync(join(out,'receipt.json')))}`}).map(([file,d])=>`${d.slice(7)}  ${file}`).join('\n')}\n`);console.log(JSON.stringify(receipt,null,2));
