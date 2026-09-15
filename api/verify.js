const { supabase, createResponse, verifyAuth, rateLimit } = require('./_utils');

module.exports = async function handler(req, res) {
    if (req.method !== 'POST') return res.status(405).end();
    if (!rateLimit(req, res, 30, 60000)) return createResponse(res, 429, { success: false, error: { code: 'RATE_LIMIT_EXCEEDED', message: 'Too many requests.' }});

    const auth = verifyAuth(req, 'volunteer');
    if (!auth && !verifyAuth(req, 'admin')) { // Admins can also verify
        return createResponse(res, 401, { success: false, error: { code: 'UNAUTHORIZED', message: 'Unauthorized.' }});
    }

    const { token, code } = req.body;

    if (!token && !code) {
        return createResponse(res, 400, { success: false, error: { code: 'INVALID_INPUT', message: 'Coupon token or code required.' }});
    }

    try {
        let query = supabase.from('coupons').select('*, students!inner(*)');
        
        if (token) {
            query = query.eq('coupon_token', token);
        } else {
            query = query.eq('coupon_code', code.toUpperCase());
        }

        const { data, error } = await query.maybeSingle();

        if (error || !data) {
             return createResponse(res, 404, { success: false, error: { code: 'COUPON_NOT_FOUND', message: 'This coupon could not be verified.' }});
        }
        
        let effectiveStatus = data.status;
        if (data.status === 'ACTIVE' && data.expires_at && new Date(data.expires_at) < new Date()) {
            effectiveStatus = 'EXPIRED';
        }

        // Return details for the volunteer to see.
        // Data minimization: Do NOT return the token if they just provided the manual code.
        return createResponse(res, 200, { 
            success: true, 
            data: {
                student_name: data.students.name,
                student_id: data.students.student_id,
                department: data.students.department,
                coupon_code: data.coupon_code,
                coupon_token: token ? data.coupon_token : undefined,
                status: effectiveStatus,
                expires_at: data.expires_at,
                used_at: data.used_at
            }
        });
    } catch (error) {
        console.error('Verify error:', error);
        return createResponse(res, 500, { success: false, error: { code: 'SERVER_ERROR', message: 'Server error' }});
    }
}
