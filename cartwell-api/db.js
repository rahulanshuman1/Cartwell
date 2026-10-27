import { MongoClient } from "mongodb";

export async function connectDb() {
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error("Missing env var MONGODB_URI");
  const client = new MongoClient(uri, { maxPoolSize: 10, serverSelectionTimeoutMS: 10000 });
  await client.connect();
  const db = client.db(process.env.MONGODB_DB || "cartwell");
  await ensureIndexes(db);
  return { client, db };
}

async function ensureIndexes(db) {
  const str = { $type: "string" }; // unique only when the field is actually set
  const uniq = (field) => ({ unique: true, partialFilterExpression: { [field]: str } });
  await Promise.all([
    db.collection("users").createIndex({ email: 1 }, uniq("email")),
    db.collection("users").createIndex({ phone: 1 }, uniq("phone")),
    db.collection("users").createIndex({ google_sub: 1 }, uniq("google_sub")),
    db.collection("orders").createIndex({ razorpay_order_id: 1 }, uniq("razorpay_order_id")),
    db.collection("orders").createIndex({ razorpay_payment_id: 1 }, uniq("razorpay_payment_id")),
    db.collection("orders").createIndex({ user_id: 1, created_at: -1 }),
    db.collection("orders").createIndex({ status: 1, refund_status: 1, refund_next_at: 1 }),
    db.collection("refresh_tokens").createIndex({ token_hash: 1 }, { unique: true }),
    db.collection("refresh_tokens").createIndex({ family: 1 }),
    db.collection("refresh_tokens").createIndex({ expires_at: 1 }, { expireAfterSeconds: 0 }),
    db.collection("password_resets").createIndex({ user_id: 1, created_at: -1 }),
    db.collection("password_resets").createIndex({ created_at: 1 }, { expireAfterSeconds: 86400 }),
    db.collection("otps").createIndex({ phone: 1, created_at: -1 }),
    db.collection("otps").createIndex({ created_at: 1 }, { expireAfterSeconds: 86400 }),
  ]);
}
