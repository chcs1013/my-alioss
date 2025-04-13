export function xml2json(xml) {
    // 如果传入的是字符串，先将其解析为 XML DOM 对象
    if (typeof xml === 'string') {
        const parser = new DOMParser();
        xml = parser.parseFromString(xml, 'application/xml');
    }

    // 递归函数，用于遍历 XML 节点并生成 JSON
    function parseNode(node) {
        const obj = {};

        // 处理节点属性
        if (node.attributes && node.attributes.length > 0) {
            obj['@attributes'] = {};
            for (let i = 0; i < node.attributes.length; i++) {
                const attr = node.attributes[i];
                obj['@attributes'][attr.name] = attr.value;
            }
        }

        // 处理子节点
        if (node.childNodes && node.childNodes.length > 0) {
            for (let i = 0; i < node.childNodes.length; i++) {
                const child = node.childNodes[i];

                // 忽略空白文本节点
                if (child.nodeType === 3 && child.textContent.trim() === '') continue;

                // 处理文本节点
                if (child.nodeType === 3) {
                    return child.textContent;
                }

                // 处理元素节点
                const nodeName = child.nodeName;
                if (typeof obj[nodeName] === 'undefined') {
                    obj[nodeName] = parseNode(child);
                } else {
                    // 如果节点名称重复，将其转换为数组
                    if (!Array.isArray(obj[nodeName])) {
                        obj[nodeName] = [obj[nodeName]];
                    }
                    obj[nodeName].push(parseNode(child));
                }
            }
        }

        return obj;
    }

    // 从根节点开始解析
    return parseNode(xml.documentElement);
}