const Joi = require('joi');

const validateSchema = (schema) => {
    return (req, res, next) => {
        const { error } = schema.validate(req.body);
        if (error) {
            return res.status(400).json({
                error: 'Validation error',
                details: error.details.map(d => d.message)
            });
        }
        next();
    };
};

const schemas = {
    login: Joi.object({
        email: Joi.string().email().required(),
        password: Joi.string().min(6).required()
    }),

    scanQR: Joi.object({
        qrCode: Joi.string().required(),
        gpsCoords: Joi.object({
            lat: Joi.number().min(-90).max(90).required(),
            lng: Joi.number().min(-180).max(180).required()
        }).required()
    }),

    startAttendance: Joi.object({
        sessionToken: Joi.string().required(),
        classId: Joi.string().required()
    }),

    heartbeat: Joi.object({
        sessionId: Joi.string().required(),
        gpsCoords: Joi.object({
            lat: Joi.number().min(-90).max(90).required(),
            lng: Joi.number().min(-180).max(180).required()
        }).required()
    })
};

module.exports = { validateSchema, schemas };