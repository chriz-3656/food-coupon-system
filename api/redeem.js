const { supabase, createResponse, verifyAuth, rateLimit } = require('./_utils');

module.exports = async function handler(req, res) {
    if (req.method !== 'POST') return res.status(405).end();
    if (!rateLimit(req, res, 20, 60000)) return createResponse(res, 429, { success: false, error: { code: 'RATE_LIMIT_EXCEEDED', message: 'Too many requests.' }});

    const auth = verifyAuth(req, 'volunteer');
    if (!auth && !verifyAuth(req, 'admin')) {
        return createResponse(res, 401, { success: false, error: { code: 'UNAUTHORIZED', message: 'Unauthorized.' }});
    }

    const { token, method } = req.body; // method = 'QR' or 'MANUAL'

    if (!token) {
        return createResponse(res, 400, { success: false, error: { code: 'INVALID_INPUT', message: 'Coupon token required for redemption.' }});
    }

    try {
        // Call the PostgreSQL RPC function to perform atomic redemption
        const { data, error } = await supabase.rpc('redeem_coupon', {
            p_coupon_token: token,
            p_volunteer_id: 'volunteer_session', // In a real app, track individual volunteers if they have separate accounts
            p_verification_method: method || 'UNKNOWN',
            p_request_id: null // optional deduplication id
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
