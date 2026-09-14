const { supabase, createResponse, verifyAuth } = require('./_utils');

export default async function handler(req, res) {
    if (req.method !== 'GET') return res.status(405).end();
    if (!verifyAuth(req, 'admin')) return createResponse(res, 401, { success: false, error: { code: 'UNAUTHORIZED', message: 'Unauthorized' }});

    const { search = '' } = req.query;

    try {
        let query = supabase
            .from('coupons')
            .select(`
                *,
                students (name, student_id)
            `)
            .order('created_at', { ascending: false })
            .limit(100); // Admin dashboard quick list

        if (search) {
            query = query.ilike('coupon_code', `%${search}%`);
        }

        const { data, error } = await query;

        if (error) throw error;

        return createResponse(res, 200, {
            success: true,
            data: data
        });
    } catch (error) {
        console.error('Coupons fetch error:', error);
        return createResponse(res, 500, { success: false, error: { code: 'SERVER_ERROR', message: 'Server error' }});
    }
}
