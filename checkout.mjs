// Vice Shirts checkout: turns the shopping bag into a Stripe Checkout page.
// Prices are set here on the server, so customers can't change them in their browser.
// Needs one setting in Netlify: STRIPE_SECRET_KEY (your Stripe secret key, sk_test_... or sk_live_...).
// Optional: STRIPE_AUTOMATIC_TAX = "true" once Stripe Tax is set up in your Stripe dashboard.

const CATALOG = {
  lasolas:    { name: "Las Olas Martini Tee",     price: 3500 },
  flags:      { name: "Signal Flags Tee",         price: 3500 },
  turtle:     { name: "Nesting Season Tee",       price: 3500 },
  heron:      { name: "New River Heron Tee",      price: 3500 },
  himmarshee: { name: "Himmarshee St Tee",        price: 3500 },
  map:        { name: "Fort Lauderdale Map Tee",  price: 3500 },
  a1a:        { name: "A1A Coastal Highway Tee",  price: 3500 },
};
const SIZES = ["S", "M", "L", "XL", "2XL"];
const PLUS_SIZE_UPCHARGE = 200;   // 2XL adds $2.00
const FREE_SHIPPING_OVER = 10000; // $100.00
const LOCAL_DELIVERY = 1000;      // $10.00
const SHIPPING = 1000;            // $10.00

const json = (body, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

export default async (req) => {
  if (req.method !== "POST") return json({ error: "Use POST." }, 405);

  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) return json({ error: "Payments aren't set up yet. Add STRIPE_SECRET_KEY in Netlify." }, 500);

  let body;
  try { body = await req.json(); } catch { return json({ error: "Something went wrong. Please try again." }, 400); }

  const items = Array.isArray(body.items) ? body.items.slice(0, 50) : [];
  const p = new URLSearchParams();
  let n = 0, subtotal = 0;

  for (const item of items) {
    const product = CATALOG[item.id];
    const qty = Math.min(Math.max(parseInt(item.qty, 10) || 0, 0), 20);
    if (!product || !SIZES.includes(item.size) || !qty) continue;
    const unit = product.price + (item.size === "2XL" ? PLUS_SIZE_UPCHARGE : 0);
    subtotal += unit * qty;
    p.append(`line_items[${n}][price_data][currency]`, "usd");
    p.append(`line_items[${n}][price_data][unit_amount]`, String(unit));
    p.append(`line_items[${n}][price_data][product_data][name]`, `${product.name} (${item.size})`);
    p.append(`line_items[${n}][quantity]`, String(qty));
    n++;
  }
  if (!n) return json({ error: "Your bag is empty." }, 400);

  const origin = new URL(req.url).origin;
  p.append("mode", "payment");
  p.append("success_url", `${origin}/#thanks`);
  p.append("cancel_url", `${origin}/#shop`);
  p.append("shipping_address_collection[allowed_countries][0]", "US");
  p.append("phone_number_collection[enabled]", "true");

  const free = subtotal >= FREE_SHIPPING_OVER;
  const options = [
    ["Local delivery to your home or hotel", free ? 0 : LOCAL_DELIVERY],
    ["Shipping anywhere in the U.S.", free ? 0 : SHIPPING],
  ];
  options.forEach(([name, amount], k) => {
    p.append(`shipping_options[${k}][shipping_rate_data][type]`, "fixed_amount");
    p.append(`shipping_options[${k}][shipping_rate_data][display_name]`, name);
    p.append(`shipping_options[${k}][shipping_rate_data][fixed_amount][amount]`, String(amount));
    p.append(`shipping_options[${k}][shipping_rate_data][fixed_amount][currency]`, "usd");
  });

  p.append("custom_fields[0][key]", "hotel");
  p.append("custom_fields[0][label][type]", "custom");
  p.append("custom_fields[0][label][custom]", "Hotel and room (if at a hotel)");
  p.append("custom_fields[0][type]", "text");
  p.append("custom_fields[0][optional]", "true");

  if (process.env.STRIPE_AUTOMATIC_TAX === "true") p.append("automatic_tax[enabled]", "true");

  const res = await fetch("https://api.stripe.com/v1/checkout/sessions", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/x-www-form-urlencoded" },
    body: p,
  });
  const data = await res.json();
  if (!res.ok) return json({ error: data.error?.message || "Checkout isn't available right now." }, 502);
  return json({ url: data.url });
};
