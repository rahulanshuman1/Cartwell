import "dotenv/config";
import crypto from "node:crypto";
import express from "express";
import helmet from "helmet";
import cors from "cors";
import rateLimit from "express-rate-limit";
import { ObjectId } from "mongodb";
import Razorpay from "razorpay";
import { z } from "zod";
import { connectDb } from "./db.js";
import { createAuth } from "./auth.js";
import { createRefunds } from "./refunds.js";

const { PORT = 3000, ALLOWED_ORIGINS = "", RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET, RAZORPAY_WEBHOOK_SECRET } = process.env;
for (const [k, v] of Object.entries({ RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET, RAZORPAY_WEBHOOK_SECRET })) {
  if (!v) throw new Error(`Missing env var ${k}`);
}

const { client, db } = await connectDb();
const products = db.collection("products");
const orders = db.collection("orders");
const rzp = new Razorpay({ key_id: RAZORPAY_KEY_ID, key_secret: RAZORPAY_KEY_SECRET });
const refunds = createRefunds({ orders, rzp });

const app = express();
app.disable("x-powered-by");
app.set("trust proxy", 1); // Render puts one proxy in front of the app
app.use(helmet());

const eq = (a, b) => {
  const x = Buffer.from(String(a)), y = Buffer.from(String(b));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
};
const hmac = (secret, data) => crypto.createHmac("sha256", secret).update(data).digest("hex");

class OutOfStock extends Error {}

/* Marks an order paid exactly once, inside a MongoDB transaction (needs Atlas or any replica set).
   Safe to call from both the browser callback and the webhook. */
async function markPaid(rzpOrderId, paymentId, amountPaise) {
  const s = client.startSession();
  let result = "unknown", failedId = null;
  try {
    await s.withTransaction(async () => {
      result = "unknown"; failedId = null; // the callback can be retried by the driver
      const o = await orders.findOne({ razorpay_order_id: rzpOrderId }, { session: s });
      if (!o) return;
      if (o.status === "paid" || o.status === "failed") { result = o.status; return; }
      if (amountPaise != null && Number(amountPaise) !== o.amount_paise) { result = "amount_mismatch"; return; }
      for (const it of o.items) {
        const r = await products.updateOne({ _id: it.product_id, stock: { $gte: it.qty } }, { $inc: { stock: -it.qty } }, { session: s });
        if (r.modifiedCount !== 1) { failedId = o._id; throw new OutOfStock(); }
      }
      await orders.updateOne({ _id: o._id }, { $set: { status: "paid", razorpay_payment_id: paymentId, paid_at: new Date() } }, { session: s });
      result = "paid";
    });
  } catch (e) {
    if (!(e instanceof OutOfStock)) throw e;
    // Paid but sold out: cancel the order and refund the customer automatically.
    await orders.updateOne({ _id: failedId, status: "created" }, { $set: {
      status: "failed", razorpay_payment_id: paymentId, refund_status: "pending", refund_attempts: 0, refund_next_at: new Date(),
    } });
    console.error("OUT OF STOCK after payment, refunding", { order: String(failedId), paymentId });
    refunds.refundOrder(failedId).catch((err) => console.error("refund error", err));
    result = "failed";
  } finally { await s.endSession(); }
  return result;
}

/* Webhook: the source of truth for payment. Needs the RAW body, so it is registered before express.json(). */
app.post("/api/webhooks/razorpay", express.raw({ type: "application/json", limit: "100kb" }), async (req, res) => {
  const sig = req.get("x-razorpay-signature") || "";
  if (!Buffer.isBuffer(req.body) || !eq(hmac(RAZORPAY_WEBHOOK_SECRET, req.body), sig)) return res.status(400).send("bad signature");
  try {
    const ev = JSON.parse(req.body.toString("utf8"));
    if (ev.event === "payment.captured" || ev.event === "order.paid") {
      const p = ev.payload?.payment?.entity;
      if (p?.order_id) await markPaid(p.order_id, p.id, p.amount);
    }
    if (ev.event === "refund.processed" || ev.event === "refund.failed") {
      const r = ev.payload?.refund?.entity;
      if (r?.payment_id) {
        const ok = ev.event === "refund.processed";
        await orders.updateOne({ razorpay_payment_id: r.payment_id, status: "failed" }, { $set: ok
          ? { refund_status: "refunded", refund_id: r.id, refunded_at: new Date() }
          : { refund_status: "manual", refund_error: "Razorpay reported that the refund failed" } });
      }
    }
    res.json({ ok: true });
  } catch (e) {
    console.error("webhook error", e);
    res.status(500).send("error"); // Razorpay will retry
  }
});

