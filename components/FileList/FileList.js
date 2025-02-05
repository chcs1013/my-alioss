import { getHTML } from '@/assets/js/browser_side-compiler.js';
import { ElMessage, ElMessageBox, ElLoading } from 'element-plus';
import { sign_url, sign_header, ISO8601 } from '@/sign.js';
import { RefreshLeft } from 'icons-vue';
import { defineAsyncComponent } from 'vue';
import { uploadFile } from '../upload-core/upload.js';
import { prettyPrintFileSize } from '@/assets/js/fileinfo.js';
import { xml2json } from '../xml2json/xml2json.js';
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

    },
    emits: ['update:path', 'update:listdata', 'goPath', 'download'],

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
            if (this.showAll) return this.filteredListData.map((value, index) => {
                const data = {
                    name: value.Key, size: (+value.Size), time: new Date(value.LastModified).toLocaleString(), type: value.Type, class: value.StorageClass, fullKey: value.Key,
                } 
                return data
            });
            
            return this.filteredListData.map((value, index) => {
                if (value.Prefix) return {
                    name: (value.Prefix).match(/([^\/]+)\/$/)[1], fullKey: value.Prefix,
                    size: '-', time: '',
                    type: '文件夹', class: '', dir: true
                };
                if (value.Key.endsWith('/')) return;
                return {
                    name: (value.Key).match(/([^\/]+)$/)[1], size: (+value.Size),
                    time: new Date(value.LastModified).toLocaleString(),
                    type: value.Type, class: value.StorageClass,
                    fullKey: value.Key, dir: false
                }
            }).filter(v => !!v).sort((a, b) => {
                if (a.dir === b.dir) return a.name.localeCompare(b.name);
                return a.dir ? -1 : 1;
            });
        }
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
        async operate(type) {
            switch (type) {
                case 'delete': {
                    let errorCount = 0;
                    
                    const deleted = new Set();
                    ElMessage.success('正在处理您的请求。这可能需要一些时间。');
                    const selection_raw = this.$refs.table.getSelectionRows();
                    const selection = new Array();
                    const path = this.path;
                    const { exportContent } = await import('../App/filelistapi.js');
                    for (const i of selection_raw) try {
                        if (i.dir) {
                            // 获取目录里**所有**内容
                            const tempArr = [];
                            await exportContent(i.fullKey, tempArr, Object.assign(Object.create(this), {
                                bucket_name: this.bucket, region_name: this.region,
                            }), { setDelimiter: false });
                            selection.push.apply(selection, tempArr.map(v => v.Key));
                        }
                        else selection.push(i.fullKey);
                    } catch (error) {
                        return ElMessageBox.alert('网络请求异常，请重试。' + error, '错误', { type: 'error', confirmButtonText: '好' });
                    }
                    try { await ElMessageBox.confirm(`要删除 ${selection.length} 文件？`, '删除', { type: 'warning', confirmButtonText: '删除', cancelButtonText: '不删除' }) } catch { return }
                    this.loadingInstance = ElLoading.service({ lock: false, fullscreen: false, target: this.$refs.my });
                    
                    const SIZE = 1000;
                    for (let i = 0; i < selection.length; i += SIZE) try {
                        const chunk = selection.slice(i, i + SIZE);
                        const url = new URL('/?delete', this.oss_name);
                        const body_parts = [`<?xml version="1.0" encoding="UTF-8"?>`, `<Delete>`];
                        for (const i of chunk) body_parts.push(`<Object><Key>${i}</Key></Object>`);
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
                }
                
                case 'newdir':
                    ElMessageBox.prompt('输入文件夹名称', '新建文件夹', {
                        confirmButtonText: '新建文件夹',
                        cancelButtonText: '取消',
                        type: 'info'
                    }).then(v => {
                        v.value && uploadFile({
                            path: (this.path.substring(1) + '/' + v.value + '/').replace(/\/\//g, '/'),
                            blob: new Blob([]),
                            endpoint: this.oss_name,
                            bucket: this.bucket,
                            region: this.region,
                            username: this.username,
                            usersecret: this.usersecret,
                        }).then(() => {
                            ElMessage.success('操作成功完成。');
                            this.$emit('goPath');
                        }).catch(e => ElMessage.error('操作未能成功完成。' + e));
                    }).catch(() => { });
                    break;
                
                case 'dl': {
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
                    const selection = this.$refs.table.getSelectionRows();
                    if (selection.length != 1) return ElMessage.error('此操作只能选择一个文件');
                    if (selection[0].dir) return ElMessage.error('此操作只能应用于文件');
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
                    CreateDynamicResizableView(div, '文件元数据: ' + selection[0].name, 720, 300);
                    break;
                }
                    
                case 'preview': {
                    const selection = this.$refs.table.getSelectionRows();
                    if (selection.length != 1) return ElMessage.error('此操作只能选择一个文件');
                    if (selection[0].dir) return ElMessage.error('此操作只能应用于文件');
                    const url = new URL((encodeURIComponent(selection[0].fullKey).replace(/\%2F/ig, '/')), this.oss_name);
                    const sign_params = { access_key_id: this.username, access_key_secret: this.usersecret, expires: 3600, bucket: this.bucket, region: this.region };
                    const signed_url = await sign_url(url, sign_params);
                    const head = await fetch(await sign_url(url, { method: 'HEAD', ...sign_params }), { method: 'HEAD' });
                    const previewLink = new URL('./preview.html', location.href);
                    const meta = new URL('/', previewLink);
                    const ctype = head.headers.get('content-type').split('/');
                    meta.searchParams.set('type', ctype[0]);
                    meta.searchParams.set('ctype', ctype.join('/'));
                    meta.searchParams.set('url', btoa(signed_url));
                    previewLink.hash = '#/' + meta.search;
                    const frame = document.createElement('iframe');
                    if ('allow' in HTMLIFrameElement.prototype) frame.allow = 'autoplay *; fullscreen *';
                    else frame.allowFullscreen = true; // for compiability
                    // to preview PDFs, sandbox is not allowed to be set
                    // frame.sandbox = 'allow-forms allow-scripts allow-modals allow-downloads allow-orientation-lock';
                    frame.src = previewLink.href;
                    frame.setAttribute('style', 'width: 100%; height: 100%; overflow: hidden; border: 0; box-sizing: border-box; display: flex; flex-direction: column;');
                    const el = CreateDynamicResizableView(frame, '预览: ' + selection[0].name, 1280, 720);
                    el.setAttribute('style', '--padding: 0;' + (el.getAttribute('style') || ''));
                    break;
                }
                    
                case 'refresh':
                    this.$emit('goPath');
                    break;
                
                case 'filter':
                    this.filterDialogShows = true;
                    break;

                default:
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
                    selection.push.apply(selection, tempArr.map(v => v.Key));
                }
                else selection.push(i.fullKey);
            this.$emit('download', selection);
        },
        getSaveToDir() {
            ElMessage.error('暂未实现，请尝试其他方式')
        },
    },

    template: await getHTML(import.meta.url, componentId),

};


export default data;

