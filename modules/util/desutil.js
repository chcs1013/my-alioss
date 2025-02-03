// DES加密函数
function DES_encrypt(data, key) {
    // 将整数密钥转换为8字节的WordArray
    const keyBytes = CryptoJS.enc.Hex.parse(padKey(key.toString(16)));

    // 使用DES加密
    const encrypted = CryptoJS.DES.encrypt(data, keyBytes, {
        mode: CryptoJS.mode.ECB,
        padding: CryptoJS.pad.Pkcs7
    });

    // 返回Base64编码的加密结果
    return encrypted.toString();
}

// DES解密函数
function DES_decrypt(encrypted_data, key) {
    // 将整数密钥转换为8字节的WordArray
    const keyBytes = CryptoJS.enc.Hex.parse(padKey(key.toString(16)));

    // 使用DES解密
    const decrypted = CryptoJS.DES.decrypt(encrypted_data, keyBytes, {
        mode: CryptoJS.mode.ECB,
        padding: CryptoJS.pad.Pkcs7
    });

    // 返回解密后的字符串
    return decrypted.toString(CryptoJS.enc.Utf8);
}

// 辅助函数：将密钥填充到8字节（64位）
function padKey(key) {
    // DES密钥需要64位（8字节），所以如果不足8字节，则在前面补0
    while (key.length < 16) {
        key = '0' + key;
    }
    return key;
}

export { DES_encrypt, DES_decrypt };

export function generateRandomKey() {
    if (window.crypto && window.crypto.getRandomValues) {
        const array = new Uint32Array(1);
        window.crypto.getRandomValues(array);
        return array[0];
    } else {
        // 回退到 Math.random()
        return Math.floor(Math.random() * 0x100000000);
    }
}
