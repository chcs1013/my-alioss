export function customCheckDrag(types) {
    for (let i of types) {
        if (i === 'application/x-web-file-explorer-item') return true;
        if (i === 'Files') return { dropEffect: 'copy' };
    }
    return false;
};

