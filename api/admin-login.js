const { createResponse, setAuthCookie, rateLimit } = require('./_utils');

module.exports = async function handler(req, res) {
    if (req.method !== 'POST') return res.status(405).end();
    if (!rateLimit(req, res, 5, 60000)) {
        return createResponse(res, 429, { success: false, error: { code: 'RATE_LIMIT_EXCEEDED', message: 'Too many attempts.' }});
    }

    const { username, password } = req.body;

    if (!username || !password) {
        return createResponse(res, 400, { success: false, error: { code: 'INVALID_INPUT', message: 'Credentials required.' }});
    }

    const correctUsername = process.env.ADMIN_USERNAME;
    const correctPassword = process.env.ADMIN_PASSWORD;

    if (username === correctUsername && password === correctPassword) {
        setAuthCookie(res, { role: 'admin' });
        return createResponse(res, 200, { success: true, message: 'Logged in successfully.' });
    } else {
        return createResponse(res, 401, { success: false, error: { code: 'UNAUTHORIZED', message: 'Invalid credentials.' }});
    }
}
