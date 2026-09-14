const { supabase, createResponse, rateLimit } = require('./_utils');

module.exports = async function handler(req, res) {
    if (req.method !== 'GET') return res.status(405).end();
    if (!rateLimit(req, res, 20, 60000)) return createResponse(res, 429, { success: false, error: { code: 'RATE_LIMIT_EXCEEDED', message: 'Too many requests.' }});

    const { id } = req.query; // This is the student's UUID, stored in their localStorage

    if (!id) {
        return createResponse(res, 400, { success: false, error: { code: 'INVALID_INPUT', message: 'Access ID required.' }});
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
            .eq('student_id', id)
            .maybeSingle();
            
        if (error || !data) {
             return createResponse(res, 404, { success: false, error: { code: 'NOT_FOUND', message: 'Coupon not found or not yet generated.' }});
        }

        return createResponse(res, 200, { 
            success: true, 
            data: {
                student_name: data.students.name,
                student_id: data.students.student_id,
                coupon_code: data.coupon_code,
                coupon_token: data.coupon_token,
                status: data.status,
                expires_at: data.expires_at,
                event_name: process.env.EVENT_NAME || 'Food Distribution Event'
            } 
        });
    } catch (error) {
        console.error('Coupon fetch error:', error);
        return createResponse(res, 500, { success: false, error: { code: 'SERVER_ERROR', message: 'Server error' }});
    }
}
