# Cartwell: online store (website + mobile app + API)

cartwell-api   Node.js + MongoDB backend (deploy on Render). Payments with Razorpay, accounts, addresses, refunds.
cartwell-web   Website (deploy on Vercel). Plain HTML/CSS/JS, no build step.
cartwell-app   Mobile app for Android and iOS (React Native with Expo).

## Run on your computer
1. API: in cartwell-api copy .env.example to .env, fill it in (NODE_ENV=development, ALLOWED_ORIGINS=http://localhost:5500),
   then run: npm install, npm run seed, npm start
2. Website: in cartwell-web set config.js to http://localhost:3000, then run: npx serve -l 5500  and open http://localhost:5500
3. Mobile app: in cartwell-app copy .env.example to .env, set EXPO_PUBLIC_API_URL, then run: npm install, npx expo run:android

## Deploy
Render (API): root directory cartwell-api, build "npm install", start "npm start", add the variables from cartwell-api/.env.example.
Vercel (website): root directory cartwell-web, framework "Other", no build command.
config.js and vercel.json in cartwell-web already point to https://cartwell.onrender.com. Change both if your Render address differs.
In Render set ALLOWED_ORIGINS to your exact Vercel address (https://..., no slash at the end).
Razorpay webhook: https://YOUR-API.onrender.com/api/webhooks/razorpay with events payment.captured, order.paid, refund.processed, refund.failed.

Never commit .env files. Use Razorpay TEST keys until everything works.
Each folder has its own README with more detail.
