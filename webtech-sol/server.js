require('dotenv').config();

const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const { createHash, randomBytes, timingSafeEqual } = require('node:crypto');
const { Pool } = require('pg');

const PORT = Number(process.env.PORT) || 3000;
const MAX_BODY_BYTES = 10 * 1024;
const RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000;
const RATE_LIMIT_MAX = 5;
const RATE_LIMITS = new Map();
const LOGIN_RATE_LIMITS = new Map();
const ADMIN_SESSIONS = new Map();
const SESSION_COOKIE = process.env.NODE_ENV === 'production' ? '__Host-wts_admin' : 'wts_admin';
const SESSION_DURATION_MS = 8 * 60 * 60 * 1000;
const ALLOWED_PROJECT_TYPES = new Set(['Website', 'E-commerce', 'Landing Page', 'Web App', 'Other']);
const ALLOWED_BUDGETS = new Set([
  'Below ₹10,000',
  '₹10,000 - ₹25,000',
  '₹25,000 - ₹50,000',
  '₹50,000 - ₹1,00,000',
  '₹1,00,000+'
]);
const STATIC_FILES = new Map([
  ['/', 'index.html'],
  ['/index.html', 'index.html'],
  ['/styles.css', 'styles.css'],
  ['/script.js', 'script.js'],
  ['/bipin-khatri.jpeg', 'bipin-khatri.jpeg'],
  ['/admin', 'admin.html'],
  ['/admin/', 'admin.html'],
  ['/admin.html', 'admin.html'],
  ['/admin.css', 'admin.css'],
  ['/admin.js', 'admin.js']
]);
for (let index = 1; index <= 7; index += 1) {
  const filename = `portfolio-${String(index).padStart(2, '0')}.png`;
  STATIC_FILES.set(`/images/${filename}`, `images/${filename}`);
}
for (let index = 1; index <= 10; index += 1) {
  const filename = `real-estate-${String(index).padStart(2, '0')}.png`;
  STATIC_FILES.set(`/images/${filename}`, `images/${filename}`);
}
const pool = process.env.DATABASE_URL
  ? new Pool({
      connectionString: process.env.DATABASE_URL,
      max: 5,
      connectionTimeoutMillis: 5000,
      idleTimeoutMillis: 30000
    })
  : null;

class RequestError extends Error {
  constructor(statusCode, message) {
    super(message);
    this.statusCode = statusCode;
  }
}

function validateSubmission(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new RequestError(400, 'Please submit a valid project request.');
  }

  const name = typeof input.name === 'string' ? input.name.trim() : '';
  const email = typeof input.email === 'string' ? input.email.trim() : '';
  const phone = typeof input.phone === 'string' ? input.phone.trim() : '';
  const projectType = typeof input.projectType === 'string' ? input.projectType : '';
  const budget = typeof input.budget === 'string' ? input.budget : '';
  const message = typeof input.message === 'string' ? input.message.trim() : '';
  const website = typeof input.website === 'string' ? input.website.trim() : '';

  if (website) throw new RequestError(400, 'Unable to accept this request.');
  if (!name || name.length > 80) throw new RequestError(400, 'Enter your name (up to 80 characters).');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) {
    throw new RequestError(400, 'Enter a valid email address.');
  }
  if (phone.length > 30 || (phone && !/^[+\d() .-]+$/.test(phone))) {
    throw new RequestError(400, 'Enter a valid phone number or leave it blank.');
  }
  if (!ALLOWED_PROJECT_TYPES.has(projectType)) {
    throw new RequestError(400, 'Choose a valid project type.');
  }
  if (!ALLOWED_BUDGETS.has(budget)) throw new RequestError(400, 'Choose a valid budget range.');
  if (!message || message.length > 5000) {
    throw new RequestError(400, 'Add a project description (up to 5,000 characters).');
  }

  return { name, email, phone, projectType, budget, message };
}

function isRateLimited(ip, now = Date.now(), limits = RATE_LIMITS, maxRequests = RATE_LIMIT_MAX) {
  const record = limits.get(ip);
  if (!record || now - record.startedAt >= RATE_LIMIT_WINDOW_MS) {
    limits.set(ip, { startedAt: now, count: 1 });
    if (limits.size > 1000) {
      for (const [key, value] of limits) {
        if (now - value.startedAt >= RATE_LIMIT_WINDOW_MS) limits.delete(key);
      }
    }
    return false;
  }

  record.count += 1;
  return record.count > maxRequests;
}

