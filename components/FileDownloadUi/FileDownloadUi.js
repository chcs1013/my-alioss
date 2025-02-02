import { getHTML } from '@/assets/js/browser_side-compiler.js';
import { ElMessage, ElMessageBox, ElLoading } from 'element-plus';
import { sign_url } from '@/sign.js';


const componentId = 'b3cbea65-60bf-44be-b01c-952885e6e0f2';

const data = {
    data() {
        return {
            files_to_download: [],
            hasInit: false,
            dltype: '1',
            linktime: '',
            linktime_prefilled: '',
            linktime_prefill: {
                '1分钟': 60, '5分钟': 300, '10分钟': 600, '1小时': 3600, '1天': 86400, '7天': 604800
            },
            linkstart: '1',
            loadingInstance: null,
        }
    },

    props: {
        modelValue: Array,
        username: String,
        usersecret: String,
        oss_name: String,
        bucket: String,
        region: String,
    },
    emits: ['update:modelValue'],

    components: {

    },

    computed: {
        linktime_prefill_options() {
            return Reflect.ownKeys(this.linktime_prefill);  
        },
    },

    methods: {
        async getlink() {
            if (!this.linktime && this.dltype === '1') return ElMessage.error('必须输入链接有效期');
            this.loadingInstance = ElLoading.service({ lock: false, fullscreen: false, target: this.$refs.my });
            try {
                for (const i of this.files_to_download) {
                    const url = new URL((encodeURIComponent(i.name).replace(/\%2F/ig, '/')), this.oss_name);
                    if (this.dltype === '2') {
                        i.link = url.href;
                        i.type = '永久链接';
                        continue;
                    }
                    const signed_url = await sign_url(url, {
                        access_key_id: this.username,
                        access_key_secret: this.usersecret,
                        expires: +this.linktime,
                        bucket: this.bucket,
                        region: this.region,
                    });
                    i.link = signed_url;
                    i.type = '临时链接';
                    i.time_data = new Date(new Date().getTime() + 1000 * (+this.linktime))
                    i.time = i.time_data.toLocaleString();
                }
                this.hasInit = true;
            }
            catch (e) {
                ElMessage.error('无法获取链接。遇到了错误：' + e);
            }
            finally {
                this.loadingInstance.close();
                this.loadingInstance = null;
            }
        },
        checkItemAvailability: (function () {
            let _ = 0;
            return function (item) {
                if (!item.time_data) return true;
                const now = new Date().getTime();
                const deltat = now - _;
                _ = now;
                if (deltat < 1000) return true;
                if (now > new Date(item.time_data).getTime()) {
                    ElMessage.error('链接已过期，请重新生成');
                    return false;
                }
                return true;
            }
        })(),
        async copyItem(i) {
            if (!this.checkItemAvailability(this.files_to_download[i])) return;
            const value = this.files_to_download[i].link;
            try {
                await navigator.clipboard.writeText(value);
                ElMessage.success('已复制');
            } catch {
                ElMessageBox.prompt('你的浏览器无法复制，请手动复制。', '复制', {
                    inputValue: value,
                    confirmButtonText: '好的',
                    cancelButtonText: '关闭'
                }).catch(() => { });
            }
        },
        openItem(i) {
            if (!this.checkItemAvailability(this.files_to_download[i])) return;
            // console.log(i);
            window.open(this.files_to_download[i].link, '_blank');
        },
    },

    mounted() {
        this.files_to_download = this.modelValue.map(i => ({
            name: i,
            type: 'unknown',
            time: '',
            link: '',
        }));
        this.$emit('update:modelValue', []);
    },

    watch: {
        linktime_prefilled(newValue) {
            this.linktime = this.linktime_prefill[newValue];
        },
    },

    template: await getHTML(import.meta.url, componentId),

};


export default data;

