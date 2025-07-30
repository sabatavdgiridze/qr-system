const bcrypt = require('bcryptjs');

const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const DB_PATH = path.join(__dirname, '../../attendance.db');
let db = null;

const initDatabase = () => {
    return new Promise((resolve, reject) => {
        db = new sqlite3.Database(DB_PATH, (err) => {
            if (err) {
                reject(err);
                return;
            }

            console.log('Connected to SQLite database');
            createTables().then(resolve).catch(reject);
        });
    });
};

const createTables = () => {
    return new Promise((resolve, reject) => {
        const tables = [
            `CREATE TABLE IF NOT EXISTS users (
        user_id VARCHAR(50) PRIMARY KEY,
        email VARCHAR(100) UNIQUE NOT NULL,
        password_hash VARCHAR(255) NOT NULL,
        role TEXT CHECK(role IN ('STUDENT', 'INSTRUCTOR')) DEFAULT 'STUDENT',
        first_name VARCHAR(50),
        last_name VARCHAR(50),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )`,

            `CREATE TABLE IF NOT EXISTS classrooms (
        room_id VARCHAR(20) PRIMARY KEY,
        gps_lat DECIMAL(10,8) NOT NULL,
        gps_lng DECIMAL(11,8) NOT NULL,
        current_qr_code VARCHAR(100),
        qr_updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )`,

            `CREATE TABLE IF NOT EXISTS classes (
        class_id VARCHAR(50) PRIMARY KEY,
        class_name VARCHAR(100) NOT NULL,
        room_id VARCHAR(20),
        day_of_week INTEGER,
        start_time TIME,
        end_time TIME,
        instructor_id VARCHAR(50),
        FOREIGN KEY (room_id) REFERENCES classrooms(room_id),
        FOREIGN KEY (instructor_id) REFERENCES users(user_id)
      )`,

            `CREATE TABLE IF NOT EXISTS class_enrollments (
        enrollment_id INTEGER PRIMARY KEY AUTOINCREMENT,
        student_id VARCHAR(50),
        class_id VARCHAR(50),
        enrolled_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (student_id) REFERENCES users(user_id),
        FOREIGN KEY (class_id) REFERENCES classes(class_id),
        UNIQUE(student_id, class_id)
      )`,

            `CREATE TABLE IF NOT EXISTS attendance_sessions (
        session_id VARCHAR(50) PRIMARY KEY,
        student_id VARCHAR(50),
        class_id VARCHAR(50),
        room_id VARCHAR(20),
        started_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        ended_at TIMESTAMP,
        status TEXT CHECK(status IN ('ACTIVE', 'COMPLETED', 'ABANDONED')) DEFAULT 'ACTIVE',
        expected_intervals INTEGER,
        FOREIGN KEY (student_id) REFERENCES users(user_id),
        FOREIGN KEY (class_id) REFERENCES classes(class_id),
        FOREIGN KEY (room_id) REFERENCES classrooms(room_id)
      )`,

            `CREATE TABLE IF NOT EXISTS heartbeats (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        session_id VARCHAR(50),
        gps_lat DECIMAL(10,8),
        gps_lng DECIMAL(11,8),
        timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        interval_number INTEGER,
        is_valid BOOLEAN DEFAULT FALSE,
        FOREIGN KEY (session_id) REFERENCES attendance_sessions(session_id)
      )`,

            `CREATE TABLE IF NOT EXISTS attendance_records (
        student_id VARCHAR(50),
        class_id VARCHAR(50),
        date DATE,
        intervals_present INTEGER DEFAULT 0,
        total_intervals INTEGER,
        attendance_percentage DECIMAL(5,2),
        status TEXT CHECK(status IN ('PRESENT', 'PARTIAL', 'ABSENT')) DEFAULT 'ABSENT',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY(student_id, class_id, date),
        FOREIGN KEY (student_id) REFERENCES users(user_id),
        FOREIGN KEY (class_id) REFERENCES classes(class_id)
      )`
        ];

        let completed = 0;
        tables.forEach((sql, index) => {
            db.run(sql, (err) => {
                if (err) {
                    reject(err);
                    return;
                }

                completed++;
                if (completed === tables.length) {
                    populateData().then(resolve).catch(reject);

                }
            });
        });
    });
};

const populateData = async () => {
    const studentHash = await bcrypt.hash('student123', 10);
    const instructorHash = await bcrypt.hash('instructor123', 10);

    const now = new Date();
    const currentDay = now.getDay();

    const class1Start = new Date(now.getTime() - 10 * 60 * 1000);
    const class1End = new Date(class1Start.getTime() + 90 * 60 * 1000);

    const class2Start = new Date(now.getTime() + 10 * 60 * 1000);
    const class2End = new Date(class2Start.getTime() + 90 * 60 * 1000);

    const formatTime = (date) => {
        return date.toTimeString().slice(0, 5);
    };

    const class1StartTime = formatTime(class1Start);
    const class1EndTime = formatTime(class1End);
    const class2StartTime = formatTime(class2Start);
    const class2EndTime = formatTime(class2End);


    const sampleData = [
        // Classrooms
        `INSERT OR IGNORE INTO classrooms VALUES 
      ('ROOM101', 33.7756, -84.3963, NULL, CURRENT_TIMESTAMP),
      ('ROOM102', 33.7758, -84.3965, NULL, CURRENT_TIMESTAMP),
      ('ROOM201', 33.7760, -84.3967, NULL, CURRENT_TIMESTAMP)`,

        // Sample instructor (password: instructor123)
        `INSERT OR IGNORE INTO users VALUES 
      ('instructor_1', 'instructor@gatech.edu', '${instructorHash}', 'INSTRUCTOR', 'Dr. John', 'Smith', CURRENT_TIMESTAMP)`,

        // Sample student (password: student123)
        `INSERT OR IGNORE INTO users VALUES 
      ('student_1', 'student@gatech.edu', '${studentHash}', 'STUDENT', 'Jane', 'Doe', CURRENT_TIMESTAMP)`,

        // Sample classes
        `INSERT OR IGNORE INTO classes VALUES 
    ('BIO101_001', 'Introduction to Biology - Section 001', 'ROOM101', ${currentDay}, '${class1StartTime}', '${class1EndTime}', 'instructor_1'),
      ('CHEM201_003', 'Organic Chemistry - Section 003', 'ROOM101', ${currentDay}, '${class2StartTime}', '${class2EndTime}', 'instructor_1')`,


        // Sample enrollment
        `INSERT OR IGNORE INTO class_enrollments (student_id, class_id) VALUES 
      ('student_1', 'BIO101_001'),
      ('student_1', 'CHEM201_003')`
    ];

    for (const sql of sampleData) {
        await new Promise((resolve, reject) => {
            db.run(sql, (err) => {
                if (err) reject(err);
                else resolve();
            });
        });
    }

    console.log('Database initialized with mock data');
};


const getDB = () => {
    if (!db) {
        throw new Error('Database not initialized');
    }
    return db;
};

module.exports = { initDatabase, getDB };