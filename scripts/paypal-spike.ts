// M1 spike: token -> create order -> (you approve as sandbox buyer) -> capture -> COMPLETED.
// Usage: npm run paypal:spike               (creates order, prints approval URL)
//        npm run paypal:spike -- <orderId>  (captures after you approved it)
import "dotenv/config";
import { captureOrder, createOrder, verifyCapture } from "../lib/paypal";

const cents = 2000;
const orderId = process.argv[2];

async function main() {
  if (!orderId) {
    const o = await createOrder({ agreedCents: cents, currency: "USD", negotiationId: `spike-${Date.now()}`, description: "Closer spike" });
    console.log("order:", o.id, o.status);
    console.log("approve as the sandbox BUYER here, then rerun with the order id:");
    console.log(o.links?.find((l) => l.rel === "payer-action" || l.rel === "approve")?.href);
    return;
  }
  const c = await captureOrder(orderId);
  console.log(JSON.stringify(verifyCapture(c, cents, "USD")), c.status);
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
