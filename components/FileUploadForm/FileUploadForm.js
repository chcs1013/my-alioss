import { getHTML } from '@/assets/js/browser_side-compiler.js';
import { ElMessage, ElLoading, ElMessageBox } from 'element-plus';
import { Delete, RefreshLeft } from 'icons-vue';
import { prettyPrintFileSize } from '@/assets/js/fileinfo.js';
import { defineAsyncComponent } from 'vue';

// const TextEdit = defineAsyncComponent(() => import('../TextEdit/TextEdit.js'));
import TextEdit from '../TextEdit/TextEdit.js';

const componentId = 'd529d06e-d70d-4d9a-8eb6-19ad0300e01e';

const data = {
    data() {
        return {
            uploadForm: {},
            selectedInternal_IK: 0, // internal key
            // 以下两个Map的key不再具有实际意义
            selectedFiles: new Map(),
            selectedHandles: new Map(),
            selectedInternal_fname2id: new Map(),
            selectedInfo: [],
            // isDragging: false,
            isDropping: false,
            useNewUploader: true,
            loadingInstance: null,
            isDone: false,
            progress: {
                total: 0, current: 0,
                filename: '', status: '',
                total_files: 0, current_files: 0,
                total_bytes: 0, current_bytes: 0,
                timeStart: 0, timeCost: 0,
                done_total: 0, done_success: 0, done_failure: 0,
            },
        }
    },

    props: {
        path: { type: String, default: '' },
        active_panel: String,
        has_enabled_full_mime_types: Boolean,
        is_loading: Boolean,
        username: String,
        usersecret: String,
        oss_name: String,
        bucket_name: String,
        region_name: String,
    },

    emits: ['update:active_panel', 'update:has_enabled_full_mime_types', 'update:is_loading', 'goPath'],

    components: {
        Delete, RefreshLeft,
        TextEdit,
    },

    methods: {
        confirmCancel() {
            this.$emit('update:active_panel', 'file');
            this.$emit('update:is_loading', false);
            this.$emit('goPath'); // 刷新列表
        },

        addFileFromInput() {
            if (this.selectedInternal_fname2id.has(i.name)) {
                this.removeApi(this.selectedInternal_fname2id.get(i.name), i.name);
            }
            for (const i of this.$refs.localFile.files) {
                const genkey = ++this.selectedInternal_IK;
                this.selectedInternal_fname2id.set(i.name, genkey);
                this.selectedFiles.set(genkey, i);
            }
            this.$refs.localFile.value = null;
            queueMicrotask(() => this.updateInfo());
        },

        removeApi(opt, itemName) {
            queueMicrotask(() => this.updateInfo());
            if (opt === true) {
                this.selectedInternal_fname2id.clear();
                return this.selected.clear();
            }
            this.selectedInternal_fname2id.delete(itemName);
            this.selected.delete(opt);
        },
        removeItem(opt, itemName) { console.error('[FileUploadForm]', 'deprecated') },   // 过会再删，防止莫名其妙bug
        removeHandle(opt, itemName) { console.error('[FileUploadForm]', 'deprecated') }, // 过会再删，防止莫名其妙bug

        async get_enabled_full_mime_types() {
            this.$emit('update:is_loading', true);

            try {
                globalThis.mime_db = await ((await fetch('./assets/data/mime-db.json')).json());
                this.$emit('update:has_enabled_full_mime_types', true);
            } catch {
                ElMessage.error('网络错误');
            } finally {
                this.$emit('update:is_loading', false);
            }
        },

        nu_click() {
            window.showOpenFilePicker({
                multiple: true,
            }).then(arr => {
                for (const i of arr) {
                    if (this.selectedInternal_fname2id.has(i.name)) {
                        this.removeApi(this.selectedInternal_fname2id.get(i.name), i.name);
                    }
                    const genkey = ++this.selectedInternal_IK;
                    this.selectedInternal_fname2id.set(i.name, genkey);
                    this.selectedHandles.set(genkey, i);
                }
                queueMicrotask(() => this.updateInfo());
            }).catch(() => { });
        },
        async traverseDirectory(directoryHandle, currentPath = '', handles) {
            let fileCount = 0; // 用于统计当前目录中处理的文件数量

            for await (const entry of directoryHandle.values()) {
                const entryPath = currentPath ? `${currentPath}/${entry.name}` : entry.name;

                if (entry.kind === 'file') {
                    // console.log('文件路径:', entryPath);
                    // 上传文件到OSS

                    entry.fullpath = entryPath;
                    handles.set(entryPath, entry);

                    fileCount++; // 文件数量加1
                } else if (entry.kind === 'directory') {
                    // console.log('目录路径:', entryPath);
                    // 递归遍历子目录，并获取子目录中处理的文件数量
                    const subDirFileCount = await this.traverseDirectory(entry, entryPath, handles);
                    fileCount += subDirFileCount; // 累加子目录的文件数量

                    // 如果子目录是空的（subDirFileCount === 0），手动处理空目录
                    if (subDirFileCount === 0) {
                        // console.log('空目录:', entryPath);
                        handles.set(entryPath + '/', { is_empty_directory: true, fullpath: entryPath });
                    }
                    fileCount++;
                }
            }

            return fileCount; // 返回当前目录中处理的文件数量
        },
        async nu_drop(ev) {
            this.isDropping = false;
            if (this.useNewUploader == false || this.isLoading || this.isDone) return;
            if (!this.checkIfDragIsAllowed(ev)) return;
            ev.preventDefault();
            const dt = ev.dataTransfer;
            const proms = [];
            
            this.loadingInstance = ElLoading.service({ lock: false, fullscreen: false, target: this.$el.parentElement });
            try {
                for (const item of dt.items) {
                    if (item.kind !== 'file') continue;
                    proms.push(item.getAsFileSystemHandle());
                }
                // await Promise.all(proms);

                // 重要性能优化
                const handles = new Map();

                for (const i of proms) {
                    const handle = await i;
                    if (handle.kind === 'directory') {
                        // Scan all files in the directory, then wrap it in a new object
                        await this.traverseDirectory(handle, handle.name, handles);
                        continue;
                    }
                    handles.set(handle.name, handle);
                }
                // this.selectedHandles = handles;
                for (const [key, value] of handles) {
                    if (this.selectedInternal_fname2id.has(value.name)) {
                        this.removeApi(this.selectedInternal_fname2id.get(value.name), value.name);
                    }
                    const genkey = ++this.selectedInternal_IK;
                    this.selectedInternal_fname2id.set(key, genkey);
                    this.selectedHandles.set(genkey, value);
                }
                queueMicrotask(() => this.updateInfo());
            } finally {
                this.loadingInstance.close();
                this.loadingInstance = null;
            }
        },
        nu_selectDirectory() {
            window.showDirectoryPicker().then(async handle => {
                this.loadingInstance = ElLoading.service({ lock: false, fullscreen: false, target: this.$el.parentElement });
                try {
                    const handles = new Map();
                    await this.traverseDirectory(handle, handle.name, handles);
                    for (const [key, value] of handles) {
                        if (this.selectedInternal_fname2id.has(value.name)) {
                            this.removeApi(this.selectedInternal_fname2id.get(value.name), value.name);
                        }
                        const genkey = ++this.selectedInternal_IK;
                        this.selectedInternal_fname2id.set(key, genkey);
                        this.selectedHandles.set(genkey, value);
                    }
                    queueMicrotask(() => this.updateInfo());
                } finally {
                    this.loadingInstance.close();
                    this.loadingInstance = null;
                }
            }).catch(() => { });
        },
        checkIfDragIsAllowed(ev) {
            const types = ev.dataTransfer.types;
            const checkResult = (() => {
                const typesarr = [
                    'application/octet-stream',
                ];
                for (const i of types) {
                    if (typesarr.includes(i)) return true;
                    if (i === 'Files') return { dropEffect: 'copy' };
                }
            })();
            if (!checkResult) return;
            ev.preventDefault();

            let dropEffect = "none";
            if (0 && checkResult.dropEffect) dropEffect = checkResult.dropEffect;
            else if (ev.shiftKey) dropEffect = "move";
            else if (ev.ctrlKey) dropEffect = "copy";
            else if (ev.altKey) dropEffect = "link";
            else dropEffect = "move";
            ev.dataTransfer.dropEffect = dropEffect;
            return true;
        },
        updateInfo() {
            this.selectedInfo.length = 0;
            for (const [key, value] of (this.useNewUploader ? this.selectedHandles : this.selectedFiles).entries()) {
                this.selectedInfo.push({
                    id: key,
                    name: value.user_id || (value.is_empty_directory ?
                        (value.fullpath + '/') : (value.fullpath || value.name)),
                });
            }
        },
        updateItemName(id, newValue) {
            // 需要先检查目标文件名是否已经存在
            if (this.selectedInternal_fname2id.has(newValue)) {
                ElMessage.info('目标文件名已添加，正在进行替换。');
                // 清理资源
                this['remove' + (this.useNewUploader ? 'Handle' : 'Item')](this.selectedInternal_fname2id.get(newValue), newValue);
            }
            const value = this.selected.get(id);
            // 可以释放旧的文件名
            this.selectedInternal_fname2id.delete(value.user_id || value.name);
            this.selectedInternal_fname2id.set(newValue, id);
            value.user_id = newValue;
            this.selected.set(id, value);

            queueMicrotask(() => this.updateInfo());
        },

        async doNewUploadV2() {
            this.$emit('update:is_loading', true);
            await new Promise(r => this.$nextTick(r));
            
            try {
                const tasks = [];
                let std_path = this.uploadForm.remotePath;
                std_path = std_path.replace(/\\/g, '/');
                std_path = std_path.endsWith('/') ? std_path : std_path + '/';

                this.progress.timeStart = new Date().getTime();
                
                if (this.useNewUploader) {
                    for (let i of this.selectedHandles.values()) {
                        tasks.push({
                            key: (std_path + (i.user_id || i.fullpath || i.name).replace(/\\/g, '/')),
                            handle: i,
                            is_empty_directory: i.is_empty_directory,
                        });
                    }
                } else {
                    for (let i of this.selectedFiles.values()) {
                        tasks.push({
                            key: (std_path + (i.user_id || i.name).replace(/\\/g, '/')),
                            blob: new Blob([i]),
                        });
                    }
                }

                const result = await CoreUploadLogicV4.call(this, tasks);
                this.isDone = true;
                this.progress.done_total = result.total;
                this.progress.done_success = result.success;
                this.progress.done_failure = result.failure;
                this.progress.timeCost = new Date().getTime() - this.progress.timeStart;
            }
            catch (error) {
                console.error('[upload]', 'unexpected:', error);
                ElMessageBox.alert(error, '意外的文件上传错误', { type: 'error', confirmButtonText: '确定' }).catch(() => { });
            }
            finally {
                this.$emit('update:is_loading', false);
            }
        },
    },

    computed: {
        selected() {
            void(this.selectedHandles); void(this.selectedFiles);
            return this.useNewUploader ? this.selectedHandles : this.selectedFiles;
        },
        fsapiNotSupported() {
            return !(window.showOpenFilePicker && window.showDirectoryPicker)
        },
        isLoading() {
            return this.is_loading;
        },
        isDragging: {
            get() { return this.isDropping },
            set(value) { this.isDropping = value; return true; }
        },
    },

    mounted() {
        this.$nextTick(() => this.uploadForm.remotePath = this.path);
        this.$nextTick(() => ((this.fsapiNotSupported) && (this.useNewUploader = false)));
    },

    watch: {

    },

    template: await getHTML(import.meta.url, componentId),

};


