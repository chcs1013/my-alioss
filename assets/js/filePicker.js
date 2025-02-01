{
function eq(el, selector) { // extended querySelector
    const r = el.querySelector(selector);
    r && (!r.on) && (r.on = r.addEventListener);
    return r;
}

class HTMLFilePickerUiElement extends HTMLElement {
    #shadowRoot = null;
    #file = null;
    #userFiles = null;

    constructor() {
        super(arguments);

        this.#shadowRoot = this.attachShadow({ mode: 'open' });
        this.#shadowRoot.innerHTML = `
        <div tabindex=0 role=button id=wrapper style="position: relative; border-radius: 10px; border: 2px dashed #ccc; padding: 10px; display: grid; place-items: center; height: 3em; user-select: none; cursor: pointer; transition: 0.1s;">
            <input type=file id=file hidden />
            <div id=text__0 inert><slot>Choose File</slot></div>
            <div id=text__1 hidden><!--
                --><span id=text__2 inert>$filename</span><!--
                --><span id=clear_wrapper>&nbsp;[<a href="javascript:" id=clear style="font-family: monospace;">clear</a>]</span><!--
            --></div>
        </div>

        <style>
a { text-decoration: none }
a:hover { text-decoration: underline }
#wrapper {
    background: #fafafa;
}
#wrapper:hover, #wrapper.dropping {
    background: #f0f0f0;
}
#wrapper:active {
    background: #d7d7d7;
}
#wrapper.dropping #clear_wrapper {
    display: none;
}
#wrapper.dropping * {
    pointer-events: none;
}
#wrapper#wrapper:has(#file:disabled) {
    background: #fefefe;
    cursor: not-allowed!important;
}
        </style>
        `;

        const
            w = eq(this.#shadowRoot, '#wrapper'),
            f = eq(this.#shadowRoot, '#file'),
            x = eq(this.#shadowRoot, '#clear'),
            t0 = eq(this.#shadowRoot, '#text__0'),
            t1 = eq(this.#shadowRoot, '#text__1'),
            t2 = eq(this.#shadowRoot, '#text__2'),
            THISISAVARTOLETTHECODELOOKSBETTER = 0;
        this.#file = f;
        const clearDropEffects = () => ((w.classList.contains('dropping') && w.classList.remove('dropping')));
        w.on('click', () => f.click());
        w.on('keydown', ev => ev.key === 'Enter' && f.click());
        w.on('dragover', ev => ev.dataTransfer.types.includes('Files') && (ev.preventDefault(), w.classList.add('dropping')));
        w.on('dragleave', clearDropEffects);
        w.on('drop', async (ev) => {
            if (!ev.dataTransfer.types.includes('Files')) return;
            ev.preventDefault();
            clearDropEffects();
            const tempResult = new Array;
            const it = ev.dataTransfer.items;
            await new Promise(queueMicrotask);
            for (const i of it) {
                if (i.kind !== 'file') continue;
                const fs = i.getAsFileSystemHandle();
                tempResult.push(fs);
                if (!this.multiple) break;
            }
            this.#userFiles = new Array;
            for (const i of tempResult) {
                const fs = await i;
                if (fs.kind !== 'file') continue;
                const file = await fs.getFile();
                this.#userFiles.push(file);
            }
            if (this.#userFiles.length < 1) return;
            t0.hidden = true, t1.hidden = false;
            if (this.#userFiles.length === 1)
                t2.innerText = this.#userFiles[0].name;
            else t2.innerText = this.#userFiles.length + ' files';
            this.dispatchEvent(new Event('change', { bubbles: true, cancelable: false }));
        });
        f.on('change', (ev) => {
            ev.stopPropagation();
            this.#userFiles = null;
            if (f.files.length) {
                t0.hidden = true, t1.hidden = false;
                if (f.files.length === 1)
                    t2.innerText = f.files[0].name;
                else t2.innerText = f.files.length + ' files';
            } else {
                t0.hidden = false, t1.hidden = true;
            }
            this.dispatchEvent(new Event('change', { bubbles: true, cancelable: false }));
        });
        x.on('click', (ev) => (f.value = null, ev.stopPropagation(), f.dispatchEvent(new Event('change'))));
        x.on('dragover', ev => ev.stopPropagation()); x.on('drop', ev => (ev.preventDefault(), ev.stopPropagation()));
    }

    static get observedAttributes() { return ['disabled', 'multiple', 'accept', 'required']; }
    attributeChangedCallback(name, oldValue, newValue) {
        switch (name) {
            case 'disabled':
            case 'multiple':
            case 'accept':
            case 'required':
                this.#file[name] = this[name];
                break;
        
            default:;
        }
    }


    get value() { return this.#userFiles || this.#file.value }
    set value(val) { return Reflect.set(this.#file, 'value', val) }
    get files() { return this.#userFiles || this.#file.files }

    get disabled() { return this.getAttribute('disabled') != null }
    set disabled(val) { val ? this.setAttribute('disabled', '') : this.removeAttribute('disabled'); return!0 }
    get multiple() { return this.getAttribute('multiple') != null }
    set multiple(val) { val ? this.setAttribute('multiple', '') : this.removeAttribute('multiple'); return!0 }
    get required() { return this.getAttribute('required') != null }
    set required(val) { val ? this.setAttribute('required', '') : this.removeAttribute('required'); return!0 }

    get accept() { return this.getAttribute('accept') }
    set accept(val) { (val == null || val == '') ? (this.removeAttribute('accept')) : this.setAttribute('accept', val); return!0 }

    select() { return this.#file.select.apply(this.#file, arguments) }

};


customElements.define('file-picker-ui', HTMLFilePickerUiElement);
}