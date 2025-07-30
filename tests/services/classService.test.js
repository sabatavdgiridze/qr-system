const { validateLocation, getCurrentClasses, CLASSROOM_RADIUS } = require('../../src/services/classService');

jest.mock('geolib', () => ({
    getDistance: jest.fn()
}));

jest.mock('../../src/database/init', () => ({
    getDB: jest.fn()
}));

const { getDistance } = require('geolib');
const { getDB } = require('../../src/database/init');

describe('classService', () => {
    let mockDB;

    beforeEach(() => {
        jest.clearAllMocks();
        mockDB = { get: jest.fn(), all: jest.fn() };
        getDB.mockReturnValue(mockDB);
    });

    describe('validateLocation', () => {
        const testCoords = { lat: 40.7128, lng: -74.0060 };

        it('returns true when within radius', async () => {
            mockDB.get.mockImplementation((query, params, callback) => {
                callback(null, { gps_lat: 40.7130, gps_lng: -74.0062 });
            });
            getDistance.mockReturnValue(25);

            const result = await validateLocation(testCoords, 'room1');
            expect(result).toBe(true);
        });

        it('returns false when outside radius', async () => {
            mockDB.get.mockImplementation((query, params, callback) => {
                callback(null, { gps_lat: 40.7150, gps_lng: -74.0080 });
            });
            getDistance.mockReturnValue(50);

            const result = await validateLocation(testCoords, 'room1');
            expect(result).toBe(false);
        });

        it('returns false when classroom not found', async () => {
            mockDB.get.mockImplementation((query, params, callback) => {
                callback(null, null);
            });

            const result = await validateLocation(testCoords, 'room1');
            expect(result).toBe(false);
        });

        it('returns false on database error', async () => {
            mockDB.get.mockImplementation((query, params, callback) => {
                callback(new Error('DB error'), null);
            });

            const result = await validateLocation(testCoords, 'room1');
            expect(result).toBe(false);
        });
    });

    describe('getCurrentClasses', () => {
        beforeEach(() => {
            jest.useFakeTimers();
            jest.setSystemTime(new Date('2024-03-12T10:05:00'));
        });

        afterEach(() => {
            jest.useRealTimers();
        });

        it('returns class starting soon', async () => {
            mockDB.all.mockImplementation((query, params, callback) => {
                callback(null, [{
                    class_id: 'class1',
                    class_name: 'Math',
                    start_time: '10:15',
                    end_time: '11:15',
                    first_name: 'John',
                    last_name: 'Doe'
                }]);
            });

            const result = await getCurrentClasses('room1', 'student1');
            expect(result[0].status).toBe('starting_soon');
        });

        it('returns class in progress', async () => {
            mockDB.all.mockImplementation((query, params, callback) => {
                callback(null, [{
                    class_id: 'class1',
                    class_name: 'Physics',
                    start_time: '10:00',
                    end_time: '11:00',
                    first_name: 'Jane',
                    last_name: 'Smith'
                }]);
            });

            const result = await getCurrentClasses('room1', 'student1');
            expect(result[0].status).toBe('in_progress');
        });

        it('returns empty array when no classes', async () => {
            mockDB.all.mockImplementation((query, params, callback) => {
                callback(null, []);
            });

            const result = await getCurrentClasses('room1', 'student1');
            expect(result).toEqual([]);
        });
    });
});