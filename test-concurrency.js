const fetch = require('node-fetch');

const API_URL = 'http://localhost:3000'; // Change to Vercel URL if testing prod

async function runConcurrencyTest(token) {
    console.log(`Starting concurrency test for token: ${token}`);
    
    // Create 20 simultaneous requests
    const promises = [];
    for (let i = 0; i < 20; i++) {
        promises.push(
            fetch(`${API_URL}/api/redeem`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ token: token, method: 'QR' })
            }).then(res => res.json())
        );
    }
    
    const results = await Promise.all(promises);
    
    let successCount = 0;
    let usedCount = 0;
    
    results.forEach(r => {
        if (r.success) successCount++;
        else if (r.error && r.error.code === 'COUPON_ALREADY_USED') usedCount++;
    });
    
    console.log(`Test Complete.`);
    console.log(`Successful redemptions: ${successCount} (Expected: 1)`);
    console.log(`Already used errors: ${usedCount} (Expected: 19)`);
    
    if (successCount === 1 && usedCount === 19) {
        console.log('✅ CONCURRENCY TEST PASSED: Atomic locking is working correctly.');
    } else {
        console.log('❌ CONCURRENCY TEST FAILED: Race condition detected.');
    }
}

// Usage: node test-concurrency.js <token>
if (process.argv[2]) {
    runConcurrencyTest(process.argv[2]);
} else {
    console.log('Please provide a coupon token. Example: node test-concurrency.js <token>');
}
