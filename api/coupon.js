const { supabase, createResponse, rateLimit } = require('./_utils');
const cookie = require('cookie');
const jwt = require('jsonwebtoken');

module.exports = async function handler(req, res) {
    if (req.method !== 'GET') return res.status(405).end();
    if (!rateLimit(req, res, 20, 60000)) return createResponse(res, 429, { success: false, error: { code: 'RATE_LIMIT_EXCEEDED', message: 'Too many requests.' }});

    const cookies = cookie.parse(req.headers.cookie || '');
    const sessionToken = cookies.student_session;

    if (!sessionToken) {
        return createResponse(res, 401, { success: false, error: { code: 'UNAUTHORIZED', message: 'No valid session. Please register or ask a volunteer.' }});
    }

    let studentId;
    try {
        const decoded = jwt.verify(sessionToken, process.env.SESSION_SECRET || 'fallback');
        studentId = decoded.student_id;
    } catch (err) {
        return createResponse(res, 401, { success: false, error: { code: 'UNAUTHORIZED', message: 'Invalid session.' }});
    }

    try {
        const { data, error } = await supabase
            .from('coupons')
            .select(`
                coupon_code,
                coupon_token,
                status,
                expires_at,
                students!inner (name, student_id)
            `)
            .eq('student_id', studentId)
            .maybeSingle();
            
        if (error || !data) {
             return createResponse(res, 404, { success: false, error: { code: 'NOT_FOUND', message: 'Coupon not found or not yet generated.' }});
        }
        
        let effectiveStatus = data.status;
        if (data.status === 'ACTIVE' && data.expires_at && new Date(data.expires_at) < new Date()) {
            effectiveStatus = 'EXPIRED';
        }

        return createResponse(res, 200, { 
            success: true, 
            data: {
                student_name: data.students.name,
                student_id: data.students.student_id,
                coupon_code: data.coupon_code,
                coupon_token: data.coupon_token,
                status: effectiveStatus,
                expires_at: data.expires_at,
                event_name: 'Food Distribution Event'
            } 
        });
    } catch (error) {
        console.error('Coupon fetch error:', error);
        return createResponse(res, 500, { success: false, error: { code: 'SERVER_ERROR', message: 'Server error' }});
    }
}
