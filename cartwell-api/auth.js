import crypto from "node:crypto";
import { promisify } from "node:util";
import express from "express";
import rateLimit from "express-rate-limit";
import jwt from "jsonwebtoken";
import { OAuth2Client } from "google-auth-library";
import { ObjectId } from "mongodb";
import { z } from "zod";

const scrypt = promisify(crypto.scrypt);
const ISS = "cartwell-api";
const REFRESH_MS = 30 * 24 * 60 * 60 * 1000;
const SCRYPT = { N: 16384, r: 8, p: 1 };

const sha256 = (s) => crypto.createHash("sha256").update(s).digest("hex");
const hmac = (secret, s) => crypto.createHmac("sha256", secret).update(s).digest("hex");
const eq = (a, b) => {
  const x = Buffer.from(String(a)), y = Buffer.from(String(b));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
};

async function hashPassword(pw) {
  const salt = crypto.randomBytes(16);
  const key = await scrypt(pw, salt, 64, SCRYPT);
  return `scrypt$${salt.toString("base64")}$${key.toString("base64")}`;
}
async function checkPassword(pw, stored) {
  const [alg, s, k] = String(stored).split("$");
  if (alg !== "scrypt" || !s || !k) return false;
  const key = await scrypt(pw, Buffer.from(s, "base64"), 64, SCRYPT);
  const want = Buffer.from(k, "base64");
  return key.length === want.length && crypto.timingSafeEqual(key, want);
}

const Email = z.string().trim().toLowerCase().email().max(80);
const Phone = z.string().regex(/^[6-9]\d{9}$/); // Indian mobile numbers, stored as 10 digits
const Password = z.string().min(8).max(128);
const Name = z.string().trim().min(2).max(60);
const BAD = { error: "Please check your details and try again." };
const DUP = 11000; // MongoDB duplicate key error code

