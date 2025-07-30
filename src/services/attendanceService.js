// src/services/attendanceService.js
const crypto = require('crypto');
const { getDB } = require('../database/init');
const { validateSessionToken } = require('./qrService');
const { validateLocation } = require('./classService');


const startAttendanceSession = async (userId, sessionToken, classId) => {
    // Validate session token
    const tokenValidation = validateSessionToken(sessionToken);
    if (!tokenValidation.valid) {
        throw new Error('Invalid or expired session token');
    }

    const { userId: tokenUserId, roomId, gpsCoords } = tokenValidation.data;

    // Verify token belongs to the same user
    if (tokenUserId !== userId) {
        throw new Error('Session token does not belong to this user');
    }

    const db = getDB();

    // Check if student already has an active session
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
        throw new Error('You already have an active attendance session');
    }

    // Verify student is enrolled in this class
    const enrollment = await new Promise((resolve, reject) => {
        db.get(
            'SELECT 1 FROM class_enrollments WHERE student_id = ? AND class_id = ?',
            [userId, classId],
            (err, row) => {
                if (err) reject(err);
                else resolve(row);
            }
        );
    });

    if (!enrollment) {
        throw new Error('You are not enrolled in this class');
    }

    // Get class information
    const classInfo = await new Promise((resolve, reject) => {
        db.get(
            'SELECT * FROM classes WHERE class_id = ? AND room_id = ?',
            [classId, roomId],
            (err, row) => {
                if (err) reject(err);
                else resolve(row);
            }
        );
    });

    if (!classInfo) {
        throw new Error('Class not found or not in the correct room');
    }

    // Validate current time is within attendance window
    const now = new Date();
    const currentTime = now.toTimeString().slice(0, 5);
    const startTime = classInfo.start_time;
    const endTime = classInfo.end_time;

    if (!isWithinAttendanceWindow(currentTime, startTime, endTime)) {
        throw new Error('Attendance is not available at this time');
    }

    // Calculate expected intervals (5-minute intervals)
    const expectedIntervals = calculateExpectedIntervals(startTime, endTime);

    // Create attendance session
    const sessionId = crypto.randomBytes(16).toString('hex');

    await new Promise((resolve, reject) => {
        db.run(
            `INSERT INTO attendance_sessions 
       (session_id, student_id, class_id, room_id, expected_intervals, started_at) 
       VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
            [sessionId, userId, classId, roomId, expectedIntervals],
            (err) => {
                if (err) reject(err);
                else resolve();
            }
        );
    });

    // Record initial heartbeat
    await recordHeartbeat(userId, sessionId, gpsCoords);

    return {
        sessionId,
        message: 'Attendance session started successfully',
        expectedIntervals,
        heartbeatIntervalMs: 2 * 60 * 1000, // Send heartbeat every 2 minutes
        className: classInfo.class_name,
        startTime: classInfo.start_time,
        endTime: classInfo.end_time
    };
};


const recordHeartbeat = async (userId, sessionId, gpsCoords) => {
    const db = getDB();

    const session = await new Promise((resolve, reject) => {
        db.get(
            `SELECT s.*, c.start_time, c.end_time 
       FROM attendance_sessions s 
       JOIN classes c ON s.class_id = c.class_id
       WHERE s.session_id = ? AND s.student_id = ? AND s.status = "ACTIVE"`,
            [sessionId, userId],
            (err, row) => {
                if (err) reject(err);
                else resolve(row);
            }
        );
    });

    if (!session) {
        throw new Error('Invalid session or session not active');
    }

    // Validate location is still within classroom
    const locationValid = await validateLocation(gpsCoords, session.room_id);

    // Calculate which 5-minute interval this heartbeat belongs to
    const intervalNumber = calculateCurrentInterval(session.start_time, session.started_at);

    // Record heartbeat
    await new Promise((resolve, reject) => {
        db.run(
            `INSERT INTO heartbeats 
       (session_id, gps_lat, gps_lng, interval_number, is_valid) 
       VALUES (?, ?, ?, ?, ?)`,
            [sessionId, gpsCoords.lat, gpsCoords.lng, intervalNumber, locationValid],
            (err) => {
                if (err) reject(err);
                else resolve();
            }
        );
    });

    // Get current heartbeat stats
    const stats = await getHeartbeatStats(sessionId);

    return {
        success: true,
        message: locationValid ? 'Heartbeat recorded successfully' : 'Heartbeat recorded (location invalid)',
        intervalNumber,
        locationValid,
        stats: {
            totalHeartbeats: stats.totalHeartbeats,
            validHeartbeats: stats.validHeartbeats,
            intervalsPresent: stats.intervalsPresent,
            expectedIntervals: session.expected_intervals,
            currentAttendancePercentage: Math.round((stats.intervalsPresent / session.expected_intervals) * 100)
        }
    };
};


const endAttendanceSession = async (userId, sessionId) => {
    const db = getDB();

    // Verify session belongs to user and is active
    const session = await new Promise((resolve, reject) => {
        db.get(
            'SELECT * FROM attendance_sessions WHERE session_id = ? AND student_id = ? AND status = "ACTIVE"',
            [sessionId, userId],
            (err, row) => {
                if (err) reject(err);
                else resolve(row);
            }
        );
    });

    if (!session) {
        throw new Error('Session not found or already ended');
    }

    // Update session status
    await new Promise((resolve, reject) => {
        db.run(
            'UPDATE attendance_sessions SET status = "COMPLETED", ended_at = CURRENT_TIMESTAMP WHERE session_id = ?',
            [sessionId],
            (err) => {
                if (err) reject(err);
                else resolve();
            }
        );
    });

    // Calculate final attendance
    const attendanceRecord = await calculateAndSaveAttendance(sessionId);

    return {
        message: 'Attendance session ended successfully',
        sessionId,
        finalRecord: attendanceRecord
    };
};


const calculateAndSaveAttendance = async (sessionId) => {
    const db = getDB();

    // Get session details
    const session = await new Promise((resolve, reject) => {
        db.get(
            'SELECT * FROM attendance_sessions WHERE session_id = ?',
            [sessionId],
            (err, row) => {
                if (err) reject(err);
                else resolve(row);
            }
        );
    });

    if (!session) {
        throw new Error('Session not found');
    }

    // Get heartbeat statistics
    const stats = await getHeartbeatStats(sessionId);

    // Calculate attendance percentage
    const attendancePercentage = (stats.intervalsPresent / session.expected_intervals) * 100;

    // Determine attendance status
    let status;
    if (attendancePercentage >= 75) {
        status = 'PRESENT';
    } else if (attendancePercentage >= 50) {
        status = 'PARTIAL';
    } else {
        status = 'ABSENT';
    }

    // Get today's date
    const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD format

    // Save or update attendance record
    await new Promise((resolve, reject) => {
        db.run(
            `INSERT OR REPLACE INTO attendance_records 
       (student_id, class_id, date, intervals_present, total_intervals, attendance_percentage, status) 
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [
                session.student_id,
                session.class_id,
                today,
                stats.intervalsPresent,
                session.expected_intervals,
                attendancePercentage,
                status
            ],
            (err) => {
                if (err) reject(err);
                else resolve();
            }
        );
    });

    return {
        studentId: session.student_id,
        classId: session.class_id,
        date: today,
        intervalsPresent: stats.intervalsPresent,
        totalIntervals: session.expected_intervals,
        attendancePercentage: Math.round(attendancePercentage * 100) / 100, // Round to 2 decimal places
        status,
        totalHeartbeats: stats.totalHeartbeats,
        validHeartbeats: stats.validHeartbeats
    };
};


