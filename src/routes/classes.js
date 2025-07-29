const express = require('express');
const { authenticateToken } = require('../middleware/auth');
const { validateSchema, schemas } = require('../middleware/validation');
const { validateQRCode, generateSessionToken } = require('../services/qrService');
const { validateLocation, getCurrentClasses } = require('../services/classService');
const { getDB } = require('../database/init');

const router = express.Router();

// Scan QR code and get available classes
router.post('/scan',
    authenticateToken,
    validateSchema(schemas.scanQR),
    async (req, res) => {
        try {
            const { qrCode, gpsCoords } = req.body;
            const { userId } = req.user;

            // Validate QR code
            const qrValidation = validateQRCode(qrCode);
            if (!qrValidation.valid) {
                return res.status(400).json({ error: `Invalid QR code: ${qrValidation.reason}` });
            }

            const { roomId } = qrValidation;

            // Validate location
            const locationValid = await validateLocation(gpsCoords, roomId);
            if (!locationValid) {
                return res.status(400).json({ error: 'Not within classroom boundaries' });
            }

            // Check for existing active session
            const db = getDB();
            const existingSession = await new Promise((resolve, reject) => {
                db.get(
                    'SELECT session_id FROM attendance_sessions WHERE student_id = ? AND status = "ACTIVE"',
                    [userId],
                    (err, row) => {
                        if (err) reject(err);
                        else resolve(row);
                    }
                );
            });

            if (existingSession) {
                return res.status(400).json({
                    error: 'You already have an active attendance session',
                    existingSessionId: existingSession.session_id
                });
            }

            // Get current classes for this room and student
            const availableClasses = await getCurrentClasses(roomId, userId);

            if (availableClasses.length === 0) {
                return res.status(404).json({ error: 'No classes available at this time' });
            }

            // Generate session token
            const sessionToken = generateSessionToken(userId, roomId, gpsCoords);

            res.json({
                sessionToken,
                availableClasses,
                roomId,
                expiresIn: 300 // 5 minutes
            });

        } catch (error) {
            console.error('QR scan error:', error);
            res.status(500).json({ error: 'Failed to process QR code' });
        }
    }
);

module.exports = router;