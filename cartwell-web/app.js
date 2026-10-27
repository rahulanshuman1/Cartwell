(function () {
"use strict";
var API = String(window.CARTWELL_API_URL || "").replace(/\/$/, "");
var RT = "cartwell.rt", CART = "cartwell.cart.v1";
var META = {
  1: { e: "🎧", t: "#dbeafe", c: "Electronics", d: "Bluetooth 5.3, 30-hour battery with case, touch controls." },
  2: { e: "⌚", t: "#e0e7ff", c: "Electronics", d: "1.8-inch display, heart-rate and sleep tracking, 7-day battery." },
  3: { e: "🔌", t: "#fef3c7", c: "Electronics", d: "USB-C fast charger with built-in overcurrent protection." },
  4: { e: "👕", t: "#fce7f3", c: "Fashion", d: "180 GSM combed cotton, pre-shrunk, regular fit." },
  5: { e: "👟", t: "#dcfce7", c: "Fashion", d: "Lightweight mesh upper with cushioned sole for daily runs." },
  6: { e: "🎒", t: "#ffedd5", c: "Fashion", d: "Water-resistant fabric, padded laptop sleeve, 3 compartments." },
  7: { e: "🍶", t: "#cffafe", c: "Home", d: "Double-wall insulated. Keeps drinks cold 24 hours, hot 12 hours." },
  8: { e: "🍳", t: "#fee2e2", c: "Home", d: "3-piece induction-friendly set with heat-resistant handles." },
  9: { e: "💡", t: "#fef9c3", c: "Home", d: "3 colour modes, 5 brightness levels, flexible neck, USB powered." },
  10: { e: "📘", t: "#e0f2fe", c: "Books", d: "A practical guide to building good habits and breaking bad ones." },
  11: { e: "🧘", t: "#ede9fe", c: "Sports", d: "Anti-slip, high-density foam, carry strap included." },
  12: { e: "🏏", t: "#ecfccb", c: "Sports", d: "Full-size, well balanced, ideal for tennis-ball and leather practice." }
};
var meta = function (id) { return META[id] || { e: "📦", t: "#e5e7eb", c: "Other", d: "" }; };
// Shows a product photo (images/<id>.jpg) when CARTWELL_PRODUCT_IMAGES is true in config.js, otherwise an emoji tile.
function fillVisual(node, p, m) {
  var emoji = function () { node.textContent = ""; node.appendChild(el("span", { class: "emo", "aria-hidden": "true", text: m.e })); };
  if (window.CARTWELL_PRODUCT_IMAGES) {
    var img = el("img", { src: "images/" + p.id + ".jpg", alt: p.name, loading: "lazy" });
    img.addEventListener("error", emoji);
    node.appendChild(img);
  } else emoji();
}
var products = [], byId = {}, cart = {}, cat = "All", sortBy = "rel", query = "", loading = true, loadError = "";
var accessToken = null, user = null;
var $ = function (s) { return document.querySelector(s); };
var inr = function (p) { return "₹" + (p / 100).toLocaleString("en-IN"); };

function el(tag, attrs, kids) {
  var x = document.createElement(tag);
  for (var k in (attrs || {})) {
    if (k === "text") x.textContent = attrs[k];
    else if (k.slice(0, 2) === "on") x.addEventListener(k.slice(2), attrs[k]);
    else x.setAttribute(k, attrs[k]);
  }
  (kids || []).forEach(function (c) { x.appendChild(typeof c === "string" ? document.createTextNode(c) : c); });
  return x;
}
function toast(m) { var t = $("#toast"); t.textContent = m; t.hidden = false; clearTimeout(toast.h); toast.h = setTimeout(function () { t.hidden = true; }, 2200); }
function openDlg(d) { if (!d.open) d.showModal(); }

/* ---------------- API client ---------------- */
function getRT() { try { return sessionStorage.getItem(RT); } catch (e) { return null; } }
function setRT(v) { try { if (v) sessionStorage.setItem(RT, v); else sessionStorage.removeItem(RT); } catch (e) {} }

async function raw(path, opt, token) {
  var ctrl = new AbortController();
  var timer = setTimeout(function () { ctrl.abort(); }, 60000); // free Render servers can take ~a minute to wake up
  try {
    var headers = { "Content-Type": "application/json" };
    if (token) headers.Authorization = "Bearer " + token;
    var res = await fetch(API + path, Object.assign({}, opt, { signal: ctrl.signal, headers: headers }));
    var data = await res.json().catch(function () { return {}; });
    if (!res.ok) { var err = new Error(data.error || "Something went wrong. Please try again."); err.status = res.status; throw err; }
    return data;
  } catch (e) {
    if (e.name === "AbortError") throw new Error("The server took too long to respond. Please try again.");
    if (e instanceof TypeError) throw new Error("Can’t reach the server. Check your connection and try again.");
    throw e;
  } finally { clearTimeout(timer); }
}
function saveSession(s) { accessToken = s.accessToken; setRT(s.refreshToken); user = s.user; syncHeader(); }
function dropSession() { accessToken = null; user = null; setRT(null); syncHeader(); }
var refreshing = null;
function refresh() {
  if (!refreshing) {
    refreshing = (async function () {
      var rt = getRT();
      if (!rt) { var e = new Error("no session"); e.status = 401; throw e; }
      var s = await raw("/api/auth/refresh", { method: "POST", body: JSON.stringify({ refreshToken: rt }) });
      saveSession(s);
    })().finally(function () { refreshing = null; });
  }
  return refreshing;
}
async function api(path, opt, mode) {
  var useToken = mode === "auth" || (mode === "optional" && !!accessToken);
  try { return await raw(path, opt, useToken ? accessToken : null); }
  catch (e) {
    if (e.status === 401 && useToken) {
      try { await refresh(); }
      catch (e2) { if (e2.status === 401) { dropSession(); throw new Error("Please sign in again."); } throw e2; }
      return raw(path, opt, accessToken);
    }
    throw e;
  }
}
var post = function (path, body, mode) { return api(path, { method: "POST", body: JSON.stringify(body) }, mode); };

/* ---------------- Cart ---------------- */
function saveCart() { try { localStorage.setItem(CART, JSON.stringify(cart)); } catch (e) {} }
function loadCart() {
  try {
    var v = JSON.parse(localStorage.getItem(CART) || "{}");
    Object.keys(v).forEach(function (k) { var id = +k, q = Math.floor(+v[k]); if (id > 0 && q > 0 && q <= 10) cart[id] = q; });
  } catch (e) {}
}
function count() { return Object.keys(cart).reduce(function (a, k) { return a + cart[k]; }, 0); }
function sync() { var c = count(); $("#cnt").textContent = c; $("#cnt").hidden = c === 0; }
function add(id, n) { cart[id] = Math.min(10, (cart[id] || 0) + n); if (cart[id] <= 0) delete cart[id]; saveCart(); sync(); }
function cartIds() { return Object.keys(cart).filter(function (k) { return byId[k]; }); }
function money() {
  var sub = cartIds().reduce(function (a, k) { return a + byId[k].price_paise * cart[k]; }, 0);
  var ship = sub >= 49900 ? 0 : 4900;
  return { sub: sub, ship: ship, total: sub + ship };
}
function syncHeader() { $("#acctLabel").textContent = user ? (user.name ? user.name.split(" ")[0] : "Account") : "Sign in"; }

/* ---------------- Catalogue ---------------- */
async function loadProducts() {
  loading = true; loadError = ""; drawGrid();
  try {
    products = await api("/api/products");
    byId = {}; products.forEach(function (p) { byId[p.id] = p; });
  } catch (e) { loadError = e.message; }
  loading = false; drawCats(); drawGrid();
}
function drawCats() {
  var b = $("#cats"); b.textContent = "";
  var cs = ["All"]; products.forEach(function (p) { var c = meta(p.id).c; if (cs.indexOf(c) < 0) cs.push(c); });
  cs.forEach(function (c) { b.appendChild(el("button", { class: "chip", type: "button", "aria-pressed": String(c === cat), text: c, onclick: function () { cat = c; drawCats(); drawGrid(); } })); });
}
function drawGrid() {
  var g = $("#grid"); g.textContent = "";
  if (loading) {
    $("#res").textContent = "Loading products. If the server was asleep, this can take up to a minute the first time.";
    for (var s = 0; s < 8; s++) g.appendChild(el("div", { class: "card skel", "aria-hidden": "true" }, [el("div", { class: "pic" }), el("div", { class: "info" }, [el("div", { class: "sk l1" }), el("div", { class: "sk l2" })])]));
    return;
  }
  if (loadError) { $("#res").textContent = ""; g.appendChild(el("div", { class: "empty" }, [el("div", { text: loadError }), el("button", { class: "btn alt", type: "button", text: "Try again", onclick: loadProducts })])); return; }
  var l = products.filter(function (p) {
    var m = meta(p.id);
    return (cat === "All" || m.c === cat) && (!query || p.name.toLowerCase().indexOf(query) > -1 || m.c.toLowerCase().indexOf(query) > -1);
  });
  if (sortBy === "lo") l.sort(function (a, b) { return a.price_paise - b.price_paise; });
  if (sortBy === "hi") l.sort(function (a, b) { return b.price_paise - a.price_paise; });
  $("#res").textContent = l.length + " product" + (l.length === 1 ? "" : "s");
  if (!l.length) { g.appendChild(el("div", { class: "empty", text: "No products match your search. Try a different word or clear the category." })); return; }
  l.forEach(function (p) {
    var m = meta(p.id), out = p.stock <= 0;
    var addBtn = el("button", { class: "btn", type: "button", text: out ? "Out of stock" : "Add to cart", onclick: function () { add(p.id, 1); toast("Added to cart"); } });
    if (out) addBtn.disabled = true;
    var pic = el("button", { class: "pic", type: "button", "aria-label": "View " + p.name, onclick: function () { openProduct(p); } });
    fillVisual(pic, p, m);
    var kids = [pic];
    if (out || p.stock <= 5) kids.push(el("span", { class: "badge" + (out ? " out" : ""), text: out ? "Out of stock" : "Only " + p.stock + " left" }));
    kids.push(el("div", { class: "info" }, [el("div", { class: "cat", text: m.c }), el("h3", { text: p.name }), el("div", { class: "price", text: inr(p.price_paise) }), addBtn]));
    g.appendChild(el("article", { class: "card", style: "--tint:" + m.t }, kids));
  });
}
function openProduct(p) {
  var m = meta(p.id), b = $("#pdBody"); b.textContent = "";
  b.appendChild(el("div", { class: "row" }, [el("h2", { text: p.name }), el("button", { class: "btn ghost", type: "button", text: "Close", onclick: function () { $("#pd").close(); } })]));
  var big = el("div", { class: "pic big", style: "--tint:" + m.t }); fillVisual(big, p, m); b.appendChild(big);
  b.appendChild(el("p", { text: m.d }));
  b.appendChild(el("div", { class: "total", text: inr(p.price_paise) }));
  var a = el("button", { class: "btn", type: "button", text: p.stock <= 0 ? "Out of stock" : "Add to cart", onclick: function () { add(p.id, 1); toast("Added to cart"); $("#pd").close(); } });
  if (p.stock <= 0) a.disabled = true;
  b.appendChild(a);
  openDlg($("#pd"));
}

/* ---------------- Cart, delivery, payment ---------------- */
var step = "cart", form = {}, note = "", paid = false;
function head(t) { return el("div", { class: "row" }, [el("h2", { text: t }), el("button", { class: "btn ghost", type: "button", text: "Close", onclick: function () { $("#cd").close(); } })]); }
function openCart() { step = "cart"; note = ""; drawCart(); openDlg($("#cd")); }
function drawCart() {
  var b = $("#cdBody"); b.textContent = "";
  if (step === "cart") {
    b.appendChild(head("Your cart"));
    var ids = cartIds();
    if (!ids.length) { b.appendChild(el("div", { class: "empty", text: "Your cart is empty. Add something you like." })); return; }
    ids.forEach(function (k) {
      var p = byId[k], m = meta(p.id);
      b.appendChild(el("div", { class: "line", style: "--tint:" + m.t }, [
        el("div", { class: "t", text: m.e }),
        el("div", {}, [el("div", { text: p.name }), el("div", { class: "note", text: inr(p.price_paise) + " each" })]),
        el("div", { class: "qty" }, [
          el("button", { type: "button", "aria-label": "Decrease quantity", text: "−", onclick: function () { add(p.id, -1); drawCart(); } }),
          el("span", { text: String(cart[k]) }),
          el("button", { type: "button", "aria-label": "Increase quantity", text: "+", onclick: function () { add(p.id, 1); drawCart(); } })])]));
    });
    var m = money();
    b.appendChild(el("div", { class: "row" }, [el("span", { text: "Delivery" }), el("span", { text: m.ship ? inr(m.ship) : "Free" })]));
    b.appendChild(el("div", { class: "row" }, [el("span", { class: "total", text: "Total" }), el("span", { class: "total", text: inr(m.total) })]));
    b.appendChild(el("button", { class: "btn alt", type: "button", text: "Continue to delivery", onclick: function () { step = "addr"; drawCart(); } }));
  } else if (step === "addr") {
    b.appendChild(head("Delivery details"));
    if (user) { form.name = form.name || user.name || ""; form.email = form.email || user.email || ""; form.phone = form.phone || user.phone || ""; }
    var defs = [["name", "Full name", "text", "name", 60], ["email", "Email", "email", "email", 80], ["phone", "Mobile number (10 digits)", "tel", "tel", 10], ["pin", "PIN code", "text", "postal-code", 6], ["addr", "Address", "text", "street-address", 120]];
    var rules = {
      name: function (v) { return v.trim().length >= 2; }, email: function (v) { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim()); },
      phone: function (v) { return /^[6-9]\d{9}$/.test(v); }, pin: function (v) { return /^\d{6}$/.test(v); }, addr: function (v) { return v.trim().length >= 8; }
    };
    var msgs = { name: "Enter your full name.", email: "Enter a valid email address.", phone: "Enter a 10-digit Indian mobile number.", pin: "Enter a 6-digit PIN code.", addr: "Enter your full address." };
    var ins = {};
    defs.forEach(function (d) {
      var i = el("input", { type: d[2], autocomplete: d[3], maxlength: String(d[4]), value: form[d[0]] || "" });
      var e = el("div", { class: "err", "aria-live": "polite" }); i._e = e; ins[d[0]] = i;
      b.appendChild(el("label", {}, [d[1], i, e]));
    });
    b.appendChild(el("button", { class: "btn alt", type: "button", text: "Continue to payment", onclick: function () {
      var ok = true;
      Object.keys(ins).forEach(function (k) { var good = rules[k](ins[k].value); ins[k].setAttribute("aria-invalid", String(!good)); ins[k]._e.textContent = good ? "" : msgs[k]; if (good) form[k] = ins[k].value; else ok = false; });
      if (ok) { step = "pay"; drawCart(); }
    } }));
    b.appendChild(el("button", { class: "btn ghost", type: "button", text: "Back to cart", onclick: function () { step = "cart"; drawCart(); } }));
  } else if (step === "pay") {
    var mm = money();
    b.appendChild(head("Payment"));
    b.appendChild(el("div", { class: "row" }, [el("span", { class: "total", text: "Pay" }), el("span", { class: "total", text: inr(mm.total) })]));
    b.appendChild(el("p", { class: "note", text: "You pay on Razorpay’s secure screen (UPI, cards, net banking, wallets). This site never sees or stores your card details." }));
    var status = el("div", { class: "msg", "aria-live": "polite", text: note });
    var go = el("button", { class: "btn", type: "button", text: "Pay securely" });
    go.addEventListener("click", function () { pay(go, status); });
    b.appendChild(status); b.appendChild(go);
    b.appendChild(el("button", { class: "btn ghost", type: "button", text: "Back", onclick: function () { step = "addr"; drawCart(); } }));
  } else if (step === "verifying") {
    b.appendChild(head("Confirming payment"));
    b.appendChild(el("p", { text: "Please wait while we confirm your payment. Do not close this page." }));
  } else if (step === "done") {
    b.appendChild(head("Order placed"));
    b.appendChild(el("p", { text: "Thank you, " + (form.name || "").trim().split(" ")[0] + ". Your order " + form.id + " is confirmed. A receipt will be sent to " + form.email + "." }));
    b.appendChild(el("button", { class: "btn alt", type: "button", text: "Keep shopping", onclick: function () { $("#cd").close(); } }));
  } else {
    b.appendChild(head("We need to check your order"));
    b.appendChild(el("p", { text: note || "We could not confirm your payment yet." }));
    b.appendChild(el("p", { class: "note", text: "Please do not pay again. Your order reference is " + (form.id || "") + "." }));
  }
}
async function pay(btn, status) {
  btn.disabled = true; status.textContent = "Contacting payment provider…";
  try {
    if (typeof window.Razorpay !== "function") throw new Error("The payment screen could not load. Turn off ad blockers and try again.");
    var items = cartIds().map(function (k) { return { id: +k, qty: cart[k] }; });
    var customer = { name: form.name.trim(), email: form.email.trim(), phone: form.phone, pin: form.pin, addr: form.addr.trim() };
    var o = await post("/api/orders", { items: items, customer: customer }, "optional");
    paid = false;
    var rz = new window.Razorpay({
      key: o.keyId, order_id: o.razorpayOrderId, amount: o.amount, currency: o.currency, name: "Cartwell", description: "Order payment",
      prefill: { name: customer.name, email: customer.email, contact: customer.phone },
      handler: function (r) { paid = true; confirmPayment(o, r); },
      modal: { ondismiss: function () { if (paid) return; step = "pay"; note = "Payment not completed. If money was deducted, it will be refunded."; drawCart(); openDlg($("#cd")); } }
    });
    $("#cd").close(); // the dialog sits above everything, so close it while Razorpay is open
    rz.open();
  } catch (e) { status.textContent = e.message; btn.disabled = false; }
}
async function confirmPayment(o, r) {
  form.id = o.orderId.slice(0, 8); step = "verifying"; drawCart(); openDlg($("#cd"));
  try {
    var v = await post("/api/payments/verify", { razorpay_order_id: r.razorpay_order_id, razorpay_payment_id: r.razorpay_payment_id, razorpay_signature: r.razorpay_signature });
    if (v.status === "paid") { cart = {}; saveCart(); sync(); step = "done"; }
    else { step = "problem"; note = v.status === "failed" ? "Sorry, an item sold out just before your payment finished. We are refunding the full amount automatically to your original payment method. It can take 5 to 7 working days to show up." : "Your payment was received but the order could not be confirmed."; }
  } catch (e) { step = "problem"; note = e.message; }
  drawCart();
}

/* ---------------- Account ---------------- */
var A = { rsent: false, mode: "email", isNew: false, name: "", email: "", password: "", phone: "", code: "", sent: false, wait: 0, timer: null };
function openAccount() { drawAccount(); openDlg($("#ad")); }
function drawAccount() { if (user) drawProfile(); else drawAuth(""); }
function aHead(t) { return el("div", { class: "row" }, [el("h2", { text: t }), el("button", { class: "btn ghost", type: "button", text: "Close", onclick: function () { $("#ad").close(); } })]); }
function field(label, key, attrs, digits) {
  var i = el("input", Object.assign({ value: A[key] || "" }, attrs));
  i.addEventListener("input", function () { if (digits) i.value = i.value.replace(/\D/g, ""); A[key] = i.value; });
  return el("label", {}, [label, i]);
}
function drawAuth(msg) {
  if (A.mode === "reset") return drawReset(msg);
  var b = $("#adBody"); b.textContent = "";
  var out = el("div", { class: "msg", "aria-live": "polite", text: msg || "" });
  b.appendChild(aHead("Sign in to Cartwell"));
  b.appendChild(el("p", { class: "note", text: "See your orders and check out faster. You can also check out as a guest." }));
  var seg = el("div", { class: "seg", role: "tablist" }, [["email", "Email"], ["phone", "Phone"]].map(function (x) {
    return el("button", { type: "button", role: "tab", "aria-selected": String(A.mode === x[0]), text: x[1], onclick: function () { A.mode = x[0]; drawAuth(""); } });
  }));
  b.appendChild(seg);
  async function run(btn, fn) {
    btn.disabled = true; out.textContent = "";
    try { await fn(); } catch (e) { out.textContent = e.message; } finally { btn.disabled = false; }
  }
  function done(s) { saveSession(s); toast("Signed in"); drawProfile(); }
  if (A.mode === "email") {
    if (A.isNew) b.appendChild(field("Full name", "name", { type: "text", maxlength: "60", autocomplete: "name" }));
    b.appendChild(field("Email", "email", { type: "email", maxlength: "80", autocomplete: "email" }));
    b.appendChild(field("Password (8+ characters)", "password", { type: "password", maxlength: "128", autocomplete: A.isNew ? "new-password" : "current-password" }));
    var go = el("button", { class: "btn alt", type: "button", text: A.isNew ? "Create account" : "Sign in" });
    go.addEventListener("click", function () {
      if (A.isNew && A.name.trim().length < 2) { out.textContent = "Enter your full name."; return; }
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(A.email.trim())) { out.textContent = "Enter a valid email address."; return; }
      if (A.password.length < 8) { out.textContent = "Use a password of at least 8 characters."; return; }
      run(go, async function () {
        done(A.isNew ? await post("/api/auth/register", { name: A.name.trim(), email: A.email.trim(), password: A.password })
                     : await post("/api/auth/login", { email: A.email.trim(), password: A.password }));
        A.password = "";
      });
    });
    b.appendChild(go);
    if (!A.isNew) b.appendChild(el("button", { class: "link", type: "button", text: "Forgot password?", onclick: function () { A.mode = "reset"; A.rsent = false; drawAuth(""); } }));
    b.appendChild(el("button", { class: "link", type: "button", text: A.isNew ? "I already have an account" : "New here? Create an account", onclick: function () { A.isNew = !A.isNew; drawAuth(""); } }));
  } else {
    b.appendChild(field("Mobile number (10 digits)", "phone", { type: "tel", inputmode: "numeric", maxlength: "10", autocomplete: "tel" }, true));
    if (A.sent) b.appendChild(field("6-digit code", "code", { type: "text", inputmode: "numeric", maxlength: "6", autocomplete: "one-time-code" }, true));
    var send = function (btn) {
      if (!/^[6-9]\d{9}$/.test(A.phone)) { out.textContent = "Enter a 10-digit Indian mobile number."; return; }
      run(btn, async function () { await post("/api/auth/otp/request", { phone: A.phone }); A.sent = true; A.code = ""; startWait(); drawAuth("Code sent. It expires in 5 minutes."); });
    };
    if (!A.sent) {
      var sb = el("button", { class: "btn alt", type: "button", text: "Send code" });
      sb.addEventListener("click", function () { send(sb); });
      b.appendChild(sb);
    } else {
      var vb = el("button", { class: "btn alt", type: "button", text: "Verify and sign in" });
      vb.addEventListener("click", function () {
        if (!/^\d{6}$/.test(A.code)) { out.textContent = "Enter the 6-digit code."; return; }
        run(vb, async function () { done(await post("/api/auth/otp/verify", { phone: A.phone, code: A.code })); A.sent = false; A.code = ""; });
      });
      var rs = el("button", { class: "link", type: "button", text: "Resend code" });
      rs.id = "resend"; rs.addEventListener("click", function () { send(rs); });
      b.appendChild(vb);
      b.appendChild(el("div", { class: "row" }, [el("button", { class: "link", type: "button", text: "Change number", onclick: function () { A.sent = false; drawAuth(""); } }), rs]));
      tickResend();
    }
  }
  b.appendChild(out);
}
function drawReset(msg) {
  var b = $("#adBody"); b.textContent = "";
  var out = el("div", { class: "msg", "aria-live": "polite", text: msg || "" });
  b.appendChild(aHead("Reset password"));
  b.appendChild(field("Email", "email", { type: "email", maxlength: "80", autocomplete: "email" }));
  if (A.rsent) {
    b.appendChild(field("6-digit code from your email", "code", { type: "text", inputmode: "numeric", maxlength: "6", autocomplete: "one-time-code" }, true));
    b.appendChild(field("New password (8+ characters)", "password", { type: "password", maxlength: "128", autocomplete: "new-password" }));
  }
  var btn = el("button", { class: "btn alt", type: "button", text: A.rsent ? "Reset password" : "Send reset code" });
  btn.addEventListener("click", async function () {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(A.email.trim())) { out.textContent = "Enter a valid email address."; return; }
    if (A.rsent) {
      if (!/^\d{6}$/.test(A.code)) { out.textContent = "Enter the 6-digit code."; return; }
      if (A.password.length < 8) { out.textContent = "Use a password of at least 8 characters."; return; }
    }
    btn.disabled = true; out.textContent = "";
    try {
      if (!A.rsent) {
        await post("/api/auth/password/forgot", { email: A.email.trim() });
        A.rsent = true; A.code = ""; drawReset("If an account exists for this email, a code is on its way. It expires in 15 minutes.");
      } else {
        saveSession(await post("/api/auth/password/reset", { email: A.email.trim(), code: A.code, password: A.password }));
        A.password = ""; A.code = ""; A.rsent = false; A.mode = "email"; toast("Password updated"); drawProfile();
      }
    } catch (e) { out.textContent = e.message; btn.disabled = false; }
  });
  b.appendChild(btn);
  b.appendChild(el("button", { class: "link", type: "button", text: "Back to sign in", onclick: function () { A.mode = "email"; A.rsent = false; drawAuth(""); } }));
  b.appendChild(out);
}
function startWait() { A.wait = 60; clearInterval(A.timer); A.timer = setInterval(function () { A.wait--; tickResend(); if (A.wait <= 0) clearInterval(A.timer); }, 1000); }
function tickResend() { var r = $("#resend"); if (!r) return; r.disabled = A.wait > 0; r.textContent = A.wait > 0 ? "Resend in " + A.wait + "s" : "Resend code"; }

