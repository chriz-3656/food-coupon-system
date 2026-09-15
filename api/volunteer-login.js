const { createResponse, setAuthCookie, rateLimit } = require('./_utils');

module.exports = async function handler(req, res) {
    if (req.method !== 'POST') return res.status(405).end();
    if (!rateLimit(req, res, 10, 60000)) {
        return createResponse(res, 429, { success: false, error: { code: 'RATE_LIMIT_EXCEEDED', message: 'Too many attempts.' }});
    }

    const { volunteer_id, password } = req.body;

    if (!volunteer_id || typeof volunteer_id !== 'string' || volunteer_id.length > 50) {
        return createResponse(res, 400, { success: false, error: { code: 'INVALID_INPUT', message: 'Valid Volunteer ID required.' }});
    }

    if (!password) {
        return createResponse(res, 400, { success: false, error: { code: 'INVALID_INPUT', message: 'Password required.' }});
    }

    const correctPassword = process.env.VOLUNTEER_PASSWORD;

    if (password === correctPassword) {
        setAuthCookie(res, { role: 'volunteer', volunteer_id: volunteer_id.trim() });
        return createResponse(res, 200, { success: true, message: 'Logged in successfully.' });
    } else {
        return createResponse(res, 401, { success: false, error: { code: 'UNAUTHORIZED', message: 'Invalid password.' }});
    }
}
