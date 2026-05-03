import fs from 'node:fs';
import path from 'node:path';
const root = process.cwd().endsWith('assetfactory-studio') ? process.cwd() : path.join(process.cwd(),'assetfactory-studio');
const required=['lib/server/assetFactoryStore.ts','lib/server/assetRenderer.ts','app/api/system/manifest/route.ts','app/api/generate/route.ts'];
for(const f of required){ const p=path.join(root,f); if(!fs.existsSync(p)){ console.error('Missing',p); process.exit(1);} }
console.log('PASS local asset-factory static checks');
