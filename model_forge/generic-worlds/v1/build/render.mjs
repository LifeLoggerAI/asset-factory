#!/usr/bin/env node
// Original offline review harness; uses pinned tools, never a provider API.
import fs from 'node:fs';import path from 'node:path';import http from 'node:http';import crypto from 'node:crypto';import {createRequire} from 'node:module';import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const flags=Object.fromEntries(process.argv.slice(2).reduce((a,v,i,all)=>v.startsWith('--')?[...a,[v.slice(2),all[i+1]]]:a,[]));
if(!flags.tools||!flags.browser||!flags.playwright)throw Error('Usage: node render.mjs --tools /abs/node_modules --browser /abs/chromium --playwright /abs/node_modules/playwright');
const require=createRequire(import.meta.url);const {chromium}=require(flags.playwright);
const MIME={'.html':'text/html','.js':'text/javascript','.json':'application/json','.glb':'model/gltf-binary','.png':'image/png'};
const server=http.createServer((req,res)=>{try{
  const pathname=decodeURIComponent(new URL(req.url,'http://localhost').pathname);let base=root,relative=pathname.slice(1);
  if(pathname.startsWith('/three/')){base=path.join(flags.tools,'three');relative=pathname.slice(7);}else if(pathname==='/')relative='build/review.html';
  const target=path.resolve(base,relative);if(!target.startsWith(base+path.sep))throw Error('invalid path');const stat=fs.statSync(target);if(!stat.isFile())throw Error('not file');
  res.setHeader('Content-Type',MIME[path.extname(target)]||'application/octet-stream');fs.createReadStream(target).pipe(res);
}catch(e){res.statusCode=404;res.end('unavailable');}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const port=server.address().port;
let browser;const receipts=[];const hash=p=>crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
try{
  browser=await chromium.launch({executablePath:flags.browser,headless:true,args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--disable-dev-shm-usage']});
  const page=await browser.newPage({viewport:{width:1200,height:800},deviceScaleFactor:1});let errors=[];
  page.on('pageerror',e=>errors.push(String(e)));await page.goto(`http://127.0.0.1:${port}/`);await page.waitForFunction(()=>window.ready===true,{timeout:60000});
  const dirs=fs.readdirSync(path.join(root,'packages')).sort();
  for(const id of dirs){if(flags.only&&flags.only!==id)continue;const version=flags.version||'1.0.2';const dir=path.join(root,'packages',id,version);if(!fs.existsSync(path.join(dir,'manifest.json')))continue;
    const shots=JSON.parse(fs.readFileSync(path.join(dir,'cameras.json')));const shotdefs=[...Object.keys(shots).map(name=>({name,profile:'desktop',lod:0,shot:shots[name]})),{name:'mobile-budget',profile:'mobile',lod:2,shot:shots.eye},{name:'xr-relevant',profile:'xr',lod:1,shot:shots.eye}];
    const previewdir=path.join(dir,'previews');fs.mkdirSync(previewdir,{recursive:true});const rows=[];
    for(const shot of shotdefs){errors=[];const url=`/packages/${id}/${version}/lod${shot.lod}.glb`;const perf=await page.evaluate(async options=>await window.renderScene(options),{url,camera:shot.shot,id,profile:shot.profile});
      if(errors.length)throw Error(errors.join('\n'));const out=path.join(previewdir,`${shot.name}.png`);await page.screenshot({path:out});rows.push({shot:shot.name,path:path.relative(dir,out),sha256:hash(out),bytes:fs.statSync(out).size,sourceGlbSha256:hash(path.join(dir,`lod${shot.lod}.glb`)),performance:perf});
    }
    const r={schemaVersion:'urai-generic-preview-receipt-v1',id,version,harnessSha256:hash(fileURLToPath(import.meta.url)),htmlSha256:hash(path.join(root,'build/review.html')),threeVersion:JSON.parse(fs.readFileSync(path.join(flags.tools,'three/package.json'))).version,browserVersion:await browser.version(),truthClassification:'GENERIC',shots:rows,visualAccepted:false,runtimeIntegrated:false,physicalDeviceTested:false};
    fs.writeFileSync(path.join(dir,'preview-receipt.json'),JSON.stringify(r,null,2)+'\n');receipts.push({id,previewReceiptSha256:hash(path.join(dir,'preview-receipt.json')),shots:rows.length});console.log(JSON.stringify({id,shots:rows.length}));
  }
  fs.writeFileSync(path.join(root,'receipts','preview-index.json'),JSON.stringify({schemaVersion:'urai-generic-preview-index-v1',receipts,runtimeIntegrated:false,deviceAcceptance:false},null,2)+'\n');
}finally{if(browser)await browser.close();server.close();}
