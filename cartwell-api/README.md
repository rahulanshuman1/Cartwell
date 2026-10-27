# Cartwell API (Node + MongoDB, for Render)

Express API with Razorpay payments and customer accounts (email + password, phone OTP, Google).
Needs MongoDB **Atlas** (or any replica set) because order payment uses a transaction.

## Run locally
1. `npm install`
2. Copy `.env.example` to `.env` and fill it in (see the comments inside).
3. `npm run seed` (adds the 12 sample products; safe to run again)
4. `npm start`, then open http://localhost:3000/api/products

## Endpoints
- `GET /api/health`, `GET /api/products`
- `POST /api/orders` `{items:[{id,qty}], customer:{name,email,phone,pin,addr}}` (optional Bearer token links the order to the account)
- `POST /api/payments/verify`, `POST /api/webhooks/razorpay`, `GET /api/orders/:id/status`
- `POST /api/auth/register | login | otp/request | otp/verify | google | refresh | logout`
- `POST /api/auth/password/forgot` `{email}` then `POST /api/auth/password/reset` `{email,code,password}` (6-digit code by email, 15 minutes, 5 tries)
- `GET /api/me`, `PATCH /api/me` `{name}`, `POST /api/me/password` `{currentPassword,newPassword}`,
  `GET|POST /api/me/addresses`, `PATCH|DELETE /api/me/addresses/:id`, `POST /api/me/addresses/:id/default` (up to 10 saved addresses), `GET /api/me/orders` (Bearer token)

## Security in place
Server-side pricing and stock, strict input validation, signed payment verification and webhooks, idempotent payment handling in a
transaction, scrypt password hashing, rotating refresh tokens with replay detection, hashed OTPs with attempt limits,
verified Google tokens, helmet headers, CORS allowlist, rate limits, small body limits, no secrets in code.
Rate limits live in memory; use Redis if you ever run more than one instance.

Password reset: the same answer is given whether or not an email has an account, resetting signs out every other device, and the
reset also marks the email as verified. Emails are sent with Resend, so set `RESEND_API_KEY` and `EMAIL_FROM` (a verified domain is
required to email anyone other than your own Resend account).

Refunds: if an item sells out after the customer has paid, the order is marked `failed` and a full refund is sent to Razorpay
automatically. Failed attempts retry with a growing delay (8 tries), and the retry job runs at start-up and every 10 minutes while the
server is awake. Each order records `refund_status` (`pending`, `initiated`, `refunded` or `manual`) and `refund_error`. Orders with
`refund_status: "manual"` need a human; find them in Atlas with the filter `{ refund_status: "manual" }`.
In the Razorpay dashboard keep payment capture on **automatic** (refunds only work on captured payments) and add the webhook events
`refund.processed` and `refund.failed` next to the two payment events.

Not included: email verification at sign-up.