function getClientAddress(request) {
  const forwardedFor = request.headers['x-forwarded-for'];
  if (typeof forwardedFor === 'string' && forwardedFor.trim()) {
    return forwardedFor.split(',').at(-1).trim();
  }
  return request.socket.remoteAddress || 'unknown';
}

function isValidRevenueEntry(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return false;
  const amount = Number(input.amount);
  const title = typeof input.title === 'string' ? input.title.trim() : '';
  const paidAt = typeof input.paidAt === 'string' ? input.paidAt : '';
  const date = new Date(`${paidAt}T00:00:00.000Z`);
  return Number.isFinite(amount)
    && amount > 0
    && amount <= 100000000
    && /^\d+(\.\d{1,2})?$/.test(String(input.amount))
    && title.length > 0
    && title.length <= 120
    && /^\d{4}-\d{2}-\d{2}$/.test(paidAt)
    && !Number.isNaN(date.getTime())
    && date.toISOString().slice(0, 10) === paidAt;
}

function getCookie(request, name) {
  const cookieHeader = request.headers.cookie || '';
  for (const cookie of cookieHeader.split(';')) {
    const separator = cookie.indexOf('=');
    if (separator < 0) continue;
    if (cookie.slice(0, separator).trim() === name) return cookie.slice(separator + 1).trim();
  }
  return '';
}

function getAdminSession(request) {
  const token = getCookie(request, SESSION_COOKIE);
  if (!token) return null;

  const tokenHash = createHash('sha256').update(token).digest('hex');
  const session = ADMIN_SESSIONS.get(tokenHash);
  if (!session) return null;
  if (session.expiresAt <= Date.now()) {
    ADMIN_SESSIONS.delete(tokenHash);
    return null;
  }
  return { tokenHash, ...session };
}

function setSessionCookie(response, token) {
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
  response.setHeader(
    'Set-Cookie',
    `${SESSION_COOKIE}=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${SESSION_DURATION_MS / 1000}${secure}`
  );
}

function clearSessionCookie(response) {
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
  response.setHeader('Set-Cookie', `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0${secure}`);
}

function isSameOrigin(request) {
  const origin = request.headers.origin;
  if (!origin) return false;
  const forwardedProto = request.headers['x-forwarded-proto'];
  const forwardedHost = request.headers['x-forwarded-host'];
  const protocol = (Array.isArray(forwardedProto) ? forwardedProto[0] : forwardedProto || 'http').split(',')[0].trim();
  const host = (Array.isArray(forwardedHost) ? forwardedHost[0] : forwardedHost || request.headers.host || '').split(',')[0].trim();
  return origin === `${protocol}://${host}`;
}

function safeEqual(left, right) {
  const leftHash = createHash('sha256').update(left).digest();
  const rightHash = createHash('sha256').update(right).digest();
  return timingSafeEqual(leftHash, rightHash);
}

