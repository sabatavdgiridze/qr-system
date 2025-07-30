const { startAttendanceSession, recordHeartbeat, endAttendanceSession, getActiveSession } = require('../../src/services/attendanceService');

jest.mock('geolib', () => ({
    getDistance: jest.fn()
}));


jest.mock('../../src/database/init', () => ({
    getDB: jest.fn()
}));

jest.mock('../../src/services/qrService', () => ({
    validateSessionToken: jest.fn()
}));

jest.mock('../../src/services/classService', () => ({
    validateLocation: jest.fn()
}));

const { getDB } = require('../../src/database/init');
const { validateSessionToken } = require('../../src/services/qrService');
const { validateLocation } = require('../../src/services/classService');

describe('attendanceService', () => {
    let mockDB;

    beforeEach(() => {
        jest.clearAllMocks();
        mockDB = { get: jest.fn(), run: jest.fn(), all: jest.fn() };
        getDB.mockReturnValue(mockDB);
        jest.useFakeTimers();
        jest.setSystemTime(new Date('2024-03-12T10:05:00'));
    });

    afterEach(() => {
        jest.useRealTimers();
    });

    it('starts attendance session successfully', async () => {
        validateSessionToken.mockReturnValue({
            valid: true,
            data: { userId: 'user1', roomId: 'room1', gpsCoords: { lat: 40.7, lng: -74.0 } }
        });

        mockDB.get
            .mockImplementationOnce((query, params, callback) => callback(null, null))
            .mockImplementationOnce((query, params, callback) => callback(null, { id: 1 }))
            .mockImplementationOnce((query, params, callback) => callback(null, {
                class_name: 'Math',
                start_time: '10:00',
                end_time: '11:00'
            }))
            .mockImplementationOnce((query, params, callback) => callback(null, {  // recordHeartbeat session lookup
                session_id: 'session1',
                room_id: 'room1',
                expected_intervals: 12,
                start_time: '10:00',
                started_at: '2024-03-12T10:00:00'
            }))
            .mockImplementationOnce((query, params, callback) => callback(null, {
                totalHeartbeats: 1,
                validHeartbeats: 1,
                intervalsPresent: 1
            }));

        mockDB.run
            .mockImplementationOnce((query, params, callback) => callback(null))
            .mockImplementationOnce((query, params, callback) => callback(null));

        validateLocation.mockResolvedValue(true);

        const result = await startAttendanceSession('user1', 'valid-token', 'class1');
        expect(result.message).toBe('Attendance session started successfully');
    });

    it('throws error for invalid session token', async () => {
        validateSessionToken.mockReturnValue({ valid: false });

        await expect(startAttendanceSession('user1', 'invalid-token', 'class1'))
            .rejects.toThrow('Invalid or expired session token');
    });

    it('records heartbeat successfully', async () => {
        mockDB.get
            .mockImplementationOnce((query, params, callback) => callback(null, {
                session_id: 'session1',
                room_id: 'room1',
                expected_intervals: 12
            }))
            .mockImplementationOnce((query, params, callback) => callback(null, {
                totalHeartbeats: 5,
                validHeartbeats: 4,
                intervalsPresent: 3
            }));

        validateLocation.mockResolvedValue(true);
        mockDB.run.mockImplementation((query, params, callback) => callback(null));

        const result = await recordHeartbeat('user1', 'session1', { lat: 40.7, lng: -74.0 });
        expect(result.success).toBe(true);
        expect(result.locationValid).toBe(true);
    });

    it('gets active session with stats', async () => {
        mockDB.get
            .mockImplementationOnce((query, params, callback) => callback(null, { session_id: 'session1' }))
            .mockImplementationOnce((query, params, callback) => callback(null, { totalHeartbeats: 5 }));

        const result = await getActiveSession('user1');
        expect(result.session_id).toBe('session1');
        expect(result.currentStats).toBeDefined();
    });
});