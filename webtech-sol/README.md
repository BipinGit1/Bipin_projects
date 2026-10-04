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

Render blocks outbound SMTP, so this project uses Resend's HTTPS API for production delivery. Without a verified sender domain and API key, the website can load but form submissions will report that email delivery is not configured.

## Backend protections

- Server-side field validation and body-size limit
- Per-IP request throttling and a hidden honeypot field
- Resend API key kept outside source control
- Generic delivery errors returned to the browser without exposing SMTP details
