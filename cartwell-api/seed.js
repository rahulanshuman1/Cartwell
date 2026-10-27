import "dotenv/config";
import { connectDb } from "./db.js";

const PRODUCTS = [
  [1, "Wireless earbuds", 149900], [2, "Smartwatch with AMOLED", 279900], [3, "Fast charger 33W", 59900],
  [4, "Cotton crew tee", 39900], [5, "Running shoes", 179900], [6, "Everyday backpack 25L", 89900],
  [7, "Steel water bottle 1L", 44900], [8, "Non-stick cookware set", 199900], [9, "LED desk lamp", 69900],
  [10, "Atomic Habits", 34900], [11, "Yoga mat 6mm", 54900], [12, "Cricket bat, kashmir willow", 129900],
];

const { client, db } = await connectDb();
for (const [id, name, price_paise] of PRODUCTS) {
  // $setOnInsert keeps existing stock and prices if you run this again
  await db.collection("products").updateOne({ _id: id }, { $setOnInsert: { name, price_paise, stock: 100 } }, { upsert: true });
}
console.log("Seeded", PRODUCTS.length, "products");
await client.close();
