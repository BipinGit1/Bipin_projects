# WebTech Sol

## Run locally

1. Install Node.js 20 or newer.
2. Run `npm install`.
3. Copy `.env.example` to `.env`.
4. Create a Resend account, verify a sending domain, and set `RESEND_API_KEY` and `MAIL_FROM` to the API key and a sender address on that verified domain.
5. Run `npm start` and open `http://localhost:3000`.

The contact form sends validated project requests through Resend to `MAIL_TO`. Keep API keys in environment variables and never commit them. The `/healthz` endpoint is available for hosting-provider health checks.

## Deploy to Render

1. Keep this website in the `webtech-sol/` folder of the `Bipin_projects` GitHub repository. The folder must include `render.yaml`, the `images/` folder, `bipin-khatri.jpeg`, and `package-lock.json`.
2. In Render, create a new Blueprint and connect `BipinGit1/Bipin_projects`. Set the Blueprint file path to `webtech-sol/render.yaml`. The blueprint's `rootDir` points the Node.js service at the website folder.
3. In the service's Environment settings, set `RESEND_API_KEY` and `MAIL_FROM`. `MAIL_FROM` must use a domain verified in your Resend account. Keep `MAIL_TO` as `webtechsolutionsz077@gmail.com`.
4. Redeploy after saving environment settings. Test the live form and confirm the message arrives in your Gmail inbox.

## Private business dashboard

1. Create a free PostgreSQL project in Neon and copy its pooled connection string (with TLS enabled).
2. In Render, add `DATABASE_URL`, `ADMIN_EMAIL=webtechsolutionsz077@gmail.com`, a unique strong `ADMIN_PASSWORD`, `RESEND_API_KEY`, and `MAIL_FROM` in the web service's Environment settings. Sending to this Gmail address with Resend requires a custom domain you control and have verified with Resend; the `onboarding@resend.dev` test sender can only deliver to the Resend account email. Set `PUBLIC_BASE_URL` to the public HTTPS site URL.
3. Save changes and redeploy. The app creates its lead, revenue, admin credential, and reset-token tables at startup.
4. Sign in at `https://webtech-sol.onrender.com/admin`. New website enquiries appear in the leads table; record payments manually to update the INR revenue totals and six-month chart.

The admin session uses an HttpOnly, Secure, SameSite cookie and expires after eight hours. Login attempts are rate-limited. Use **Forgot password?** on the dashboard sign-in page to email a one-time reset link to the configured admin email. Reset links expire after 30 minutes and can only be used once; requesting a newer link invalidates earlier links. Password reset emails require working `RESEND_API_KEY` and `MAIL_FROM` settings in Render, with the sender domain verified in Resend; the recovery page explains this if the settings are missing. New passwords must contain at least 8 characters, including uppercase and lowercase letters. After the first reset, the new password is stored as a salted scrypt hash in PostgreSQL, replacing the environment password for login. Keep the Neon connection string and dashboard password private; never commit them to GitHub or enter them into this chat.

Render blocks outbound SMTP, so this project uses Resend's HTTPS API for production email notifications. Without the database connection, project requests cannot be stored. If the database is configured but Resend is not, requests are still saved in the dashboard and the visitor is told that the email notification is temporarily unavailable.

## Backend protections

- Server-side field validation and body-size limit
- Per-IP request throttling and a hidden honeypot field
- Resend API key kept outside source control
- HttpOnly, Secure, SameSite admin session cookie with server-side expiry
- Rate-limited password reset with single-use, expiring, hashed tokens kept in the URL fragment
- Salted scrypt password hashes stored in PostgreSQL after password reset
- Same-origin validation for password recovery requests
- Same-origin checks for authenticated dashboard mutations
- Parameterized PostgreSQL queries for revenue and lead updates
- Generic delivery errors returned to the browser without exposing SMTP details
