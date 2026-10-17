import { defineConfig } from 'vite';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const directory=path.dirname(fileURLToPath(import.meta.url));

/** Inline Vite's bundled JS/CSS into its output HTML, with no extra plugin. */
function singleHTML() {
  return {
    name:'single-html-output',
    async closeBundle() {
      const output=path.join(directory,'dist');
      const index=path.join(output,'index.html');
      let html=await fs.readFile(index,'utf8');
      for(const match of [...html.matchAll(/<script\b[^>]*src="([^"]+)"[^>]*><\/script>/g)]) {
        const code=await fs.readFile(path.join(output,match[1].replace(/^\.\//,'')),'utf8');
        html=html.replace(match[0],()=>`<script type="module">${code.replaceAll('</script','<\\/script')}</script>`);
      }
      for(const match of [...html.matchAll(/<link\b[^>]*href="([^"]+\.css)"[^>]*>/g)]) {
        const css=await fs.readFile(path.join(output,match[1].replace(/^\.\//,'')),'utf8');
        html=html.replace(match[0],()=>`<style>${css}</style>`);
      }
      await fs.writeFile(index,html);
      // Keep intermediate assets for inspectability. index.html itself is standalone.
    }
  };
}
export default defineConfig({
  base:'./',
  server:{port:3000,strictPort:true},
  preview:{port:3000,strictPort:true},
  resolve:{alias:[{find:/^#lab\//,replacement:`${path.join(directory,'src')}/`}]},
  plugins:[singleHTML()],
  build:{target:'esnext',cssCodeSplit:false,assetsInlineLimit:Infinity,rollupOptions:{output:{inlineDynamicImports:true}}}
});
