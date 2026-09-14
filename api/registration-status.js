const { supabase, createResponse, rateLimit } = require('./_utils');

module.exports = async function handler(req, res) {
    if (req.method !== 'GET') return res.status(405).end();
    if (!rateLimit(req, res, 20, 60000)) {
        return createResponse(res, 429, { success: false, error: { code: 'RATE_LIMIT_EXCEEDED', message: 'Too many requests.' }});
    }

    const { phone } = req.query;

    if (!phone) {
        return createResponse(res, 400, { success: false, error: { code: 'INVALID_INPUT', message: 'Mobile number required.' }});
    }

    try {
        const normalizedPhone = phone.trim().replace(/\s+/g, '');
        const { data, error } = await supabase
            .from('students')
            .select('verification_status')
            .eq('phone', normalizedPhone)
            .single();
            
        if (error || !data) {
             return createResponse(res, 404, { success: false, error: { code: 'NOT_FOUND', message: 'Registration not found for this mobile number.' }});
        }

        // If verified, we might want to also tell them if they have a coupon.
        // For simplicity, we just return the status. The frontend can redirect them to /coupon if VERIFIED.
        return createResponse(res, 200, { success: true, data: { status: data.verification_status } });
    } catch (error) {
        console.error('Status check error:', error);
        return createResponse(res, 500, { success: false, error: { code: 'SERVER_ERROR', message: 'Server error' }});
    }
}
