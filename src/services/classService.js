const { getDistance } = require('geolib');
const { getDB } = require('../database/init');

const CLASSROOM_RADIUS = 30; // meters

// Validate if GPS coordinates are within classroom boundaries
const validateLocation = async (gpsCoords, roomId) => {
    try {
        const db = getDB();

        const classroom = await new Promise((resolve, reject) => {
            db.get(
                'SELECT gps_lat, gps_lng FROM classrooms WHERE room_id = ?',
                [roomId],
                (err, row) => {
                    if (err) reject(err);
                    else resolve(row);
                }
            );
        });

        if (!classroom) {
            return false;
        }

        const distance = getDistance(
            { latitude: gpsCoords.lat, longitude: gpsCoords.lng },
            { latitude: classroom.gps_lat, longitude: classroom.gps_lng }
        );

        return distance <= CLASSROOM_RADIUS;
    } catch (error) {
        console.error('Location validation error:', error);
        return false;
    }
};

// Get current classes available in a room for a student
const getCurrentClasses = async (roomId, studentId) => {
    try {
        const db = getDB();
        const now = new Date();
        const currentDay = now.getDay();
        const currentTime = now.toTimeString().slice(0, 5);

        const classes = await new Promise((resolve, reject) => {
            db.all(`
        SELECT c.class_id, c.class_name, c.start_time, c.end_time,
               u.first_name || ' ' || u.last_name as instructor_name
        FROM classes c
        JOIN class_enrollments e ON c.class_id = e.class_id
        JOIN users u ON c.instructor_id = u.user_id
        WHERE c.room_id = ? 
          AND e.student_id = ?
          AND c.day_of_week = ?
          AND TIME(?) BETWEEN TIME(c.start_time, '-15 minutes') AND TIME(c.start_time, '+20 minutes')
      `, [roomId, studentId, currentDay, currentTime], (err, rows) => {
                if (err) reject(err);
                else resolve(rows);
            });
        });

        return classes.map(cls => ({
            classId: cls.class_id,
            className: cls.class_name,
            startTime: cls.start_time,
            endTime: cls.end_time,
            instructor: cls.instructor_name,
            status: isClassStartingSoon(cls.start_time, currentTime) ? 'starting_soon' : 'in_progress'
        }));

    } catch (error) {
        console.error('Get current classes error:', error);
        return [];
    }
};

const isClassStartingSoon = (classStartTime, currentTime) => {
    const [startHour, startMin] = classStartTime.split(':').map(Number);
    const [currentHour, currentMin] = currentTime.split(':').map(Number);

    const startMinutes = startHour * 60 + startMin;
    const currentMinutes = currentHour * 60 + currentMin;

    return currentMinutes < startMinutes && (startMinutes - currentMinutes) <= 15;
};

module.exports = {
    validateLocation,
    getCurrentClasses,
    CLASSROOM_RADIUS
};
