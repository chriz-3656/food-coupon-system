const { supabase, createResponse, verifyAuth, rateLimit } = require('./_utils');

module.exports = async function handler(req, res) {
    if (req.method !== 'POST') return res.status(405).end();
    if (!rateLimit(req, res, 20, 60000)) return createResponse(res, 429, { success: false, error: { code: 'RATE_LIMIT_EXCEEDED', message: 'Too many requests.' }});

    const auth = verifyAuth(req, 'volunteer');
    if (!auth && !verifyAuth(req, 'admin')) {
        return createResponse(res, 401, { success: false, error: { code: 'UNAUTHORIZED', message: 'Unauthorized.' }});
    }

    const { token, code, method } = req.body; // method = 'QR' or 'MANUAL'

    if (!token && !code) {
        return createResponse(res, 400, { success: false, error: { code: 'INVALID_INPUT', message: 'Coupon token or code required for redemption.' }});
    }

    const volunteerId = auth ? auth.volunteer_id : 'admin';

    try {
        // Call the PostgreSQL RPC function to perform atomic redemption
        const { data, error } = await supabase.rpc('redeem_coupon', {
            p_coupon_token: token || null,
            p_coupon_code: code || null,
            p_volunteer_id: volunteerId || 'unknown',
            p_verification_method: method || 'UNKNOWN',
            p_request_id: null
        });

        if (error) {
            console.error('RPC Error:', error);
            return createResponse(res, 500, { success: false, error: { code: 'SERVER_ERROR', message: 'Redemption failed due to a server error.' }});
        }

        // The RPC returns a JSONB object with success/code/message
        if (!data.success) {
            return createResponse(res, 400, { success: false, error: data });
        }

        return createResponse(res, 200, data);

    } catch (error) {
        console.error('Redeem error:', error);
        return createResponse(res, 500, { success: false, error: { code: 'SERVER_ERROR', message: 'Server error' }});
    }
}
