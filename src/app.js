const express = require('express');

const { initDatabase } = require('./database/init');

const authRoutes = require('./routes/auth');
const classRoutes = require('./routes/classes');
const attendanceRoutes = require('./routes/attendance');

const { startQRRotationJob } = require('./services/qrService');


const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

app.use('/api/auth', authRoutes);
app.use('/api/classes', classRoutes);
app.use('/api/attendance', attendanceRoutes);



const startServer = async () => {
    await initDatabase();
    startQRRotationJob();

    app.listen(PORT, () => {
        console.log(`server listening on port : ${PORT}`);
    });
};

startServer();