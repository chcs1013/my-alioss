import { getHTML } from '@/assets/js/browser_side-compiler.js';
import { ElMessage, ElMessageBox } from 'element-plus';
import { CircleClose } from 'icons-vue';
import { sign_url } from '@/sign.js';

const componentId = 'f138678f-3278-4dfa-84b3-83dab8a24366';

const data = {
    data() {
        return {
            page: '',
            sign_url_form: {
                method: 'V4',
                url: this.oss_name,
                bucket: this.bucket,
                region: this.region,
                expiry: 300,
                http_method: 'GET',
                ak: 'default',
                username: '', usersecret: '',
                is_entering_password: false,
                custom_header: [],
            },
            signed_url: '',
        }
    },

    props: {
        username: String,
        usersecret: String,
        oss_name: String,
        bucket: String,
        region: String,
    },

    components: {
        CircleClose,
    },

    methods: {
        async run_sign() {
            if (this.sign_url_form.method === 'V1') return ElMessage.error('暂时不支持 V1 签名');
            try {
                const { url, bucket, region, expiry, ak, username, usersecret, http_method } = this.sign_url_form;
                let akid, aks;
                if (ak === 'default') {
                    akid = this.username; aks = this.usersecret;
                }
                else if (ak === 'custom') {
                    akid = username; aks = usersecret;
                } else {
                    return ElMessage.error('AK 类型无效。')
                }
                const ahl = {};
                for (const i of this.sign_url_form.custom_header) {
                    if (i[0] && i[1]) ahl[i[0]] = i[1];
                }
                const signedUrl = await sign_url(url, {
                    access_key_id: akid,
                    access_key_secret: aks,
                    expires: expiry,
                    bucket,
                    region,
                    method: http_method,
                    additionalHeadersList: ahl,
                });
                this.signed_url = signedUrl;
                ElMessage.success('签名成功!');

                this.page = 'sign_done'
            } catch (error) {
                ElMessage.error('签名失败! ' + error.message);
            }
        },
        async sign_openCreditInput() {
            try {
                document.querySelector('#myApp nav').requestPointerLock();
                ElMessage.warning('即将进入 SafeEdit');
                try { await ElMessageBox.alert('即将进入 SafeEdit, 按 Enter 继续。', 'SafeEdit Component', {
                    confirmButtonText: 'SafeEdit',
                    type: 'success',
                    distinguishCancelAndClose: true,
                }) } catch (action) { if (action === 'close') { document.exitPointerLock(); return } }
            } catch {
                try { await ElMessageBox.confirm('SafeEdit 在此计算机不可用，即将进入 InsecureEdit 。确认继续？', 'SafeEdit 失败', {
                    confirmButtonText: 'InsecureEdit',
                    cancelButtonText: "Don't Edit",
                    type: 'error'
                }) } catch { document.exitPointerLock(); return }
            }
            this.sign_url_form.is_entering_password = true;
            this.$nextTick(() => this.$nextTick(() => this.$refs.sign_username_input.focus()));
            ElMessage.success('SafeEdit');
        },
        sign_checkCredit() {
            if (this.sign_url_form.username && this.sign_url_form.usersecret)
                this.sign_url_form.is_entering_password = false;
            document.exitPointerLock();
        },
        addCustomHeader() {
            this.sign_url_form.custom_header.push(['', '']);
        },
        removeCustomHeader(index) {
            this.sign_url_form.custom_header.splice(index, 1);
        },
        async copySignedUrl() {
            try {
                await navigator.clipboard.writeText(this.signed_url);
                ElMessage.success('复制成功!');
            }
            catch (error) {
                ElMessage.error('复制失败! ' + error);
            }
        },
    },

    template: await getHTML(import.meta.url, componentId),

};


export default data;

