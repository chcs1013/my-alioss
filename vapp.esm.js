/*
main JavaScript file for myalioss

*/

pg_statistics.ML = new Date() - ST;// module load



const updateLoadStat = (globalThis.ShowLoadProgress) ? globalThis.ShowLoadProgress : function () { };

globalThis.appInstance_ = {};


export function delay(timeout = 0) {
    return new Promise(resolve => setTimeout(resolve, timeout));
}


updateLoadStat('Waiting');
await new Promise(resolve => setTimeout(resolve));

import { addCSS, registerResizableWidget, zIndexManager } from './modules/util/BindMove.js';
registerResizableWidget();
zIndexManager.config(20001, 20999);

// break long tasks
await delay();

updateLoadStat('Loading Vue.js');
import { createApp } from 'vue';

// break long tasks
await delay();

updateLoadStat('Loading Vue Application');
const Vue_App = (await import('./components/App/App.js')).default;
pg_statistics.AL = new Date() - ST;// app load

updateLoadStat('set user data');
const PROJECT_IDENTIFIER = 'Project:MyAliOSS;Type:User;Key:';
globalThis.u = {
    get(key) { return localStorage.getItem(PROJECT_IDENTIFIER + key) },
    set(key, value) { return localStorage.setItem(PROJECT_IDENTIFIER + key, value) },
    delete(keys) {
        if (arguments.length < 1) throw new TypeError('key(s) is required');
        if (arguments.length > 1) {
            for (const i of arguments) this.delete(i);
            return true;
        }
        if (typeof keys === 'string') return localStorage.removeItem(PROJECT_IDENTIFIER + keys);
        else if ((!keys) || (!Array.isArray(keys) && typeof keys[Symbol.iterator] !== 'function'))
            throw new TypeError('Bad argument');
        for (const i of keys) this.delete(i);
        return true;
    },
}

// break long tasks
await delay();

updateLoadStat('Creating Vue application');
const app = createApp(Vue_App);
globalThis.appInstance_.app = app;
// break long tasks
await delay();
updateLoadStat('Loading Element-Plus');
{
    const element = await import('element-plus');
    app.use(element);
}
// break long tasks
await delay();
updateLoadStat('Creating app instance');
app.config.unwrapInjectedRef = true;
app.config.compilerOptions.isCustomElement = (tag) => tag.includes('-');
app.config.compilerOptions.comments = true;

// app.mount('#app');

updateLoadStat('Finding #myApp');
const myApp = document.getElementById('myApp');
console.assert(myApp); if (!myApp) throw new Error('FATAL: #myApp not found');

// break long tasks
await delay(10);

updateLoadStat('Mounting application to document');
app.mount(myApp);
pg_statistics.MNT = new Date() - ST;// app mount

// break long tasks
await delay(10);
if (globalThis.swAlive === true && 'serviceWorker' in navigator) {
    try {
        const registrations = await navigator.serviceWorker.getRegistrations();
        for (const registration of registrations) {
            await registration.unregister();
        }
        console.info('[sw]', 'Service Worker unregistered successfully');
    } catch (error) {
        console.error('[sw]', 'Failed to unregister Service Worker:', error);
    }
}
pg_statistics.SWU = new Date() - ST; // Service Worker unregistration duration

// break long tasks
await delay();
updateLoadStat('Finishing');
globalThis.FinishLoad?.call(globalThis);
pg_statistics.OK = new Date() - ST;// app ok





// break long tasks
await delay();


setTimeout(async () => {
    globalThis.mime_db = await ((await fetch('./assets/data/mime_db-lite.json')).json());
    const def = ''//'application/octet-stream';
    globalThis.GetMimeTypeByExtension = (function getMimeTypeByExtension(extension) {
        const json = globalThis.mime_db;
        if (!extension) return def;
        // 遍历 JSON 对象
        for (const mimeType in json) {
            // 检查当前 MIME 类型的 extensions 数组是否包含目标扩展名
            if (json[mimeType].extensions && json[mimeType].extensions.includes(extension)) {
                let r = mimeType;
                if (json[mimeType].charset) r += '; charset=' + json[mimeType].charset;
                return r; // 如果找到匹配的扩展名，返回对应的 MIME 类型
            }
        }
        return def; // 如果没有找到匹配的扩展名，返回 默认
    });
});


queueMicrotask(() => {
    const widgets_container = document.createElement('div');
    widgets_container.dataset.usage = '__CreateDynamicResizableView__';
    const CSS = new CSSStyleSheet();
    const css_Text = `
    widget-caption {
        display: flex;
        flex-direction: row;
    }
    widget-caption > span {
        flex: 1;
        overflow: hidden;
        text-overflow: ellipsis;
        margin-right: 0.5em;
    }
    [data-usage="__CreateDynamicResizableView__"] {
        position: absolute;
        left: 0;
        top: 0;
        right: 0;
        bottom: 0;
        inset: 0;
        width: 100%;
        height: 100%;
        box-sizing: border-box;
        padding: 0;
    }
    `;
    CSS.replace(css_Text).then(() => { document.adoptedStyleSheets.push(CSS) }).catch(() => {
        const style = document.createElement('style');
        style.innerHTML = css_Text;
        widgets_container.append(style);
    });
    globalThis.CreateDynamicResizableView = function (element, title, width, height) {
        const el = document.createElement('resizable-widget');
        el.style.width = Math.min(window.innerWidth, width) + 'px';
        el.style.height = Math.min(window.innerHeight, height) + 'px';
        widgets_container.append(el);

        const caption = document.createElement('widget-caption');
        caption.slot = 'widget-caption';
        const title_container = document.createElement('span');
        title_container.textContent = title;
        caption.append(title_container);
        const close_button = document.createElement('button');
        close_button.innerText = 'x';
        close_button.style.float = 'right';
        close_button.dataset.excludeBindmove = 'true';
        close_button.addEventListener('click', () => el.remove());
        caption.append(close_button);

        el.append(caption, element);
        el.open = true;

        return el;
    };
    globalThis.document.addEventListener('click', ev => {
        const target = ev.target;
        if (!target || target.tagName !== 'A') return;
        if (target.target !== '_blank') return;
        if ((new URL(target.href, location.href).hostname === location.hostname)) return;
        // external link detected
        ev.preventDefault();
        queueMicrotask(() => {
            const frame = document.createElement('iframe');
            // frame.sandbox = 'allow-forms allow-scripts allow-popups allow-popups-to-escape-sandbox';
            frame.src = new URL(target.href, location.href).href;
            frame.setAttribute('style', 'width: 100%; height: 100%; overflow: hidden; border: 0; box-sizing: border-box; display: flex; flex-direction: column;');

            CreateDynamicResizableView(frame, 'External Link', 720, 1000);
        });
    });

    document.getElementById('myApp').after(widgets_container);
});


import('@/assets/js/preview-helper.js').then(module => globalThis.appInstance_.PreviewHelper = module);



// CODE END

// 预加载子组件，提升用户体验
setTimeout(() => {
    const preload_list = [
        '@/components/FileUploadForm/FileUploadForm.js',
        '@/components/FileDownloadUi/FileDownloadUi.js',
        '@/modules/monaco-editor/loadmono.js',
    ];
    for (const i of preload_list) import(i).then(() => {
        console.info('[preload]', 'Module has been successfully prefetched:', i);
    }).catch(error => {
        console.warn('[preload]', 'Failed to prefetch module:', i, error);
    });
});