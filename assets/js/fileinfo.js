const prettyPrintFileSize = await (async function () {
    const isMac = /mac|iphone/i.test(navigator.userAgent);
    const userdec = null
    const usedec = ('boolean' === typeof userdec) ? userdec : isMac;
    const units = usedec ?
        ['Byte', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB'] :
        ['Byte', 'KiB', 'MiB', 'GiB', 'TiB', 'PiB', 'EiB', 'ZiB', 'YiB'],
        n = usedec ? 1000 : 1024, d = 9;
    return function prettyPrintFileSize(size, extra = true, cutoff_small_part = -1) {
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
        if (cutoff_small_part >= 0) {
            newSize = String(newSize);
            if (newSize.indexOf('.') !== -1) {
                let [int, dec] = newSize.split('.');
                if (cutoff_small_part === 0) {
                    newSize = int;
                } else if (dec.length > cutoff_small_part) {
                    newSize = int + '.' + dec.slice(0, cutoff_small_part);
                }
            }
        }
        return extra ?
            (newSize + ' ' + unit + (unit !== units[0] ? (` (${size} ${units[0]})`) : '')) :
            (newSize + ' ' + unit);
    }
})();
export { prettyPrintFileSize };
