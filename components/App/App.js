import { getHTML } from '@/assets/js/browser_side-compiler.js';
import { ElMessage, ElMessageBox, ElLoading } from 'element-plus';
import { xml2json } from '../xml2json/xml2json.js';
import { Close, Fold } from 'icons-vue';
import { defineAsyncComponent } from 'vue';
import { sign_header, ISO8601 } from '@/sign.js';



const FileList = defineAsyncComponent(() => import('../FileList/FileList.js'));
const FileUploadForm = defineAsyncComponent(() => import('../FileUploadForm/FileUploadForm.js'));
const FileDownloadUi = defineAsyncComponent(() => import('../FileDownloadUi/FileDownloadUi.js'));
const FileTextEditor = defineAsyncComponent(() => import('../FileTextEditor/FileTextEditor.js'));
const TheTools = defineAsyncComponent(() => import('../TheTools/TheTools.js'));
const Settings = defineAsyncComponent(() => import('../Settings/Settings.js'));



const componentId = '27a30f0a-bb4c-44b3-ad24-db910fe7e054';

const data = {
    data() {
        return {
            username: '',
            usersecret: '',
            oss_name: '',
            bucket_name: '',
            region_name: '',
            default_endpoint: 'https://oss-cn-hangzhou.aliyuncs.com',
            logon_data: {
                access_key_id: '', access_key_secret: '', remember: true,
                remember_endpoint: true,
            },
            remember_endpoint_bucket_associations: {
                enabled: true,
            },
            user_endpoint2name: {},
            oss_history: [],
            showAppTopMenu: false,
            isConnected: false, isLoading: false,
            // buckets: [],
            listdata: [],
            loadingInstance: null,
            path: '/',
            vcs_enabled: false,
            vcs_status: null,
            bucket_name_loader_PromiseObject: { a: null, b: null, c: null, d: null, e: 0, f: '' },
            active_panel: 'file',
            loadCopyRightFrame: false,
            files_to_download: [],
            has_enabled_full_mime_types: true,
            appVersion: '正在获取...',
            appLoadTime: 0,
            appTabs: [
                { text: '文件', tab: 'file' },
                { text: '上传', tab: 'upload' }, { text: '下载', tab: 'download' },
                { text: '编辑', tab: 'edit' },
                { text: '工具', tab: 'tools' }, { text: '设置', tab: 'set' }, { text: '关于', tab: 'about' }
            ],
            fileSelection: [],
        }
    },

    components: {
        Fold, Close,
        FileList,
        FileUploadForm,
        FileDownloadUi,
        FileTextEditor,
        TheTools,
        Settings,
    },

    computed: {
        
    },

    methods: {
        async access() {
            if (this.isConnected) {
                if (this.isLoading) {
                    ElMessage.error('此时不能断开连接。');
                    return;
                }
                // Execute all cleanup here when disconnect.
                this.isConnected = false;
                this.listdata.length = 0;
                this.bucket_name = '';
                this.active_panel = 'file';
                this.path = '/';
                this.vcs_enabled = false;
                this.vcs_status = null;
                return;
            }
            if (!this.oss_name.startsWith('https://')) this.oss_name = 'https://' + this.oss_name;
            try {
                new URL(this.oss_name);
            } catch {
                ElMessage.error('无效的 URL。请填写正确的 OSS Endpoint。');
                return;
            }
            this.isConnected = true;
            if (this.logon_data.remember_endpoint) {
                u.set('Endpoint', this.oss_name);
                if (!this.oss_history.includes(this.oss_name)) {
                    this.oss_history.push(this.oss_name);
                    this.save_oss_history();
                }
            }

            this.isLoading = true;
            this.update()
                .catch(e => ElMessageBox.alert('无法连接到 OSS。\n' + e, '错误', { type: 'error', confirmButtonText: '好' }))
                .finally(() => this.isLoading = false);
        },
        async update() {
            if (this.m__updateLock) return;
            this.m__updateLock = true;
            let llid = 0;
            if (!this.loadingInstance) llid = setTimeout(() => {
                this.loadingInstance = ElLoading.service({ lock: false, fullscreen: false, target: this.$refs.main_ui });
            }, 200);
            // console.log('created loading service in FileExplorer:', this.loadingInstance);

            let err;
            try {
                if(!this.usersecret) throw '未登录状态下无法列举 Bucket，只能通过路径访问或上传文件。';
                // list bucket
                if (!this.bucket_name) {
                    ({ bucket: this.bucket_name, region: this.region_name } = await this.getBucketName(this.oss_name));
                }
                // if (!this.vcs_status) await this.GetVcsStatus();
                const { exportContent } = await import('./filelistapi.js');
                await exportContent(this.path, this.listdata, this);
            }
            catch (e) { err = e; }
            finally {
                if (llid) clearTimeout(llid);
                this.$nextTick(() => {
                    if (this.loadingInstance) {
                        this.loadingInstance.close();
                        this.loadingInstance = null;
                    }
                    this.m__updateLock = false;
                });
            }
            if (err) throw err;
        },
        async GetVcsStatus() {
            while (1) {
                const url = new URL('/?versioning', this.oss_name);
                const date = new Date();
                const myHead = {
                    'x-oss-content-sha256': 'UNSIGNED-PAYLOAD',
                    'x-oss-date': ISO8601(date),
                };
                const resp = await fetch(url, {
                    method: 'GET',
                    headers: {
                        Authorization: await sign_header(url, {
                            access_key_id: this.username, access_key_secret: this.usersecret, date, bucket: this.bucket_name, region: this.region_name,
                            expires: 60, additionalHeadersList: myHead,
                        }),
                        ...myHead
                    }
                });
                const json = xml2json(await resp.text());

                console.log(json);
                break;
            }
        },
        async logonUser(isLogon = true) {
            if (!isLogon) {
                u.delete('AccessKey');
                return location.reload()
            }
            try { await ElMessageBox.confirm('请确认填写的信息准确无误。', 'Access Key 登录', {
                confirmButtonText: '继续登录', cancelButtonText: '取消', type: 'info'
            }) } catch { return }
            if (!this.logon_data.access_key_id || !this.logon_data.access_key_secret) {
                ElMessage.error('请填写用户名和密码。');
                return;
            }
            this.$refs.loginBox.close();
            this.username = this.logon_data.access_key_id;
            this.usersecret = this.logon_data.access_key_secret;
            if (this.logon_data.remember) {
                u.set('AccessKey', JSON.stringify(this.logon_data));
            }
            this.logon_data.access_key_secret = '';
            ElMessage.success('登录完成');
        },
        clearLogonInfo() {
            u.delete('AccessKey', 'Endpoint', 'user_endpoint2name', 'UserHistory');

            globalThis.location.reload();
        },
        clearEbAssociationInfo() {
            u.delete('user_endpoint2name');
            this.user_endpoint2name = {};
            ElMessage.success('已清除');
        },
        checkIfDragIsAllowed(ev) {
            const types = ev.dataTransfer.types;
            if (!types.includes('Files')) return false;
            ev.preventDefault();
            ev.dataTransfer.dropEffect = 'copy';
            return true;
        },
        goPath(neewPath) {
            if (neewPath) this.path = neewPath;
            if (!this.path.startsWith('/')) {
                this.path = '/' + this.path;
            }
            else if (this.path.startsWith('//')) {
                this.path = this.path.substring(1);
            }
            this.isLoading = true;
            this.update()
                .catch(e => ElMessageBox.alert('无法连接到 OSS。\n' + e, '错误', { type: 'error', confirmButtonText: '好' }))
                .finally(() => this.isLoading = false);
        },
        async getBucketName(endpoint) {
            // 尝试解析输入的Endpoint为主机名
            let hostname;
            try {
                const url = new URL(endpoint.startsWith('http') ? endpoint : `https://${endpoint}`);
                hostname = url.hostname;
            } catch (e) {
                // 如果解析失败，直接使用原始输入（简易处理）
                throw '无效的 URL'
            }

            // 匹配标准OSS Endpoint格式: bucket.oss-region.aliyuncs.com
            const ossPattern = /^([a-z0-9_-]+)\.(oss-)([a-z0-9-]+)\.aliyuncs\.com$/i;
            const match = hostname.match(ossPattern);

            if (match) {
                // 标准OSS Endpoint情况
                return {
                    bucket: match[1],
                    region: match[3]
                };
            } else {
                // // 自定义域名情况
                if (Reflect.has(this.user_endpoint2name, endpoint)) {
                    return (Reflect.get(this.user_endpoint2name, endpoint));
                }
                this.bucket_name_loader_PromiseObject = { a: null, b: null, c: null, d: null, e: 0, f: '' };
                this.$refs.dlgInputBucketName.showModal();
                return await new Promise((resolve, reject) => {
                    this.bucket_name_loader_PromiseObject.a = resolve;
                    this.bucket_name_loader_PromiseObject.b = reject;
                });
            }
        },
        async resolvetrydlgInputBucketName() {
            this.$refs.dlgGuessingBucketName.showModal();
            let hasErr = false;
            try {
                const url = new URL('/?list-type=2', this.oss_name);
                const fakeresp = await fetch(url, {
                    method: 'GET',
                    headers: {
                        'x-oss-date': new Date().toUTCString(),
                        Authorization: 'OSS ' + this.username + ':MA==',
                    }
                });
                const fakeresp_json = xml2json(await fakeresp.text());
                let stringToSign = fakeresp_json.StringToSign; // 获取真实需要的签名字符串
                const bucket_name = stringToSign.match(/\/([^\/]+)\/$/)[1];
                this.bucket_name = bucket_name;

                // 通过随机选择访问一个 endpoint 即可获得正确的 endpoint
                const correct_region = await (async () => {
                    // 通过一个必定不存在的地址，加上List File操作（需权限），使目标
                    // 节点如果正确，则必定返回其他error；如果EC为0003-00001403，则
                    // 说明节点不正确，此时返回值会带上正确的 Endpoint。
                    const random_region = 'cn-hangzhou'; // 需要保证此region的长期可用性
                    const random_string = '9d5304a2-4ec4-493a-812a-55ab4258c2f3'; //
                    const url = new URL(`https://${this.bucket_name}.oss-${random_region}.aliyuncs.com/${random_string}/?list-type=2`); // random string
                    // // 然而直接fetch会报CORS ERROR，所以我们让用户手动复制粘贴
                    const resp_raw = (await new Promise((resolve, reject) => {
                        this.bucket_name_loader_PromiseObject.c = resolve;
                        this.bucket_name_loader_PromiseObject.d = reject;
                        this.bucket_name_loader_PromiseObject.e = 1;
                        this.bucket_name_loader_PromiseObject.f = url.href;
                        this.$refs.dlgInputUserManualRegion.showModal();
                    }));
                    let stat = 0, resp_json = null;
                    if (resp_raw.includes('</Endpoint>')) {
                        resp_json = xml2json(resp_raw);
                    } else {
                        const resp = resp_raw.split(' ');
                        // 字符串匹配
                        for (let i = 0, l = resp.length; i < l; ++i) {
                            const data = resp[i];
                            if (stat == 0) {
                                if (url.hostname === data) stat = 1;
                                continue;
                            }
                            if (stat === 1) if (data !== bucket_name) {
                                resp_json = { EC: data }; break;
                            }
                            if (stat === 2) {
                                resp_json = { Endpoint: data };
                            }
                            if (stat === 3) {
                                resp_json.EC = data; break;
                            }
                            ++stat;
                        }

                        if (resp_json.EC !== '0003-00001403') {
                            if (resp_json.EC === '0003-00000001' || resp_json.EC === '0003-00000002' || resp_json.EC === '0003-00000905') {
                                // AccessDenied
                                // 说明之前构造的正好是正确的region
                                return random_region;
                            }
                            // 无法处理
                            throw -1;
                        }
                    }
                    // 尝试获得返回值
                    return resp_json.Endpoint.match(/oss-([a-z0-9-]+)\.aliyuncs\.com$/)[1];
                })();
                if (!correct_region) throw 1;
                console.info('[app]', '解析的region:', correct_region);

                this.bucket_name_loader_PromiseObject.a({
                    bucket: bucket_name, region: correct_region,
                });

                if (this.remember_endpoint_bucket_associations.enabled) {
                    this.user_endpoint2name[this.oss_name] = {
                        bucket: bucket_name, region: correct_region,
                    };
                    u.set('user_endpoint2name', JSON.stringify(this.user_endpoint2name));
                }
            } catch (e) {
                this.$refs.dlgGuessingBucketName.close();
                ElMessage.error('无法自动获得相关数据。请手动输入。');
                return;
            }
            this.$refs.dlgGuessingBucketName.close();
            this.$refs.dlgInputBucketName.close();
        },
        async resolvetrydlgInputRegionName(n) {
            if (n === 1) {
                this.bucket_name_loader_PromiseObject.e = 2;
                this.bucket_name_loader_PromiseObject.f = '';
                try {
                    const text = await navigator.clipboard.readText();
                    this.bucket_name_loader_PromiseObject.f = text;
                } catch { }
                return;
            }
            if (n === 2) {
                this.bucket_name_loader_PromiseObject.c(this.bucket_name_loader_PromiseObject.f);
                this.$refs.dlgInputUserManualRegion.close();
            }
        },
        resolvedlgInputBucketName() {
            if (!this.bucket_name || !this.region_name) return ElMessage.error('请输入正确的 bucket 和 region');
            this.bucket_name_loader_PromiseObject.a({
                bucket: this.bucket_name,
                region: this.region_name,
            });
            this.$refs.dlgInputBucketName.close();
            if (this.remember_endpoint_bucket_associations.enabled) {
                this.user_endpoint2name[this.oss_name] = {
                    bucket: this.bucket_name, region: this.region_name,
                };
                u.set('user_endpoint2name', JSON.stringify(this.user_endpoint2name));
            }
        },
        handleAppTopMenuSelect(data) {
            switch (data) {
                case '/':
                    this.$refs.oss_info_box.open = true;
                    break;
                case '#oss_name':
                    if (this.isConnected || this.isLoading) {
                        ElMessage.error('此时不要修改 Endpoint。');
                        break;
                    }
                    ElMessageBox.prompt('输入新的 OSS Endpoint:', '输入', {
                        inputValue: this.oss_name,
                        confirmButtonText: '更新',
                        cancelButtonText: '放弃',
                    }).then(v => {
                        if (v.value) this.oss_name = v.value;
                    }).catch(() => { });
                    break;
                case '#oss_connect':
                    this.$nextTick(() => this.access());
                    break;
                case '#oss_memory':
                    this.logon_data.remember_endpoint = !this.logon_data.remember_endpoint;
                    break;
                case '#u':
                    this.$refs.loginBox.open = true;
                    break;
                case '#x':
                    this.showAppTopMenu = false;
                    break;
            
                default:
                    if (data.startsWith('#oss_history_item/')) {
                        this.oss_name = data.substring('#oss_history_item/'.length);
                        this.showAppTopMenu = false;
                    }
                    break;
            }
        },
        handleAppTabClick(data) {
            const name = data.props.name;
            this.active_panel = name;
        },
        generatePreloadData() {
            try {
                const current_config = {
                    username: this.username,
                    usersecret: this.usersecret,
                    oss_name: this.oss_name,
                    bucket_name: this.bucket_name,
                    region_name: this.region_name,
                    // 默认不包含 path
                    remember: this.logon_data.remember,
                    remember_endpoint: this.logon_data.remember_endpoint,
                    oss_history: this.oss_history,
                };
                const data = btoa(JSON.stringify(current_config));
                ElMessageBox.prompt('请复制以下内容，以便下次直接加载：', '预加载数据', {
                    inputValue: data,
                    confirmButtonText: '复制',
                    cancelButtonText: '不复制',
                }).then(v => {
                    if (v.action === 'confirm') navigator.clipboard.writeText(data);
                }).catch(() => { });
            } catch {
                ElMessage.error('无法生成预加载数据。');
            }
        },
        async applyPreloadData() {
            try {
                const { value } = await ElMessageBox.prompt('请输入数据。温馨提示：确认后已有数据将被覆盖！', '预加载数据', {
                    confirmButtonText: '覆盖',
                    cancelButtonText: '不要继续',
                });
                u.set('Preload', value);
                ElMessage.success('请稍候...');
                location.reload();
            } catch (e) {
                (e !== 'cancel') && ElMessage.error('无法处理预加载数据。');
            }
        },
        executeDownloadFn(paths) {
            this.active_panel = 'download';
            this.files_to_download = paths;
        },
        inspectFileMimeType() {
            ElMessageBox.prompt('输入扩展名以开始:', '输入', {
                inputValue: '',
                confirmButtonText: '检查',
                cancelButtonText: '放弃',
            }).then(v => {
                if (v.value) ElMessage.success(`${v.value}=${GetMimeTypeByExtension(v.value)}`);
            }).catch(() => { });
        },
        save_oss_history() {
            u.set('UserHistory', JSON.stringify(this.oss_history));
        },
        getAutocompleteOssName(query, cb) {
            if (!cb) cb = v => v;
            if (this.isConnected) return cb([]);
            if (!query) return cb(this.oss_history);
            return cb(this.oss_history.filter(v => v && (v.toLowerCase().includes(query.toLowerCase()))));
        },
        deleteAutocompleteOssName(data) {
            const index = this.oss_history.indexOf(data);
            if (index < 0) return;
            this.oss_history.splice(index, 1);
            this.save_oss_history();

            // 解决autocomplete用户体验的问题
            this.$refs.AC1.close();
            this.$refs.AC2 && (this.$refs.AC2.close());
            this.isLoading = true;
            this.$nextTick(() => this.$nextTick(() => {
                this.isLoading = false;
                document.documentElement.focus()
            }));
        },
    },

    mounted() {
        this.$nextTick(() => {
            const user_endpoint2name = u.get('user_endpoint2name');
            if (user_endpoint2name) try {
                this.user_endpoint2name = JSON.parse(user_endpoint2name);
            } catch { }
            
            const url = new URL(location.href);
            const preload = url.searchParams.get('preload') || u.get('Preload');
            if (preload) try {
                const json = JSON.parse(atob(preload));
                if (json.oss_name) this.oss_name = json.oss_name;
                if (json.username) this.username = json.username;
                if (json.usersecret) this.usersecret = json.usersecret;
                if (json.bucket_name) this.bucket_name = json.bucket_name;
                if (json.region_name) this.region_name = json.region_name;
                if (json.path) this.path = json.path;
                if (json.oss_history) this.oss_history = json.oss_history;
                if (json.remember_endpoint) this.logon_data.remember_endpoint = json.remember_endpoint;
                if (json.remember) this.logon_data.remember = json.remember;

                // 下面开始处理调用函数部分，以使数据同步
                if (json.username && json.usersecret) {
                    if (this.logon_data.remember) {
                        u.set('AccessKey', JSON.stringify({ access_key_id: json.username, access_key_secret: json.usersecret }));
                    }
                }
                if (json.oss_name && this.logon_data.remember_endpoint) {
                    u.set('Endpoint', this.oss_name);
                }
                if (json.bucket_name && json.region_name) {
                    this.user_endpoint2name[this.oss_name] = {
                        bucket: json.bucket_name,
                        region: json.region_name,
                    }
                    u.set('user_endpoint2name', JSON.stringify(this.user_endpoint2name));
                }
                console.info('[preload]', 'Preload data has been applied');
            } catch (e) {
                console.warn('[preload]', 'Invalid preload data has been found\nFalling back to normal mode.');
                ElMessage.warning('无法处理的预加载数据。');
            }
            if (!url.searchParams.has('debug')) import('./replacelocationparams.js');

            this.$nextTick(() => {
                const user_data_str = u.get('AccessKey');
                if (user_data_str) try {
                    const user_data = JSON.parse(user_data_str);
                    this.username = user_data.access_key_id;
                    this.usersecret = user_data.access_key_secret;
                    this.logon_data.access_key_id = user_data.access_key_id;
                } catch {}
                const endpoint_str = u.get('Endpoint');
                if (endpoint_str) {
                    this.oss_name = endpoint_str;
                }
                const oss_history = u.get('UserHistory');
                if (oss_history) try {
                    const data = JSON.parse(oss_history);
                    if (!Array.isArray(data)) throw 0;
                    this.oss_history = data;
                } catch {
                    u.set('UserHistory', '[]');
                }
            });

            queueMicrotask(() => {
                if (u.get('Preload')) {
                    u.delete('Preload');
                } 
            });
        });

        fetch('./assets/data/version.json').then(v => v.json()).then(json => {
            if (json.schema_version === 1) {
                this.appVersion = json.data.values['app.version.id'];
            } else {
                console.warn('[version]', 'Unsupported schema version:', json.schema_version);
                this.appVersion = '0.0.0.0';
            }
        }).catch(() => this.appVersion = '0.0.0.0');

        import('@/sign.js').then(v => {
            globalThis.appInstance_.signingkit = {};
            for (const i in v) globalThis.appInstance_.signingkit[i] = v[i];
        });

        this.appLoadTime = pg_statistics.ASL = new Date() - ST;//App Script Loaded
    },

    template: await getHTML(import.meta.url, componentId),

};


export default data;



