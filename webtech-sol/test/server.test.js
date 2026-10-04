const test = require('node:test');
const assert = require('node:assert/strict');
const { createServer, deliverEmail, validateSubmission } = require('../server');

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