async function initializeDatabase() {
  if (!pool) {
    console.warn('Dashboard and lead storage are disabled: DATABASE_URL is not configured.');
    return;
  }

  await pool.query(`
    CREATE TABLE IF NOT EXISTS website_leads (
      id BIGSERIAL PRIMARY KEY,
      name VARCHAR(80) NOT NULL,
      email VARCHAR(254) NOT NULL,
      phone VARCHAR(30) NOT NULL DEFAULT '',
      project_type VARCHAR(40) NOT NULL,
      budget VARCHAR(40) NOT NULL,
      message TEXT NOT NULL,
      status VARCHAR(20) NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'contacted', 'closed')),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS revenue_entries (
      id BIGSERIAL PRIMARY KEY,
      title VARCHAR(120) NOT NULL,
      amount NUMERIC(12, 2) NOT NULL CHECK (amount > 0),
      paid_at DATE NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
}

function readBoundedJson(request, response, callback) {
  readJsonBody(request)
    .then(callback)
    .catch((error) => {
      if (error instanceof RequestError) return sendJson(response, error.statusCode, { error: error.message });
      console.error('Request body parsing failed:', error.message || error.name);
      return sendJson(response, 400, { error: 'Please submit a valid request.' });
    });
}

async function handleAdminApi(request, response, pathname, database = pool) {
  if (pathname === '/api/admin/login') {
    if (request.method !== 'POST') {
      response.setHeader('Allow', 'POST');
      return sendJson(response, 405, { error: 'Method not allowed.' });
    }
    if (!/^application\/json(?:\s*;|$)/i.test(request.headers['content-type'] || '')) {
      return sendJson(response, 415, { error: 'Invalid login request.' });
    }

    const ip = getClientAddress(request);
    if (isRateLimited(ip, Date.now(), LOGIN_RATE_LIMITS, 5)) {
      return sendJson(response, 429, { error: 'Too many login attempts. Try again in 15 minutes.' });
    }

    return readBoundedJson(request, response, async (input) => {
      const email = typeof input?.email === 'string' ? input.email.trim().toLowerCase() : '';
      const password = typeof input?.password === 'string' ? input.password : '';
      const expectedEmail = process.env.ADMIN_EMAIL?.trim().toLowerCase();
      const expectedPassword = process.env.ADMIN_PASSWORD;
      if (!expectedEmail || !expectedPassword || expectedPassword.length < 16) {
        return sendJson(response, 503, { error: 'Dashboard login is not configured yet.' });
      }

      if (ADMIN_SESSIONS.size > 1000) {
        for (const [key, value] of ADMIN_SESSIONS) {
          if (value.expiresAt <= Date.now()) ADMIN_SESSIONS.delete(key);
        }
      }
      const emailMatches = safeEqual(email, expectedEmail);
      const passwordMatches = safeEqual(password, expectedPassword);
      if (!emailMatches || !passwordMatches) {
        return sendJson(response, 401, { error: 'Invalid email or password.' });
      }

      const token = randomBytes(32).toString('base64url');
      const tokenHash = createHash('sha256').update(token).digest('hex');
      ADMIN_SESSIONS.set(tokenHash, {
        email: expectedEmail,
        expiresAt: Date.now() + SESSION_DURATION_MS
      });
      setSessionCookie(response, token);
      return sendJson(response, 200, { email: expectedEmail });
    });
  }

  const session = getAdminSession(request);
  if (pathname === '/api/admin/session') {
    if (request.method !== 'GET') {
      response.setHeader('Allow', 'GET');
      return sendJson(response, 405, { error: 'Method not allowed.' });
    }
    return session
      ? sendJson(response, 200, { email: session.email })
      : sendJson(response, 401, { error: 'Please sign in to continue.' });
  }

  if (!session) return sendJson(response, 401, { error: 'Please sign in to continue.' });
  if (request.method === 'POST' && !isSameOrigin(request)) {
    return sendJson(response, 403, { error: 'Request origin could not be verified.' });
  }
  if (pathname === '/api/admin/logout') {
    if (request.method !== 'POST') {
      response.setHeader('Allow', 'POST');
      return sendJson(response, 405, { error: 'Method not allowed.' });
    }
    ADMIN_SESSIONS.delete(session.tokenHash);
    clearSessionCookie(response);
    return sendJson(response, 200, { message: 'Signed out.' });
  }
  if (!database) return sendJson(response, 503, { error: 'Dashboard storage is not configured yet.' });

  if (pathname === '/api/admin/summary') {
    if (request.method !== 'GET') {
      response.setHeader('Allow', 'GET');
      return sendJson(response, 405, { error: 'Method not allowed.' });
    }
    try {
      const [leads, newLeads, revenue, monthRevenue, recentLeads, recentRevenue, revenueTrend] = await Promise.all([
        database.query('SELECT COUNT(*)::int AS count FROM website_leads'),
        database.query("SELECT COUNT(*)::int AS count FROM website_leads WHERE status = 'new'"),
        database.query('SELECT COALESCE(SUM(amount), 0)::numeric(12, 2)::text AS total FROM revenue_entries'),
        database.query("SELECT COALESCE(SUM(amount), 0)::numeric(12, 2)::text AS total FROM revenue_entries WHERE paid_at >= date_trunc('month', CURRENT_DATE)::date"),
        database.query('SELECT id, name, email, phone, project_type AS "projectType", budget, message, status, created_at AS "createdAt" FROM website_leads ORDER BY created_at DESC LIMIT 100'),
        database.query('SELECT id, title, amount::text, paid_at AS "paidAt", created_at AS "createdAt" FROM revenue_entries ORDER BY paid_at DESC, created_at DESC LIMIT 100'),
        database.query(`
          SELECT to_char(months.month_start, 'Mon YYYY') AS month,
            COALESCE(SUM(entries.amount), 0)::numeric(12, 2)::text AS total
          FROM generate_series(
            date_trunc('month', CURRENT_DATE) - interval '5 months',
            date_trunc('month', CURRENT_DATE),
            interval '1 month'
          ) AS months(month_start)
          LEFT JOIN revenue_entries AS entries
            ON date_trunc('month', entries.paid_at)::date = months.month_start::date
          GROUP BY months.month_start
          ORDER BY months.month_start
        `)
      ]);
      return sendJson(response, 200, {
        leads: { total: leads.rows[0].count, new: newLeads.rows[0].count, recent: recentLeads.rows },
        revenue: {
          total: revenue.rows[0].total,
          thisMonth: monthRevenue.rows[0].total,
          trend: revenueTrend.rows,
          recent: recentRevenue.rows
        }
      });
    } catch (error) {
      console.error('Dashboard report query failed:', error.message || error.name);
      return sendJson(response, 503, { error: 'Dashboard data is temporarily unavailable.' });
    }
  }

  if (pathname === '/api/admin/revenue') {
    if (request.method !== 'POST') {
      response.setHeader('Allow', 'POST');
      return sendJson(response, 405, { error: 'Method not allowed.' });
    }
    if (!/^application\/json(?:\s*;|$)/i.test(request.headers['content-type'] || '')) {
      return sendJson(response, 415, { error: 'Invalid revenue entry.' });
    }
    return readBoundedJson(request, response, async (input) => {
      if (!isValidRevenueEntry(input)) {
        return sendJson(response, 400, { error: 'Enter a valid description, amount, and payment date.' });
      }
      try {
        const result = await database.query(
          'INSERT INTO revenue_entries (title, amount, paid_at) VALUES ($1, $2, $3) RETURNING id, title, amount::text, paid_at AS "paidAt"',
          [input.title.trim(), Number(input.amount).toFixed(2), input.paidAt]
        );
        return sendJson(response, 201, { entry: result.rows[0] });
      } catch (error) {
        console.error('Revenue entry could not be saved:', error.message || error.name);
        return sendJson(response, 503, { error: 'Revenue entry could not be saved. Please try again.' });
      }
    });
  }

  const leadStatusMatch = pathname.match(/^\/api\/admin\/leads\/(\d+)$/);
  if (leadStatusMatch) {
    if (request.method !== 'PATCH') {
      response.setHeader('Allow', 'PATCH');
      return sendJson(response, 405, { error: 'Method not allowed.' });
    }
    if (!/^application\/json(?:\s*;|$)/i.test(request.headers['content-type'] || '')) {
      return sendJson(response, 415, { error: 'Invalid lead update.' });
    }
    return readBoundedJson(request, response, async (input) => {
      if (!['new', 'contacted', 'closed'].includes(input?.status)) {
        return sendJson(response, 400, { error: 'Choose a valid lead status.' });
      }
      try {
        const result = await database.query(
          'UPDATE website_leads SET status = $1 WHERE id = $2 RETURNING id, status',
          [input.status, leadStatusMatch[1]]
        );
        if (!result.rowCount) return sendJson(response, 404, { error: 'Lead not found.' });
        return sendJson(response, 200, { lead: result.rows[0] });
      } catch (error) {
        console.error('Lead status could not be updated:', error.message || error.name);
        return sendJson(response, 503, { error: 'Lead status could not be updated. Please try again.' });
      }
    });
  }

  response.writeHead(404, { 'Content-Type': 'application/json; charset=utf-8' });
  return response.end(JSON.stringify({ error: 'Not found.' }));
}

async function readJsonBody(request) {
  const chunks = [];
  let length = 0;

  for await (const chunk of request) {
    length += chunk.length;
    if (length > MAX_BODY_BYTES) throw new RequestError(413, 'The request is too large.');
    chunks.push(chunk);
  }

  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    throw new RequestError(400, 'Please submit a valid project request.');
  }
}

async function deliverEmail(submission) {
  const { RESEND_API_KEY, MAIL_FROM } = process.env;
  if (!RESEND_API_KEY || !MAIL_FROM) {
    throw new RequestError(503, 'Email delivery is not configured yet. Please contact us by email.');
  }

  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${RESEND_API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      from: MAIL_FROM,
      to: [process.env.MAIL_TO || 'webtechsolutionsz077@gmail.com'],
      reply_to: submission.email,
      subject: `New WebTech Sol project request from ${submission.name.replace(/[\r\n]/g, ' ')}`,
      text: [
        `Name: ${submission.name}`,
        `Email: ${submission.email}`,
        `Phone: ${submission.phone || 'Not provided'}`,
        `Project type: ${submission.projectType}`,
        `Budget: ${submission.budget}`,
        '',
        'Project details:',
        submission.message
      ].join('\n')
    }),
    signal: AbortSignal.timeout(10000)
  });

  if (!response.ok) throw new Error(`Resend API returned HTTP ${response.status}`);
}

function sendJson(response, statusCode, body) {
  response.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff'
  });
  response.end(JSON.stringify(body));
}

async function handleContact(request, response, database = pool) {
  if (request.method !== 'POST') {
    response.setHeader('Allow', 'POST');
    return sendJson(response, 405, { error: 'Method not allowed.' });
  }

  if (!/^application\/json(?:\s*;|$)/i.test(request.headers['content-type'] || '')) {
    return sendJson(response, 415, { error: 'Please submit the form using the website.' });
  }

  const ip = getClientAddress(request);
  if (isRateLimited(ip)) return sendJson(response, 429, { error: 'Too many requests. Please try again later.' });

  try {
    const submission = validateSubmission(await readJsonBody(request));
    if (!database) throw new RequestError(503, 'Project request storage is not configured yet. Please contact us by email.');
    await database.query(
      'INSERT INTO website_leads (name, email, phone, project_type, budget, message) VALUES ($1, $2, $3, $4, $5, $6)',
      [submission.name, submission.email, submission.phone, submission.projectType, submission.budget, submission.message]
    );
    try {
      await deliverEmail(submission);
    } catch (error) {
      console.error('Project request was saved, but email notification failed:', error.message || error.name);
      return sendJson(response, 200, {
        message: 'Your project request was saved. Email notification is temporarily unavailable, but we can see it in the dashboard.'
      });
    }
    return sendJson(response, 200, { message: 'Your project request was received and emailed.' });
  } catch (error) {
    if (error instanceof RequestError) {
      return sendJson(response, error.statusCode, { error: error.message });
    }

    console.error('Project request email delivery failed:', error.message || error.name || 'Unknown error');
    return sendJson(response, 503, { error: 'We could not save your request right now. Please try again later.' });
  }
}

function serveStatic(request, response, pathname) {
  const filename = STATIC_FILES.get(pathname);
  if (!filename) {
    response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    return response.end('Not found');
  }

  const filePath = path.join(__dirname, filename);
  const contentTypes = {
    '.html': 'text/html; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.jpeg': 'image/jpeg',
    '.png': 'image/png'
  };

  response.writeHead(200, {
    'Content-Type': contentTypes[path.extname(filePath)],
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Referrer-Policy': 'strict-origin-when-cross-origin'
  });
  if (request.method === 'HEAD') return response.end();
  return fs.createReadStream(filePath).pipe(response);
}

function createServer({ database = pool } = {}) {
  return http.createServer((request, response) => {
    let pathname;
    try {
      pathname = new URL(request.url, 'http://localhost').pathname;
    } catch {
      return sendJson(response, 400, { error: 'Invalid request URL.' });
    }

    if (pathname === '/healthz' && (request.method === 'GET' || request.method === 'HEAD')) {
      response.writeHead(200, {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'no-store'
      });
      return response.end(request.method === 'HEAD' ? undefined : JSON.stringify({ status: 'ok' }));
    }

    if (pathname === '/api/contact') return void handleContact(request, response, database);
    if (pathname.startsWith('/api/admin/')) {
      return void handleAdminApi(request, response, pathname, database).catch((error) => {
        console.error('Admin request failed:', error.message || error.name);
        if (!response.headersSent) return sendJson(response, 500, { error: 'The dashboard request failed. Please try again.' });
        return response.end();
      });
    }
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      response.setHeader('Allow', 'GET, HEAD');
      response.writeHead(405, { 'Content-Type': 'text/plain; charset=utf-8' });
      return response.end('Method not allowed');
    }
    return serveStatic(request, response, pathname);
  });
}

if (require.main === module) {
  initializeDatabase()
    .then(() => {
      createServer().listen(PORT, () => {
        console.log(`WebTech Sol is running at http://localhost:${PORT}`);
      });
    })
    .catch((error) => {
      console.error('Database initialization failed:', error.message || error.name);
      process.exitCode = 1;
    });
}

module.exports = { createServer, deliverEmail, isValidRevenueEntry, validateSubmission };
