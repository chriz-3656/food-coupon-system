const { supabase, createResponse, verifyAuth } = require('./_utils');
const crypto = require('crypto');

function escapeLike(str) {
    return str.replace(/[%_\\]/g, '\\$&');
}

function preventCsvInjection(cell) {
    if (!cell) return '';
    const str = String(cell);
    if (/^[=+\-@]/.test(str)) {
        return "'" + str; // Prefix with quote
    }
    return str;
}

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
    if (!verifyAuth(req, 'admin')) return createResponse(res, 401, { success: false, error: { code: 'UNAUTHORIZED', message: 'Unauthorized' }});

    const action = req.query.action || (req.body && req.body.action);

    try {
        if (req.method === 'GET') {
            if (action === 'stats') {
                const { data, error } = await supabase.rpc('get_dashboard_stats');
                if (error) throw error;

                return createResponse(res, 200, {
                    success: true,
                    data: { 
                        registered: data.total_students, 
                        verified: data.verified_students, 
                        pending: data.pending_students, 
                        active: data.active_coupons, 
                        redeemed: data.used_coupons, 
                        expired: data.expired_coupons || 0, 
                        revoked: data.revoked_coupons || 0 
                    }
                });
            }

            if (action === 'students') {
                const { page = 1, limit = 50, search = '' } = req.query;
                const start = (page - 1) * limit;
                const end = start + parseInt(limit) - 1;

                let query = supabase
                    .from('students')
                    .select(`
                        id, name, student_id, department, verification_status, created_at,
                        coupons (coupon_code, status)
                    `, { count: 'exact' });

                if (search) {
                    const safeSearch = escapeLike(search);
                    query = query.or(`name.ilike.%${safeSearch}%,student_id.ilike.%${safeSearch}%,phone.ilike.%${safeSearch}%`);
                }

                query = query.order('created_at', { ascending: false }).range(start, end);
                const { data, count, error } = await query;
                if (error) throw error;

                return createResponse(res, 200, { success: true, data: { students: data, total: count, page: parseInt(page), limit: parseInt(limit) }});
            }

            if (action === 'export') {
                const { data, error } = await supabase
                    .from('students')
                    .select(`
                        name, student_id, department, year, verification_status, created_at, verified_at,
                        coupons (coupon_code, status, used_at)
                    `)
                    .order('created_at', { ascending: false });

                if (error) throw error;

                const headers = ['Name', 'Student ID', 'Department', 'Year', 'Verification Status', 'Coupon Code', 'Coupon Status', 'Created At', 'Verified At', 'Used At'];
                let csvContent = headers.join(',') + '\n';

                data.forEach(st => {
                    const row = [
                        `"${preventCsvInjection(st.name).replace(/"/g, '""')}"`,
                        `"${preventCsvInjection(st.student_id)}"`,
                        `"${preventCsvInjection(st.department).replace(/"/g, '""')}"`,
                        `"${preventCsvInjection(st.year).replace(/"/g, '""')}"`,
                        `"${preventCsvInjection(st.verification_status)}"`,
                        `"${st.coupons && st.coupons[0] ? preventCsvInjection(st.coupons[0].coupon_code) : ''}"`,
                        `"${st.coupons && st.coupons[0] ? preventCsvInjection(st.coupons[0].status) : ''}"`,
                        `"${st.created_at || ''}"`,
                        `"${st.verified_at || ''}"`,
                        `"${st.coupons && st.coupons[0] ? (st.coupons[0].used_at || '') : ''}"`
                    ];
                    csvContent += row.join(',') + '\n';
                });

                res.setHeader('Content-Type', 'text/csv');
                res.setHeader('Content-Disposition', 'attachment; filename=event_data_export.csv');
                return res.status(200).send(csvContent);
            }
        }

        if (req.method === 'POST') {
            if (action === 'verify' || action === 'reject') {
                const { student_id } = req.body;
                if (!student_id) return createResponse(res, 400, { success: false, error: { code: 'INVALID_INPUT', message: 'Student ID required.' }});

                const { data: student, error: fetchError } = await supabase.from('students').select('*').eq('id', student_id).single();
                if (fetchError || !student) return createResponse(res, 404, { success: false, error: { code: 'NOT_FOUND', message: 'Student not found.' }});

                if (action === 'reject') {
                    await supabase.from('students').update({ verification_status: 'REJECTED' }).eq('id', student_id);
                    return createResponse(res, 200, { success: true, message: 'Student rejected.' });
                }

                if (action === 'verify') {
                    if (student.verification_status === 'VERIFIED') return createResponse(res, 400, { success: false, error: { code: 'ALREADY_VERIFIED', message: 'Already verified.' }});

                    const token = crypto.randomBytes(32).toString('hex');
                    const code = generateCode();

                    const { data: rpcData, error: rpcError } = await supabase.rpc('admin_verify_student', {
                        p_student_id: student_id,
                        p_coupon_code: code,
                        p_coupon_token: token
                    });

                    if (rpcError) {
                        console.error("Admin verify RPC error:", rpcError);
                        throw rpcError;
                    }
                    if (!rpcData.success) {
                        return createResponse(res, 400, { success: false, error: rpcData });
                    }

                    return createResponse(res, 200, { success: true, message: 'Student verified.' });
                }
            }

            if (action === 'revoke') {
                const { coupon_code } = req.body;
                if (!coupon_code) return createResponse(res, 400, { success: false, error: { code: 'INVALID_INPUT', message: 'Coupon code required.' }});

                const { data, error } = await supabase
                    .from('coupons')
                    .update({ status: 'REVOKED' })
                    .eq('coupon_code', coupon_code)
                    .neq('status', 'USED')
                    .select('id')
                    .single();

                if (error) return createResponse(res, 400, { success: false, error: { code: 'REVOKE_FAILED', message: 'Could not revoke.' }});

                await supabase.from('audit_logs').insert([{ action: 'REVOKE_COUPON', entity_type: 'coupons', entity_id: data.id, actor: 'admin' }]);
                return createResponse(res, 200, { success: true, message: 'Coupon revoked.' });
            }
        }

        return createResponse(res, 400, { success: false, error: { code: 'INVALID_ACTION', message: 'Invalid action or method.' }});
    } catch (error) {
        console.error('Admin API error:', error);
        return createResponse(res, 500, { success: false, error: { code: 'SERVER_ERROR', message: 'Server error' }});
    }
}
