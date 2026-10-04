const test = require('node:test');
const assert = require('node:assert/strict');
const { createServer, deliverEmail, isValidAdminPassword, isValidRevenueEntry, validateSubmission } = require('../server');

const validSubmission = {
  name: 'Bipin Khatri',
  email: 'client@example.com',
  phone: '',
  projectType: 'Website',
  budget: 'Below ₹10,000',
  message: 'I need a business website.',
  website: ''
};

test('validates a complete project request', () => {
  assert.deepEqual(validateSubmission(validSubmission), {
    name: validSubmission.name,
    email: validSubmission.email,
    phone: '',
    projectType: validSubmission.projectType,
    budget: validSubmission.budget,
    message: validSubmission.message
  });
});

test('rejects invalid email addresses', () => {
  assert.throws(
    () => validateSubmission({ ...validSubmission, email: 'not-an-email' }),
    { statusCode: 400, message: 'Enter a valid email address.' }
  );
});

test('rejects unsupported options and honeypot submissions', () => {
  assert.throws(
    () => validateSubmission({ ...validSubmission, projectType: 'Other service' }),
    { statusCode: 400, message: 'Choose a valid project type.' }
  );
  assert.throws(
    () => validateSubmission({ ...validSubmission, website: 'spam' }),
    { statusCode: 400, message: 'Unable to accept this request.' }
  );
});

test('sends project requests to Resend with the configured recipient', async () => {
  const originalApiKey = process.env.RESEND_API_KEY;
  const originalFrom = process.env.MAIL_FROM;
  const originalTo = process.env.MAIL_TO;
  const originalFetch = global.fetch;
  process.env.RESEND_API_KEY = 'test-api-key';
  process.env.MAIL_FROM = 'WebTech Sol <hello@example.com>';
  process.env.MAIL_TO = 'webtechsolutionsz077@gmail.com';
  global.fetch = async (url, options) => {
    assert.equal(url, 'https://api.resend.com/emails');
    assert.equal(options.headers.Authorization, 'Bearer test-api-key');
    const payload = JSON.parse(options.body);
    assert.deepEqual(payload.to, ['webtechsolutionsz077@gmail.com']);
    assert.equal(payload.reply_to, validSubmission.email);
    return { ok: true, status: 200 };
  };

  try {
    await deliverEmail(validSubmission);
  } finally {
    global.fetch = originalFetch;
    if (originalApiKey === undefined) delete process.env.RESEND_API_KEY;
    else process.env.RESEND_API_KEY = originalApiKey;
    if (originalFrom === undefined) delete process.env.MAIL_FROM;
    else process.env.MAIL_FROM = originalFrom;
    if (originalTo === undefined) delete process.env.MAIL_TO;
    else process.env.MAIL_TO = originalTo;
  }
});

test('reports missing Resend configuration without attempting delivery', async () => {
  const originalApiKey = process.env.RESEND_API_KEY;
  const originalFrom = process.env.MAIL_FROM;
  delete process.env.RESEND_API_KEY;
  delete process.env.MAIL_FROM;

  try {
    await assert.rejects(
      deliverEmail(validSubmission),
      { statusCode: 503, message: 'Email delivery is not configured yet. Please contact us by email.' }
    );
  } finally {
    if (originalApiKey !== undefined) process.env.RESEND_API_KEY = originalApiKey;
    if (originalFrom !== undefined) process.env.MAIL_FROM = originalFrom;
  }
});

test('validates positive INR revenue entries with real calendar dates', () => {
  assert.equal(isValidRevenueEntry({ title: 'Project payment', amount: '1250.50', paidAt: '2026-10-04' }), true);
  assert.equal(isValidRevenueEntry({ title: '', amount: '1250', paidAt: '2026-10-04' }), false);
  assert.equal(isValidRevenueEntry({ title: 'Project payment', amount: '0', paidAt: '2026-10-04' }), false);
  assert.equal(isValidRevenueEntry({ title: 'Project payment', amount: '1250', paidAt: '2026-02-30' }), false);
});

test('requires reset passwords to contain 8 characters, uppercase, and lowercase', () => {
  assert.equal(isValidAdminPassword('Abcdefg1'), true);
  assert.equal(isValidAdminPassword('abcdefg1'), false);
  assert.equal(isValidAdminPassword('ABCDEFG1'), false);
  assert.equal(isValidAdminPassword('Abc123'), false);
});

