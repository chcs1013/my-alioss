import { sign_header, ISO8601 } from '@/sign.js';
import { xml2json } from '../xml2json/xml2json.js';

const xml_vcs_parse = (() => {
    function parseXMLKeepingOrder(xmlString) {
        const parser = new DOMParser();
        const doc = parser.parseFromString(xmlString, "text/xml");
        const result = [];

        // 获取根元素的所有直接子元素
        const root = doc.documentElement;
        const children = root.children;

        for (let i = 0; i < children.length; i++) {
            const element = children[i];
            if (element.tagName !== 'Version' && element.tagName !== 'DeleteMarker') continue;
            const obj = processElement(element);
            obj.isDeleteMarker = element.tagName === 'DeleteMarker';
            result.push(obj);
        }

        return (result);
    }

    function processElement(element) {
        const obj = {};
        for (const child of element.children) {
            if (child.children.length > 0) {
                obj[child.tagName] = processElement(child);
            } else {
                obj[child.tagName] = child.textContent;
            }
        }
        return obj;
    }

    return parseXMLKeepingOrder;
})();

/**
 * 
 * @param {String} path path
 * @param {Array} refOutputArray output container
 * @param {Object} c component
 * @param {*} param3 
 */
export async function exportContent(path, refOutputArray, c, { setDelimiter = true, vcs = false, NextVersionIdMarker = undefined } = {}) {
    let token = null;
    while (1) {
        const url = new URL(vcs ? '/?versions=&max-keys=1000' : '/?list-type=2&max-keys=1000', c.oss_name);
        if (setDelimiter) url.searchParams.append('delimiter', '/');
        if (path.length > 1) url.searchParams.append('prefix', (path[0] === '/') ? path.substring(1) : path);
        if (vcs) {
            if (token) url.searchParams.append('key-marker', token);
            if (NextVersionIdMarker) url.searchParams.append('version-id-marker', NextVersionIdMarker);
        } else {
            if (token) url.searchParams.append('continuation-token', token);
        }
        const date = new Date();
        const myHead = {
            'x-oss-content-sha256': 'UNSIGNED-PAYLOAD',
            'x-oss-date': ISO8601(date),
        };
        // url.search = url.search.replace(/\+/g, '%20');
        const resp = await fetch(url, {
            method: 'GET',
            headers: {
                Authorization: await sign_header(url, {
                    access_key_id: c.username, access_key_secret: c.usersecret, date, bucket: c.bucket_name, region: c.region_name,
                    expires: 60, additionalHeadersList: myHead,
                }),
                ...myHead
            }
        });
        const text_raw = await resp.text()
        const json = xml2json(text_raw);

        if (!token) {
            refOutputArray.length = 0;
        }
        if ((!vcs) && +json.KeyCount) {
            if (!Array.isArray(json.Contents) && json.Contents) refOutputArray.push(json.Contents);
            else refOutputArray.push.apply(refOutputArray, json.Contents);
        }
        else if (vcs) {
            // 单独对数据进行解析，以保持顺序
            const data = xml_vcs_parse(text_raw);
            refOutputArray.push.apply(refOutputArray, data);

            // if (!Array.isArray(json.Version) && json.Version) refOutputArray.push(json.Version);
            // else if (json.Version) refOutputArray.push.apply(refOutputArray, json.Version);
            // if (!Array.isArray(json.DeleteMarker) && json.DeleteMarker) { const d = json.DeleteMarker; d.isDeleteMarker = true; refOutputArray.push(d); }
            // else if (json.DeleteMarker) refOutputArray.push.apply(refOutputArray, json.DeleteMarker.map(v => { v.isDeleteMarker = true; return v; }));
        }
        if (!Array.isArray(json.CommonPrefixes) && json.CommonPrefixes) refOutputArray.push(json.CommonPrefixes);
        else refOutputArray.push.apply(refOutputArray, json.CommonPrefixes);

        if (json.EC) {
            throw json.Code + ': ' + json.Message;
        }

        if (json.NextContinuationToken) {
            token = json.NextContinuationToken;
            continue;
        }
        if (json.NextKeyMarker && json.NextVersionIdMarker) {
            token = json.NextKeyMarker;
            NextVersionIdMarker = json.NextVersionIdMarker;
            continue;
        }
        break;
    }
}
