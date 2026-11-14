import {defineConfig} from 'vite';
export default defineConfig({base:'./',build:{target:'es2022',sourcemap:false,rolldownOptions:{input:'app.html'}},server:{host:'0.0.0.0'},preview:{host:'0.0.0.0'}});