test('saves contact requests to the lead store when email notifications are unavailable', async () => {
  const originalApiKey = process.env.RESEND_API_KEY;
  const originalFrom = process.env.MAIL_FROM;
  delete process.env.RESEND_API_KEY;
  delete process.env.MAIL_FROM;
  let storedValues;
  const database = {
    async query(sql, values) {
      assert.match(sql, /INSERT INTO website_leads/);
      storedValues = values;
      return { rows: [], rowCount: 1 };
    }
  };
  const server = createServer({ database });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));

  try {
    const response = await fetch(`http://127.0.0.1:${server.address().port}/api/contact`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(validSubmission)
    });
    assert.equal(response.status, 200);
    assert.match((await response.json()).message, /saved/);
    assert.deepEqual(storedValues, [
      validSubmission.name,
      validSubmission.email,
      validSubmission.phone,
      validSubmission.projectType,
      validSubmission.budget,
      validSubmission.message
    ]);
  } finally {
    await new Promise((resolve, reject) => {
      server.close((error) => error ? reject(error) : resolve());
    });
    if (originalApiKey === undefined) delete process.env.RESEND_API_KEY;
    else process.env.RESEND_API_KEY = originalApiKey;
    if (originalFrom === undefined) delete process.env.MAIL_FROM;
    else process.env.MAIL_FROM = originalFrom;
  }
});

test('protects dashboard APIs behind login and creates an HttpOnly session', async () => {
  const originalEmail = process.env.ADMIN_EMAIL;
  const originalPassword = process.env.ADMIN_PASSWORD;
  process.env.ADMIN_EMAIL = 'webtechsolutionsz077@gmail.com';
  process.env.ADMIN_PASSWORD = 'a-long-private-test-password';
  const revenueEntries = [];
  const leads = [];
  const database = {
    async query(sql, values = []) {
      if (sql.includes('SELECT password_hash, password_salt FROM admin_credentials')) {
        return { rows: [], rowCount: 0 };
      }
      if (sql.includes('INSERT INTO revenue_entries')) {
        const entry = { id: revenueEntries.length + 1, title: values[0], amount: values[1], paidAt: values[2] };
        revenueEntries.push(entry);
        return { rows: [entry], rowCount: 1 };
      }
      if (sql.includes('UPDATE website_leads')) {
        const lead = leads.find((item) => String(item.id) === String(values[1]));
        if (!lead) return { rows: [], rowCount: 0 };
        lead.status = values[0];
        return { rows: [{ id: lead.id, status: lead.status }], rowCount: 1 };
      }
      if (sql.includes('COUNT(*)') && sql.includes("status = 'new'")) {
        return { rows: [{ count: leads.filter((lead) => lead.status === 'new').length }] };
      }
      if (sql.includes('COUNT(*)')) return { rows: [{ count: leads.length }] };
      if (sql.includes('generate_series')) {
        return { rows: [{ month: 'Oct 2026', total: String(revenueEntries.reduce((sum, entry) => sum + Number(entry.amount), 0)) }] };
      }
      if (sql.includes('SUM(amount)') && sql.includes('date_trunc')) {
        return { rows: [{ total: String(revenueEntries.reduce((sum, entry) => sum + Number(entry.amount), 0)) }] };
      }
      if (sql.includes('SUM(amount)')) {
        return { rows: [{ total: String(revenueEntries.reduce((sum, entry) => sum + Number(entry.amount), 0)) }] };
      }
      if (sql.includes('FROM website_leads')) return { rows: leads };
      if (sql.includes('FROM revenue_entries')) return { rows: revenueEntries };
      throw new Error(`Unexpected test query: ${sql}`);
    }
  };
  const server = createServer({ database });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));

  try {
    const baseUrl = `http://127.0.0.1:${server.address().port}`;
    const forbidden = await fetch(`${baseUrl}/api/admin/summary`);
    assert.equal(forbidden.status, 401);

    const failedLogin = await fetch(`${baseUrl}/api/admin/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: process.env.ADMIN_EMAIL, password: 'wrong-password' })
    });
    assert.equal(failedLogin.status, 401);

    const login = await fetch(`${baseUrl}/api/admin/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: process.env.ADMIN_EMAIL, password: process.env.ADMIN_PASSWORD })
    });
    assert.equal(login.status, 200);
    const cookie = login.headers.get('set-cookie');
    assert.match(cookie, /HttpOnly/);
    assert.match(cookie, /SameSite=Strict/);

    const session = await fetch(`${baseUrl}/api/admin/session`, { headers: { Cookie: cookie } });
    assert.equal(session.status, 200);
    assert.equal((await session.json()).email, process.env.ADMIN_EMAIL);

    const paidAt = new Date().toISOString().slice(0, 10);
    const createRevenue = await fetch(`${baseUrl}/api/admin/revenue`, {
      method: 'POST',
      headers: {
        Cookie: cookie,
        Origin: baseUrl,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ title: 'Website project', amount: '15000', paidAt })
    });
    assert.equal(createRevenue.status, 201);

    const summaryResponse = await fetch(`${baseUrl}/api/admin/summary`, { headers: { Cookie: cookie } });
    assert.equal(summaryResponse.status, 200);
    const summary = await summaryResponse.json();
    assert.equal(summary.revenue.total, '15000');
    assert.equal(summary.leads.total, 0);
    assert.equal(summary.revenue.recent.length, 1);

    const logout = await fetch(`${baseUrl}/api/admin/logout`, {
      method: 'POST',
      headers: {
        Cookie: cookie,
        Origin: baseUrl,
        'Content-Type': 'application/json'
      },
      body: '{}'
    });
    assert.equal(logout.status, 200);
    const expiredSession = await fetch(`${baseUrl}/api/admin/session`, { headers: { Cookie: cookie } });
    assert.equal(expiredSession.status, 401);
  } finally {
    await new Promise((resolve, reject) => {
      server.close((error) => error ? reject(error) : resolve());
    });
    if (originalEmail === undefined) delete process.env.ADMIN_EMAIL;
    else process.env.ADMIN_EMAIL = originalEmail;
    if (originalPassword === undefined) delete process.env.ADMIN_PASSWORD;
    else process.env.ADMIN_PASSWORD = originalPassword;
  }
});

