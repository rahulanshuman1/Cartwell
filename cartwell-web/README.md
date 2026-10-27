# Cartwell website (static, for Vercel)

Plain HTML, CSS and JavaScript. No build step.

Edit two places before deploying:
1. `config.js`: set `CARTWELL_API_URL` to your Render API address.
2. `vercel.json`: replace `cartwell-api.onrender.com` in the `connect-src` part of the Content-Security-Policy with the same host.

The site shows products from the API, supports guest checkout with Razorpay, and sign-in by email or phone code with order history.
Google sign-in is only in the mobile app for now.
The sign-in refresh token is kept in sessionStorage (cleared when the tab closes). The strict Content-Security-Policy in `vercel.json`
limits scripts to this site and Razorpay, which is what protects it.

## Product photos (optional)
Cards show emoji tiles by default. To use real photos, put `1.jpg` ... `12.jpg` (square, about 600 x 600) in an `images` folder here,
named after the product id, and add this line to `config.js`:
```
window.CARTWELL_PRODUCT_IMAGES = true;
```
Any product without a photo falls back to its emoji tile.
