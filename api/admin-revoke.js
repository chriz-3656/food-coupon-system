const { supabase, createResponse, verifyAuth } = require('./_utils');

export default async function handler(req, res) {
    if (req.method !== 'POST') return res.status(405).end();
    if (!verifyAuth(req, 'admin')) return createResponse(res, 401, { success: false, error: { code: 'UNAUTHORIZED', message: 'Unauthorized' }});

    const { coupon_code } = req.body;

    if (!coupon_code) {
        return createResponse(res, 400, { success: false, error: { code: 'INVALID_INPUT', message: 'Coupon code required.' }});
    }

    try {
        const { data, error } = await supabase
            .from('coupons')
            .update({ status: 'REVOKED' })
            .eq('coupon_code', coupon_code)
            .neq('status', 'USED') // Don't revoke already used coupons easily
            .select('id')
            .single();

        if (error) {
            return createResponse(res, 400, { success: false, error: { code: 'REVOKE_FAILED', message: 'Could not revoke coupon (it may not exist or is already USED).' }});
        }

        await supabase.from('audit_logs').insert([{
            action: 'REVOKE_COUPON',
            entity_type: 'coupons',
            entity_id: data.id,
            actor: 'admin'
        }]);

        return createResponse(res, 200, { success: true, message: 'Coupon revoked successfully.' });

    } catch (error) {
        console.error('Revoke error:', error);
        return createResponse(res, 500, { success: false, error: { code: 'SERVER_ERROR', message: 'Server error' }});
    }
}
