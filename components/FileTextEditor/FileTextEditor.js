import { getHTML } from '@/assets/js/browser_side-compiler.js';
import { sign_url } from '@/sign.js';
import { uploadFile } from '../upload-core/upload.js';
import { ElMessage } from 'element-plus';


const componentId = 'e119282f-4d19-4954-940e-b70eb6469d69';

const data = {
    data() {
        return {
            file_type: '',
        }
    },

    computed: {
        current_file() {
            return (this.selection.length === 1) ?
                (this.selection[0] && this.selection[0].fullKey) : null;  
        },
    },

    props: {
        selection: Array,
        username: String,
        usersecret: String,
        oss_name: String,
        bucket: String,
        region: String,
    },

    emits: ['update:active_panel'],

    components: {

    },

    methods: {
        async savefile(save = true) {
            if (save) try {
                await uploadFile({
                    path: (this.current_file).replace(/\/\//g, '/'),
                    blob: new Blob([this.$refs.editor.value]),
                    endpoint: this.oss_name,
                    bucket: this.bucket,
                    region: this.region,
                    username: this.username,
                    usersecret: this.usersecret,
                    type: this.file_type,
                });
                ElMessage.success('操作成功完成。');
            } catch (error) {
                ElMessage.error(`文件保存失败。\n${error}`);
            }
            else this.$emit('update:active_panel', 'file');
        },
    },

    mounted() {
        this.$nextTick(async () => {
            if (!this.current_file) return;
            if (this.selection[0].dir) return this.$refs.editor.value = '无法编辑文件夹';
            if (this.selection[0].size > 1048576) return this.$refs.editor.value = '文件过大，无法编辑';
            this.$refs.editor.value = '正在加载文件...';
            try {
                const resp = await fetch(await sign_url(new URL((encodeURIComponent(this.current_file).replace(/\%2F/ig, '/')), this.oss_name), {
                    access_key_id: this.username,
                    access_key_secret: this.usersecret,
                    expires: 60,
                    bucket: this.bucket,
                    region: this.region,
                }));
                if (!resp.ok) throw `HTTP Error ${resp.status} : ${resp.statusText}\n\n${await resp.text()}`;
                this.file_type = resp.headers.get('content-type');
                if (!this.file_type.startsWith('text/')) return this.$refs.editor.value = '非文本文件，无法编辑';
                this.$refs.editor.value = await resp.text();
                this.$refs.editor.editor.addAction({
                    id: 'saveFile',
                    label: '保存文件',
                    keybindings: [
                        monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS
                    ],
                    contextMenuGroupId: 'navigation',
                    contextMenuOrder: 0.5,
                    run: () => {
                        this.savefile(true);
                    }
                });
            } catch (error) {
                this.$refs.editor.value = `文件 ${this.current_file} 加载失败。\n\n${error}\n\n${error && error.stack}`;
            }
        });
    },

    template: await getHTML(import.meta.url, componentId),

};


export default data;


import '@/modules/monaco-editor/loadmono.js';

