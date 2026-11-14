import {rename,readFile,writeFile,mkdir,cp} from 'node:fs/promises';
import path from 'node:path';
const root=path.resolve(import.meta.dirname,'..');
await rename(path.join(root,'dist/app.html'),path.join(root,'dist/index.html'));
if(process.argv.includes('--release')){
 await writeFile(path.join(root,'index.html'),await readFile(path.join(root,'dist/index.html')));
 for(const name of ['assets','samples']){await mkdir(path.join(root,name),{recursive:true});await cp(path.join(root,'dist',name),path.join(root,name),{recursive:true});}
 await writeFile(path.join(root,'.nojekyll'),'');
 console.log('Root index.html, assets/ and samples/ are ready for branch-based GitHub Pages.');
}