export default data;




import { uploadFile, truncate_number } from '../upload-core/upload.js';
export async function CoreUploadLogicV4(tasks) {
    // console.log(tasks);
    const totalTasks = tasks.length;
    let totalUploaded = 0;
    let totalFailed = 0;
    this.progress.total_files = totalTasks; this.progress.current_files = 0;
    const symbol1 = Symbol('symbol1');
    const cb = (chunk_id, _1, _2, pos, size) => {
        if (chunk_id == 0) {
            this.progress.status = '上传出错。 ' + _1 + ' ' + _2;
        } else {
            this.progress.status = (chunk_id > _1) ? `正在合并上传的文件` : `正在上传 chunk ${chunk_id} (共 ${_1} 个 chunk)`;
            this.progress.current = +truncate_number(_2 * 100, 4);
            this.progress.current_bytes = prettyPrintFileSize(pos);
            this.progress.total_bytes = prettyPrintFileSize(size);
            // 修正总进度：当前文件进度 _2(0~1) 直接累加
            this.progress.total = +truncate_number((totalUploaded - totalFailed + ((_2))) / totalTasks * 100, 4);
        }
    };
    for (const i of tasks) {
        try {
            this.progress.filename = i.key;
            this.progress.current_bytes = this.progress.total_bytes = 0;
            this.progress.status = '正在开始上传...';
            if (i.is_empty_directory) {
                // console.log('空目录:', i.fullpath);
                await uploadFile({
                    path: i.key + '/',
                    blob: new Blob([]),
                    endpoint: this.oss_name,
                    bucket: this.bucket_name,
                    region: this.region_name,
                    username: this.username,
                    usersecret: this.usersecret,
                });
                throw symbol1;
            }

            let blob;
            if (i.handle) {
                blob = await i.handle.getFile();
                this.progress.total_bytes = blob.size;
            } else {
                blob = i.blob;
                this.progress.total_bytes = i.blob.size;
            }
            const result = await uploadFile({
                path: i.key,
                blob, cb,
                endpoint: this.oss_name,
                bucket: this.bucket_name,
                region: this.region_name,
                username: this.username,
                usersecret: this.usersecret,
            });
            this.progress.status = `${i.key} 上传成功`;
            if (!result) throw result;
        } catch (error) {
            if (error !== symbol1) {
                totalFailed++;
                // console.error('上传失败:', i.key, error);
                ElMessage.error(`文件 ${i.key} 上传失败: ${error}`);
            }
        }
        totalUploaded++;

        // 更新UI
        this.progress.current_files = totalUploaded;
        this.progress.current = 100;
        this.progress.total = +truncate_number((totalUploaded - totalFailed) / totalTasks * 100, 4);
        this.progress.status = '上传已完成。';
    }
    this.progress.total = 100;
    return {
        total: totalTasks,
        success: totalUploaded - totalFailed,
        failure: totalFailed,
    };
}

