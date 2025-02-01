import { getHTML } from '@/assets/js/browser_side-compiler.js';
import { customCheckDrag } from './public.js';


const componentId = 'd3a0b5f14eea4d39ac26082a1dacfd24';

const data = {
    data() {
        return {
            editMode: false,
            cachedPath: '',
            noSave: false,

        }
    },

    components: {

    },

    props: {
        // server: Object,
        path: String,
        iconUrl: {
            type: String,
            default: "assets/img/shell/folder.png"
        },
    },

    emits: ['openPath'],

    methods: {
        onitemdragover(ev) {
            if (!ev.target.classList.contains('explorer-nav-pathblock')) return;
            const checkedDropEffect = customCheckDrag(ev.dataTransfer.types);
            if (!checkedDropEffect) return;
            ev.preventDefault();
            ev.target.classList.add('hover');
            let dropEffect = "none";
            if (checkedDropEffect && checkedDropEffect.dropEffect) dropEffect = checkedDropEffect.dropEffect;
            else if (ev.shiftKey) dropEffect = "move";
            else if (ev.ctrlKey) dropEffect = "copy";
            else if (ev.altKey) dropEffect = "link";
            else dropEffect = "move";
            window.appInstance_.lastDropEffect = ev.dataTransfer.dropEffect = dropEffect;
        },
        onitemdragleave(ev) {
            if (!ev.target.classList.contains('explorer-nav-pathblock')) return;
            ev.target.classList.remove('hover');
        },
        onitemdrop(ev) {
            if (!ev.target.classList.contains('explorer-nav-pathblock')) return;
            const checkedDropEffect = customCheckDrag(ev.dataTransfer.types);
            if (!checkedDropEffect) return;
            ev.preventDefault();
            ev.target.classList.remove('hover');
        },
        onwheel(ev) {
            const root = this.$refs.root;
            if (root) root.scrollLeft += ev.deltaX || ev.deltaY;
        },
        open(path) {
            this.$emit('openPath', path);
        },
        enterEditMode() {
            this.cachedPath = this.path;
            this.editMode = true;
            this.$nextTick(() => this.$refs.inp?.focus());
        },
        saveChanges() {
            if (this.noSave) return;
            this.open(this.cachedPath);
            this.editMode = false;
        },
        discardChanges() {
            this.noSave = true;
            this.editMode = false;
            this.$nextTick(() => this.$nextTick(() => this.noSave = false));
        },
    },

    computed: {
        computedPath() {
            const arr = [];
            const path = this.path.replace(/\\/g, '/');
            const winVolTest = /^\/\/\?\/Volume\{[0-F]{8}-[0-F]{4}-[0-F]{4}-[0-F]{4}-[0-F]{12}\}\//i;
            if (winVolTest.test(path)) {
                // is Windows Volume path
                // eg. //?/Volume{01234567-8901-2345-6789-012345678901}/Path/to/Name/
                arr.push(path.substring(0, 48));
                const restPath = path.substring(49);
                restPath.split('/').filter(e => !!e).forEach(v => arr.push(v));
            } else if (path[0] === '/') {
                // is unix-style path
                // eg. /var/www/
                arr.push('/');
                path.split('/').filter(e => !!e).forEach(v => arr.push(v));
            } else {
                // is Windows-style path
                // eg. C:/Windows/
                path.split('/').filter(e => !!e).forEach(v => arr.push(v));
            }
            // return arr.map((el, index) => ({ name: el, path: arr.slice(0, index).join('/') }));
            const newArr = []; let newPath = '';
            for (const i of arr) {
                newArr.push({
                    name: i,
                    path: (newPath += (i + '/')),
                });
            }
            return newArr;
        },
    },

    watch: {
        path: {
            immediate: true,
            handler(val, oldVal) { this.$nextTick(()=>{
                const root = this.$refs.root;
                if (root) root.scrollLeft = root.clientWidth + root.scrollWidth;
            })} 
        }
    },

    template: await getHTML(import.meta.url, componentId),

};


export default data;

