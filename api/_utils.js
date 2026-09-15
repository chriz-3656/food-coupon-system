const { createClient } = require('@supabase/supabase-js');
const jwt = require('jsonwebtoken');
const cookie = require('cookie');

function requireEnv(name) {
    const val = process.env[name];
    if (!val) {
        console.error(`CRITICAL: Missing environment variable ${name}`);
        throw new Error(`Server configuration error: ${name} is missing.`);
    }
    return val;
}

const SUPABASE_URL = requireEnv('SUPABASE_URL');
const SUPABASE_SECRET_KEY = requireEnv('SUPABASE_SECRET_KEY'); // Use service_role key to bypass RLS in the API layer
const SESSION_SECRET = requireEnv('SESSION_SECRET');

const supabase = createClient(SUPABASE_URL, SUPABASE_SECRET_KEY, {
    auth: { persistSession: false }
});


function createResponse(res, status, data) {
    res.status(status).json(data);
}

function verifyAuth(req, expectedRole) {
    const cookies = cookie.parse(req.headers.cookie || '');
    const token = cookies.auth_token;

    if (!token) {
        return null;
    }

    try {
        const decoded = jwt.verify(token, SESSION_SECRET);
        if (expectedRole && decoded.role !== expectedRole) {
            return null;
        }
        return decoded;
    } catch (error) {
        return null;
    }
}

function setAuthCookie(res, payload) {
    const token = jwt.sign(payload, SESSION_SECRET, { expiresIn: '12h' });
    const serializedCookie = cookie.serialize('auth_token', token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict',
        maxAge: 60 * 60 * 12, // 12 hours
        path: '/'
    });
    res.setHeader('Set-Cookie', serializedCookie);
}

function clearAuthCookie(res) {
    const serializedCookie = cookie.serialize('auth_token', '', {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict',
        maxAge: -1,
        path: '/'
    });
    res.setHeader('Set-Cookie', serializedCookie);
}

// Simple in-memory rate limiter (Warning: resets on Serverless cold start, but better than nothing)
const rateLimits = new Map();
function rateLimit(req, res, maxRequests = parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || '50'), windowMs = parseInt(process.env.RATE_LIMIT_WINDOW_MS || '60000')) {
    let ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown';
    if (typeof ip === 'string' && ip.includes(',')) {
        ip = ip.split(',')[0].trim();
    }
    
    const now = Date.now();
    
    if (!rateLimits.has(ip)) {
        rateLimits.set(ip, { count: 1, resetTime: now + windowMs });
        return true;
    }

    const limitInfo = rateLimits.get(ip);
    
    if (now > limitInfo.resetTime) {
        limitInfo.count = 1;
        limitInfo.resetTime = now + windowMs;
        return true;
    }

    if (limitInfo.count >= maxRequests) {
        return false;
    }

    limitInfo.count++;
    return true;
}

module.exports = {
    supabase,
    createResponse,
    verifyAuth,
    setAuthCookie,
    clearAuthCookie,
    rateLimit
};
module.exports.SESSION_SECRET = SESSION_SECRET;
