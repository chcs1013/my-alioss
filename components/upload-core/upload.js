import { sign_url } from "@/sign.js";
import { xml2json } from '@/components/xml2json/xml2json.js';

// FOR DEBUG ONLY
// import { ElMessage } from 'element-plus';

function truncate_number(input, digits) {
    // 将数字转换为字符串
    const inputStr = input.toString();

    // 找到小数点的位置
    const decimalIndex = inputStr.indexOf('.');

    // 如果没有小数点，直接补齐到指定位数
    if (decimalIndex === -1) {
        return digits === 0 ? inputStr : `${inputStr}.${'0'.padEnd(digits, '0')}`;
    }

    // 截取整数部分和小数部分
    const integerPart = inputStr.substring(0, decimalIndex);
    let decimalPart = inputStr.substring(decimalIndex + 1);

    // 如果小数部分长度大于指定位数，截断
    if (decimalPart.length > digits) {
        decimalPart = decimalPart.substring(0, digits);
    }
    // 如果小数部分长度小于指定位数，补齐
    else if (decimalPart.length < digits) {
        decimalPart = decimalPart.padEnd(digits, '0');
    }

    // 拼接结果
    return digits === 0 ? integerPart : `${integerPart}.${decimalPart}`;
}
// BE CAREFUL:: THIS FUNCTION HAS NOT BEEN TESTED!
async function send_request_with_callback(request, options, callback = null) {
    // 复制原始 options 对象，避免直接修改原对象
    const fetchOptions = { ...options };

    // 如果存在回调函数，尝试跟踪进度
    if (typeof callback === 'function') {
        const originalBody = fetchOptions.body;

        // 处理 Blob/File 类型的 body（如文件上传）
        if (originalBody instanceof Blob) {
            const total = originalBody.size;  // 总字节数
            let loaded = 0;                   // 已上传字节数

            // 创建 TransformStream 用于跟踪读取进度
            const progressStream = new TransformStream({
                transform(chunk, controller) {
                    loaded += chunk.byteLength;  // 更新已上传字节数
                    queueMicrotask(() => callback(loaded, total));     // 触发回调
                    controller.enqueue(chunk);   // 将数据块传递下去
                }
            });

            // 将原始 Blob 流通过 progressStream 转换
            const originalStream = originalBody.stream();
            fetchOptions.body = originalStream.pipeThrough(progressStream);
        }

        // 可选：处理其他类型的流（如 ReadableStream）
        else if (originalBody instanceof ReadableStream) {
            let loaded = 0;
            const progressStream = new TransformStream({
                transform(chunk, controller) {
                    loaded += chunk.byteLength;
                    queueMicrotask(() => callback(loaded, null));  // 总大小未知，传递 null
                    controller.enqueue(chunk);
                }
            });
            fetchOptions.body = originalBody.pipeThrough(progressStream);
        }

        // TypeError: Failed to execute 'fetch' on 'Window': The `duplex` member must be specified for a request with a streaming body
        fetchOptions.duplex = 'half';
    }

    // 发送请求并返回响应
    const response = await fetch(request, fetchOptions);
    return response;
}
const fetch2 = fetch; // aliyun not supported
async function init_upload(path, endpoint, bucket, region, username, usersecret, mimeType) {
    const url = new URL(path, endpoint);
    const additionalHeadersList = { 'content-disposition': 'inline' };
    if (mimeType) {
        additionalHeadersList['content-type'] = mimeType;
    }
    url.search = '?uploads';
    const signed_url = await sign_url(url, { access_key_id: username, access_key_secret: usersecret, bucket, region, method: 'POST', expires: 3600, additionalHeadersList });
    const resp = await fetch(signed_url, {
        method: 'POST',
        headers: additionalHeadersList,
    });
    if (!resp.ok) throw new Error('Failed to initlate multi-part upload. Error: ' + resp.status + resp.statusText);
    const value = xml2json(await resp.text());
    return value.UploadId;
}
async function send(path, blob, pos, endpoint, bucket, region, username, usersecret, chunk_id, UploadId, mimeType = '', callback = null) {
    const url = new URL(path, endpoint);
    const additionalHeadersList = { 'content-disposition': 'inline' };
    if (blob.type) {
        additionalHeadersList['content-type'] = blob.type;
    }
    else if (mimeType) {
        additionalHeadersList['content-type'] = mimeType;
    }
    if (!chunk_id) {
        // signle part
        const signed_url = await sign_url(url, { access_key_id: username, access_key_secret: usersecret, bucket, region, method: 'PUT', expires: 3600, additionalHeadersList });
        const response = await fetch2(signed_url, {
            method: 'PUT',
            body: blob,
            headers: additionalHeadersList,
        }, callback);
        if (!response.ok) throw new Error('Failed to upload block ' + chunk_id + ' at position ' + pos + '. Error: ' + response.status + ' ' + response.statusText);
        await response.text(); // 等待请求完成

        const crc64 = response.headers.get('x-oss-hash-crc64ecma');
        const ETag = response.headers.get('etag');
        return { crc64, ETag };
    }
    url.searchParams.set('partNumber', chunk_id);
    url.searchParams.set('uploadId', UploadId);
    const signed_url = await sign_url(url, { access_key_id: username, access_key_secret: usersecret, bucket, region, method: 'PUT', expires: 3600, additionalHeadersList });
    // console.log('url:', signed_url);

    // core upload
    // ElMessage.success('headers=' + JSON.stringify(additionalHeadersList, null, 2));
    const response = await fetch2(signed_url, {
        method: 'PUT',
        body: blob,
        headers: additionalHeadersList,
    }, callback);
    if (!response.ok) throw new Error('Failed to upload block ' + chunk_id + ' at position ' + pos + '. Error: ' + response.status + ' ' + response.statusText);
    await response.text(); // 等待请求完成

    const crc64 = response.headers.get('x-oss-hash-crc64ecma');
    const ETag = response.headers.get('etag');
    return { crc64, ETag };
}
async function post_upload(path, endpoint, bucket, region, username, usersecret, uploadId, etags, mimeType) {
    const url = new URL(path, endpoint);
    url.searchParams.set('uploadId', uploadId);
    const additionalHeadersList = { 'content-disposition': 'inline' };
    const signed_url = await sign_url(url, { access_key_id: username, access_key_secret: usersecret, bucket, region, method: 'POST', expires: 3600, additionalHeadersList });
    const body_parts = [`<CompleteMultipartUpload>`];
    let n = 0;
    for (const i of etags) {
        ++n;
        body_parts.push(`<Part><PartNumber>${n}</PartNumber><ETag>${i}</ETag></Part>`)
    }
    body_parts.push(`</CompleteMultipartUpload>`);
    const resp = await fetch(signed_url, {
        method: 'POST',
        body: new Blob(body_parts),
        headers: additionalHeadersList,
    });
    if (!resp.ok) throw new Error('Failed to complete multi-part upload. Error: ' + resp.status + resp.statusText);
    const value = xml2json(await resp.text());
    return value.ETag;
}
// 提取文件扩展名的函数
function getFileExtension(filePath) {
    // 提取文件名
    const fileName = filePath.split('/').pop(); // 取路径的最后一部分
    // 按 '.' 分割文件名
    const parts = fileName.split('.');
    if (parts.length > 1) {
        return parts[parts.length - 1]; // 返回扩展名
    }
    return ""; // 如果没有扩展名，返回空字符串
}
const chunkSize = 16 * 1024 * 1024, chunkMinFileSize = 32 * 1024 * 1024;
async function uploadFile({ path: composedPath, blob, cb, endpoint, bucket, region, username, usersecret }) {
    function delay(ms = 0) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
    const size = blob.size;
    const total_chunks = Math.ceil(size / chunkSize);
    let pos = 0, chunk_id = 0;
    let lastStep = 0, step = 0, errorCount = 0;
    composedPath = (encodeURIComponent(composedPath).replace(/\%2F/ig, '/'));
    const wrappedCallback = (current, total) => {
        if (!cb) return;
        current = pos + current; // 校正
        cb(chunk_id + 1, total_chunks, (current / size), current, size);
    };
    // 获取扩展名对应的MIME Type
    const extName = getFileExtension(composedPath);
    const mimeType = blob.type ? blob.type : (extName ?
        GetMimeTypeByExtension(extName) :
        GetMimeTypeByExtension());
    // 如果文件小于指定大小，则直接上传，节省请求次数
    if (size < chunkMinFileSize) {
        cb && cb(1, 1, 0, 0, size);
        return (await send(composedPath, blob, 0, endpoint, bucket, region, username, usersecret, 0, 0, mimeType, wrappedCallback)).ETag;
    }
    // 初始化上传
    const UploadId = await init_upload(composedPath, endpoint, bucket, region, username, usersecret, mimeType);
    if (!UploadId) throw new Error('Failed to get UploadId. This seems like an internal error?');
    const etags = [];
    cb && cb(1, total_chunks, 0, 0, size);
    while (pos < size) {
        ++chunk_id;
        const len = pos + Math.min(blob.size - pos, chunkSize);
        const newBlob = blob.slice(pos, len);
        // console.log('Uploading', pos, len, 'of', size, 'data', name, 'blob', newBlob);
        try {
            const { crc64, ETag } = await send(composedPath, newBlob, pos, endpoint, bucket, region, username, usersecret, chunk_id, UploadId, mimeType, wrappedCallback);
            // TODO: Check CRC64
            etags.push(ETag);
        }
        catch (error) {
            if (++errorCount > 6) throw error;
            let ms = errorCount * 500;
            cb && cb(0, error, `Error (${errorCount}), retry after ${ms}ms..`);
            await delay(ms);
            continue;
        }
        pos = len;
        step = pos / size;
        if (step - lastStep > 0.00005) {
            lastStep = step;
            cb && cb(chunk_id + 1, total_chunks, step, pos, size);
        }
        errorCount = 0;
        await new Promise(resolve => queueMicrotask(resolve));
    }
    // 完成上传
    const etag = await post_upload(composedPath, endpoint, bucket, region, username, usersecret, UploadId, etags, mimeType);

    return etag;
}

export {
    truncate_number,
    init_upload,
    send,
    post_upload,
    getFileExtension,
    uploadFile,
};
export {
    chunkSize,
    chunkMinFileSize,
};