const { supabase, createResponse, rateLimit } = require('./_utils');
const crypto = require('crypto');

function generateCode() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let code = '';
    for (let i=0; i<8; i++) {
        if (i===4) code += '-';
        code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return code;
}

module.exports = async function handler(req, res) {
    if (req.method !== 'POST') return res.status(405).end();
    
    // Strict rate limit for registration (e.g. 5 per minute)
    if (!rateLimit(req, res, 5, 60000)) {
        return createResponse(res, 429, { success: false, error: { code: 'RATE_LIMIT_EXCEEDED', message: 'Too many requests. Please try again later.' }});
    }

    let { name, student_id, phone, department, year } = req.body;

    // Strict validation
    if (!name || typeof name !== 'string' || name.length > 100) {
        return createResponse(res, 400, { success: false, error: { code: 'INVALID_INPUT', message: 'Valid name is required.' }});
    }
    if (!student_id || typeof student_id !== 'string' || student_id.length > 50) {
        return createResponse(res, 400, { success: false, error: { code: 'INVALID_INPUT', message: 'Valid Roll No is required.' }});
    }
    if (!phone || typeof phone !== 'string' || phone.replace(/\s+/g, '').length < 7 || phone.length > 20) {
        return createResponse(res, 400, { success: false, error: { code: 'INVALID_INPUT', message: 'Valid Mobile number is required.' }});
    }
    if (!department || typeof department !== 'string' || department.length > 100) {
        return createResponse(res, 400, { success: false, error: { code: 'INVALID_INPUT', message: 'Valid department is required.' }});
    }

    const normalizedStudentId = student_id.trim().toLowerCase();
    const normalizedPhone = phone.trim().replace(/\s+/g, '');

    try {
        const token = crypto.randomBytes(32).toString('hex');
        const code = generateCode();

        const { data, error } = await supabase.rpc('register_student_and_coupon', {
            p_name: name.trim(),
            p_student_id: normalizedStudentId,
            p_phone: normalizedPhone,
            p_department: department.trim(),
            p_year: year ? String(year).trim() : null,
            p_coupon_code: code,
            p_coupon_token: token
        });

        if (error) {
            console.error('RPC Error:', error);
            return createResponse(res, 500, { success: false, error: { code: 'SERVER_ERROR', message: 'An internal server error occurred.' }});
        }

        if (!data.success) {
            if (data.code === 'STUDENT_ALREADY_REGISTERED') {
                return createResponse(res, 409, { success: false, error: { code: 'STUDENT_ALREADY_REGISTERED', message: 'A student with this Mobile Number is already registered.' }});
            }
            if (data.code === 'REGISTRATION_CLOSED') {
                return createResponse(res, 403, { success: false, error: { code: 'REGISTRATION_CLOSED', message: 'Registration is currently closed.' }});
            }
            return createResponse(res, 400, { success: false, error: { code: data.code, message: 'Registration failed.' }});
        }

        // Return a secure HTTP-only cookie containing the token so the frontend doesn't need it in localstorage.
        // Wait, localstorage uses student_uuid. If we change it, we have to change the frontend.
        // Finding 6 says: "Separate student database ID from coupon access credential... The token must be generated server-side. Do not expose database primary keys unnecessarily."
        // We will return a JWT that the frontend can store in localStorage to authenticate the coupon request, or just set an HttpOnly cookie!
        // But the frontend is currently reading UUID from localstorage: `localStorage.getItem('student_uuid')`.
        // Let's issue a secure cookie, and the frontend just fetches `/api/coupon` without `?id=UUID`.

        const jwt = require('jsonwebtoken');
        const cookie = require('cookie');
        const SESSION_SECRET = require('./_utils').SESSION_SECRET;
        const sessionToken = jwt.sign({ student_id: data.student_uuid }, SESSION_SECRET, { expiresIn: '7d' });
        
        res.setHeader('Set-Cookie', cookie.serialize('student_session', sessionToken, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'strict',
            maxAge: 60 * 60 * 24 * 7,
            path: '/'
        }));

        return createResponse(res, 200, { success: true, data: { status: 'VERIFIED' }}); // no need to return ID

    } catch (error) {
        console.error('Registration error:', error);
        return createResponse(res, 500, { success: false, error: { code: 'SERVER_ERROR', message: 'An internal server error occurred.' }});
    }
}
