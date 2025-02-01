import { h, ref } from 'vue';
import { getHTML } from '@/assets/js/browser_side-compiler.js';
import { LoadCSS } from '../../assets/js/ResourceLoader.js';
import { ElMessage, ElMessageBox, ElLoading, ElSwitch } from 'element-plus';
import ExplorerNavBar from './ExplorerNavBar.js';


const componentId = '71fe886e983243d6b23a880127be76f1';
import { customCheckDrag } from './public.js';


const data = {
    data() {
        return {
            loadingInstance: null,
            listdata: [],
            viewType: 'list',
            objectCount: 0,
            filterText: '',
            selectedColumns: [
                tr('ui.string:filename'),
            ],
            m__updateLock: false,
            isFav: false,
            clickToOpen: false,
            
        }
    },

    components: {
        ExplorerNavBar,

    },

    props: {
        server: Object,
        path: String,
    },

    inject: ['apptitle'],

    methods: {
        async update() {
            if (this.m__updateLock) return;
            this.m__updateLock = true;
            if (!this.loadingInstance) {
                this.loadingInstance = ElLoading.service({ lock: false, fullscreen: false, target: this.$refs.app?.parentElement });
            }
            // console.log('created loading service in FileExplorer:', this.loadingInstance);
            
            this.listdata = await this.loadList();
            if (('ok' in this.listdata && (!this.listdata.ok)) || this.listdata instanceof Error) {
                // console.log('closed loading service by an error in FileExplorer');
                if (this.loadingInstance) {
                    this.loadingInstance.close();
                    this.loadingInstance = null;
                }
                if (this.listdata instanceof Error)
                    ElMessage.error(`Failed to load data: ${this.listdata}`);
                else
                    ElMessage.error(`Failed to load data: HTTP error ${this.listdata.status}, error text:\n`
                        + await this.listdata.text());
                this.m__updateLock = false;
                return globalThis.navigation?.canGoBack && history.back();
            }

            this.isFav = false;
            let srv_and_path = this.server.addr + '|' + this.path;
            srv_and_path = srv_and_path.replaceAll('\\', '/');
            if (!srv_and_path.endsWith('/')) srv_and_path += '/';
            const favindex = await userdata.get('favlist', srv_and_path);
            if (favindex != null) {
                this.isFav = true;
            }

            const ctoVal = await userdata.get('config', 'explorer.clickToOpen');
            (ctoVal == null) && await userdata.put('config', false, 'explorer.clickToOpen');
            this.clickToOpen = ctoVal === true;
            
            this.objectCount = this.listdata.length || 0;

            let apptitle = this.path.replaceAll('\\', '/');
            const noFullpath = await userdata.get('config', 'explorer.noFullpath');
            if (noFullpath === true) {
                if (apptitle.endsWith('/')) apptitle = apptitle.substring(0, apptitle.length - 1);
                apptitle = apptitle.substring(apptitle.lastIndexOf('/') + 1);
            } else if (noFullpath !== false) {
                await userdata.put('config', true, 'explorer.noFullpath');
            }
            globalThis.appInstance_.instance.apptitle = apptitle;
            this.$nextTick(() => {
                if (this.loadingInstance) {
                    this.loadingInstance.close();
                    this.loadingInstance = null;
                }
                this.m__updateLock = false;
                // console.log('closed loading service in FileExplorer');
                this.$refs.lst?.update();
            });
        },

        async loadList() {
            const forbiddenKeywords = ['d|.', 'd|..'];
            const url = new URL('/files', this.server.addr);
            url.searchParams.append('path', this.path);
            try {
                const resp = await fetch(url, {
                    method: 'post',
                    headers: { 'x-auth-token': this.server.pswd },
                });
                if (!resp.ok) return resp;
                return (await resp.text())
                    .split('\n')
                    .filter(el => el.length > 2 && (!forbiddenKeywords.includes(el)))
                    // .sort((a, b) => (a[0] == 'd' && b[0] == 'f') ? -1 : ((a[0] == 'f' && b[0] == 'd') ? 1 : 0));
                    //此处的排序改为在后端做，(C++那不比js快多了。。)
            }
            catch (error) { return error };
        },

        renderList() {
            const r = [];
            // 缓存循环中用到的数据（性能分析器显示调用了很多很多！次 get）
            const addr = this.server.addr, pswd = this.server.pswd, path = this.path;
            if (!this.listdata || !Array.isArray(this.listdata)) return [];
            for (let i of this.listdata) {
                if (i.length < 3) continue;
                const a = i.split('|');
                const b = [{}, a[1]];
                if (a[0] === 'd') {
                    b[0].html = `<span class="icon is-folder"></span>`;
                    b[0].type = 'd';
                }
                else if (a[0] === 'f') {
                    b[0].html = `<span class="icon is-file"></span>`;
                    b[0].type = 'f';
                }
                else {
                    b[0] = a[0];
                }
                b[0] && (b[0]._srv = addr, b[0]._pswd = pswd, b[0]._path = path);
                r.push(b);
            }
            return r;
        },

        doFilter: antitik(async function () {
            const text = this.filterText;
            if (!text) {
                this.objectCount = this.listdata.length;
                return this.$refs.lst.update();
            }
            const fullTest = (text.startsWith('"') && text.endsWith('"'));
            const fullTestStr = text.substring(Math.min(1, text.length - 1), text.length - 1);
            this.objectCount = await this.$refs.lst.filter(el => {
                if (!el) return false;
                if (Array.isArray(el)) return fullTest ? el[1] === fullTestStr : el[1]?.includes?.(text);
                if (fullTest) return el.substring ? el.substring(2) === fullTestStr : false;
                if (el.includes) return el.includes(text);
                return false;
            });
        }),

        async openFile(blank = false) {
            const selection = this.$refs.lst.selection;
            if (selection.size < 1) {
                return ElMessage.error(tr("ui.string:objectNotSelected"));
            }
            if (selection.size > 5) try {
                await ElMessageBox.confirm(tr('ui.string:confirmMultipleFileOpen')
                    .replace('$1', selection.size), 'Open Files', {
                    confirmButtonText: tr('dialog.ok'),
                    cancelButtonText: tr('dialog.cancel'),
                    type: 'info'
                });
            } catch { return; }

            let item_ = selection.keys(), item, isFirst = true, val;
            let currentPath = String(this.path);
            if (!(currentPath.endsWith("/") || currentPath.endsWith("\\"))) currentPath += "/";
            let __result = null;
            let el_data = this.listdata;
            if (!el_data) {
                return;
            }
            if (this.$refs.lst.getFilter())
                el_data = this.listdata.filter(this.$refs.lst.getFilter());

            while ((item = item_.next()) && !item.done) {
                val = el_data?.[item.value];
                if (!val) continue;
                if (!(val.startsWith('f|') || val.startsWith('d|'))) {
                    continue; // 未知项目
                }
                const isDir = val.startsWith('d|');
                val = val.substring(2);
                const hash = computeHash.call(this, val, currentPath, isDir);
                if (!hash) continue;

                if (isFirst) {
                    isFirst = false;
                    __result = hash;
                } else {
                    window.w_open(hash, '_blank');
                }
            }

            if (__result) {
                blank ?
                    window.w_open(__result, '_blank')?.focus() :
                    location.hash = __result;
            }
        },

        async modifyFav() {
            try {
                let srv_and_path = this.server.addr + '|' + this.path;
                srv_and_path = srv_and_path.replaceAll('\\', '/');
                if (!srv_and_path.endsWith('/')) srv_and_path += '/';
                if (this.isFav) {
                    await userdata.delete('favlist', srv_and_path);
                    ElMessage.success(tr('ui.favlist.delete.success'));
                } else {
                    let name = srv_and_path.substring(0, srv_and_path.length - 1);
                    name = name.substring(name.lastIndexOf('/') + 1);
                    // console.log(name);
                    const obj = {
                        fullpathname: srv_and_path,
                        srv: this.server.addr,
                        pathname: this.path,
                        name: name,
                        type: 'directory',
                    };
                    await userdata.put('favlist', obj);
                    ElMessage.success(tr('ui.favlist.add.success'));
                }
                this.isFav = !this.isFav;
            }
            catch (error) { ElMessage.error(error) };
        },

        customDragData(i) {
            return this.$refs.lst.$data[i];
        },
        customCheckDrag,

        async handleObjectDropping(ev) {
            const dataTransfer = ev.dataTransfer;
            let targetElem;
            for (let i of ev.composedPath()) {
                if (i?.tagName?.toLowerCase() === 'v-list-row' ||
                    i?.tagName?.toLowerCase() === 'v-list-view' ||
                    i?.classList?.contains?.('explorer-nav-pathblock')) {
                    targetElem = i;
                    break;
                }
            }
            if (!targetElem) return;
            let targetdir;
            let target = targetElem.dataset.path || this.$refs.lst.$data?.[targetElem.dataset.n];
            if (targetElem === this.$refs.lst) {
                targetdir = this.path;
            }
            else if (!target) {
                console.warn('[FileExplorer][Warn] handleObjectDropping:', 'targetElem found but target not found');
                return;
            }
            else if (typeof target === 'string') {
                targetdir = target;
            }
            else {
                targetdir = target[0]._path;
                if (!(targetdir?.endsWith?.('/') || targetdir?.endsWith?.('\\'))) targetdir += '/';
                targetdir += target[1];
            }
            let data = dataTransfer.getData('application/x-web-file-explorer-item');
            const dfiles = dataTransfer.files;

            const get = async (file, srv, pswd) => {
                const url = new URL('/isFileOrDirectory', srv);
                url.searchParams.set('name', file);
                const result = await fetch(url, { headers: { 'x-auth-token': pswd } });
                if (!result.ok) throw null;
                const text = await result.text();
                return text;
            }

            try {
                const r1 = await get(targetdir, this.server.addr, this.server.pswd);
                if (r1 !== '-1') {
                    return ElMessage.error(tr((r1 === '0') ? 'ui.fo.error/folderNotFound' : 'ui.fo.error/cantPutFileInFile'));
                }
            } catch {
                return ElMessage.error(tr('ui.fo.error/cantLoadDataFromRemote'));
            }

            let nsa = h('input', { type: 'checkbox' }); // "不再提示"框

            if (dfiles.length) {
                // 文件上传
                if (!targetdir) return;

                let override_box = h('input', { type: 'checkbox' }); // "不再提示"框
                const executer = async () => {
                    if (nsa.el?.checked) {
                        await userdata.put('config', true, 'file.upload.noAsk')
                    }
                    const override = !!(override_box.el?.checked);

                    // const key = String(new Date().getTime()) + String(Math.floor(Math.random() * 1e8));
                    // await userdata.put('uploadCache', dfiles, key);
                    // const arr = location.hash.split('/');
                    // arr.splice(3, Infinity, 'sys/upload/k=' + key);
                    // arr.push(targetdir);
                    // location.hash = arr.join('/');
                    const files = [];

                    for (let i of dfiles) {
                        files.push({
                            server: this.server.addr,
                            pswd: this.server.pswd,
                            path: targetdir,
                            filename: i.name,
                            override: override,
                            blob: new Blob([i]),
                        });
                    }
                    globalThis.appInstance_.addTask({
                        type: 'upload',
                        files: files,
                    });

                    globalThis.appInstance_.instance.transferPanel_isOpen = true;
                };
                if (await userdata.get('config', 'file.upload.noAsk')) {
                    executer();
                } else
                ElMessageBox({
                    title: 'File Operation',
                    message: h('div', null, [
                        h('span', null, tr('ui.fo.confirm/upload').replaceAll('$1', dfiles.length)),
                        h('textarea', { rows: 3, readonly: true, style: 'width:100%;box-sizing:border-box;resize:vertical' }, targetdir),
                        h('label', { style: 'display:block;margin-top:5px' }, [
                            nsa, h('span', tr('doNotAskAgain')),
                        ]),
                        h('label', { style: 'display:block;margin-top:5px' }, [
                            override_box, h('span', tr('ui.file.upload.override')),
                        ]),
                    ]),
                    showCancelButton: true,
                    confirmButtonText: tr('dialog.ok'),
                    cancelButtonText: tr('dialog.cancel'),
                }).then(executer).catch(err => {
                    if (err instanceof DOMException) {
                        ElMessage.error(err.stack);
                } });
                return;
            }

            // 处理内部文件操作
            let lastDropEffect = window.appInstance_.lastDropEffect || this.$refs.lst.lastDropEffect;
            try { data = JSON.parse(data) } catch { return console.warn('Failed to parse application data') };
            // console.log(lastDropEffect, data);
            if ('lastDropEffect' in window.appInstance_) delete window.appInstance_.lastDropEffect;

            const files = [];
            let isCORS = false;
            let corsConfirmed = false;

            for (const i of data) {
                let src, dist = targetdir;
                try {
                    if (!i[0]._path.endsWith('/')) i[0]._path += '/';
                    src = i[0]._path + i[1];
                }
                catch { return console.warn('Failed to resolve application data') };
            
                if (src === dist) return;
                // 去掉过于低效的代码
                /*try {
                    const r2 = await get(src, i[0]._srv, i[0]._pswd);
                    if (r2 === '0') {
                        return ElMessage.error(tr('ui.fo.error/fileNotFound'));
                    }
                }
                catch {
                    return ElMessage.error(tr('ui.fo.error/cantLoadDataFromRemote'));
                }*/

                if (i[0]._srv !== this.server.addr) {
                    isCORS = true;
                    if (!corsConfirmed) try {
                        // 确认跨域文件传输
                        await ElMessageBox({
                            title: tr("ui.fo.confirm/crossOriginFileTransfer"),
                            message: h('div', null, [
                                h('span', { style: 'word-break:break-word' }, tr("ui.fo.confirm/crossOriginFileTransferText")
                                    .replaceAll('$1', i[0]._srv).replaceAll('$2', this.server.addr)),
                            ]),
                            showCancelButton: true,
                            confirmButtonText: tr('dialog.ok'),
                            cancelButtonText: tr('dialog.cancel'),
                        });
                        corsConfirmed = true;
                    } catch { return; }
                }

                files.push(i);
            }
            if (isCORS) lastDropEffect = 'copy';

            let srcText = files.length < 2 ?
                (data[0][0]._path + data[0][1]) :
                tr('ui.fo.confirm/count').replace('$1', files.length);

            const executer = async () => {
                if (nsa.el?.checked) {
                    await userdata.put('config', true, 'noAskBeforeFileOps')
                }
                
                if (isCORS) return ElMessage.error('Cross-Origin Not Supported yet') // TODO
                
                const arr = [];
                for (let i of files) try {
                    const path = i[0]._path + i[1];
                    let dest = targetdir;
                    if (!dest.endsWith('/')) dest += '/';
                    dest += i[1];
                    // console.log(path, ' => ', dest);
                    arr.push({
                        server: this.server.addr, pswd: this.server.pswd,
                        src: path, dest: dest,
                    });
                } catch { }
                globalThis.appInstance_.addTask({
                    type: lastDropEffect,
                    files: arr
                });
                globalThis.appInstance_.instance.transferPanel_isOpen = true;
            };
            if (await userdata.get('config', 'noAskBeforeFileOps')) {
                executer();
            } else
            ElMessageBox({
                title: 'File Operation',
                message: h('div', null, [
                    h('div', { style: 'word-break:break-word' }, tr('ui.fo.confirm/' + lastDropEffect)
                        .replaceAll('$1', srcText).replaceAll('$2', targetdir)),
                    h('label', { style: 'display:block;margin-top:5px' }, [
                        nsa, h('span', tr('doNotAskAgain')),
                    ])
                ]),
                showCancelButton: true,
                confirmButtonText: tr('dialog.ok'),
                cancelButtonText: tr('dialog.cancel'),
            }).then(executer).catch(() => { });
        },

        async deleteSelected(ev) {
            const selection = this.$refs.lst.selection;
            if (selection.size < 1) {
                return ElMessage.error(tr("ui.string:objectNotSelected"));
            }
            try {
                await ElMessageBox.confirm(
                    tr('ui.fo.confirm/delete' + (ev.shiftKey ? 'Forever' : ''))
                    .replace('$1', tr("ui.fo.confirm/count").replace('$1', selection.size)),
                    'Delete File', {
                    confirmButtonText: tr('dialog.ok'),
                    cancelButtonText: tr('dialog.cancel'),
                    type: 'warning'
                });
            } catch { return; }

            const files = new Array;
            let el_data = this.listdata;
            if (!el_data) return;
            if (this.$refs.lst.getFilter())
                el_data = this.listdata.filter(this.$refs.lst.getFilter());
            const p = this.path.endsWith('/') ? this.path : this.path + '/';
            for (const i of selection) {
                files.push({
                    server: this.server.addr,
                    pswd: this.server.pswd,
                    path: p + el_data[i].substring(2) + (el_data[i].substring(0, 2) === 'd|' ? '/' : ''),
                })
            }
            // console.log(files);

            globalThis.appInstance_.addTask({
                type: 'delete',
                files: files,
            });
        },

        async rename() {

            let el_data = this.listdata;
            if (!el_data) return;
            if (this.$refs.lst.getFilter())
                el_data = this.listdata.filter(this.$refs.lst.getFilter());
            const p = this.path.endsWith('/') ? this.path : this.path + '/';
            const file = this.$refs.lst.selection,
                srv = this.server.addr,
                pw = this.server.pswd;
            if (file.size == 0) return;
            else if (file.size === 1) {
                const src = el_data[file.toArray()[0]].substring(2);
                ElMessageBox.prompt(
                    h('div', { style: 'word-break:break-all' },
                        tr('ui.fo.rename').replaceAll('$1', p + src)), 'File Operation', {
                    confirmButtonText: tr('dialog.ok'),
                    cancelButtonText: tr('dialog.cancel'),
                    inputValidator: v => !!v,
                    inputValue: src,
                }).then(name => {
                    if (name.action !== 'confirm') return;
                    const task = {
                        type: 'move',
                        files: [{
                            server: srv, pswd: pw,
                            src: p + src, dest: p + name.value,
                        }]
                    };
                    globalThis.appInstance_.addTask(task, { wait: true });
                }).catch(() => { });
            }
            else if (file.size > 1) {
                globalThis.appInstance_.renameDialog?.rename(file, el_data, p, srv, pw);
            }
        },

        navbar_open(path) {
            location.hash = '#/s/' + btoa(this.server.addr) + '/' + path;
        },


    },

    computed: {
        objectCountStr() {
            return splitNumber(this.objectCount) + ` object${this.objectCount > 1 ? 's' : ''}`;
        },
    },

    mounted() {
        this.update();
        globalThis.appInstance_.explorer = this;

        this.$nextTick(() => {
            LoadCSS(`
            .icon {
                display: inline-block;
                width: 1em;
                height: 1em;
                background-position: center;
                background-repeat: no-repeat;
                background-size: 1em;
                margin-right: 5px;
            }
            .icon.is-file {
                background-image: url(assets/img/shell/file.png);
            }
            .icon.is-folder {
                background-image: url(assets/img/shell/folder.png);
            }
            `, this.$refs.lst.shadowRoot);
        });
    },
    beforeUnmount() {
        delete globalThis.appInstance_.explorer;
        
    },
    
    watch: {
        path() {
            this.$nextTick(() => this.update());
        },
    },

    template: await getHTML(import.meta.url, componentId),

};


export default data;


function splitNumber(num) {
    if (isNaN(num) || Math.abs(num) < 1000) return num;
    return num.toString().replace(/\d+/, function (n) {
        return n.replace(/(\d)(?=(\d{3})+$)/g, a => a + ',');
    });
}


function debounce(fn, delay, thisArg = globalThis) {
    let timeId = null;
    return function () {
        const outerThis = this;
        if (timeId) clearTimeout(timeId);
        timeId = setTimeout(function (args) {
            if (thisArg === globalThis && outerThis !== globalThis)
                return fn.apply(outerThis, args);
            return fn.apply(thisArg, args);
        }, delay, arguments);
        return timeId;
    };
}

function computeHash(item, currentPath, isFolder = false) {
    try { return '#/s/' + btoa(this.server.addr) + '/' + currentPath + encodeURIComponent(item) + (isFolder ? '/' : ''); }
    catch { return null }
};


import { TickManager } from '../VList/TickManager.js';
const tickManager = new TickManager(500);
let cancelNextTick = null;
function antitik(fn) {
    return function () {
        cancelNextTick && cancelNextTick();
        cancelNextTick = tickManager.nextTick(() => fn.apply(this, arguments));
    };
}