function refundText(o) {
  var s = o.refund_status;
  if (s === "refunded") return "An item sold out. We refunded " + inr(o.amount_paise) + " to your original payment method. It can take 5 to 7 working days to show in your account.";
  if (s === "initiated") return "An item sold out. Your refund of " + inr(o.amount_paise) + " has started. It can take 5 to 7 working days.";
  if (s === "manual") return "An item sold out. We are sorting out your refund by hand and will be in touch. Your order reference is " + o.id.slice(0, 8) + ".";
  return "An item sold out. We are refunding " + inr(o.amount_paise) + " automatically.";
}
async function drawProfile() {
  var b = $("#adBody"); b.textContent = "";
  b.appendChild(aHead(user.name ? "Hi, " + user.name.split(" ")[0] : "Your account"));
  b.appendChild(el("p", { class: "note", text: [user.email, user.phone && "+91 " + user.phone].filter(Boolean).join("  |  ") }));
  b.appendChild(el("h3", { text: "Your orders" }));
  var box = el("div", { style: "display:grid;gap:8px" }, [el("div", { class: "note", text: "Loading…" })]);
  b.appendChild(box);
  b.appendChild(el("button", { class: "btn ghost", type: "button", text: "Sign out", onclick: async function () {
    var rt = getRT(); if (rt) await post("/api/auth/logout", { refreshToken: rt }).catch(function () {});
    dropSession(); A.sent = false; toast("Signed out"); drawAuth("");
  } }));
  try {
    var list = await api("/api/me/orders", {}, "auth");
    box.textContent = "";
    if (!list.length) box.appendChild(el("div", { class: "note", text: "No orders yet. When you buy something while signed in, it shows up here." }));
    list.forEach(function (o) {
      var kids = [
        el("div", { class: "row" }, [el("strong", { text: "Order " + o.id.slice(0, 8) }), el("span", { style: "font-weight:700;color:var(" + (o.status === "paid" ? "--ok" : "--danger") + ")", text: o.status === "paid" ? "Paid" : "Cancelled" })]),
        el("div", { class: "note", text: new Date(o.created_at).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) })
      ];
      o.items.forEach(function (i) { kids.push(el("div", { text: i.qty + " x " + i.name })); });
      kids.push(el("strong", { text: inr(o.amount_paise) }));
      if (o.status === "failed") kids.push(el("div", { class: "note", text: refundText(o) }));
      box.appendChild(el("div", { class: "ord" }, kids));
    });
  } catch (e) { box.textContent = ""; box.appendChild(el("div", { class: "msg", text: e.message })); if (!user) drawAuth(""); }
}

/* ---------------- Start ---------------- */
$("#cartOpen").addEventListener("click", openCart);
$("#acctOpen").addEventListener("click", openAccount);
$("#sf").addEventListener("submit", function (e) { e.preventDefault(); query = $("#q").value.trim().toLowerCase().slice(0, 60); drawGrid(); });
$("#q").addEventListener("input", function () { if (!this.value) { query = ""; drawGrid(); } });
$("#sort").addEventListener("change", function () { sortBy = this.value; drawGrid(); });
loadCart(); sync(); drawGrid();
loadProducts();
if (getRT()) refresh().catch(function (e) { if (e.status === 401) dropSession(); });
})();
