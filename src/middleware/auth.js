const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'jwt-key';

const authenticateToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
        return res.status(401).json({ error: 'Access token required' });
    }

    jwt.verify(token, JWT_SECRET, (err, user) => {
        if (err) {
            return res.status(403).json({ error: 'Invalid or expired token' });
        }
        req.user = user;
        next();
    });
};

const requireRole = (role) => {
    return (req, res, next) => {
        if (req.user.role !== role) {
            return res.status(403).json({ error: `${role} access required` });
        }
        next();
    };
};

const generateToken = (user) => {
    return jwt.sign(
        {
            userId: user.user_id,
            email: user.email,
            role: user.role
        },
        JWT_SECRET,
        { expiresIn: '12h' }
    );
};

module.exports = { authenticateToken, requireRole, generateToken, JWT_SECRET };