test('emails a single-use password reset link and changes the dashboard password', async () => {
  const originalEmail = process.env.ADMIN_EMAIL;
  const originalPassword = process.env.ADMIN_PASSWORD;
  const originalApiKey = process.env.RESEND_API_KEY;
  const originalFrom = process.env.MAIL_FROM;
  const originalBaseUrl = process.env.PUBLIC_BASE_URL;
  const originalFetch = global.fetch;
  process.env.ADMIN_EMAIL = 'webtechsolutionsz077@gmail.com';
  process.env.ADMIN_PASSWORD = 'the-original-test-password';
  process.env.RESEND_API_KEY = 'test-api-key';
  process.env.MAIL_FROM = 'WebTech Sol <hello@example.com>';
  const resetTokens = new Map();
  let credential = null;
  let resetUrl;
  global.fetch = async (url, options) => {
    if (url !== 'https://api.resend.com/emails') return originalFetch(url, options);
    assert.equal(url, 'https://api.resend.com/emails');
    assert.equal(options.headers.Authorization, 'Bearer test-api-key');
    const email = JSON.parse(options.body);
    assert.deepEqual(email.to, [process.env.ADMIN_EMAIL]);
    resetUrl = email.text.match(/https?:\/\/\S+/)?.[0];
    return { ok: true, status: 200 };
  };
  const database = {
    async query(sql, values = []) {
      if (sql.includes('DELETE FROM admin_password_resets WHERE email = $1 OR expires_at <= NOW()')) {
        resetTokens.clear();
        return { rows: [], rowCount: 0 };
      }
      if (sql.includes('INSERT INTO admin_password_resets')) {
        resetTokens.set(values[0], { email: values[1] });
        return { rows: [], rowCount: 1 };
      }
      if (sql.includes('DELETE FROM admin_password_resets WHERE token_hash = $1')) {
        resetTokens.delete(values[0]);
        return { rows: [], rowCount: 1 };
      }
      if (sql.includes('WITH used_token AS')) {
        const token = resetTokens.get(values[0]);
        if (!token || token.email !== values[3]) return { rows: [], rowCount: 0 };
        resetTokens.delete(values[0]);
        credential = { password_hash: values[1], password_salt: values[2] };
        return { rows: [{ id: 1 }], rowCount: 1 };
      }
      if (sql.includes('DELETE FROM admin_password_resets WHERE email = $1')) {
        resetTokens.clear();
        return { rows: [], rowCount: 0 };
      }
      if (sql.includes('SELECT password_hash, password_salt FROM admin_credentials')) {
        return { rows: credential ? [credential] : [], rowCount: credential ? 1 : 0 };
      }
      throw new Error(`Unexpected test query: ${sql}`);
    }
  };
  const server = createServer({ database });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));

  try {
    const baseUrl = `http://127.0.0.1:${server.address().port}`;
    process.env.PUBLIC_BASE_URL = baseUrl;
    const requestReset = await fetch(`${baseUrl}/api/admin/forgot-password`, {
      method: 'POST',
      headers: { Origin: baseUrl, 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: process.env.ADMIN_EMAIL })
    });
    assert.equal(requestReset.status, 200);
    assert.match((await requestReset.json()).message, /If the address matches/);
    assert.ok(resetUrl);

    const token = new URLSearchParams(new URL(resetUrl).hash.slice(1)).get('reset');
    assert.ok(token);
    const invalidPassword = await fetch(`${baseUrl}/api/admin/reset-password`, {
      method: 'POST',
      headers: { Origin: baseUrl, 'Content-Type': 'application/json', 'X-Forwarded-For': '192.0.2.40' },
      body: JSON.stringify({ token, newPassword: 'lowercase1' })
    });
    assert.equal(invalidPassword.status, 400);

    const reset = await fetch(`${baseUrl}/api/admin/reset-password`, {
      method: 'POST',
      headers: { Origin: baseUrl, 'Content-Type': 'application/json', 'X-Forwarded-For': '192.0.2.41' },
      body: JSON.stringify({ token, newPassword: 'NewStrongPass8' })
    });
    assert.equal(reset.status, 200);

    const replay = await fetch(`${baseUrl}/api/admin/reset-password`, {
      method: 'POST',
      headers: { Origin: baseUrl, 'Content-Type': 'application/json' },
      body: JSON.stringify({ token, newPassword: 'AnotherNewPass8' })
    });
    assert.equal(replay.status, 400);

    const newLogin = await fetch(`${baseUrl}/api/admin/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: process.env.ADMIN_EMAIL, password: 'NewStrongPass8' })
    });
    assert.equal(newLogin.status, 200);
    const oldLogin = await fetch(`${baseUrl}/api/admin/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: process.env.ADMIN_EMAIL, password: process.env.ADMIN_PASSWORD })
    });
    assert.equal(oldLogin.status, 401);
  } finally {
    global.fetch = originalFetch;
    await new Promise((resolve, reject) => {
      server.close((error) => error ? reject(error) : resolve());
    });
    if (originalEmail === undefined) delete process.env.ADMIN_EMAIL;
    else process.env.ADMIN_EMAIL = originalEmail;
    if (originalPassword === undefined) delete process.env.ADMIN_PASSWORD;
    else process.env.ADMIN_PASSWORD = originalPassword;
    if (originalApiKey === undefined) delete process.env.RESEND_API_KEY;
    else process.env.RESEND_API_KEY = originalApiKey;
    if (originalFrom === undefined) delete process.env.MAIL_FROM;
    else process.env.MAIL_FROM = originalFrom;
    if (originalBaseUrl === undefined) delete process.env.PUBLIC_BASE_URL;
    else process.env.PUBLIC_BASE_URL = originalBaseUrl;
  }
});

test('serves a healthy status from the Render health-check endpoint', async () => {
  const server = createServer();
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));

  try {
    const address = server.address();
    const response = await fetch(`http://127.0.0.1:${address.port}/healthz`);
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { status: 'ok' });
  } finally {
    await new Promise((resolve, reject) => {
      server.close((error) => error ? reject(error) : resolve());
    });
  }
});

test('does not cache admin assets that contain password recovery behavior', async () => {
  const server = createServer();
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));

  try {
    const response = await fetch(`http://127.0.0.1:${server.address().port}/admin.js`);
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('cache-control'), 'no-store');
  } finally {
    await new Promise((resolve, reject) => {
      server.close((error) => error ? reject(error) : resolve());
    });
  }
});
