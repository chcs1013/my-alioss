
/**
 * AES加密数据
 * @param {string} data - 要加密的原始数据
 * @param {string} key - 加密密钥
 * @returns {string} 返回加密后的字符串
 */
function encrypt_data(data, key) {
    // 将数据转换为字符
    const dataStr = String(data);

    // 使用AES加密
    const encrypted = CryptoJS.AES.encrypt(dataStr, key).toString();

    return encrypted;
}

/**
 * AES解密数据
 * @param {string} enc - 加密后的字符串
 * @param {string} key - 解密密钥（必须与加密密钥相同）
 * @returns {string|object} 返回解密后的原始内容，如果是JSON会自动解析为对象
 */
function decrypt_data(enc, key) {
    try {
        // 使用AES解密
        const decrypted = CryptoJS.AES.decrypt(enc, key);
        const originalText = decrypted.toString(CryptoJS.enc.Utf8);

        return originalText;
    } catch (e) {
        console.error("解密失败:", e);
        return null;
    }
}

export { encrypt_data, decrypt_data };