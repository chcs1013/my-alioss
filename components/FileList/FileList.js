import { getHTML } from '@/assets/js/browser_side-compiler.js';
import { ElMessage, ElMessageBox, ElLoading } from 'element-plus';
import { sign_url, sign_header, ISO8601 } from '@/sign.js';
import { RefreshLeft } from 'icons-vue';
import { defineAsyncComponent } from 'vue';
import { uploadFile } from '../upload-core/upload.js';
import { prettyPrintFileSize } from '@/assets/js/fileinfo.js';
import { xml2json } from '../xml2json/xml2json.js';
import { encrypt_data, decrypt_data } from '@/modules/util/aesutil.js';
const ExplorerNavBar = defineAsyncComponent(() => import('../FileExplorer/ExplorerNavBar.js'));


const componentId = '44706256-867e-492f-bd3e-609c11c2dd15';

const data = {
    data() {
        return {
            currentPage: 1,
            pageSize: 20,
            total_files: 0,
            loadingInstance: null,
            showAll: false,
            downloadFolderDialogShows: false,
            currentCommand: '选择操作...',
            userFilter: '',
            filterDialogShows: false,
            changeStorageTypeDialogShows: false,
            bulkSelectDialogShows: false,
            copy_in_progress: false,
            storage_classes: {
                "Standard": "标准存储",
                "IA": "低频访问",
                "Archive": "归档存储",
                "ColdArchive": "冷归档存储",
                "DeepColdArchive": "深度冷归档存储"
            },
        }
    },

    props: {
        path: String,
        username: String,
        usersecret: String,
        oss_name: String,
        bucket: String,
        region: String,
        listdata: Array,
        vcs_enabled: Boolean,
        vcs_status: String,
        vcs_show: Boolean,

    },
    emits: ['update:path', 'update:listdata', 'update:selection', 'update:vcs_enabled', 'update:vcs_status', 'update:vcs_show', 'goPath', 'download'],

    components: {
        RefreshLeft,
        ExplorerNavBar,
    },

    watch: {
        path() {
            this.userFilter = '';  
        },
    },

    computed: {
        fsapiNotSupported() {
            return !(window.showOpenFilePicker && window.showDirectoryPicker)
        },
        filteredListData() {
            if (typeof this.userFilter !== 'string') return this.listdata;
            const uf = this.userFilter.toLowerCase();
            return this.userFilter ? this.listdata.filter(v =>
                ((v.Key && (!v.Key.endsWith('/')) && v.Key.match(/([^\/]+)$/)[1]) || (v.Prefix && v.Prefix.match(/([^\/]+)\/$/)[1]) || '').toLowerCase().includes(uf)) : this.listdata;
        },
        file_list() {
            const arr = this.filteredListData.map((value, index) => {
                if (value.Prefix) return {
                    name: (value.Prefix).match(/([^\/]+)\/$/)[1], fullKey: value.Prefix,
                    size: '-', time: '',
                    type: '文件夹', class: '', dir: true
                };
                if (value.Key.endsWith('/')) return;
                return {
                    name: (value.Key).match(/([^\/]+)$/)[1], size: isNaN(+value.Size) ? '-' : prettyPrintFileSize(+value.Size, false, 3),
                    time: new Date(value.LastModified).toLocaleString(),
                    type: value.Type, class: value.StorageClass,
                    fullKey: value.Key, dir: false,
                    versionid: value.VersionId || null,
                    latest: (value.IsLatest === 'true') || null,
                    isDeleteMarker: value.isDeleteMarker || false,
                    hasChildren: false,
                }
            }).filter(v => !!v).sort((a, b) => {
                if (a.dir === b.dir) return a.name.localeCompare(b.name);
                // if (a.latest) return -1;
                return a.dir ? -1 : 1;
            });

            if (!this.vcs_show) return arr;
            
            const files = new Map();
            for (const i of arr) {
                if (i.dir) {
                    files.set(i.fullKey, [i]);
                    continue;
                }
                if (!files.has(i.fullKey)) files.set(i.fullKey, []);
                files.get(i.fullKey).push(i);
            }
            const arr2 = new Array();
            for (const [key, value] of files) {
                if (value[0].dir) {
                    arr2.push(value[0]);
                    continue;
                }
                let i = 0;
                for (const v of value) {
                    v.name += ' (' + (i++).toString() + ')';
                }
                arr2.push({
                    name: (key).match(/([^\/]+)$/)[1] + ' ',
                    fullKey: key,
                    size: '', time: '', type: '', class: '',
                    hasChildren: true, children: value,
                    count: value.length,
                });
            }
            return arr2;
        },
        vcs_show_: {
            get() { return this.vcs_show },
            set(v) { this.$emit('update:listdata', []); this.$emit('update:vcs_show', v); this.$emit('goPath'); },
        },
    },

    methods: {
        async dynupdate(name, operation = 'ADD|DELETE', data = {}) {
            if (operation === 'DELETE') {
                this.$emit('goPath');
            }
            if (operation === 'ADD') {
                const myArr = Array.from(this.listdata);
                myArr.push(data);
                this.$emit('update:listdata', myArr.sort((a, b) => a.Key.localeCompare(b.Key)));
                return;
            }
        }, 
        async export_file_list_from_selection(vcs = false) {
            const selection_raw = this.$refs.table.getSelectionRows();
            const selection = new Array();
            const { exportContent } = await import('../App/filelistapi.js');
            for (const i of selection_raw) try {
                if (i.hasChildren) continue;
                if (i.dir) {
                    // 获取目录里**所有**内容
                    const tempArr = [];
                    await exportContent(i.fullKey, tempArr, Object.assign(Object.create(this), {
                        bucket_name: this.bucket, region_name: this.region,
                    }), { setDelimiter: false, vcs: (vcs) });
                    if (vcs) selection.push.apply(selection, tempArr.map(v => ({ Key: v.Key, VersionId: v.VersionId })));
                    else selection.push.apply(selection, tempArr.map(v => v.Key));
                }
                else if (vcs) selection.push({ Key: i.fullKey, VersionId: i.versionid });
                else selection.push(i.fullKey);
            } catch (error) {
                throw ElMessageBox.alert('网络请求异常，请重试。' + error, '错误', { type: 'error', confirmButtonText: '好' });
            }
            return selection;
        },
        async operate(type) {
            switch (type) {
                case 'delete': case 'delete_version': try {
                    let errorCount = 0;
                    
                    const deleted = new Set();
                    ElMessage.success('正在处理您的请求。这可能需要一些时间。');
                    const selection = await this.export_file_list_from_selection(type === 'delete_version');
                    if (selection.length === 0) return ElMessage.error('没有选择任何文件或版本');
                    try {
                        await ElMessageBox.confirm(
                            this.vcs_enabled ? (type === 'delete_version' ? `即将彻底删除 ${selection.length} 个版本。删除后将无法恢复这些版本。确认继续？` :
                                `要添加 ${selection.length} 文件的删除标记？`) : `版本控制未启用，即将彻底删除 ${selection.length} 文件。确认继续？`,
                            '删除', { type: 'warning', confirmButtonText: '删除', cancelButtonText: '不删除' })
                    } catch { return }
                    this.loadingInstance = ElLoading.service({ lock: false, fullscreen: false, target: this.$refs.my });
                    
                    const SIZE = 1000;
                    for (let i = 0; i < selection.length; i += SIZE) try {
                        const chunk = selection.slice(i, i + SIZE);
                        const url = new URL('/?delete', this.oss_name);
                        const body_parts = [`<?xml version="1.0" encoding="UTF-8"?>`, `<Delete>`];
                        if (type === 'delete_version')
                            for (const i of chunk) body_parts.push(`<Object><Key>${i.Key}</Key><VersionId>${i.VersionId}</VersionId></Object>`);
                        else for (const i of chunk) body_parts.push(`<Object><Key>${i}</Key></Object>`);
                        body_parts.push('</Delete>');
                        const body = new Blob(body_parts);

                        // 计算 MD5 的二进制数组
                        const md5Hash = CryptoJS.MD5(await body.text()).toString(CryptoJS.enc.Latin1);
                        // 将二进制数组转换为 Base64
                        const contentMD5 = CryptoJS.enc.Base64.stringify(CryptoJS.enc.Latin1.parse(md5Hash));

                        const date = new Date();
                        const myHead = { 'x-oss-content-sha256': 'UNSIGNED-PAYLOAD', 'x-oss-date': ISO8601(date), 'content-md5': contentMD5 };
                        const resp = await fetch(url, {
                            method: 'POST',
                            headers: {
                                Authorization: await sign_header(url, {
                                    access_key_id: this.username, access_key_secret: this.usersecret, date, bucket: this.bucket, region: this.region,
                                    expires: 300, additionalHeadersList: myHead, method: 'POST',
                                }),
                                ...myHead
                            },
                            body,
                        });
                        const json = xml2json(await resp.text());
                        if (Array.isArray(json.Deleted)) for (const i of json.Deleted) {
                            deleted.add(i.Key || i.Prefix);
                        }
                        else if (json.Deleted) deleted.add(json.Deleted.Key);
                        errorCount += (chunk.length - deleted.length);
                    } catch (error) {
                        ElMessageBox.alert('网络请求异常，请重试。' + error, '错误', { type: 'error', confirmButtonText: '好' });
                    }
                    this.dynupdate(deleted, 'DELETE');
                    if (errorCount > 0) ElMessageBox.alert(errorCount + ' 文件删除失败。请检查文件是否存在，或者您是否有权限删除此文件。', '错误', { type: 'error', confirmButtonText: '好' });
                    else ElMessage.success('删除成功');
                    this.loadingInstance.close();
                    this.loadingInstance = null;
                    break;
                } catch (e) {
                    ElMessage.error(e);
                    break;
                }
                
                case 'newfile':
                case 'newdir':
                {
                    const content = type === 'newfile' ? '文件' : '文件夹';
                    ElMessageBox.prompt(`输入${content}名称`, `新建${content}`, {
                        confirmButtonText: `新建${content}`,
                        cancelButtonText: '取消',
                        type: 'info'
                    }).then(v => {
                        v.value && uploadFile({
                            path: (this.path.substring(1) + '/' + v.value + ((type === 'newfile') ? '' : '/')).replace(/\/\//g, '/'),
                            blob: new Blob([]),
                            endpoint: this.oss_name,
                            bucket: this.bucket,
                            region: this.region,
                            username: this.username,
                            usersecret: this.usersecret,
                            type: (type === 'newfile') ? 'text/plain' : null,
                        }).then(() => {
                            ElMessage.success('操作成功完成。');
                            this.$emit('goPath');
                        }).catch(e => ElMessage.error('操作未能成功完成。' + e));
                    }).catch(() => { });
                    break;
                }
                
                case 'dl': {
                    if (this.vcs_show_) return ElMessage.error('历史版本功能尚未完善，暂时无法使用此功能');
                    let path = this.path.replace(/\\/g, '/');
                    if (!path.endsWith('/')) path += '/';
                    const selection_raw = this.$refs.table.getSelectionRows();
                    const selection = new Array();
                    let hasDir = false;
                    for (const i of selection_raw)
                        if (i.dir) { hasDir = true; break }
                        else selection.push(i.fullKey);
                    if (hasDir) {
                        return this.downloadFolderDialogShows = true;
                    }
                    this.$emit('download', selection);
                    break;
                }
                    
                case 'meta': {
                    if (this.vcs_show_) return ElMessage.error('历史版本功能尚未完善，暂时无法使用此功能');
                    const selection = this.$refs.table.getSelectionRows();
                    if (selection.length != 1) return ElMessage.error('此操作只能选择一个文件');
                    if (selection[0].dir) return ElMessage.error('此操作只能应用于文件');
                    const vel = document.createElement('x-virtual-placeholder');
                    const el = CreateDynamicResizableView(vel, '文件元数据: ' + selection[0].name, 720, 300);
                    vel.innerText = '正在加载，请稍候...';
                    try {
                        const url = new URL((encodeURIComponent(selection[0].fullKey).replace(/\%2F/ig, '/')), this.oss_name);
                        const signed_url = await sign_url(url, {
                            access_key_id: this.username,
                            access_key_secret: this.usersecret,
                            expires: 10,
                            bucket: this.bucket,
                            region: this.region,
                            method: 'HEAD',
                        });
                        const head = await fetch(signed_url, {
                            method: 'HEAD'
                        });
                        const div = document.createElement('div');
                        div.style.whiteSpace = 'pre';
                        let str = '';
                        head.headers.forEach((value, key) => {
                            str += `${key}: ${value}\n`;
                        });
                        div.innerText = str;
                        vel.replaceWith(div);
                    } catch (e) {
                        vel.innerText = `加载失败惹... ${e}`;
                    }
                    break;
                }
                    
                case 'preview': {
                    if (this.vcs_show_) return ElMessage.error('历史版本功能尚未完善，暂时无法使用此功能');
                    const selection = this.$refs.table.getSelectionRows();
                    if (selection.length != 1) return ElMessage.error('此操作只能选择一个文件');
                    if (selection[0].dir) return ElMessage.error('此操作只能应用于文件');
                    if (!globalThis.appInstance_.PreviewHelper) return ElMessage.error('预览组件尚未完成加载，请稍等片刻...');

                    const vel = document.createElement('x-virtual-placeholder');
                    const el = CreateDynamicResizableView(vel, '预览: ' + selection[0].name, 1300, 740);
                    vel.innerText = '正在加载，请稍候...';
                    
                    try {
                        const url = new URL((encodeURIComponent(selection[0].fullKey).replace(/\%2F/ig, '/')), this.oss_name);
                        const sign_params = { access_key_id: this.username, access_key_secret: this.usersecret, expires: 600, bucket: this.bucket, region: this.region };
                        const head = await fetch(await sign_url(url, { method: 'HEAD', ...sign_params }), { method: 'HEAD' });

                        // 确认el是否还在DOM中，如果用户已经关闭弹出窗口则不进行后续请求
                        if (!el.isConnected) break;

                        const frame = document.createElement('oss-object-preview-form');
                        vel.replaceWith(frame);
                        el.setAttribute('style', '--padding: 0;' + (el.getAttribute('style') || ''));

                        await frame.init(async (time = 0) => {
                            if (time === 0) sign_params.expires = 600;
                            else sign_params.expires = time;
                            return await sign_url(url, sign_params);
                        }, head.headers.get('Content-Type') || 'application/octet-stream', selection[0].name);

                        // 如果是视频，那么去掉标题栏
                        if ((head.headers.get('Content-Type') || '').startsWith('video/')) {
                            el.querySelector('widget-caption').remove();
                            const form = el.querySelector('oss-object-preview-form');

                            // 自定义控件
                            const { BindMove } = await import('@/modules/util/BindMove.js');
                            const moving_area = document.createElement('div');
                            moving_area.className = 'x-oss-video-preview-v2-video-moving-area';
                            el.prepend(moving_area);
                            BindMove(moving_area, el);

                            const ctls = document.createElement('div');
                            ctls.className = 'x-oss-video-preview-v2-video-ctls';
                            const title = document.createElement('span');
                            title.className = 'x-title';
                            title.append(document.createTextNode(selection[0].name));
                            const close = document.createElement('button');
                            close.className = 'el-button';
                            close.append(document.createTextNode('x'));
                            ctls.append(title, close);
                            el.prepend(ctls);

                            // 添加消息处理程序
                            let intervalId;

                            const cleanup = () => {
                                el.remove();
                                clearInterval(intervalId);
                            };
                            close.addEventListener('click', cleanup);

                            let lastMouseMoveTime = Date.now();
                            const showControls = () => {
                                ctls.classList.add('active');
                                lastMouseMoveTime = Date.now();
                            };
                            const hideControls = () => {
                                if (Date.now() - lastMouseMoveTime >= 1900 && ctls.classList.contains('active')) {
                                    ctls.classList.remove('active');
                                }
                            };
                            el.addEventListener('pointermove', showControls, true);
                            intervalId = setInterval(hideControls, 500);
                            showControls();
                        }
                    } catch (e) {
                        vel.innerText = `加载失败惹... ${e}`;
                    }
                    break;
                }
                    
                case 'refresh':
                    this.$emit('goPath');
                    break;
                
                case 'filter':
                    this.filterDialogShows = true;
                    break;
                
                case 'setvcs':
                    this.setvcs();
                    break;
                
                case 'togglevcs':
                    this.vcs_show_ = !this.vcs_show_;
                    break;
                
                case 'chstoragetype':
                    this.changeStorageTypeDialogShows = true;
                    break;
                
                case 'bulkSelectDialogShows':
                    this.bulkSelectDialogShows = true;
                    break;
                
                case 'copy':
                    try {
                        const arr = await this.export_file_list_from_selection();
                        if (!arr.length) return ElMessage.error('没有选中文件');
                        this.copy_in_progress = true;
                        await new Promise(requestAnimationFrame); await new Promise(requestAnimationFrame);
                        const text = JSON.stringify({
                            bucket: this.bucket,
                            region: this.region,
                            endpoint: this.oss_name,
                            action: 'copy',
                            objects: arr,
                            path: this.path,
                        });
                        const rand_bytes = new Uint8Array(64);
                        crypto.getRandomValues(rand_bytes);
                        const password = CryptoJS.enc.Hex.stringify(CryptoJS.lib.WordArray.create(rand_bytes));
                        await navigator.clipboard.writeText(JSON.stringify({
                            data: encrypt_data(text, password),
                            app: 'my-alioss',
                            uuid: 'e8d9fcfc-b3ee-4e38-903a-d540b860b738',
                            version: 2025042001,
                            password
                        }));
                        ElMessage.success(`已复制 ${arr.length} 个 Object`);
                    } catch (e) {
                        ElMessage.error('复制失败: ' + e)
                    } finally {
                        this.copy_in_progress = false;
                    }
                    break;
                
                case 'paste':
                    try {
                        await this.do_paste(await navigator.clipboard.readText());
                    } catch (e) {
                        ElMessage.error('无法粘贴: ' + e);
                    }
                    break;

                default:
                    ElMessage.error('暂不支持操作 ' + type);
                    break;
            }
        },
        goPath($event) {
            if (!$event.endsWith('/')) $event += '/';
            if ($event.startsWith('//')) $event = $event.substring(1);
            this.$emit('goPath', $event);
        },
        async getContentLinkOnly() {
            this.downloadFolderDialogShows = false;
            ElMessage.success('正在处理您的请求。这可能需要一些时间。');
            const selection_raw = this.$refs.table.getSelectionRows();
            const selection = new Array();
            const { exportContent } = await import('../App/filelistapi.js');
            for (const i of selection_raw)
                if (i.dir) {
                    // 获取目录里**所有**内容
                    const tempArr = [];
                    await exportContent(i.fullKey, tempArr, Object.assign(Object.create(this), {
                        bucket_name: this.bucket, region_name: this.region,
                    }), { setDelimiter: false });
                    selection.push.apply(selection, tempArr.filter(v => (!v.Key.endsWith('/'))).map(v => v.Key));
                }
                else selection.push(i.fullKey);
            this.$emit('download', selection);
        },
        getSaveToDir() {
            // TODO
            ElMessage.error('暂未实现，请尝试其他方式')
        },
        onSelectionChange(s) {
            this.$emit('update:selection', s);
        },
        async setvcs() {
            let r;
            try {
                r = await ElMessageBox.confirm('此 Bucket 的版本控制状态是？', '设置版本控制状态', {
                    type: 'info', confirmButtonText: '已启用', cancelButtonText: '未启用', distinguishCancelAndClose: !0,
                });
            } catch (err) { 
                r = err;
            }
            if (r === 'close') return;
            r = (r === 'confirm');
            this.$emit('update:vcs_enabled', r);
            this.$emit('update:vcs_status', r ? 'enabled' : 'disabled');
        },
        loadChildren(row, treeNode, resolve) {
            resolve([]);
        },
        async handleChangeStorageType(ev) {
            const el = ev.target;
            if (!el || !el.dataset) return;
            const act = el.dataset.act;
            if (!act) return;

            // 调用 CopyObject
            let errorCount = 0;

            if (this.vcs_show) return ElMessage.error('不支持VCS');

            ElMessage.success('正在处理您的请求。这可能需要一些时间。');
            const selection = await this.export_file_list_from_selection();
            if (selection.length === 0) return ElMessage.error('没有选择任何文件或版本');
            try {
                await ElMessageBox.confirm(
                    `即将修改 ${selection.length} 文件的存储类型为 ${act}。请注意可能的数据解冻/转移费用。确认继续？`,
                    '更改文件存储类型', { type: 'warning', confirmButtonText: act, cancelButtonText: '保持原样' })
            } catch { return }

            this.loadingInstance = ElLoading.service({ lock: false, fullscreen: false, target: this.$refs.my });

            for (const i of selection) try {
                const name = i;
                await this.copy_object(name, name, this.bucket, undefined, true, act);
            } catch (error) {
                ElMessage.error(i + ' 失败: ' + error);
            }
            if (errorCount > 0) ElMessageBox.alert(errorCount + ' 文件操作失败。请检查文件是否存在，或者您是否有权限操作此文件。', '错误', { type: 'error', confirmButtonText: '好' });
            else ElMessage.success('操作成功！');
            this.loadingInstance.close();
            this.loadingInstance = null;
            this.$emit('goPath')
        },
        handle_paste_event(ev) {
            const active = document.activeElement;
            if (active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA' || active.isContentEditable)) {
                return;
            }
            ev.preventDefault();

            const data = (ev.clipboardData || window.clipboardData).getData("text");
            queueMicrotask(() => this.do_paste(data).catch((e) => ElMessage.error('无法粘贴: ' + e)));
        },
        async copy_object(target, source, source_bucket, signal, override = true, s_class = null) {
            const url = new URL((encodeURIComponent(target).replace(/\%2F/ig, '/')), this.oss_name);
            const headers = {};
            Reflect.set(headers, 'x-oss-copy-source', encodeURI(`/${source_bucket}/${source}`).replace(/\+/g, '%2B'));
            if (!override) Reflect.set(headers, 'x-oss-forbid-overwrite', 'true');
            if (s_class) Reflect.set(headers, 'x-oss-storage-class', s_class);
            const signed = await sign_url(url, {
                access_key_id: this.username,
                access_key_secret: this.usersecret,
                expires: 600,
                bucket: this.bucket,
                region: this.region,
                method: 'PUT',
                additionalHeadersList: headers
            });
            const resp = await fetch(signed, {
                method: 'PUT',
                signal,
                headers,
            });
            if (!resp.ok) throw `HTTP ${resp.status} ${resp.statusText}`;
            return (await resp.text()) || true;
        },
        async do_paste(clipdata) {
            if (clipdata[0] !== '{') throw '剪贴板中不是使用本程序复制的数据';
            const json = JSON.parse(clipdata);
            if (!json || json.app !== 'my-alioss' || json.uuid !== 'e8d9fcfc-b3ee-4e38-903a-d540b860b738') throw '剪贴板中不是使用本程序复制的数据';
            if (json.version > 2025042001) throw '应用程序版本不兼容，请使用相同版本重新复制';
            if (json.version < 2025042001) throw '暂时不支持此操作，请使用相同版本重新复制';
            const obj = JSON.parse(decrypt_data(json.data, json.password));
            if (obj.action !== 'copy') throw '数据目的不正确';
            if (obj.region !== this.region) throw '不允许跨区域复制';

            const allow_override = await new Promise((r, j) => {
                ElMessageBox.confirm('如果遇到重复文件，是否允许直接覆盖？', '粘贴文件', {
                    type: 'warning',
                    confirmButtonText: '直接覆盖',
                    cancelButtonText: '不可以覆盖',
                    distinguishCancelAndClose: true,
                }).then(() => r(true)).catch((e) => (e === 'close') ? j('取消操作') : r(false));
            });

            const div = document.createElement('div');
            const el = CreateDynamicResizableView(div, '文件复制进行中', 360, 240);
            el.style.overflow = 'hidden';
            div.style.overflow = 'hidden';
            div.style.display = 'flex';
            div.style.flexDirection = 'column';
            div.style.width = div.style.height = '100%';
            div.style.boxSizing = 'border-box';
            el.querySelector('button').remove();

            const { innerWidth, innerHeight } = window;
            const { offsetWidth, offsetHeight } = el;
            el.style.left = `${(innerWidth - offsetWidth) / 2}px`;
            el.style.top = `${(innerHeight - offsetHeight) / 2}px`;

            try {
                const _1 = document.createElement('div');
                _1.setAttribute('style', 'text-align:center;margin-bottom:0.5em;font-size:large;font-weight:bold;');
                _1.append('正在复制 ' + obj.objects.length + ' 个文件');
                div.append(_1);
                const btn = document.createElement('button');
                btn.className = 'el-button';
                btn.append('取消');
                let Cancelled = false, signal = null;
                btn.onclick = () => {
                    Cancelled = true;
                    el.remove();
                    signal.abort();
                }

                const current = document.createElement('div');
                current.style.wordBreak = 'break-all';
                current.style.whiteSpace = 'normal';
                current.style.marginBottom = '0.5em';
                current.style.overflow = 'auto';
                current.style.flex = '1';
                div.append(current, btn);

                let success = 0, count = 0, failures = [];
                for (const i of obj.objects) {
                    if (Cancelled) throw '用户已取消';
                    if (i.endsWith('/')) continue;
                    signal = new AbortController();
                    current.innerText = '';
                    const _2 = document.createElement('div');
                    _2.setAttribute('style', 'margin-top: 0.5em;');
                    _2.append(`正在复制: ${i}\n`);
                    current.append(`当前进度 ${count}/${obj.objects.length} (${Math.floor(count * 1e6 / obj.objects.length) / 1e4}%)`, _2);
                    const relative_path = i.substring(obj.path.length - 1);
                    try {
                        ++count;
                        if (await this.copy_object(this.path + relative_path, i, obj.bucket, signal.signal, allow_override)) ++success;
                    } catch (error) {
                        failures.push(`${i} 复制失败: ${error}`);
                    }
                }
                if (Cancelled) throw '用户已取消';
                
                current.innerText = `复制完成，共处理 ${count} 个 Object，${success} 成功，${count - success} 失败。${failures.length ? '\n\n失败详情: \n' : ''}${failures.join('\n')}`;
                btn.innerText = ('完成');
                btn.onclick = () => el.remove();
                this.$emit('goPath');

                // 如果文件<10个，则快速完成
                if (obj.objects.length < 10) {
                    el.remove();
                    ElMessage[success === count ? 'success' : (success === 0 ? 'error' : 'warning')](`复制完成，共处理 ${count} 个 Object，${success} 成功，${count - success} 失败。`);
                }
            } catch (e) {
                if (typeof e !== 'string') console.error('[copy]', e);
                el.remove();
                throw e;
            }
        },
        do_select(act) {
            switch (act) {
                case 'prev': {
                    let ln = 0, shift = 0;
                    for (const i of this.file_list) {
                        if (i.children) {
                            const count = i.children.length - 1;
                            shift += 1;
                            for (let i = 0; i < count; ++i) {
                                this.$refs.table.toggleRowSelection(i + ln + shift, true);
                            }
                        }
                        ++ln;
                    }
                    break;
                }
                
                default: ;
            }
        },
    },

    mounted() {
        window.addEventListener('paste', this.handle_paste_event);
    },

    unmounted() {
        window.removeEventListener('paste', this.handle_paste_event);
        
    },

    template: await getHTML(import.meta.url, componentId),

};


export default data;

