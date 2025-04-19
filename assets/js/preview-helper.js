class HTMLOssObjectPreviewForm extends HTMLElement {
    static stylesheet = new CSSStyleSheet();

    #initbit = false;
    #el = null;

    constructor() {
        super();
        this.attachShadow({ mode: 'open' });
        this.shadowRoot.adoptedStyleSheets = [HTMLOssObjectPreviewForm.stylesheet];

        this.#el = document.createElement('div');
        this.#el.id = 'app';
        this.#el.innerText = 'Loading...';
        this.shadowRoot.append(this.#el);
    }

    connectedCallback() {
        // Component connected to the DOM
    }

    disconnectedCallback() {
        // Component disconnected from the DOM
    }

    async init(getossUrl, fileType, fileName) {
        if (this.#initbit) throw new Error('HTMLOssObjectPreviewForm has been initialized!');

        const type_array = fileType.split('/');
        const majorType = type_array[0];
        const minorType = type_array[1] || '';
        const ossUrl = await getossUrl();

        switch (majorType) {
            case 'text': {
                this.#el.classList.add('text');
                fetch(ossUrl).then(v => v.text()).then(v => { this.#el.innerText = ''; this.#el.append(document.createTextNode(v)); }).catch(e => this.#el.innerText = `无法加载预览: ${e}`);
                break;
            }
            case 'audio':
            case 'video': {
                const apply_volume = (p) => {
                    p.addEventListener('volumechange', () => {
                        // save the user's volume preference
                        u.set('PreferredVolume', p.volume);
                    });
                    queueMicrotask(() => {
                        // set the volume to the user's preference
                        const preferredVolume = u.get('PreferredVolume');
                        if (preferredVolume) p.volume = preferredVolume;
                    });
                };

                const p = document.createElement(majorType);
                p.id = 'app';
                this.#el.replaceWith(p);
                p.controls = true;
                apply_volume(p);
                    
                let source = document.createElement('source');
                source.src = await getossUrl(3600 * 24); // 24小时的临时链接
                source.type = fileType;
                p.appendChild(source);
                if (!p.isConnected) break;
                p.load();
                p.play().catch(() => { });
                break;
            }
            case 'image': {
                let img = document.createElement('img');
                img.id = 'app';
                img.src = ossUrl;
                img.alt = fileName;
                img.addEventListener('click', () => {
                    img.classList.toggle('scale');
                });
                this.#el.replaceWith(img);
                break;
            }
                
            default: switch (fileType) {
                case 'application/pdf': {
                    fetch(ossUrl).then(v => v.blob()).then(v => {
                        let p = document.createElement('object');
                        p.id = 'app';
                        this.#el.replaceWith(p);
                        p.data = URL.createObjectURL(v);
                        p.type = fileType;
                    }).catch(e => this.#el.innerText = `无法加载预览: ${e}`);
                    break;
                }
            
                default: {
                    this.#el.innerText = '';
                    this.#el.classList.add('text');
                    const a = document.createElement('a');
                    a.href = ossUrl;
                    a.target = '_blank';
                    a.innerText = '点击下载文件。';
                    a.rel = 'noopener noreferrer';
                    a.download = 'true';
                    this.#el.append('没有预览。', a);
                }
            }
        }

        if ('image/audio/video'.split('/').includes(majorType)) {
            this.classList.add('media');
        }

        this.#initbit = true;
    }
}

// Define the CSS styles
HTMLOssObjectPreviewForm.stylesheet.replace(`
:host {
    width: 100%;
    height: 100%;
    overflow: auto;
    border: 0;
    box-sizing: border-box;
    display: flex;
    flex-direction: column;
}
:host(.media) {
    background-color: black;
}

* {
    box-sizing: border-box;
}

a {
    color: blue;
    text-decoration: none;
}

a:hover {
    text-decoration: underline;
}

#app.text {
    padding: 10px;
    white-space: pre;
    font-family: Consolas, monospace;
}

img#app {
    cursor: zoom-in;
    max-width: 100%;
    max-height: 100%;
    object-fit: contain;
    width: fit-content;
    height: fit-content;
    margin: auto;
}

img#app.scale {
    max-width: unset;
    max-height: unset;
    cursor: zoom-out;
}

video#app, object#app {
    width: 100%;
    height: 100%;
}

audio#app {
    margin: auto;
}
`);

// Register the custom element
customElements.define('oss-object-preview-form', HTMLOssObjectPreviewForm);


function load_script(script_url) {
    return new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = script_url;
        script.onload = () => resolve(script);
        script.onerror = reject;
        document.head.appendChild(script);
    });
}
