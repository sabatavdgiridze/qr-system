const { generateQRCode, validateQRCode, generateSessionToken, validateSessionToken } = require('../../src/services/qrService');

jest.mock('../../src/middleware/auth', () => ({
    JWT_SECRET: 'test-jwt-secret'
}));

jest.mock('../../src/database/init', () => ({
    getDB: jest.fn()
}));

jest.mock('node-cron', () => ({
    schedule: jest.fn()
}));

describe('qrService', () => {
    const originalEnv = process.env;

    beforeEach(() => {
        jest.clearAllMocks();
        process.env = { ...originalEnv, QR_SECRET: 'test-qr-secret' };
        jest.useFakeTimers();
        jest.setSystemTime(new Date('2024-03-12T10:00:00'));
    });

    afterEach(() => {
        process.env = originalEnv;
        jest.useRealTimers();
    });

    describe('generateQRCode', () => {
        it('generates valid QR code format', () => {
            const result = generateQRCode('room123');
            const parts = result.split('_');

            expect(parts).toHaveLength(3);
            expect(parts[0]).toBe('room123');
            expect(parts[1]).toMatch(/^\d+$/);
            expect(parts[2]).toHaveLength(64);
        });

        it('generates different codes for different rooms', () => {
            const code1 = generateQRCode('room1');
            const code2 = generateQRCode('room2');

            expect(code1).not.toBe(code2);
        });
    });

    describe('validateQRCode', () => {
        it('validates current time block QR code', () => {
            const qrCode = generateQRCode('room123');
            const result = validateQRCode(qrCode);

            expect(result.valid).toBe(true);
            expect(result.roomId).toBe('room123');
        });

        it('validates previous time block QR code', () => {
            const qrCode = generateQRCode('room123');
            jest.advanceTimersByTime(10 * 60 * 1000); // 10 minutes later

            const result = validateQRCode(qrCode);
            expect(result.valid).toBe(true);
        });

        it('rejects expired QR code', () => {
            const qrCode = generateQRCode('room123');
            jest.advanceTimersByTime(21 * 60 * 1000); // 21 minutes later

            const result = validateQRCode(qrCode);
            expect(result.valid).toBe(false);
            expect(result.reason).toBe('expired');
        });

        it('rejects invalid format', () => {
            const result = validateQRCode('invalid_format');
            expect(result.valid).toBe(false);
            expect(result.reason).toBe('invalid_format');
        });

        it('rejects tampered QR code', () => {
            const qrCode = generateQRCode('room123');
            const tamperedCode = qrCode.replace('room123', 'room456');

            const result = validateQRCode(tamperedCode);
            expect(result.valid).toBe(false);
            expect(result.reason).toBe('invalid_signature');
        });

    });

    describe('generateSessionToken', () => {
        it('generates valid JWT token', () => {
            const token = generateSessionToken('user1', 'room1', { lat: 40.7, lng: -74.0 });
            expect(typeof token).toBe('string');
            expect(token.split('.')).toHaveLength(3);
        });

        it('includes correct payload data', () => {
            const jwt = require('jsonwebtoken');
            const token = generateSessionToken('user1', 'room1', { lat: 40.7, lng: -74.0 });
            const decoded = jwt.verify(token, 'test-jwt-secret');

            expect(decoded.userId).toBe('user1');
            expect(decoded.roomId).toBe('room1');
            expect(decoded.gpsCoords).toEqual({ lat: 40.7, lng: -74.0 });
            expect(decoded.nonce).toBeDefined();
        });
    });

    describe('validateSessionToken', () => {
        it('validates valid token', () => {
            const token = generateSessionToken('user1', 'room1', { lat: 40.7, lng: -74.0 });
            const result = validateSessionToken(token);

            expect(result.valid).toBe(true);
            expect(result.data.userId).toBe('user1');
        });

        it('rejects expired token', () => {
            const token = generateSessionToken('user1', 'room1', { lat: 40.7, lng: -74.0 });
            jest.advanceTimersByTime(6 * 60 * 1000); // 6 minutes later

            const result = validateSessionToken(token);
            expect(result.valid).toBe(false);
        });

        it('rejects invalid token', () => {
            const result = validateSessionToken('invalid.token.here');
            expect(result.valid).toBe(false);
            expect(result.reason).toBeDefined();
        });

        it('rejects tampered token', () => {
            const token = generateSessionToken('user1', 'room1', { lat: 40.7, lng: -74.0 });
            const tamperedToken = token.slice(0, -5) + 'xxxxx';

            const result = validateSessionToken(tamperedToken);
            expect(result.valid).toBe(false);
        });
    });
});