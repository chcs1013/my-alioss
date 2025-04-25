import { getHTML } from '@/assets/js/browser_side-compiler.js';


const componentId = '156cf8f9-1cd0-45fd-a3ea-f67529524236';

const data = {
    data() {
        return {
            settings: {
                disallowOnlinePreview: false,
                disallowOnlineOfficeFilePreview: false,
                disallowTextPreview: false,
                disallowPdfPreview: false,
                disallowMediaPreview: false,
                disallowImagePreview: false,
                disallowVideoPreview: false,
                disallowAudioPreview: false,
            }
        }
    },

    components: {

    },

    methods: {
        setState(suffix, value) {
            for (const i in this.settings) {
                if (!i.endsWith(suffix)) continue;
                this.settings[i] = value;
            }
        }
    },

    watch: {
        settings: {
            deep: true,
            handler(newVal) {
                for (const key in newVal) {
                    u.set(key[0].toUpperCase() + key.slice(1), newVal[key]);
                }
            }
        },
    },

    mounted() {
        // 初始化设置项
        Object.keys(this.settings).forEach(key => {
            const settingKey = key[0].toUpperCase() + key.slice(1);
            this.settings[key] = (u.get(settingKey) == 'true');
        });
    },

    template: await getHTML(import.meta.url, componentId),

};


export default data;

