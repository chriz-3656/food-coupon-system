const { supabase, createResponse, rateLimit } = require('./_utils');
const cookie = require('cookie');
const jwt = require('jsonwebtoken');

module.exports = async function handler(req, res) {
    if (req.method !== 'POST') return res.status(405).end();
    if (!rateLimit(req, res, 20, 60000)) {
        return createResponse(res, 429, { success: false, error: { code: 'RATE_LIMIT_EXCEEDED', message: 'Too many requests.' }});
    }

    const { phone, student_id } = req.body;

    if (!phone || !student_id) {
        return createResponse(res, 400, { success: false, error: { code: 'INVALID_INPUT', message: 'Mobile number and Roll No required.' }});
    }

    try {
        const normalizedPhone = phone.trim().replace(/\s+/g, '');
        const { data, error } = await supabase
            .from('students')
            .select('id, verification_status')
            .eq('phone', normalizedPhone)
            .eq('student_id', student_id.trim())
            .single();
            
        if (error || !data) {
             return createResponse(res, 404, { success: false, error: { code: 'NOT_FOUND', message: 'No registration found matching this Mobile No and Roll No.' }});
        }

        if (data.verification_status !== 'VERIFIED') {
             return createResponse(res, 200, { success: true, data: { status: data.verification_status, redirect: false } });
        }

        // Student is verified, likely has a coupon. Set session cookie so they can retrieve it.
        const sessionToken = jwt.sign(
            { student_id: data.id, role: 'student' },
            require('./_utils').SESSION_SECRET,
            { expiresIn: '7d' }
        );

        res.setHeader('Set-Cookie', cookie.serialize('student_session', sessionToken, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'strict',
            maxAge: 60 * 60 * 24 * 7,
            path: '/'
        }));

        return createResponse(res, 200, { success: true, data: { status: 'VERIFIED', redirect: true } });
    } catch (error) {
        console.error('Status check error:', error);
        return createResponse(res, 500, { success: false, error: { code: 'SERVER_ERROR', message: 'Server error' }});
    }
}
