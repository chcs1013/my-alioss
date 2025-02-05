

let generateSignature;
if (typeof globalThis.crypto !== 'undefined' && typeof globalThis.crypto.subtle !== 'undefined')
    generateSignature = async function generateSignature(secret, stringToSign) {
        const encoder = new TextEncoder();
        const key = await crypto.subtle.importKey(
            'raw',
            encoder.encode(secret),
            { name: 'HMAC', hash: 'SHA-1' },
            false,
            ['sign']
        );
        const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(stringToSign));
        return btoa(String.fromCharCode(...new Uint8Array(signature))); // 转换为 Base64
    }
else
    generateSignature = async function generateSignature(secret, stringToSign) {
        const hmac = CryptoJS.HmacSHA1(stringToSign, secret);
        return hmac.toString(CryptoJS.enc.Base64);
    }
export { generateSignature };
export async function getAuthorizationHeader(accessKeyId, secret, stringToSign) {
    console.warn('[sign.js]', 'V1 sign is deprecated. Use V4 instead');
    const signature = await generateSignature(secret, stringToSign);
    return `OSS ${accessKeyId}:${signature}`;
}

export function ISO8601(date) { // e.g.20250201T053008Z
    if (!date) date = new Date(); // now
    const isoString = date.toISOString();
    // 提取需要的部分并拼接
    return (
        isoString.substring(0, 4) + // 年
        isoString.substring(5, 7) + // 月
        isoString.substring(8, 10) + // 日
        'T' +
        isoString.substring(11, 13) + // 小时
        isoString.substring(14, 16) + // 分钟
        isoString.substring(17, 19) + // 秒
        'Z'
    );
}
function getCanonicalHeaders(date, host, additionalHeadersList = {}) {
    // 生成 CanonicalHeaders
    const headers = {
        // 'host': host,
        // 'x-oss-content-sha256': 'UNSIGNED-PAYLOAD',
        // 'x-oss-date': date,
        ...additionalHeadersList,
    };
    // 将 headers 的 key 转换为小写，并对 value 进行 trim
    const lowerCaseHeaders = Reflect.ownKeys(headers).reduce((acc, key) => {
        acc[key.toLowerCase()] = headers[key].trim();
        return acc;
    }, {});
    // 按照字典序排序
    const sortedHeaders = Reflect.ownKeys(lowerCaseHeaders).sort();
    const headers_additional = Reflect.ownKeys(Reflect.ownKeys(additionalHeadersList).reduce((acc, key) => {
        acc[key.toLowerCase()] = headers[key].trim();
        return acc;
    }, {})).sort();
    // 生成 CanonicalHeaders 字符串
    return {
        result: sortedHeaders
            .map(key => `${key}:${lowerCaseHeaders[key]}`)
            .join('\n') + (sortedHeaders.length ? '\n' : ''),
        headers: sortedHeaders.join(';'),
        headers_additional: headers_additional.join(';'),
    };
}
const PathNameStandard = {
    '!': '%21',
    "'": '%27',
    '"': '%22',
    '(': '%28',
    ')': '%29',
};
function makePathNameStandard(pathname) {
    return pathname
        .replace(/[\!\'\"\(\)]/g, substring => PathNameStandard[substring]);
}
function getCanonicalQueryString(url = new URL()) {
    // 获取 URL 的 searchParams
    const searchParams = url.searchParams;
    // 将 searchParams 转换为数组并按键排序
    const sortedParams = Array.from(searchParams.entries()).sort();
    // 将排序后的键值对重新组合为查询字符串
    const canonicalQueryString = sortedParams
        .map(([key, value]) => `${makePathNameStandard(encodeURIComponent(key))}${value?'=':''}${makePathNameStandard(encodeURIComponent(value))}`)
        .join('&');
    return canonicalQueryString;
}
// 定义 HMAC-SHA256 辅助函数
function hmacsha256(key, message) {
    return CryptoJS.HmacSHA256(message, key);
}
// https://help.aliyun.com/zh/oss/developer-reference/add-signatures-to-urls
export async function sign_url(user_url, {
    access_key_id, access_key_secret: secret,
    additionalHeadersList = {},
    base_url = undefined,
    expires = 60,
    bucket = null, region = null,
    method = "GET",
    date: userDate = null,
} = {}) {
    // if (!base_url && (user_url && user_url.origin)) base_url = user_url.origin;
    const url = new URL(user_url, base_url);
    url.pathname = makePathNameStandard(url.pathname);
    // 初始化
    if (!userDate) userDate = new Date();
    const date = ISO8601(userDate);
    url.searchParams.set('x-oss-signature-version', 'OSS4-HMAC-SHA256')
    // 参数检查
    if ((expires < 1 || expires > 604800)) throw new TypeError('Expires must between 1 and 604800');
    if (!region) throw new TypeError('In V4 signature, `region` is required.'); // what a fucking!
    // 处理 headers
    if (Reflect.ownKeys(additionalHeadersList).length) {
        // 将头部字段转换为小写
        const lowerCaseHeaders = Object.keys(additionalHeadersList).map(header => header.toLowerCase());
        // 按照字典序升序排列
        const sortedHeaders = lowerCaseHeaders.sort();
        // 使用分号连接数组中的元素，获取字符串
        const xOssAdditionalHeaders = sortedHeaders.join(';');
        // 完成
        url.searchParams.set('x-oss-additional-headers', xOssAdditionalHeaders);
    }
    // 处理 x-oss-credential
    const 获取Region派生密钥的参数集 = `${date.substring(0, 8)}/${region}/oss/aliyun_v4_request`; // 摆烂了，这么多参数，文档里面命名乱的一批
    const credential = `${access_key_id}/${获取Region派生密钥的参数集}`;
    url.searchParams.set('x-oss-credential', credential);
    // 处理 date
    url.searchParams.set('x-oss-date', date);
    url.searchParams.set('x-oss-expires', expires);
    // ** 正式处理 signature
    // https://help-static-aliyun-doc.aliyuncs.com/assets/img/zh-CN/5027864371/CAEQRBiBgIDk24XG_xgiIDg0NDAyZmYyNjliMDRmMWJiM2VmNmQwZDFlODU1ZGM24179394_20240119144811.026.svg
    const CanonicalHeaders = getCanonicalHeaders(date, url.hostname, additionalHeadersList);
    const CanonicalQueryString = url.search.length ? getCanonicalQueryString(url) : '';
    const CanonicalRequest = `${method.toUpperCase()}
/${bucket}${(url.pathname)}
${CanonicalQueryString}
${CanonicalHeaders.result}
${CanonicalHeaders.headers_additional}
UNSIGNED-PAYLOAD`;
    const StringToSign = `OSS4-HMAC-SHA256
${date}
${获取Region派生密钥的参数集}
${CryptoJS.SHA256(CanonicalRequest).toString(CryptoJS.enc.Hex)}`;
    const SigningKey = hmacsha256(hmacsha256(hmacsha256(hmacsha256(CryptoJS.enc.Utf8.parse("aliyun_v4" + secret), date.substring(0, 8)), region), 'oss'), 'aliyun_v4_request');
    const signature = hmacsha256(SigningKey, StringToSign);
    //--
    url.searchParams.set('x-oss-signature', signature);
    //--
    return url.href;
}
export async function sign_header(user_url, {
    access_key_id, access_key_secret: secret,
    additionalHeadersList = {},
    base_url = undefined,
    expires = 60,
    bucket = null, region = null,
    method = "GET",
    date : userDate = null,
} = {}) {
    // if (!base_url && (user_url && user_url.origin)) base_url = user_url.origin;
    // const url = new URL(typeof user_url === 'string' ?
    //     (encodeURIComponent(user_url).replace(/\%2F/ig, '/')) :
    //     (encodeURIComponent(decodeURIComponent(user_url.pathname)).replace(/\%2F/ig, '/')), base_url);
    const url = new URL(user_url, base_url);
    url.pathname = makePathNameStandard(url.pathname);
    let result = 'OSS4-HMAC-SHA256 Credential=';
    // 初始化
    if (!userDate) userDate = new Date();
    const date = ISO8601(userDate);
    // 参数检查
    if ((expires < 1 || expires > 604800)) throw new TypeError('Expires must between 1 and 604800');
    if (!region) throw new TypeError('In V4 signature, `region` is required.'); // what a fucking!
    if (!date) throw new TypeError('In header signing, the `date` is required to complete your full request.');
    // 处理 x-oss-credential
    const 获取Region派生密钥的参数集 = `${date.substring(0, 8)}/${region}/oss/aliyun_v4_request`; // 摆烂了，这么多参数，文档里面命名乱的一批
    const credential = `${access_key_id}/${获取Region派生密钥的参数集}`;
    result += credential;
    // 处理 headers
    if (Reflect.ownKeys(additionalHeadersList).length) {
        const lowerCaseHeaders = Object.keys(additionalHeadersList).map(header => header.toLowerCase());
        const sortedHeaders = lowerCaseHeaders.sort();
        const xOssAdditionalHeaders = sortedHeaders.join(';');
        result += ",AdditionalHeaders=" + xOssAdditionalHeaders;
    }
    // ** 正式处理 signature
    // https://help-static-aliyun-doc.aliyuncs.com/assets/img/zh-CN/5027864371/CAEQRBiBgIDk24XG_xgiIDg0NDAyZmYyNjliMDRmMWJiM2VmNmQwZDFlODU1ZGM24179394_20240119144811.026.svg
    const CanonicalHeaders = getCanonicalHeaders(date, url.hostname, additionalHeadersList);
    const CanonicalQueryString = url.search.length ? getCanonicalQueryString(url) : '';
    const CanonicalRequest = `${method.toUpperCase()}
/${bucket}${(url.pathname)}
${CanonicalQueryString}
${CanonicalHeaders.result}
${CanonicalHeaders.headers_additional}
UNSIGNED-PAYLOAD`;
    const StringToSign = `OSS4-HMAC-SHA256
${date}
${获取Region派生密钥的参数集}
${CryptoJS.SHA256(CanonicalRequest).toString(CryptoJS.enc.Hex)}`;
    const SigningKey = hmacsha256(hmacsha256(hmacsha256(hmacsha256(CryptoJS.enc.Utf8.parse("aliyun_v4" + secret), date.substring(0, 8)), region), 'oss'), 'aliyun_v4_request');
    const signature = hmacsha256(SigningKey, StringToSign);
    //--
    result += `,Signature=${signature}`;
    //--
    return result;
}
