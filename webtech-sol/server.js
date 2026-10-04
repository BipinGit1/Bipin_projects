require('dotenv').config();

const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');

const PORT = Number(process.env.PORT) || 3000;
const MAX_BODY_BYTES = 10 * 1024;
const RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000;
const RATE_LIMIT_MAX = 5;
const RATE_LIMITS = new Map();
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
  ['/bipin-khatri.jpeg', 'bipin-khatri.jpeg']
]);
for (let index = 1; index <= 7; index += 1) {
  const filename = `portfolio-${String(index).padStart(2, '0')}.png`;
  STATIC_FILES.set(`/images/${filename}`, `images/${filename}`);
}
for (let index = 1; index <= 10; index += 1) {
  const filename = `real-estate-${String(index).padStart(2, '0')}.png`;
  STATIC_FILES.set(`/images/${filename}`, `images/${filename}`);
}

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

function isRateLimited(ip, now = Date.now()) {
  const record = RATE_LIMITS.get(ip);
  if (!record || now - record.startedAt >= RATE_LIMIT_WINDOW_MS) {
    RATE_LIMITS.set(ip, { startedAt: now, count: 1 });
    if (RATE_LIMITS.size > 1000) {
      for (const [key, value] of RATE_LIMITS) {
        if (now - value.startedAt >= RATE_LIMIT_WINDOW_MS) RATE_LIMITS.delete(key);
      }
    }
    return false;
  }

  record.count += 1;
  return record.count > RATE_LIMIT_MAX;
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

async function handleContact(request, response) {
  if (request.method !== 'POST') {
    response.setHeader('Allow', 'POST');
    return sendJson(response, 405, { error: 'Method not allowed.' });
  }

  if (!/^application\/json(?:\s*;|$)/i.test(request.headers['content-type'] || '')) {
    return sendJson(response, 415, { error: 'Please submit the form using the website.' });
  }

  const ip = request.socket.remoteAddress || 'unknown';
  if (isRateLimited(ip)) return sendJson(response, 429, { error: 'Too many requests. Please try again later.' });

  try {
    const submission = validateSubmission(await readJsonBody(request));
    await deliverEmail(submission);
    return sendJson(response, 200, { message: 'Your project request has been sent.' });
  } catch (error) {
    if (error instanceof RequestError) {
      return sendJson(response, error.statusCode, { error: error.message });
    }

    console.error('Project request email delivery failed:', error.message || error.name || 'Unknown error');
    return sendJson(response, 502, { error: 'We could not deliver your request right now. Please try again later.' });
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

function createServer() {
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

    if (pathname === '/api/contact') return void handleContact(request, response);
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      response.setHeader('Allow', 'GET, HEAD');
      response.writeHead(405, { 'Content-Type': 'text/plain; charset=utf-8' });
      return response.end('Method not allowed');
    }
    return serveStatic(request, response, pathname);
  });
}

if (require.main === module) {
  createServer().listen(PORT, () => {
    console.log(`WebTech Sol is running at http://localhost:${PORT}`);
  });
}

module.exports = { createServer, deliverEmail, validateSubmission };
