// Display details the API does not store yet (emoji, tint, category, blurb), keyed by product id.
export const META = {
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
  12: { e: "🏏", t: "#ecfccb", c: "Sports", d: "Full-size, well balanced, ideal for tennis-ball and leather practice." },
};
export const metaFor = (id) => META[id] || { e: "📦", t: "#e5e7eb", c: "Other", d: "" };
