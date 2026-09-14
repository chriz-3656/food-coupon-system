const { supabase, createResponse, verifyAuth } = require('./_utils');
const crypto = require('crypto');

function generateCode() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // excluding ambiguous chars
    let code = '';
    for (let i=0; i<8; i++) {
        if (i===4) code += '-';
        code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return code;
}

export default async function handler(req, res) {
    if (req.method !== 'POST') return res.status(405).end();
    if (!verifyAuth(req, 'admin')) return createResponse(res, 401, { success: false, error: { code: 'UNAUTHORIZED', message: 'Unauthorized' }});

    const { student_id, action } = req.body; // action = 'verify' or 'reject'

    if (!student_id || !action) {
        return createResponse(res, 400, { success: false, error: { code: 'INVALID_INPUT', message: 'Student ID and action required.' }});
    }

    try {
        // Find student
        const { data: student, error: fetchError } = await supabase.from('students').select('*').eq('id', student_id).single();
        if (fetchError || !student) return createResponse(res, 404, { success: false, error: { code: 'NOT_FOUND', message: 'Student not found.' }});

        if (action === 'reject') {
            await supabase.from('students').update({ verification_status: 'REJECTED' }).eq('id', student_id);
            return createResponse(res, 200, { success: true, message: 'Student rejected.' });
        }

        if (action === 'verify') {
            if (student.verification_status === 'VERIFIED') {
                 return createResponse(res, 400, { success: false, error: { code: 'ALREADY_VERIFIED', message: 'Student already verified.' }});
            }

            // Generate secure token and human code
            const token = crypto.randomBytes(32).toString('hex');
            const code = generateCode();

            // Create coupon
            const { error: insertError } = await supabase.from('coupons').insert([{
                student_id: student.id,
                coupon_code: code,
                coupon_token: token,
                status: 'ACTIVE'
            }]);

            if (insertError) {
                if (insertError.code === '23505') {
                     // Somehow a coupon already exists
                     return createResponse(res, 409, { success: false, error: { code: 'COUPON_EXISTS', message: 'Coupon already exists for student.' }});
                }
                throw insertError;
            }

            // Update student status
            await supabase.from('students').update({ verification_status: 'VERIFIED', verified_at: new Date().toISOString(), verified_by: 'admin' }).eq('id', student_id);

            return createResponse(res, 200, { success: true, message: 'Student verified and coupon generated.' });
        }
        
        return createResponse(res, 400, { success: false, error: { code: 'INVALID_ACTION', message: 'Invalid action.' }});

    } catch (error) {
        console.error('Verify error:', error);
        return createResponse(res, 500, { success: false, error: { code: 'SERVER_ERROR', message: 'Server error' }});
    }
}
