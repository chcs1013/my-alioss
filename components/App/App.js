import { getHTML } from '@/assets/js/browser_side-compiler.js';
import { ElMessage, ElMessageBox, ElLoading } from 'element-plus';
import { addCSS as LoadCSS } from '@/BindMove.js';
import { xml2json } from '../xml2json/xml2json.js';
import { RefreshLeft, Fold } from 'icons-vue';
import { defineAsyncComponent } from 'vue';
import { sign_url, sign_header, ISO8601 } from '@/sign.js';


const FileList = defineAsyncComponent(() => import('../FileList/FileList.js'));
const FileUploadForm = defineAsyncComponent(() => import('../FileUploadForm/FileUploadForm.js'));
const FileDownloadUi = defineAsyncComponent(() => import('../FileDownloadUi/FileDownloadUi.js'));



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
            showAppTopMenu: false,
            isConnected: false, isLoading: false,
            // buckets: [],
            listdata: [],
            loadingInstance: null,
            path: '/',
            bucket_name_loader_PromiseObject: { a: null, b: null, c: null, d: null, e: 0, f: '' },
            active_panel: 'file',
            loadCopyRightFrame: false,
            files_to_download: [],
            has_enabled_full_mime_types: true,
            appVersion: '正在获取...',
            appLoadTime: 0,
        }
    },

    components: {
        Fold,
        FileList,
        FileUploadForm,
        FileDownloadUi,
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
                this.isConnected = false;
                this.listdata.length = 0;
                this.bucket_name = '';
                this.$refs.lst?.update();
                return;
            }
            try {
                new URL(this.oss_name);
            } catch {
                ElMessage.error('无效的 URL。请填写正确的 OSS Endpoint。');
                return;
            }
            this.isConnected = true;
            if (this.logon_data.remember_endpoint) {
                localStorage.setItem('Project:MyAliOSS;Type:User;Key:Endpoint', this.oss_name);
            }

            this.isLoading = true;
            this.update()
                .catch(e => ElMessageBox.alert('无法连接到 OSS。\n' + e, '错误', { type: 'error', confirmButtonText: '好' }))
                .finally(() => this.isLoading = false);
        },
        async update() {
            if (this.m__updateLock) return;
            this.m__updateLock = true;
            if (!this.loadingInstance) {
                this.loadingInstance = ElLoading.service({ lock: false, fullscreen: false, target: this.$refs.main_ui });
            }
            // console.log('created loading service in FileExplorer:', this.loadingInstance);

            let err;
            try {
                if(!this.usersecret) throw '未登录状态下无法列举 Bucket，只能通过路径访问或上传文件。';
                // list buckey
                const url = new URL('/?list-type=2', this.oss_name);
                if (this.path.length > 1) url.searchParams.append('prefix', this.path.substring(1));
                if (!this.bucket_name) {
                    ({ bucket: this.bucket_name, region: this.region_name } = await this.getBucketName(this.oss_name));
                }
                // stringToSign = `GET\n\n\n${date}\nx-oss-date:${date}\n/${this.bucket_name}${decodeURIComponent(url.pathname)}`;
                // const resp = await fetch(url, {
                //     method: 'GET',
                //     headers: {
                //         'x-oss-date': date,
                //         Authorization: await getAuthorizationHeader(this.username, this.usersecret, stringToSign),
                //     }
                // });
                const date = new Date();
                // await sign_url(url, {
                //     access_key_id: this.username,
                //     access_key_secret: this.usersecret,
                //     expires: 60,
                //     bucket: this.bucket_name,
                //     region: this.region_name,
                //     date,
                // })
                const myHead = {
                    'x-oss-content-sha256': 'UNSIGNED-PAYLOAD',
                    'x-oss-date': ISO8601(date),
                };
                const resp = await fetch(url, {
                    method: 'GET',
                    headers: {
                        Authorization: await sign_header(url, {
                            access_key_id: this.username,
                            access_key_secret: this.usersecret,
                            date,
                            expires: 60,
                            bucket: this.bucket_name,
                            region: this.region_name,
                            additionalHeadersList: myHead
                        }),
                        ...myHead
                    }
                });
                const json = xml2json(await resp.text());
                // console.log(json);

                if (+json.KeyCount) {
                    this.listdata = (
                        json.KeyCount == 1 ?
                            [json.Contents] : json.Contents
                    );
                } else {
                    this.listdata.length = 0;
                }

                if (json.EC) {
                    throw json.Code + ': ' + json.Message;
                }
                
            }
            catch (e) { err = e; }
            finally {
                this.$nextTick(() => {
                    if (this.loadingInstance) {
                        this.loadingInstance.close();
                        this.loadingInstance = null;
                    }
                    this.m__updateLock = false;
                    // console.log('closed loading service in FileExplorer');
                    this.$refs.lst?.update();
                });
            }
            if (err) throw err;
        },
        async logonUser(isLogon = true) {
            if (!isLogon) {
                localStorage.removeItem('Project:MyAliOSS;Type:User;Key:AccessKey');
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
                localStorage.setItem('Project:MyAliOSS;Type:User;Key:AccessKey', JSON.stringify(this.logon_data));
            }
            this.logon_data.access_key_secret = '';
            ElMessage.success('登录完成');
        },
        // async getBuckets() {
        //     try {
        //         const resp = await makeApiRequest_Direct('/', this.default_endpoint, this.username, this.usersecret)
        //         if (!resp) {
        //             throw '请检查 Access Key 是否有效。';
        //         }
        //         console.log(resp);
        //         if (resp.ListAllMyBucketsResult.Buckets.Bucket.length) {
        //             return resp.ListAllMyBucketsResult.Buckets.Bucket;
        //         }
        //     }
        //     catch (e) {
        //         ElMessageBox.alert('无法获取 Bucket 列表。' + e, '错误', { type: 'error' });
        //     }
        // },
        clearLogonInfo() {
            localStorage.removeItem('Project:MyAliOSS;Type:User;Key:AccessKey');
            localStorage.removeItem('Project:MyAliOSS;Type:User;Key:Endpoint');
            localStorage.removeItem('Project:MyAliOSS;Type:User;Key:user_endpoint2name');

            globalThis.location.reload();
        },
        clearEbAssociationInfo() {
            localStorage.removeItem('Project:MyAliOSS;Type:User;Key:user_endpoint2name');
            this.user_endpoint2name = {};
            ElMessage.success('已清除');
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
                    // const resp = await fetch(url, {
                    //     method: 'GET',
                    //     headers: {
                    //         'x-oss-date': new Date().toUTCString(),
                    //         Authorization: 'OSS LLLLLLLL:MA==',
                    //     }
                    // });
                    // const resp_json = xml2json(await resp.text());
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
                    localStorage.setItem('Project:MyAliOSS;Type:User;Key:user_endpoint2name', JSON.stringify(this.user_endpoint2name));
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
                localStorage.setItem('Project:MyAliOSS;Type:User;Key:user_endpoint2name', JSON.stringify(this.user_endpoint2name));
            }
        },
        handleAppTopMenuSelect(data) {
            switch (data) {
                case '/':
                    this.$refs.oss_info_box.open = true;
                    break;
                case '#oss_name':
                    if (this.isConnected || this.isLoading) break;
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
    },

    mounted() {
        // this.$nextTick(() => {
        //     LoadCSS(`
        //     .icon {
        //         display: inline-block;
        //         width: 1em;
        //         height: 1em;
        //         background-position: center;
        //         background-repeat: no-repeat;
        //         background-size: 1em;
        //         margin-right: 5px;
        //     }
        //     .icon.is-file {
        //         background-image: url(assets/img/shell/file.png);
        //     }
        //     .icon.is-folder {
        //         background-image: url(assets/img/shell/folder.png);
        //     }
        //     `, this.$refs.lst.shadowRoot);
        // });
        this.$nextTick(() => {
            const user_endpoint2name = localStorage.getItem('Project:MyAliOSS;Type:User;Key:user_endpoint2name');
            if (user_endpoint2name) try {
                this.user_endpoint2name = JSON.parse(user_endpoint2name);
            } catch { }
            
            const url = new URL(location.href);
            const preload = url.searchParams.get('preload');
            if (preload) try {
                const json = JSON.parse(atob(preload));
                if (json.oss_name) this.oss_name = json.oss_name;
                if (json.username) this.username = json.username;
                if (json.usersecret) this.usersecret = json.usersecret;
                if (json.bucket_name) this.bucket_name = json.bucket_name;
                if (json.region_name) this.region_name = json.region_name;
                if (json.path) this.path = json.path;
                if (json.remember_endpoint) this.logon_data.remember_endpoint = json.remember_endpoint;
                if (json.remember) this.logon_data.remember = json.remember;

                // 下面开始处理调用函数部分，以使数据同步
                if (json.username && json.usersecret) {
                    if (this.logon_data.remember) {
                        localStorage.setItem('Project:MyAliOSS;Type:User;Key:AccessKey', JSON.stringify({ access_key_id: json.username, access_key_secret: json.usersecret }));
                    }
                }
                if (json.oss_name && this.logon_data.remember_endpoint) {
                    localStorage.setItem('Project:MyAliOSS;Type:User;Key:Endpoint', this.oss_name);
                }
                if (json.bucket_name && json.region_name) {
                    this.user_endpoint2name[this.oss_name] = {
                        bucket: json.bucket_name,
                        region: json.region_name,
                    }
                    localStorage.setItem('Project:MyAliOSS;Type:User;Key:user_endpoint2name', JSON.stringify(this.user_endpoint2name));
                }
                console.info('[preload]', 'Preload data has been applied');
            } catch (e) {
                console.warn('[preload]', 'Invalid preload data has been found: ', preload, '\n Falling back to normal mode.');
            }
            if (!url.searchParams.has('debug')) import('./replacelocationparams.js');

            this.$nextTick(() => {
                const user_data_str = localStorage.getItem('Project:MyAliOSS;Type:User;Key:AccessKey');
                if (user_data_str) try {
                    const user_data = JSON.parse(user_data_str);
                    this.username = user_data.access_key_id;
                    this.usersecret = user_data.access_key_secret;
                    this.logon_data.access_key_id = user_data.access_key_id;
                } catch {}
                const endpoint_str = localStorage.getItem('Project:MyAliOSS;Type:User;Key:Endpoint');
                if (endpoint_str) {
                    this.oss_name = endpoint_str;
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

        this.appLoadTime = pg_statistics.ASL = new Date() - ST;//App Script Loaded
    },

    template: await getHTML(import.meta.url, componentId),

};


export default data;



