const { createClient } = require('@supabase/supabase-js');

// This test requires a real Supabase database connection.
// It tests the atomic redemption logic by firing multiple simultaneous requests.
// Ensure SUPABASE_URL and SUPABASE_SECRET_KEY are set in your environment.

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SECRET_KEY;

if (!supabaseUrl || !supabaseKey) {
    console.error("Skipping concurrency test: Missing SUPABASE_URL or SUPABASE_SECRET_KEY in environment.");
    process.exit(0);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function runConcurrencyTest() {
    console.log("Starting Concurrency Test...");

    // 1. Create a dummy student and coupon for testing
    const studentId = 'TEST-' + Date.now();
    const token = 'TOKEN-' + Date.now();

    const { data: student, error: sErr } = await supabase.from('students').insert([{
        name: 'Concurrency Test User',
        student_id: studentId,
        verification_status: 'VERIFIED'
    }]).select('id').single();

    if (sErr) throw sErr;

    const { data: coupon, error: cErr } = await supabase.from('coupons').insert([{
        student_id: student.id,
        coupon_code: 'TEST-CODE',
        coupon_token: token,
        status: 'ACTIVE'
    }]).select('id').single();

    if (cErr) throw cErr;

    console.log("Created test coupon with token:", token);

    // 2. Fire 20 concurrent redemption requests
    const CONCURRENT_REQUESTS = 20;
    const promises = [];

    console.log(`Firing ${CONCURRENT_REQUESTS} simultaneous redemption requests...`);
    for (let i = 0; i < CONCURRENT_REQUESTS; i++) {
        // We call the RPC directly to test the database-level atomic lock
        promises.push(
            supabase.rpc('redeem_coupon', {
                p_coupon_token: token,
                p_volunteer_id: `volunteer_${i}`,
                p_verification_method: 'TEST'
            })
        );
    }

    const results = await Promise.all(promises);

    // 3. Analyze results
    let successCount = 0;
    let alreadyUsedCount = 0;
    let otherErrors = 0;

    results.forEach(res => {
        if (res.error) {
            console.error("RPC execution error:", res.error);
            otherErrors++;
        } else if (res.data.success === true) {
            successCount++;
        } else if (res.data.code === 'COUPON_ALREADY_USED') {
            alreadyUsedCount++;
        } else {
            otherErrors++;
            console.log("Other failure:", res.data);
        }
    });

    console.log("--- Test Results ---");
    console.log(`Total Requests: ${CONCURRENT_REQUESTS}`);
    console.log(`Success (Redeemed): ${successCount}`);
    console.log(`Failed (Already Used): ${alreadyUsedCount}`);
    console.log(`Other Errors: ${otherErrors}`);

    // 4. Assertions
    let passed = true;
    if (successCount !== 1) {
        console.error(`❌ FAILED: Expected exactly 1 success, got ${successCount}`);
        passed = false;
    }
    if (alreadyUsedCount !== (CONCURRENT_REQUESTS - 1)) {
        console.error(`❌ FAILED: Expected exactly ${CONCURRENT_REQUESTS - 1} already used errors, got ${alreadyUsedCount}`);
        passed = false;
    }

    // 5. Verify database state
    const { data: finalCoupon } = await supabase.from('coupons').select('status, used_by').eq('id', coupon.id).single();
    const { data: redemptions } = await supabase.from('redemptions').select('id').eq('coupon_id', coupon.id);

    console.log("Final Coupon Status in DB:", finalCoupon.status);
    console.log("Total Redemption Records in DB:", redemptions.length);

    if (redemptions.length !== 1) {
        console.error(`❌ FAILED: Expected exactly 1 redemption record, got ${redemptions.length}`);
        passed = false;
    }

    if (passed) {
        console.log("✅ CONCURRENCY TEST PASSED! Atomic redemption works perfectly.");
    }

    // Cleanup
    await supabase.from('students').delete().eq('id', student.id);
    
    process.exit(passed ? 0 : 1);
}

runConcurrencyTest().catch(err => {
    console.error("Test execution failed:", err);
    process.exit(1);
});
