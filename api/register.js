const { supabase, createResponse, rateLimit } = require('./_utils');

export default async function handler(req, res) {
    if (req.method !== 'POST') return res.status(405).end();
    if (!rateLimit(req, res, 10, 60000)) {
        return createResponse(res, 429, { success: false, error: { code: 'RATE_LIMIT_EXCEEDED', message: 'Too many requests. Please try again later.' }});
    }

    const { name, student_id, phone, department, year } = req.body;

    if (!name || !student_id || !department) {
        return createResponse(res, 400, { success: false, error: { code: 'INVALID_INPUT', message: 'Missing required fields.' }});
    }

    const normalizedStudentId = student_id.trim().toLowerCase();

    try {
        // Check if registration is open
        const { data: config, error: configError } = await supabase
            .from('event_config')
            .select('registration_open, registration_closes_at')
            .limit(1)
            .maybeSingle();
        
        if (configError) throw configError;

        if (config && (!config.registration_open || (config.registration_closes_at && new Date(config.registration_closes_at) < new Date()))) {
            return createResponse(res, 403, { success: false, error: { code: 'REGISTRATION_CLOSED', message: 'Registration is currently closed.' }});
        }

        // Insert student
        const { data, error } = await supabase
            .from('students')
            .insert([
                { name: name.trim(), student_id: normalizedStudentId, phone: phone?.trim(), department: department.trim(), year: year?.trim() }
            ])
            .select('id, student_id, verification_status')
            .single();

        if (error) {
            if (error.code === '23505') { // Unique violation
                return createResponse(res, 409, { success: false, error: { code: 'STUDENT_ALREADY_REGISTERED', message: 'A student with this ID is already registered.' }});
            }
            throw error;
        }

        return createResponse(res, 200, { success: true, data: { status: data.verification_status, id: data.id }});

    } catch (error) {
        console.error('Registration error:', error);
        return createResponse(res, 500, { success: false, error: { code: 'SERVER_ERROR', message: 'An internal server error occurred.' }});
    }
}
