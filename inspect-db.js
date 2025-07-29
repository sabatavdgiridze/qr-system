const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const DB_PATH = path.join(__dirname, 'attendance.db');

const db = new sqlite3.Database(DB_PATH, (err) => {
    if (err) {
        console.error('Error opening database:', err);
        return;
    }
    console.log('Connected to SQLite database');
});

db.all("SELECT name FROM sqlite_master WHERE type='table'", (err, tables) => {
    if (err) {
        console.error('Error getting tables:', err);
        return;
    }

    console.log('\n=== TABLES ===');
    tables.forEach(table => {
        console.log(`- ${table.name}`);
    });
});

db.all("SELECT * FROM users", (err, users) => {
    if (err) {
        console.error('Error getting users:', err);
    } else {
        console.log('\n=== USERS ===');
        console.log(users);
    }
});

db.all("SELECT * FROM classrooms", (err, classrooms) => {
    if (err) {
        console.error('Error getting classrooms:', err);
    } else {
        console.log('\n=== CLASSROOMS ===');
        console.log(classrooms);
    }
});

// Check classes table
db.all("SELECT * FROM classes", (err, classes) => {
    if (err) {
        console.error('Error getting classes:', err);
    } else {
        console.log('\n=== CLASSES ===');
        console.log(classes);
    }
    db.close();
});
