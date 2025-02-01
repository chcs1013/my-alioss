export function fileinfo(fullpath) {
    if (fullpath.includes('\\')) fullpath = fullpath.replaceAll('\\', '/');
    return {
        fullpath: fullpath,
        path: fullpath.substring(0, fullpath.lastIndexOf('/')),
        name: fullpath.substring(fullpath.lastIndexOf('/') + 1),
        ext: fullpath.substring((fullpath.lastIndexOf('.') + 1) || (fullpath.length)),
    }
}
const prettyPrintFileSize = await (async function () {
    const isMac = /mac|iphone/i.test(navigator.userAgent);
    const userdec = null
    const usedec = ('boolean' === typeof userdec) ? userdec : isMac;
    const units = usedec ?
        ['Byte', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB'] :
        ['Byte', 'KiB', 'MiB', 'GiB', 'TiB', 'PiB', 'EiB', 'ZiB', 'YiB'],
        n = usedec ? 1000 : 1024, d = 9;
    return function prettyPrintFileSize(size) {
        if (isNaN(size)) return size;
        size = +size;
        let newSize = size, unit = units[0];
        for (let i = 0, unitslen = units.length; i < unitslen; ++i) {
            unit = units[i];
            let _val = Math.floor((newSize / n) * (10 ** d)) / (10 ** d);
            if (_val < 1 || i + 2 > unitslen) break;
            newSize = _val;
            unit = units[i + 1];
        }
        return newSize + ' ' + unit + (unit !== units[0] ? (` (${size} ${units[0]})`) : '');
    }
})();
export { prettyPrintFileSize };
