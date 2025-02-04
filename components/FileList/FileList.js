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
            const basePath = this.path.substring(1); // 为了符合 Linux 的文件管理习惯，我们采用以“/”开头的路径模式，在实际对接API时需处理掉
            return this.listdata.map((value, index) => {
                const data = {
                    name: value.Key,
                    size: prettyPrintFileSize(+value.Size),
                    time: new Date(value.LastModified).toLocaleString(),
                    type: value.Type,
                    class: value.StorageClass,
                    is_directory: value.Key.includes('/'),
                }
                if (data.is_directory) {
                    /* TODO:
                    value.Key 是 文件在OSS中的完整路径，例如 data/user/0/path/to/file.txt
                    basePath 是用户的“当前路径”，类似于`pwd`，也可以是一个“prefix”
                    例如，文件 data/1.txt 可以被以下 basePath 匹配：
                    da
                    dat
                    data/
                    但不能被以下 basePath 匹配：
                    dat/
                    我们的要求是：
                    我们只显示“当前目录”下的**直属**文件。例如，
                    当前目录：data/
                    文件有：[data/1.txt, data/2.txt, data/user1/3.txt, data/sub/path/to/file4.txt]
                    显示内容：
                    【文件夹】user1
                    【文件夹】sub
                    【文件】1.txt
                    【文件】2.txt
                    可能需要修改相关数据结构，例如可能需要更改`map`的使用。
                    */
                }
                return data
            });
        },
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
                    const selection = this.$refs.table.getSelectionRows();
                    // console.log(selection);
                    try { await ElMessageBox.confirm(`要删除 ${selection.length} 文件？`, '删除', { type: 'warning', confirmButtonText: '删除', cancelButtonText: '不删除' }) } catch { return }
                    this.loadingInstance = ElLoading.service({ lock: false, fullscreen: false, target: this.$refs.my });

                    const deleted = new Set();
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
                            path: (this.path + '/' + v.value + '/').replace(/\/\//g, '/'),
                            blob: new Blob([]),
                            endpoint: this.oss_name,
                            bucket: this.bucket,
                            region: this.region,
                            username: this.username,
                            usersecret: this.usersecret,
                        }).then(() => {
                            const date = new Date().getTime();
                            ElMessage.success('操作成功完成。');
                            this.dynupdate(v.value + '/', 'ADD', {
                                Key: v.value + '/',
                                Size: 0, LastModified: date,
                                Type: 'Normal', Class: ''
                            });
                        }).catch(e => ElMessage.error('操作未能成功完成。' + e));
                    }).catch(() => { });
                    break;
                
                case 'dl': {
                    let path = this.path.replace(/\\/g, '/');
                    if (!path.endsWith('/')) path += '/';
                    const selection = this.$refs.table.getSelectionRows();
                    this.$emit('download', selection.map(i => i.name));
                    break;
                }
                    
                case 'meta': {
                    const selection = this.$refs.table.getSelectionRows();
                    if (selection.length != 1) return ElMessage.error('此操作只能选择一个文件');
                    const url = new URL((encodeURIComponent(selection[0].name).replace(/\%2F/ig, '/')), this.oss_name);
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
        toggleRowSelection(row) {
            this.$refs.table.toggleRowSelection(row);
        },
        onCurrentChange() {
            
        },

    },

    template: await getHTML(import.meta.url, componentId),

};


export default data;

