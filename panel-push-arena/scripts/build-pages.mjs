import fs from 'node:fs/promises';
import path from 'node:path';
import { build } from 'vite';
import react from '@vitejs/plugin-react';
import ts from 'typescript';

const root=process.cwd();
const output=path.resolve(root,'pages-output');
await build({configFile:false,root,base:'/panel-push/',plugins:[react()],build:{outDir:output,emptyOutDir:true,rollupOptions:{input:path.join(root,'pages-entry.tsx'),output:{entryFileNames:'game.js',chunkFileNames:'[name]-[hash].js'}}}});
const css=(await fs.readFile('app/globals.css','utf8')).replace(/^@import[^\n]+\n/gm,'');
await fs.writeFile(path.join(output,'game.css'),'button,input,select{font:inherit}button{color:inherit}h1,h2,p{margin-top:0}\n'+css+'\n'+await fs.readFile('app/chat.css','utf8'));
await fs.copyFile('public/favicon.svg',path.join(output,'favicon.svg'));
await fs.writeFile(path.join(output,'index.html'),'<!doctype html><html lang="ja"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>PANEL PUSH ARENA</title><link rel="icon" href="/panel-push/favicon.svg"><link rel="stylesheet" href="/panel-push/game.css"></head><body><div id="root"></div><script type="module" src="/panel-push/game.js"></script></body></html>');
let api=await fs.readFile('app/api/game/route.ts','utf8');
api=api.replace('import { env } from "cloudflare:workers";','');
api=api.replace('import { Difficulty, difficultyRanges as ranges, boardPattern } from "../../../lib/panel-rules";', (await fs.readFile('lib/panel-rules.ts','utf8')).replace(/export /g,'')+'\nconst ranges=difficultyRanges;');
api=api.replace('export async function POST','async function POST');
api='export async function onRequestPost(context:any){ const env={DB:context.env.PANEL_DB};\n'+api+'\nreturn POST(context.request);\n}';
await fs.writeFile(path.join(output,'pages-function.js'),ts.transpileModule(api,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022}}).outputText);