const getAttendanceRecord = async (userId, classId, date) => {
    const db = getDB();

    const record = await new Promise((resolve, reject) => {
        db.get(
            `SELECT ar.*, c.class_name, u.first_name, u.last_name
       FROM attendance_records ar
       JOIN classes c ON ar.class_id = c.class_id
       JOIN users u ON ar.student_id = u.user_id
       WHERE ar.student_id = ? AND ar.class_id = ? AND ar.date = ?`,
            [userId, classId, date],
            (err, row) => {
                if (err) reject(err);
                else resolve(row);
            }
        );
    });

    return record;
};


const getStudentAttendanceHistory = async (userId) => {
    const db = getDB();

    const records = await new Promise((resolve, reject) => {
        db.all(
            `SELECT ar.*, c.class_name
       FROM attendance_records ar
       JOIN classes c ON ar.class_id = c.class_id
       WHERE ar.student_id = ?
       ORDER BY ar.date DESC, ar.created_at DESC`,
            [userId],
            (err, rows) => {
                if (err) reject(err);
                else resolve(rows);
            }
        );
    });

    return records;
};


const getActiveSession = async (userId) => {
    const db = getDB();

    const session = await new Promise((resolve, reject) => {
        db.get(
            `SELECT s.*, c.class_name, c.start_time, c.end_time, r.room_id
       FROM attendance_sessions s
       JOIN classes c ON s.class_id = c.class_id
       JOIN classrooms r ON s.room_id = r.room_id
       WHERE s.student_id = ? AND s.status = "ACTIVE"`,
            [userId],
            (err, row) => {
                if (err) reject(err);
                else resolve(row);
            }
        );
    });

    if (session) {
        // Get current stats
        const stats = await getHeartbeatStats(session.session_id);
        session.currentStats = stats;
    }

    return session;
};



