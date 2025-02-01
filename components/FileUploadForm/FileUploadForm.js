import { getHTML } from '@/assets/js/browser_side-compiler.js';
import { ElMessage, ElLoading, ElMessageBox } from 'element-plus';
import { Delete, RefreshLeft } from 'icons-vue';
import { prettyPrintFileSize } from '@/assets/js/fileinfo.js';


const componentId = 'd529d06e-d70d-4d9a-8eb6-19ad0300e01e';

const data = {
    data() {
        return {
            uploadForm: {},
            selectedFiles: new Map(),
            selectedHandles: new Map(),
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

    emits: ['update:active_panel', 'update:has_enabled_full_mime_types', 'update:is_loading'],

    components: {
        Delete, RefreshLeft,
    },

    methods: {
        update() {
            this.selectedFiles.clear();

            try { this.uploadForm.remotePath = decodeURIComponent(this.uploadForm.remotePath) } catch { }
        },

        updateFileList() {
            for (const i of this.$refs.localFile.files) {
                this.selectedFiles.set(i.name, i);
            }
            this.$refs.localFile.value = null;
        },

        removeItem(opt) {
            if (opt === true) {
                return this.selectedFiles.clear();
            }
            this.selectedFiles.delete(opt);
        },

        removeHandle(opt) {
            if (opt === true) {
                return this.selectedHandles.clear();
            }
            this.selectedHandles.delete(opt);
        },

        confirmCancel() {
            this.$emit('update:active_panel', 'file');
            this.$emit('update:is_loading', false);
        },

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
                    this.selectedHandles.set(i.name, i);
                }
            }).catch(() => { });
        },
        async traverseDirectory(directoryHandle, currentPath = '') {
            let fileCount = 0; // 用于统计当前目录中处理的文件数量

            for await (const entry of directoryHandle.values()) {
                const entryPath = currentPath ? `${currentPath}/${entry.name}` : entry.name;

                if (entry.kind === 'file') {
                    // console.log('文件路径:', entryPath);
                    // 上传文件到OSS

                    entry.fullpath = entryPath;
                    this.selectedHandles.set(entryPath, entry);

                    fileCount++; // 文件数量加1
                } else if (entry.kind === 'directory') {
                    // console.log('目录路径:', entryPath);
                    // 递归遍历子目录，并获取子目录中处理的文件数量
                    const subDirFileCount = await this.traverseDirectory(entry, entryPath);
                    fileCount += subDirFileCount; // 累加子目录的文件数量

                    // 如果子目录是空的（subDirFileCount === 0），手动处理空目录
                    if (subDirFileCount === 0) {
                        // console.log('空目录:', entryPath);
                        this.selectedHandles.set(entryPath + '/', { is_empty_directory: true, fullpath: entryPath });
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

                for (const i of proms) {
                    const handle = await i;
                    if (handle.kind === 'directory') {
                        // Scan all files in the directory, then wrap it in a new object
                        await this.traverseDirectory(handle, handle.name);
                        continue;
                    }
                    this.selectedHandles.set(handle.name, handle);
                }
            } finally {
                this.loadingInstance.close();
                this.loadingInstance = null;
            }
        },
        nu_selectDirectory() {
            window.showDirectoryPicker().then(async handle => {
                this.loadingInstance = ElLoading.service({ lock: false, fullscreen: false, target: this.$el.parentElement });
                try {
                    await this.traverseDirectory(handle, handle.name);
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
                            key: (std_path + (i.fullpath || i.name)),
                            handle: i,
                            is_empty_directory: i.is_empty_directory,
                        });
                    }
                } else {
                    for (let i of this.selectedFiles.values()) {
                        tasks.push({
                            key: (std_path + i.name),
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
        selectedFilesInfo() {
            const r = [];
            for (const i of this.selectedFiles.values()) {
                r.push(i.name);
            }
            return r;
        },
        selectedHandlesInfo() {
            const r = [];
            for (const i of this.selectedHandles.values()) {
                if (i.is_empty_directory) r.push(i.fullpath + '/');
                else r.push(i.fullpath || i.name);
            }
            return r;
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
            if (i.handle) {
                const file = await i.handle.getFile();
                this.progress.total_bytes = file.size;
                const result = await uploadFile({
                    path: i.key,
                    blob: file,
                    cb: (chunk_id, _1, _2, pos, size) => {
                        if (chunk_id == 0) {
                            this.progress.status = '上传出错. ' + _1 + ' ' + _2;
                        } else {
                            this.progress.status = `正在上传 chunk ${chunk_id} (共 ${_1} 个 chunk)`;
                            this.progress.current = +truncate_number(_2 * 100, 4);
                            this.progress.current_bytes = prettyPrintFileSize(pos);
                            this.progress.total_bytes = prettyPrintFileSize(size);
                        }
                    },
                    endpoint: this.oss_name,
                    bucket: this.bucket_name,
                    region: this.region_name,
                    username: this.username,
                    usersecret: this.usersecret,
                });
                // console.log('上传成功:', i.key, result);
                this.progress.status = `${i.key} 上传成功`;
                if (!result) throw result;
            } else {
                this.progress.total_bytes = i.blob.size;
                const result = await uploadFile({
                    path: i.key,
                    blob: i.blob,
                    cb: (chunk_id, _1, _2, pos, size) => {
                        if (chunk_id == 0) {
                            this.progress.status = '上传出错. ' + _1 + ' ' + _2;
                        } else {
                            this.progress.status = `正在上传 chunk ${chunk_id} (共 ${_1} 个 chunk)`;
                            this.progress.current = +truncate_number(_2 * 100, 4);
                            this.progress.current_bytes = prettyPrintFileSize(pos);
                            this.progress.total_bytes = prettyPrintFileSize(size);
                        }
                    },
                    endpoint: this.oss_name,
                    bucket: this.bucket_name,
                    region: this.region_name,
                    username: this.username,
                    usersecret: this.usersecret,
                });
                // console.log('上传成功:', i.key, result);
                this.progress.status = `${i.key} 上传成功`;
                if (!result) throw result;
            }
            totalUploaded++;
        } catch (error) {
            if (error !== symbol1) {
                totalFailed++;
                // console.error('上传失败:', i.key, error);
                ElMessage.error(`文件 ${i.key} 上传失败: ${error}`);
            }
        }

        // 更新UI
        this.progress.current_files = totalUploaded;
        this.progress.current = 100;
        this.progress.total = +truncate_number(totalUploaded / totalTasks * 100, 4);
        this.progress.status = '上传已完成。';
    }
    return {
        total: totalTasks,
        success: totalUploaded,
        failure: totalFailed,
    };
}

