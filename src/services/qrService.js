const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const cron = require('node-cron');
const { JWT_SECRET } = require('../middleware/auth');
const { getDB } = require('../database/init');

const QR_SECRET = process.env.QR_SECRET || 'qr-secret';

// Generate QR code content for a room
const generateQRCode = (roomId) => {
    const timeBlock = Math.floor(Date.now() / (10 * 60 * 1000)); // 10-minute blocks
    const payload = `${roomId}_${timeBlock}`;
    const hmac = crypto.createHmac('sha256', QR_SECRET)
        .update(payload)
        .digest('hex');
    return `${payload}_${hmac}`;
};

// Validate QR code
const validateQRCode = (qrCode) => {
    try {
        const parts = qrCode.split('_');
        if (parts.length !== 3) {
            return { valid: false, reason: 'invalid_format' };
        }

        const [roomId, timeBlock, providedHmac] = parts;
        const currentTimeBlock = Math.floor(Date.now() / (10 * 60 * 1000));

        // Allow current and previous block (20-minute window)
        if (Math.abs(currentTimeBlock - parseInt(timeBlock)) > 1) {
            return { valid: false, reason: 'expired' };
        }

        // Verify HMAC
        const expectedHmac = crypto.createHmac('sha256', QR_SECRET)
            .update(`${roomId}_${timeBlock}`)
            .digest('hex');

        if (providedHmac !== expectedHmac) {
            return { valid: false, reason: 'invalid_signature' };
        }

        return { valid: true, roomId };
    } catch (error) {
        return { valid: false, reason: 'parse_error' };
    }
};

// Generate session token after QR scan
const generateSessionToken = (userId, roomId, gpsCoords) => {
    const payload = {
        userId,
        roomId,
        gpsCoords,
        nonce: crypto.randomBytes(16).toString('hex'),
        iat: Math.floor(Date.now() / 1000),
        exp: Math.floor(Date.now() / 1000) + (5 * 60) // 5 minutes
    };

    return jwt.sign(payload, JWT_SECRET);
};

// Validate session token
const validateSessionToken = (token) => {
    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        return { valid: true, data: decoded };
    } catch (error) {
        return { valid: false, reason: error.message };
    }
};

// Update QR codes for all classrooms (runs every 10 minutes)
const updateQRCodes = async () => {
    try {
        const db = getDB();

        // Get all classrooms
        const classrooms = await new Promise((resolve, reject) => {
            db.all('SELECT room_id FROM classrooms', (err, rows) => {
                if (err) reject(err);
                else resolve(rows);
            });
        });

        // Update QR codes
        for (const classroom of classrooms) {
            const newQRCode = generateQRCode(classroom.room_id);

            await new Promise((resolve, reject) => {
                db.run(
                    'UPDATE classrooms SET current_qr_code = ?, qr_updated_at = CURRENT_TIMESTAMP WHERE room_id = ?',
                    [newQRCode, classroom.room_id],
                    (err) => {
                        if (err) reject(err);
                        else resolve();
                    }
                );
            });

            // update the qr, by calling the hook for the corresponding room
        }

        console.log(`Updated QR codes for ${classrooms.length} classrooms`);
    } catch (error) {
        console.error('Failed to update QR codes:', error);
    }
};

const startQRRotationJob = () => {
    cron.schedule('*/10 * * * *', updateQRCodes);

    updateQRCodes();

    console.log('QR code rotation job started');
};

module.exports = {
    generateQRCode,
    validateQRCode,
    generateSessionToken,
    validateSessionToken,
    startQRRotationJob
};
