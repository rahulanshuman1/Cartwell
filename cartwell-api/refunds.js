// Automatic refunds for orders that were paid but could not be fulfilled (item sold out).
// Order refund_status: pending -> processing -> initiated -> refunded, or "manual" after repeated failures.
export function createRefunds({ orders, rzp }) {
  const MAX_ATTEMPTS = 8;
  const backoffMs = (n) => Math.min(2 ** n * 5 * 60_000, 6 * 3_600_000); // 10 min, 20 min, ... up to 6 hours

  async function refundOrder(orderId) {
    // Claim the order atomically so two workers never refund the same order at once.
    const o = await orders.findOneAndUpdate(
      { _id: orderId, status: "failed", refund_status: "pending" },
      { $set: { refund_status: "processing", refund_started_at: new Date() }, $inc: { refund_attempts: 1 } },
      { returnDocument: "after" });
    if (!o) return null;
    try {
      // If a refund already exists at Razorpay (for example we crashed after creating it), reuse it instead of refunding twice.
      const existing = await rzp.payments.fetchMultipleRefund(o.razorpay_payment_id);
      let refund = (existing?.items || []).find((r) => r.status !== "failed");
      if (!refund) {
        refund = await rzp.payments.refund(o.razorpay_payment_id, {
          amount: o.amount_paise, speed: "normal", notes: { reason: "Item out of stock", order: String(o._id) },
        });
      }
      const done = refund.status === "processed";
      await orders.updateOne({ _id: o._id }, { $set: {
        refund_id: refund.id, refund_status: done ? "refunded" : "initiated", refund_error: null, ...(done ? { refunded_at: new Date() } : {}),
      } });
      return refund;
    } catch (e) {
      const msg = String(e?.error?.description || e?.message || e).slice(0, 200);
      const giveUp = o.refund_attempts >= MAX_ATTEMPTS;
      await orders.updateOne({ _id: o._id }, { $set: {
        refund_status: giveUp ? "manual" : "pending", refund_error: msg, refund_next_at: new Date(Date.now() + backoffMs(o.refund_attempts)),
      } });
      console.error(giveUp ? "REFUND NEEDS MANUAL ACTION" : "refund failed, will retry", { order: String(o._id), msg });
      return null;
    }
  }

  // Retries refunds that are due, and frees ones stuck "processing" after a crash.
  async function sweep() {
    const now = new Date();
    await orders.updateMany(
      { status: "failed", refund_status: "processing", refund_started_at: { $lt: new Date(now - 15 * 60_000) } },
      { $set: { refund_status: "pending", refund_next_at: now } });
    const due = await orders.find({ status: "failed", refund_status: "pending", refund_next_at: { $lte: now } }).limit(20).toArray();
    for (const o of due) await refundOrder(o._id);
    return due.length;
  }

  return { refundOrder, sweep };
}
