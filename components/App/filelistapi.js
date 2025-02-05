import { sign_header, ISO8601 } from '@/sign.js';
import { xml2json } from '../xml2json/xml2json.js';
/**
 * 
 * @param {String} path path
 * @param {Array} refOutputArray output container
 * @param {Object} c component
 * @param {*} param3 
 */
export async function exportContent(path, refOutputArray, c, { setDelimiter = true } = {}) {
    let token = null;
    while (1) {
        const url = new URL('/?list-type=2&max-keys=1000', c.oss_name);
        if (setDelimiter) url.searchParams.append('delimiter', '/');
        if (path.length > 1) url.searchParams.append('prefix', (path[0] === '/') ? path.substring(1) : path);
        if (!c.bucket_name) {
            ({ bucket: c.bucket_name, region: c.region_name } = await c.getBucketName(c.oss_name));
        }
        if (token) url.searchParams.append('continuation-token', token);
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
        const json = xml2json(await resp.text());

        if (!token) {
            refOutputArray.length = 0;
        }
        if (+json.KeyCount) {
            if (!Array.isArray(json.Contents) && json.Contents) refOutputArray.push(json.Contents);
            else refOutputArray.push.apply(refOutputArray, json.Contents);
            if (!Array.isArray(json.CommonPrefixes) && json.CommonPrefixes) refOutputArray.push(json.CommonPrefixes);
            else refOutputArray.push.apply(refOutputArray, json.CommonPrefixes);
        }

        if (json.EC) {
            throw json.Code + ': ' + json.Message;
        }

        if (json.NextContinuationToken) {
            token = json.NextContinuationToken;
            continue;
        }
        break;
    }
}
