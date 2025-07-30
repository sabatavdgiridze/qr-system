const express = require('express');
const { authenticateToken } = require('../middleware/auth');
const { validateSchema, schemas } = require('../middleware/validation');
const {
    startAttendanceSession,
    recordHeartbeat,
    endAttendanceSession,
    calculateAttendance
} = require('../services/attendanceService');

const router = express.Router();

router.post('/start',
    authenticateToken,
    validateSchema(schemas.startAttendance),
    async (req, res) => {
        try {
            const { sessionToken, classId } = req.body;
            const { userId } = req.user;

            const result = await startAttendanceSession(userId, sessionToken, classId);
            res.json(result);

        } catch (error) {
            console.error('Start attendance error:', error);
            res.status(400).json({ error: error.message });
        }
    }
);

router.post('/heartbeat',
    authenticateToken,
    validateSchema(schemas.heartbeat),
    async (req, res) => {
        try {
            const { sessionId, gpsCoords } = req.body;
            const { userId } = req.user;

            const result = await recordHeartbeat(userId, sessionId, gpsCoords);
            res.json(result);

        } catch (error) {
            console.error('Heartbeat error:', error);
            res.status(400).json({ error: error.message });
        }
    }
);

router.post('/end', authenticateToken, async (req, res) => {
    try {
        const { sessionId } = req.body;
        const { userId } = req.user;

        const result = await endAttendanceSession(userId, sessionId);
        res.json(result);

    } catch (error) {
        console.error('End attendance error:', error);
        res.status(400).json({ error: error.message });
    }
});

router.get('/record/:classId/:date', authenticateToken, async (req, res) => {
    try {
        const { classId, date } = req.params;
        const { userId } = req.user;

        const record = await calculateAttendance(userId, classId, date);
        res.json(record);

    } catch (error) {
        console.error('Get attendance error:', error);
        res.status(500).json({ error: 'Failed to get attendance record' });
    }
});

module.exports = router;