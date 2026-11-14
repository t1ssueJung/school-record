import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
test('repository root is directly deployable under a GitHub Pages project path',async()=>{
 const root=path.resolve(import.meta.dirname,'..'),html=await fs.readFile(path.join(root,'index.html'),'utf8');
 assert.ok(!html.includes('src="/src/main.js"'));
 const script=html.match(/<script[^>]+src="([^"]+)"/)[1],style=html.match(/<link[^>]+href="([^"]+\.css)"/)[1];
 for(const asset of [script,style]){assert.ok(asset.startsWith('./assets/'));assert.ok((await fs.stat(path.resolve(root,asset))).isFile());assert.ok(new URL(asset,'https://example.github.io/school-record/').pathname.startsWith('/school-record/assets/'));}
 assert.ok((await fs.stat(path.join(root,'samples/명렬표-가명.xlsx'))).isFile());
 assert.ok((await fs.stat(path.join(root,'.nojekyll'))).isFile());
});
