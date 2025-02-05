import { getHTML } from '@/assets/js/browser_side-compiler.js';
import { ElMessage, ElMessageBox, ElLoading } from 'element-plus';
import { sign_url, sign_header, ISO8601 } from '@/sign.js';
import { RefreshLeft } from 'icons-vue';
import { defineAsyncComponent } from 'vue';
import { uploadFile } from '../upload-core/upload.js';
import { prettyPrintFileSize } from '@/assets/js/fileinfo.js';
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

    computed: {
        file_list() {
            if (this.showAll) return this.listdata.map((value, index) => {
                const data = {
                    name: value.Key,
                    size: (+value.Size),
                    time: new Date(value.LastModified).toLocaleString(),
                    type: value.Type,
                    class: value.StorageClass,
                    fullKey: value.Key,
                } 
                return data
            });
            const basePath = this.path === '/' ? '' : this.path.substring(1); // 处理根目录
            const currentDepth = basePath.split('/').filter(p => p).length; // 当前路径层级

            // 用于收集所有可能的文件/文件夹
            const items = new Map(); // 用Map实现自动去重和快速查找

            this.listdata.forEach(item => {
                // 只处理属于当前路径下的对象
                if (!item.Key.startsWith(basePath)) return;

                // 获取相对路径（去掉basePath前缀）
                const relPath = item.Key.slice(basePath.length);

                // 分割路径层级（过滤空段）
                const segments = relPath.split('/').filter(p => p !== '');

                // 排除当前路径自身（当basePath是完整路径时）
                if (relPath === '' && item.Size === 0) return;

                // CASE 1: 显式目录（以/结尾的0字节对象）
                if (item.Key.endsWith('/') && item.Size === 0) {
                    const dirName = segments[0] + '/';
                    if (!items.has(dirName)) {
                        items.set(dirName, {
                            name: segments[0],
                            isExplicit: true,
                            type: item.Type,
                            class: '',
                            dir: true,
                            size: '',
                            time: new Date(item.LastModified).toLocaleString(),
                            fullKey: item.Key
                        });
                    }
                    return;
                }

                // CASE 2: 处理隐式目录和文件
                if (segments.length === 0) return; // 排除空路径

                // 当前路径下的直属文件
                if (segments.length === 1 && !item.Key.endsWith('/')) {
                    const fileName = segments[0];
                    if (!items.has(fileName)) {
                        items.set(fileName, {
                            name: fileName,
                            type: item.Type,
                            class: item.StorageClass,
                            dir: false,
                            size: (+item.Size),
                            time: new Date(item.LastModified).toLocaleString(),
                            fullKey: item.Key
                        });
                    }
                    return;
                }

                // 处理隐式目录（根据深层对象推断出的目录）
                const firstSegment = segments[0];
                const implicitDirKey = `${basePath}${firstSegment}/`;
                const dirName = `${firstSegment}/`;

                if (!items.has(dirName)) {
                    items.set(dirName, {
                        name: firstSegment,
                        isExplicit: false,
                        type: item.Type,
                        class: '',
                        dir: true,
                        size: '',
                        time: this.findImplicitDirTime(implicitDirKey), // 需要实现时间推断方法
                        fullKey: implicitDirKey
                    });
                }
            });

            // 转换为数组并排序（目录在前，文件在后）
            return Array.from(items.values()).sort((a, b) => {
                if (a.dir === b.dir) return a.name.localeCompare(b.name);
                return a.dir ? -1 : 1;
            });
        }
    },

    methods: {
        async dynupdate(name, operation = 'ADD|DELETE', data = {}) {
            if (operation === 'DELETE') {
                if (name instanceof Set) {
                    this.$emit('update:listdata', this.listdata.filter(value => !name.has(value.Key)));
                    return;
                }
                this.$emit('update:listdata', this.listdata.filter(value => value.Key !== name));
                return;
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
                    const selection_raw = this.$refs.table.getSelectionRows();
                    
                    const deleted = new Set();
                    const selection = new Set();
                    for (const i of selection_raw) {
                        if (i.dir) {
                            const content = this.getFolderContents(i.fullKey);
                            for (const j of content) selection.add(j);
                        } else {
                            selection.add({ name: i.fullKey });
                        }
                    }

                    try { await ElMessageBox.confirm(`要删除 ${selection.size} 文件？`, '删除', { type: 'warning', confirmButtonText: '删除', cancelButtonText: '不删除' }) } catch { return }
                    this.loadingInstance = ElLoading.service({ lock: false, fullscreen: false, target: this.$refs.my });
                    
                    for (const I of selection) {
                        const i = (encodeURIComponent(I.name).replace(/\%2F/ig, '/'));
                        if (!this.usersecret) {
                            // 未登录，尝试匿名操作
                            const url = new URL(i, this.oss_name);
                            try {
                                const resp = await fetch(url, { method: 'DELETE' });
                                if (!resp.ok) throw -1;
                                deleted.add(I.name);
                            }
                            catch {
                                ElMessageBox.alert('此 bucket 不允许匿名写入。请登录后重试。', '错误', { type: 'error', confirmButtonText: '好' });
                                break;
                            }
                            return;
                        }
                        // 登录状态
                        const url = new URL(i, this.oss_name);
                        try {
                            const resp = await fetch(await sign_url(url, {
                                access_key_id: this.username,
                                access_key_secret: this.usersecret,
                                expires: 30,
                                bucket: this.bucket,
                                region: this.region,
                                method: 'DELETE',
                            }), {
                                method: 'DELETE',
                            });
                            if (!resp.ok) throw -1;
                            deleted.add(I.name);
                        }
                        catch {
                            ++errorCount;
                            continue;
                        }
                    }
                    this.dynupdate(deleted, 'DELETE');
                    if (errorCount) ElMessageBox.alert(errorCount + ' 文件删除失败。请检查文件是否存在，或者您是否有权限删除此文件。', '错误', { type: 'error', confirmButtonText: '好' });
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
                    for (const i of selection_raw) {
                        if (i.dir) {
                            const content = this.getFolderContents(i.fullKey);
                            for (const j of content) selection.push(j.name);
                        } else {
                            selection.push(i.fullKey);
                        }
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

                default:
                    break;
            }
        },
        goPath($event) {
            if (!$event.endsWith('/')) {
                return ElMessage.warning('当前模式下不支持非斜杠结尾的文件筛选器模式');
            }
            if ($event.startsWith('//')) $event = $event.substring(1);
            this.$emit('goPath', $event);
        },
        toggleRowSelection(row) {
            this.$refs.table.toggleRowSelection(row);
        },
        onCurrentChange() {
            
        },
        // 查找隐式目录的最近修改时间（取目录下最新文件的修改时间）
        findImplicitDirTime(dirPrefix) {
            return this.listdata
                .filter(item => item.Key.startsWith(dirPrefix) && !item.Key.endsWith('/'))
                .reduce((latest, item) => {
                    const mtime = new Date(item.LastModified);
                    return mtime > latest ? mtime : latest;
                }, new Date(0))
                .toLocaleString();
        },
        // 新增方法：获取指定文件夹下的所有文件（包含嵌套文件）
        getFolderContents(folderKey) {
            // 确保文件夹路径以斜杠结尾
            const normalizedKey = folderKey.endsWith('/') ? folderKey : `${folderKey}/`

            return this.listdata.filter(item => {
                // 匹配当前文件夹下的所有对象（包含子目录）
                const isInFolder = item.Key.startsWith(normalizedKey)

                // 排除文件夹标记对象（显式目录）
                const isFolderMarker = item.Key.endsWith('/') && item.Size === 0

                // // 排除其他目录的文件夹标记
                // const isSubFolderMarker = item.Key.slice(normalizedKey.length).includes('/')

                return isInFolder && !isFolderMarker// && !isSubFolderMarker
            }).map(value => ({ name: value.Key }));
        },

    },

    template: await getHTML(import.meta.url, componentId),

};


export default data;

