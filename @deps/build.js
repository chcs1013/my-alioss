import { build } from "esbuild";
import { promises as fs } from 'fs';

console.log("Deleting old artifacts...");
try {
    const dir = '../modules/@deps/';
    const files = await fs.readdir(dir);
    await Promise.all(
        files.map(file => fs.rm(`${dir}${file}`, { recursive: true, force: true }))
    );
} catch (e) {
    // Directory may not exist, ignore
}

console.log("Building...");
await build({
    entryPoints: ['./bundle.js'],
    bundle: true,
    platform: 'browser',
    format: 'esm',
    minify: true,
    target: 'es2022',
    sourcemap: true,
    loader: {
        '.css': 'css'
    },
    alias: {
        'vue': 'vue/dist/vue.esm-browser.js',
        'vue$': 'vue/dist/vue.esm-browser.js',
    },
    outdir: '../modules/@deps/',
});
console.log('---------------------------');
await build({
    entryPoints: ['./element-plus.js'],
    bundle: true,
    platform: 'browser',
    format: 'esm',
    minify: true,
    target: 'es2022',
    sourcemap: false,
    loader: {
        '.css': 'css'
    },
    external: ['vue'],
    outdir: '../modules/@deps/',
});
console.log("Build complete!");

