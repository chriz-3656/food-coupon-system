const { supabase, createResponse, verifyAuth } = require('./_utils');

module.exports = async function handler(req, res) {
    if (req.method !== 'GET') return res.status(405).end();
    if (!verifyAuth(req, 'admin')) return createResponse(res, 401, { success: false, error: { code: 'UNAUTHORIZED', message: 'Unauthorized' }});

    try {
        const { data: students, error: sError } = await supabase.from('students').select('verification_status');
        const { data: coupons, error: cError } = await supabase.from('coupons').select('status');
        
        if (sError || cError) throw sError || cError;

        let registered = students.length;
        let verified = students.filter(s => s.verification_status === 'VERIFIED').length;
        let pending = students.filter(s => s.verification_status === 'PENDING').length;
        
        let active = coupons.filter(c => c.status === 'ACTIVE').length;
        let redeemed = coupons.filter(c => c.status === 'USED').length;
        let expired = coupons.filter(c => c.status === 'EXPIRED').length;
        let revoked = coupons.filter(c => c.status === 'REVOKED').length;

        return createResponse(res, 200, {
            success: true,
            data: {
                registered, verified, pending,
                active, redeemed, expired, revoked
            }
        });
    } catch (error) {
        console.error('Stats error:', error);
        return createResponse(res, 500, { success: false, error: { code: 'SERVER_ERROR', message: 'Server error' }});
    }
}
