const { supabase, createResponse, verifyAuth } = require('./_utils');

export default async function handler(req, res) {
    if (req.method !== 'GET') return res.status(405).end();
    if (!verifyAuth(req, 'admin')) return createResponse(res, 401, { success: false, error: { code: 'UNAUTHORIZED', message: 'Unauthorized' }});

    try {
        const { data, error } = await supabase
            .from('students')
            .select(`
                name, student_id, department, year, verification_status, created_at, verified_at,
                coupons (coupon_code, status, used_at)
            `)
            .order('created_at', { ascending: false });

        if (error) throw error;

        // Construct CSV
        const headers = ['Name', 'Student ID', 'Department', 'Year', 'Verification Status', 'Coupon Code', 'Coupon Status', 'Created At', 'Verified At', 'Used At'];
        let csvContent = headers.join(',') + '\n';

        data.forEach(st => {
            const row = [
                `"${(st.name || '').replace(/"/g, '""')}"`,
                `"${st.student_id || ''}"`,
                `"${(st.department || '').replace(/"/g, '""')}"`,
                `"${(st.year || '').replace(/"/g, '""')}"`,
                `"${st.verification_status || ''}"`,
                `"${st.coupons && st.coupons[0] ? st.coupons[0].coupon_code : ''}"`,
                `"${st.coupons && st.coupons[0] ? st.coupons[0].status : ''}"`,
                `"${st.created_at || ''}"`,
                `"${st.verified_at || ''}"`,
                `"${st.coupons && st.coupons[0] ? (st.coupons[0].used_at || '') : ''}"`
            ];
            csvContent += row.join(',') + '\n';
        });

        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', 'attachment; filename=event_data_export.csv');
        return res.status(200).send(csvContent);

    } catch (error) {
        console.error('Export error:', error);
        return createResponse(res, 500, { success: false, error: { code: 'SERVER_ERROR', message: 'Server error' }});
    }
}