app.use(cors({ origin: ALLOWED_ORIGINS.split(",").map((s) => s.trim()).filter(Boolean), methods: ["GET", "POST", "PATCH", "DELETE"] }));
app.use(express.json({ limit: "20kb" }));
app.use("/api/", rateLimit({ windowMs: 60_000, limit: 60, standardHeaders: true, legacyHeaders: false }));

const auth = createAuth(db);
app.use("/api/auth", auth.router);
app.use("/api/me", auth.meRouter);
const orderLimiter = rateLimit({ windowMs: 10 * 60_000, limit: 15, standardHeaders: true, legacyHeaders: false });

app.get("/api/health", (_req, res) => res.json({ ok: true }));

app.get("/api/products", async (_req, res, next) => {
  try {
    const rows = await products.find().sort({ _id: 1 }).toArray();
    res.json(rows.map((p) => ({ id: p._id, name: p.name, price_paise: p.price_paise, stock: p.stock })));
  } catch (e) { next(e); }
});

const OrderBody = z.object({
  items: z.array(z.object({ id: z.number().int().positive(), qty: z.number().int().min(1).max(10) }))
          .min(1).max(30)
          .refine((a) => new Set(a.map((i) => i.id)).size === a.length, "duplicate items"),
  customer: z.object({
    name: z.string().trim().min(2).max(60),
    email: z.string().trim().email().max(80),
    phone: z.string().regex(/^[6-9]\d{9}$/),
    pin: z.string().regex(/^\d{6}$/),
    addr: z.string().trim().min(8).max(120),
  }).strict(),
}).strict();

/* Creates the order. Prices come ONLY from the database, never from the client. */
app.post("/api/orders", orderLimiter, auth.optionalAuth, async (req, res, next) => {
  const parsed = OrderBody.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid order details." });
  const { items, customer } = parsed.data;
  try {
    const prods = await products.find({ _id: { $in: items.map((i) => i.id) } }).toArray();
    const byId = new Map(prods.map((p) => [p._id, p]));
    let subtotal = 0;
    for (const it of items) {
      const p = byId.get(it.id);
      if (!p) return res.status(400).json({ error: "A product in your cart no longer exists." });
      if (p.stock < it.qty) return res.status(409).json({ error: "An item in your cart is out of stock." });
      subtotal += p.price_paise * it.qty;
    }
    const amount = subtotal + (subtotal >= 49900 ? 0 : 4900);

    const { insertedId } = await orders.insertOne({
      status: "created", amount_paise: amount, customer, created_at: new Date(),
      user_id: req.user ? new ObjectId(req.user.id) : null,
      items: items.map((it) => ({ product_id: it.id, name: byId.get(it.id).name, qty: it.qty, price_paise: byId.get(it.id).price_paise })),
    });
    let rp;
    try { rp = await rzp.orders.create({ amount, currency: "INR", receipt: String(insertedId) }); }
    catch (e) { await orders.deleteOne({ _id: insertedId }); throw e; }
    await orders.updateOne({ _id: insertedId }, { $set: { razorpay_order_id: rp.id } });
    res.status(201).json({ orderId: String(insertedId), razorpayOrderId: rp.id, amount, currency: "INR", keyId: RAZORPAY_KEY_ID });
  } catch (e) { next(e); }
});

/* Called by the client after Razorpay Checkout succeeds. */
const VerifyBody = z.object({
  razorpay_order_id: z.string().max(60), razorpay_payment_id: z.string().max(60), razorpay_signature: z.string().max(128),
}).strict();
app.post("/api/payments/verify", async (req, res, next) => {
  const p = VerifyBody.safeParse(req.body);
  if (!p.success) return res.status(400).json({ error: "Invalid request." });
  const { razorpay_order_id: oid, razorpay_payment_id: pid, razorpay_signature: sig } = p.data;
  if (!eq(hmac(RAZORPAY_KEY_SECRET, `${oid}|${pid}`), sig)) return res.status(400).json({ error: "Payment could not be verified." });
  try { res.json({ status: await markPaid(oid, pid, null) }); } catch (e) { next(e); }
});

app.get("/api/orders/:id/status", async (req, res, next) => {
  if (!/^[0-9a-f]{24}$/i.test(req.params.id)) return res.status(400).json({ error: "Invalid id." });
  try {
    const o = await orders.findOne({ _id: new ObjectId(req.params.id) }, { projection: { status: 1 } });
    if (!o) return res.status(404).json({ error: "Order not found." });
    res.json({ status: o.status });
  } catch (e) { next(e); }
});

app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({ error: "Something went wrong. Please try again." });
});

app.listen(PORT, () => console.log(`Cartwell API on :${PORT}`));

// Retry any refunds that are due, shortly after start-up and then every 10 minutes while the server is awake.
setTimeout(() => refunds.sweep().catch(console.error), 30_000);
setInterval(() => refunds.sweep().catch(console.error), 10 * 60_000);
