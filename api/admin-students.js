const { supabase, createResponse, verifyAuth } = require('./_utils');

module.exports = async function handler(req, res) {
    if (req.method !== 'GET') return res.status(405).end();
    if (!verifyAuth(req, 'admin')) return createResponse(res, 401, { success: false, error: { code: 'UNAUTHORIZED', message: 'Unauthorized' }});

    const { page = 1, limit = 50, search = '' } = req.query;
    const start = (page - 1) * limit;
    const end = start + parseInt(limit) - 1;

    try {
        let query = supabase
            .from('students')
            .select(`
                id, name, student_id, department, verification_status, created_at,
                coupons (coupon_code, status)
            `, { count: 'exact' });

        if (search) {
            query = query.or(`name.ilike.%${search}%,student_id.ilike.%${search}%`);
        }

        query = query.order('created_at', { ascending: false }).range(start, end);

        const { data, count, error } = await query;

        if (error) throw error;

        return createResponse(res, 200, {
            success: true,
            data: {
                students: data,
                total: count,
                page: parseInt(page),
                limit: parseInt(limit)
            }
        });
    } catch (error) {
        console.error('Students fetch error:', error);
        return createResponse(res, 500, { success: false, error: { code: 'SERVER_ERROR', message: 'Server error' }});
    }
}