const calculateExpectedIntervals = (startTime, endTime) => {
    const [startHour, startMin] = startTime.split(':').map(Number);
    const [endHour, endMin] = endTime.split(':').map(Number);

    const startMinutes = startHour * 60 + startMin;
    const endMinutes = endHour * 60 + endMin;
    const durationMinutes = endMinutes - startMinutes;

    return Math.ceil(durationMinutes / 5); // 5-minute intervals
};


const calculateCurrentInterval = (classStartTime, sessionStartTime) => {
    const now = new Date();
    const sessionStart = new Date(sessionStartTime);

    // Calculate minutes elapsed since session start
    const minutesElapsed = Math.floor((now - sessionStart) / (1000 * 60));

    // Calculate interval number (1-based)
    const intervalNumber = Math.floor(minutesElapsed / 5) + 1;

    return Math.max(1, intervalNumber);
};


const isWithinAttendanceWindow = (currentTime, startTime, endTime) => {
    const [currentHour, currentMin] = currentTime.split(':').map(Number);
    const [startHour, startMin] = startTime.split(':').map(Number);
    const [endHour, endMin] = endTime.split(':').map(Number);

    const currentMinutes = currentHour * 60 + currentMin;
    const startMinutes = startHour * 60 + startMin;
    const endMinutes = endHour * 60 + endMin;

    // Allow check-in from 15 minutes before class starts until 20 minutes after
    const windowStart = startMinutes - 15;
    const windowEnd = startMinutes + 20;

    return currentMinutes >= windowStart && currentMinutes <= windowEnd;
};


const getHeartbeatStats = async (sessionId) => {
    const db = getDB();

    const stats = await new Promise((resolve, reject) => {
        db.get(
            `SELECT 
         COUNT(*) as totalHeartbeats,
         COUNT(CASE WHEN is_valid = 1 THEN 1 END) as validHeartbeats,
         COUNT(DISTINCT CASE WHEN is_valid = 1 THEN interval_number END) as intervalsPresent
       FROM heartbeats 
       WHERE session_id = ?`,
            [sessionId],
            (err, row) => {
                if (err) reject(err);
                else resolve(row);
            }
        );
    });

    return {
        totalHeartbeats: stats.totalHeartbeats || 0,
        validHeartbeats: stats.validHeartbeats || 0,
        intervalsPresent: stats.intervalsPresent || 0
    };
};


const cleanupAbandonedSessions = async () => {
    const db = getDB();
    const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000);

    const abandonedSessions = await new Promise((resolve, reject) => {
        db.all(
            `SELECT DISTINCT s.session_id 
       FROM attendance_sessions s
       LEFT JOIN heartbeats h ON s.session_id = h.session_id
       WHERE s.status = "ACTIVE" 
       AND (
         SELECT MAX(timestamp) FROM heartbeats WHERE session_id = s.session_id
       ) < ? 
       OR h.timestamp IS NULL`,
            [tenMinutesAgo.toISOString()],
            (err, rows) => {
                if (err) reject(err);
                else resolve(rows);
            }
        );
    });

    for (const session of abandonedSessions) {
        await new Promise((resolve, reject) => {
            db.run(
                'UPDATE attendance_sessions SET status = "ABANDONED", ended_at = CURRENT_TIMESTAMP WHERE session_id = ?',
                [session.session_id],
                (err) => {
                    if (err) reject(err);
                    else resolve();
                }
            );
        });

        await calculateAndSaveAttendance(session.session_id);
    }

    console.log(`Cleaned up ${abandonedSessions.length} abandoned attendance sessions`);
    return abandonedSessions.length;
};

module.exports = {
    startAttendanceSession,
    recordHeartbeat,
    endAttendanceSession,
    getAttendanceRecord,
    getStudentAttendanceHistory,
    getActiveSession,
    calculateAndSaveAttendance,
    cleanupAbandonedSessions
};