export function createAuth(db) {
  const { JWT_SECRET, OTP_SECRET, GOOGLE_CLIENT_IDS = "", TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_FROM, RESEND_API_KEY, EMAIL_FROM, NODE_ENV } = process.env;
  if (!JWT_SECRET || JWT_SECRET.length < 32 || !OTP_SECRET || OTP_SECRET.length < 32) {
    throw new Error("JWT_SECRET and OTP_SECRET must be set, 32+ random characters each");
  }
  const users = db.collection("users"), rts = db.collection("refresh_tokens"), otps = db.collection("otps"), resets = db.collection("password_resets");
  const googleIds = GOOGLE_CLIENT_IDS.split(",").map((s) => s.trim()).filter(Boolean);
  const google = new OAuth2Client();
  const dummyHash = hashPassword(crypto.randomBytes(8).toString("hex")); // equalises timing for unknown emails

  const publicUser = (u) => ({ id: String(u._id), name: u.name || "", email: u.email ?? null, phone: u.phone ?? null, has_password: !!u.password_hash, created_at: u.created_at ?? null });
  const signAccess = (id) => jwt.sign({ sub: String(id) }, JWT_SECRET, { algorithm: "HS256", expiresIn: "15m", issuer: ISS });

  async function issueRefresh(userId, family = crypto.randomUUID()) {
    const token = crypto.randomBytes(32).toString("base64url");
    await rts.insertOne({ user_id: userId, token_hash: sha256(token), family, expires_at: new Date(Date.now() + REFRESH_MS), revoked_at: null, created_at: new Date() });
    return token;
  }
  const session = async (u) => ({ accessToken: signAccess(u._id), refreshToken: await issueRefresh(u._id), user: publicUser(u) });

  function readToken(req) {
    const h = req.get("authorization") || "";
    return h.startsWith("Bearer ") ? h.slice(7) : null;
  }
  function verify(req, res) {
    try {
      const p = jwt.verify(readToken(req), JWT_SECRET, { algorithms: ["HS256"], issuer: ISS });
      if (!ObjectId.isValid(p.sub)) throw new Error("bad subject");
      req.user = { id: p.sub };
      return true;
    } catch {
      res.status(401).json({ error: "Please sign in again." });
      return false;
    }
  }
  const requireAuth = (req, res, next) => { if (verify(req, res)) next(); };
  // Guests pass through. A token that is present but bad gets 401 so the client can refresh and retry.
  const optionalAuth = (req, res, next) => { if (!readToken(req) || verify(req, res)) next(); };

  const lim = (windowMs, limit, keyGenerator) => rateLimit({
    windowMs, limit, standardHeaders: true, legacyHeaders: false,
    message: { error: "Too many attempts. Please wait a few minutes and try again." },
    ...(keyGenerator ? { keyGenerator } : {}),
  });
  const ipLimit = lim(15 * 60_000, 30);
  const emailLimit = lim(15 * 60_000, 10, (req) => "e:" + String(req.body?.email || "").toLowerCase().slice(0, 80));
  const otpReqLimit = lim(10 * 60_000, 5);

  async function sendSms(phone, text) {
    if (!TWILIO_ACCOUNT_SID) {
      if (NODE_ENV === "production") throw new Error("SMS provider not configured");
      console.log(`[dev only] SMS to ${phone}: ${text}`);
      return;
    }
    const r = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${TWILIO_ACCOUNT_SID}/Messages.json`, {
      method: "POST",
      headers: { Authorization: "Basic " + Buffer.from(`${TWILIO_ACCOUNT_SID}:${TWILIO_AUTH_TOKEN}`).toString("base64") },
      body: new URLSearchParams({ To: "+91" + phone, From: TWILIO_FROM, Body: text }),
    });
    if (!r.ok) throw new Error("SMS send failed: " + r.status);
  }

  async function sendEmail(to, subject, text) {
    if (!RESEND_API_KEY) {
      if (NODE_ENV === "production") throw new Error("Email provider not configured");
      console.log(`[dev only] Email to ${to}: ${subject}\n${text}`);
      return;
    }
    const r = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: EMAIL_FROM, to: [to], subject, text }),
    });
    if (!r.ok) throw new Error("Email send failed: " + r.status);
  }

  const router = express.Router();

  /* ---------- Email + password ---------- */
  router.post("/register", ipLimit, async (req, res, next) => {
    const p = z.object({ name: Name, email: Email, password: Password }).strict().safeParse(req.body);
    if (!p.success) return res.status(400).json({ error: "Enter your name, a valid email, and a password of at least 8 characters." });
    try {
      const doc = { name: p.data.name, email: p.data.email, email_verified: false, password_hash: await hashPassword(p.data.password), created_at: new Date() };
      const r = await users.insertOne(doc);
      res.status(201).json(await session({ ...doc, _id: r.insertedId }));
    } catch (e) {
      if (e.code === DUP) return res.status(409).json({ error: "An account with this email already exists. Try signing in." });
      next(e);
    }
  });

  router.post("/login", ipLimit, emailLimit, async (req, res, next) => {
    const p = z.object({ email: Email, password: z.string().min(1).max(128) }).strict().safeParse(req.body);
    if (!p.success) return res.status(400).json(BAD);
    try {
      const u = await users.findOne({ email: p.data.email });
      const ok = await checkPassword(p.data.password, u?.password_hash || (await dummyHash));
      if (!u || !u.password_hash || !ok) return res.status(401).json({ error: "Incorrect email or password." });
      res.json(await session(u));
    } catch (e) { next(e); }
  });

  /* ---------- Phone OTP ---------- */
  router.post("/otp/request", otpReqLimit, async (req, res, next) => {
    const p = z.object({ phone: Phone }).strict().safeParse(req.body);
    if (!p.success) return res.status(400).json({ error: "Enter a 10-digit Indian mobile number." });
    const phone = p.data.phone;
    try {
      const [minute, hour] = await Promise.all([
        otps.countDocuments({ phone, created_at: { $gt: new Date(Date.now() - 60_000) } }),
        otps.countDocuments({ phone, created_at: { $gt: new Date(Date.now() - 3_600_000) } }),
      ]);
      if (minute > 0) return res.status(429).json({ error: "Please wait a minute before asking for another code." });
      if (hour >= 5) return res.status(429).json({ error: "Too many codes requested. Try again later." });
      const code = String(crypto.randomInt(0, 1_000_000)).padStart(6, "0");
      await otps.updateMany({ phone, used: false }, { $set: { used: true } });
      await otps.insertOne({ phone, code_hash: hmac(OTP_SECRET, `${phone}:${code}`), expires_at: new Date(Date.now() + 5 * 60_000), attempts: 0, used: false, created_at: new Date() });
      try { await sendSms(phone, `${code} is your Cartwell code. It expires in 5 minutes. Do not share it.`); }
      catch (e) { console.error(e); return res.status(502).json({ error: "We could not send the code. Please try again." }); }
      res.json({ ok: true });
    } catch (e) { next(e); }
  });

  router.post("/otp/verify", ipLimit, async (req, res, next) => {
    const p = z.object({ phone: Phone, code: z.string().regex(/^\d{6}$/) }).strict().safeParse(req.body);
    if (!p.success) return res.status(400).json({ error: "Enter the 6-digit code." });
    const { phone, code } = p.data;
    const fail = () => res.status(400).json({ error: "That code is wrong or has expired." });
    try {
      const latest = await otps.findOne({ phone, used: false, expires_at: { $gt: new Date() } }, { sort: { created_at: -1 } });
      if (!latest) return fail();
      // Atomically count the attempt; at most 5 tries per code.
      const o = await otps.findOneAndUpdate({ _id: latest._id, used: false, attempts: { $lt: 5 } }, { $inc: { attempts: 1 } }, { returnDocument: "after" });
      if (!o || !eq(hmac(OTP_SECRET, `${phone}:${code}`), o.code_hash)) return fail();
      const used = await otps.updateOne({ _id: o._id, used: false }, { $set: { used: true } });
      if (used.modifiedCount !== 1) return fail();
      const find = () => users.findOneAndUpdate({ phone }, { $setOnInsert: { name: "", email_verified: false, created_at: new Date() } }, { upsert: true, returnDocument: "after" });
      let u;
      try { u = await find(); } catch (e) { if (e.code !== DUP) throw e; u = await find(); } // two simultaneous first sign-ins
      res.json(await session(u));
    } catch (e) { next(e); }
  });

  /* ---------- Password reset (6-digit code sent by email) ---------- */
  const forgotLimit = lim(60 * 60_000, 5, (req) => "f:" + String(req.body?.email || "").toLowerCase().slice(0, 80));
  router.post("/password/forgot", ipLimit, forgotLimit, async (req, res) => {
    const p = z.object({ email: Email }).strict().safeParse(req.body);
    if (!p.success) return res.status(400).json({ error: "Enter a valid email address." });
    res.json({ ok: true }); // identical answer and speed whether or not the account exists; the work happens after replying
    try {
      const email = p.data.email;
      const u = await users.findOne({ email });
      if (!u) return;
      if (await resets.countDocuments({ user_id: u._id, created_at: { $gt: new Date(Date.now() - 60_000) } })) return;
      const code = String(crypto.randomInt(0, 1_000_000)).padStart(6, "0");
      await resets.updateMany({ user_id: u._id, used: false }, { $set: { used: true } });
      await resets.insertOne({ user_id: u._id, code_hash: hmac(OTP_SECRET, `reset:${email}:${code}`), expires_at: new Date(Date.now() + 15 * 60_000), attempts: 0, used: false, created_at: new Date() });
      await sendEmail(email, "Your Cartwell password reset code",
        `Your Cartwell password reset code is ${code}.\n\nIt expires in 15 minutes. If you did not ask for this, you can ignore this email and your password will stay the same.`);
    } catch (e) { console.error("password reset email failed", e); }
  });

  router.post("/password/reset", ipLimit, emailLimit, async (req, res, next) => {
    const p = z.object({ email: Email, code: z.string().regex(/^\d{6}$/), password: Password }).strict().safeParse(req.body);
    if (!p.success) return res.status(400).json({ error: "Enter the 6-digit code and a new password of at least 8 characters." });
    const { email, code, password } = p.data;
    const fail = () => res.status(400).json({ error: "That code is wrong or has expired." });
    try {
      const u = await users.findOne({ email });
      if (!u) return fail();
      const latest = await resets.findOne({ user_id: u._id, used: false, expires_at: { $gt: new Date() } }, { sort: { created_at: -1 } });
      if (!latest) return fail();
      // Atomically count the attempt; at most 5 tries per code.
      const r = await resets.findOneAndUpdate({ _id: latest._id, used: false, attempts: { $lt: 5 } }, { $inc: { attempts: 1 } }, { returnDocument: "after" });
      if (!r || !eq(hmac(OTP_SECRET, `reset:${email}:${code}`), r.code_hash)) return fail();
      const used = await resets.updateOne({ _id: r._id, used: false }, { $set: { used: true } });
      if (used.modifiedCount !== 1) return fail();
      // Receiving the code proves the person owns this email, so it also becomes verified.
      const nu = await users.findOneAndUpdate({ _id: u._id }, { $set: { password_hash: await hashPassword(password), email_verified: true } }, { returnDocument: "after" });
      await rts.updateMany({ user_id: u._id, revoked_at: null }, { $set: { revoked_at: new Date() } }); // sign out every other device
      res.json(await session(nu));
    } catch (e) { next(e); }
  });

  /* ---------- Google ---------- */
  router.post("/google", ipLimit, async (req, res, next) => {
    const p = z.object({ idToken: z.string().min(20).max(4096) }).strict().safeParse(req.body);
    if (!p.success || !googleIds.length) return res.status(400).json(BAD);
    let g;
    try { g = (await google.verifyIdToken({ idToken: p.data.idToken, audience: googleIds })).getPayload(); }
    catch { return res.status(401).json({ error: "Google sign-in could not be verified." }); }
    if (!g?.sub || !g.email || !g.email_verified) return res.status(401).json({ error: "Your Google email is not verified." });
    const email = g.email.toLowerCase(), name = (g.name || "").slice(0, 60);
    try {
      let u = await users.findOne({ google_sub: g.sub });
      if (!u) {
        // Link to an existing account with the same email. If that account's email was never verified,
        // drop its password so whoever pre-registered the address cannot keep access.
        u = await users.findOneAndUpdate(
          { email, google_sub: { $exists: false } },
          [{ $set: {
            google_sub: { $literal: g.sub },
            password_hash: { $cond: [{ $eq: ["$email_verified", true] }, "$password_hash", "$$REMOVE"] },
            email_verified: true,
            name: { $cond: [{ $eq: [{ $ifNull: ["$name", ""] }, ""] }, { $literal: name }, "$name"] },
          } }],
          { returnDocument: "after" });
      }
      if (!u) {
        const doc = { name, email, email_verified: true, google_sub: g.sub, created_at: new Date() };
        u = { ...doc, _id: (await users.insertOne(doc)).insertedId };
      }
      res.json(await session(u));
    } catch (e) { next(e); }
  });

  /* ---------- Sessions ---------- */
  const TokenBody = z.object({ refreshToken: z.string().min(20).max(100) }).strict();
  router.post("/refresh", ipLimit, async (req, res, next) => {
    const p = TokenBody.safeParse(req.body);
    const again = () => res.status(401).json({ error: "Please sign in again." });
    if (!p.success) return again();
    try {
      const hash = sha256(p.data.refreshToken);
      // Atomically use up the token: only one request can win.
      const t = await rts.findOneAndUpdate({ token_hash: hash, revoked_at: null, expires_at: { $gt: new Date() } }, { $set: { revoked_at: new Date() } }, { returnDocument: "before" });
      if (!t) {
        const old = await rts.findOne({ token_hash: hash });
        if (old?.revoked_at) await rts.updateMany({ family: old.family, revoked_at: null }, { $set: { revoked_at: new Date() } }); // replayed token: end the whole session family
        return again();
      }
      const u = await users.findOne({ _id: t.user_id });
      if (!u) return again();
      res.json({ accessToken: signAccess(u._id), refreshToken: await issueRefresh(u._id, t.family), user: publicUser(u) });
    } catch (e) { next(e); }
  });

  router.post("/logout", ipLimit, async (req, res, next) => {
    const p = TokenBody.safeParse(req.body);
    if (!p.success) return res.json({ ok: true });
    try {
      const t = await rts.findOne({ token_hash: sha256(p.data.refreshToken) });
      if (t) await rts.updateMany({ family: t.family, revoked_at: null }, { $set: { revoked_at: new Date() } });
      res.json({ ok: true });
    } catch (e) { next(e); }
  });

  /* ---------- Signed-in user ---------- */
  const meRouter = express.Router();
  meRouter.use(requireAuth);
  meRouter.get("/", async (req, res, next) => {
    try {
      const u = await users.findOne({ _id: new ObjectId(req.user.id) });
      if (!u) return res.status(401).json({ error: "Please sign in again." });
      res.json(publicUser(u));
    } catch (e) { next(e); }
  });
  meRouter.patch("/", async (req, res, next) => {
    const p = z.object({ name: Name }).strict().safeParse(req.body);
    if (!p.success) return res.status(400).json({ error: "Enter your full name (2 to 60 characters)." });
    try {
      const u = await users.findOneAndUpdate({ _id: new ObjectId(req.user.id) }, { $set: { name: p.data.name } }, { returnDocument: "after" });
      if (!u) return res.status(401).json({ error: "Please sign in again." });
      res.json(publicUser(u));
    } catch (e) { next(e); }
  });
  const pwLimit = lim(60 * 60_000, 10, (req) => "pw:" + req.user.id);
  meRouter.post("/password", pwLimit, async (req, res, next) => {
    const p = z.object({ currentPassword: z.string().min(1).max(128), newPassword: Password }).strict().safeParse(req.body);
    if (!p.success) return res.status(400).json({ error: "Enter your current password and a new one of at least 8 characters." });
    try {
      const u = await users.findOne({ _id: new ObjectId(req.user.id) });
      if (!u) return res.status(401).json({ error: "Please sign in again." });
      if (!u.password_hash) return res.status(400).json({ error: "This account has no password yet. Use “Forgot password” on the sign-in screen to set one." });
      if (!(await checkPassword(p.data.currentPassword, u.password_hash))) return res.status(400).json({ error: "Your current password is incorrect." });
      const nu = await users.findOneAndUpdate({ _id: u._id }, { $set: { password_hash: await hashPassword(p.data.newPassword) } }, { returnDocument: "after" });
      await rts.updateMany({ user_id: u._id, revoked_at: null }, { $set: { revoked_at: new Date() } }); // sign out every other device
      res.json(await session(nu));
    } catch (e) { next(e); }
  });
  /* ---------- Saved delivery addresses ---------- */
  const addrs = db.collection("addresses");
  const AddrFields = z.object({ name: Name, phone: Phone, pin: z.string().regex(/^\d{6}$/), addr: z.string().trim().min(8).max(120) });
  const AddrBody = AddrFields.extend({ is_default: z.boolean().optional() }).strict();
  const BAD_ADDR = { error: "Check the address details and try again." };
  const publicAddr = (a) => ({ id: String(a._id), name: a.name, phone: a.phone, pin: a.pin, addr: a.addr, is_default: !!a.is_default });
  const addrLimit = lim(60 * 60_000, 60, (req) => "ad:" + req.user.id);
  const oid = (s) => (/^[0-9a-f]{24}$/i.test(String(s)) ? new ObjectId(s) : null);
  const MAX_ADDRESSES = 10;

  meRouter.get("/addresses", async (req, res, next) => {
    try {
      const rows = await addrs.find({ user_id: new ObjectId(req.user.id) }).sort({ is_default: -1, created_at: -1 }).toArray();
      res.json(rows.map(publicAddr));
    } catch (e) { next(e); }
  });

  meRouter.post("/addresses", addrLimit, async (req, res, next) => {
    const p = AddrBody.safeParse(req.body);
    if (!p.success) return res.status(400).json(BAD_ADDR);
    const uid = new ObjectId(req.user.id);
    try {
      const count = await addrs.countDocuments({ user_id: uid });
      if (count >= MAX_ADDRESSES) return res.status(400).json({ error: `You can save up to ${MAX_ADDRESSES} addresses. Remove one to add another.` });
      const { is_default, ...fields } = p.data;
      const makeDefault = count === 0 || is_default === true; // the first address is always the default
      if (makeDefault) await addrs.updateMany({ user_id: uid, is_default: true }, { $set: { is_default: false } });
      const doc = { user_id: uid, ...fields, is_default: makeDefault, created_at: new Date() };
      const r = await addrs.insertOne(doc);
      res.status(201).json(publicAddr({ ...doc, _id: r.insertedId }));
    } catch (e) { next(e); }
  });

  meRouter.patch("/addresses/:id", addrLimit, async (req, res, next) => {
    const _id = oid(req.params.id), p = AddrBody.safeParse(req.body);
    if (!_id || !p.success) return res.status(400).json(BAD_ADDR);
    const uid = new ObjectId(req.user.id);
    try {
      if (!(await addrs.findOne({ _id, user_id: uid }))) return res.status(404).json({ error: "Address not found." });
      const { is_default, ...set } = p.data;
      if (is_default === true) {
        await addrs.updateMany({ user_id: uid, is_default: true, _id: { $ne: _id } }, { $set: { is_default: false } });
        set.is_default = true;
      }
      const a = await addrs.findOneAndUpdate({ _id, user_id: uid }, { $set: set }, { returnDocument: "after" });
      res.json(publicAddr(a));
    } catch (e) { next(e); }
  });

  meRouter.post("/addresses/:id/default", addrLimit, async (req, res, next) => {
    const _id = oid(req.params.id);
    if (!_id) return res.status(400).json(BAD_ADDR);
    const uid = new ObjectId(req.user.id);
    try {
      if (!(await addrs.findOne({ _id, user_id: uid }))) return res.status(404).json({ error: "Address not found." });
      await addrs.updateMany({ user_id: uid, is_default: true, _id: { $ne: _id } }, { $set: { is_default: false } });
      await addrs.updateOne({ _id, user_id: uid }, { $set: { is_default: true } });
      res.json({ ok: true });
    } catch (e) { next(e); }
  });

  meRouter.delete("/addresses/:id", addrLimit, async (req, res, next) => {
    const _id = oid(req.params.id);
    if (!_id) return res.status(400).json(BAD_ADDR);
    const uid = new ObjectId(req.user.id);
    try {
      const gone = await addrs.findOneAndDelete({ _id, user_id: uid });
      if (!gone) return res.status(404).json({ error: "Address not found." });
      if (gone.is_default) { // promote the newest remaining address
        const next1 = await addrs.findOne({ user_id: uid }, { sort: { created_at: -1 } });
        if (next1) await addrs.updateOne({ _id: next1._id }, { $set: { is_default: true } });
      }
      res.json({ ok: true });
    } catch (e) { next(e); }
  });

  meRouter.get("/orders", async (req, res, next) => {
    try {
      const rows = await db.collection("orders")
        .find({ user_id: new ObjectId(req.user.id), status: { $in: ["paid", "failed"] } })
        .sort({ created_at: -1 }).limit(50).toArray();
      res.json(rows.map((o) => ({
        id: String(o._id), status: o.status, amount_paise: o.amount_paise, created_at: o.created_at, refund_status: o.refund_status ?? null,
        ship_to: { name: o.customer?.name ?? "", addr: o.customer?.addr ?? "", pin: o.customer?.pin ?? "" },
        items: o.items.map((i) => ({ product_id: i.product_id, name: i.name, qty: i.qty, price_paise: i.price_paise })),
      })));
    } catch (e) { next(e); }
  });

  return { router, meRouter, requireAuth, optionalAuth };
}
