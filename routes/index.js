const express = require('express');
const router = express.Router();
const crypto = require('crypto');

function encryptImage(hex) {
    const password = 'Password used to generate key';

    // Encryption
    const salt = crypto.randomBytes(16).toString('hex');
    const key = crypto.scryptSync(password, salt, 32);
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv('aes-256-cbc', key, iv);
    
    let encrypted = cipher.update(hex, 'hex', 'hex');
    encrypted += cipher.final('hex');
    
    // Bitmap transformation
    const length = toHex32(encrypted.length); // length of encrypted data without padding
    const data = (length + salt + iv.toString('hex') + encrypted).padEnd(Math.ceil((length + encrypted).length / 8) * 8, '0');
    const imageWidth = Math.floor(Math.sqrt(data.length / 6)); // hex color value = 6 byte
    const dataAsArray = data.match(new RegExp('.{1,' + imageWidth * 6 + '}', 'g'));
    const imageHeight = dataAsArray.length;
    // Add padding in every row
    const paddedData = dataAsArray.map(row => row.padEnd(Math.ceil(imageWidth * 6 / 8) * 8, '0')).join('');
    const contentSize = paddedData.length / 2;

    const bitmapHeader =
        '424D' +
        toHex32(54 + contentSize) +
        '00000000' +
        toHex32(54) +
        toHex32(40) +
        toHex32(imageWidth) +
        toHex32(imageHeight) +
        '01001800' +
        '0000000010000000' +
        '130B0000130B0000' +
        '0000000000000000';
    
    const imageHex = bitmapHeader + paddedData;
    const image64 = 'data:image/bmp;base64,' + Buffer.from(imageHex, 'hex').toString('base64');

    return image64;
}

function decryptImage(imageBase64) {
    const password = 'Password used to generate key';
    
    // Bitmap decoding
    const imageHex = Buffer.from(imageBase64.split(',', 2)[1], 'base64').toString('hex');
    const width = fromHex32(imageHex.substr(18 * 2, 8));
    let content = imageHex.substr(54 * 2); // 54 byte header => 108 byte hex
    // Remove padding in every row
    content = content.match(new RegExp('.{1,' + Math.ceil(width * 6 / 8) * 8 + '}', 'g'));
    content = content.map(row => row.substr(0, width * 6)).join('');

    // Decryption
    const length = fromHex32(content.substr(0, 8));
    const salt = content.substr(8, 32); // 16 byte salt => 32 byte hex
    const iv = Buffer.from(content.substr(8 + 32, 32), 'hex'); // 16 byte IV => 32 byte hex

    const encrypted = content.substr(72); // 8 + 32 + 32

    const key = crypto.scryptSync(password, salt, 32);
    const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);
    
    let decrypted = decipher.update(encrypted.substr(0, length), 'hex', 'hex');
    decrypted += decipher.final('hex');
    
    return decrypted;
}

// Hex notation used in bitmap header: BBKKMM (Byte, KiloByte and MegaByte)
// Example: 16 byte = 0F0000
function toHex32(bytes) {
    return bytes.toString(16).padStart(8, '0').match(/.{1,2}/g).reverse().join('');
}

// Convert from bitmap hex notation to integer
function fromHex32(hex) {
    return parseInt(hex.match(/.{1,2}/g).reverse().join(''), 16);
}

function get(params) {
    
    let imageBase64;
    if (params.image) {
        imageBase64 = decodeURIComponent(params.image);
    } else {
        const hex = Buffer.from(params.text, 'utf-8').toString('hex');
        imageBase64 = encryptImage(hex);
    }

    const decodedHex = decryptImage(imageBase64);
    const decodedText = Buffer.from(decodedHex, 'hex').toString('utf8');
    const imageUrl = '/decode/' + encodeURIComponent(imageBase64);

    return { imageUrl : imageUrl, imageData : imageBase64, decoded : decodedText };
}

router.get('/', function(req, res, next) {
    res.render('index', get({ text : 'Hi, this text will be crypted with aes256 and stored in a bitmap image' }));
});

router.get('/decode/:image', function (req, res, next) {
    res.render('index', get(req.params));
});

router.get('/encode/:text', function (req, res, next) {
    res.render('index', get(req.params));
});

module.exports = router;
