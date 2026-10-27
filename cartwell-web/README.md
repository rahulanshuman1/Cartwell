# Cartwell website (static, for Vercel)

Plain HTML, CSS and JavaScript. No build step.

Edit two places before deploying:
1. `config.js`: set `CARTWELL_API_URL` to your Render API address.
2. `vercel.json`: replace `cartwell-api.onrender.com` in the `connect-src` part of the Content-Security-Policy with the same host.

The site shows products from the API, supports guest checkout with Razorpay, and sign-in by email or phone code with order history.
Google sign-in is only in the mobile app for now.
The sign-in refresh token is kept in sessionStorage (cleared when the tab closes). The strict Content-Security-Policy in `vercel.json`
limits scripts to this site and Razorpay, which is what protects it.
