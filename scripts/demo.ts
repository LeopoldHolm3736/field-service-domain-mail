export {};

const base = process.env.SERVICE_URL ?? "http://localhost:3000";

const response = await fetch(`${base}/work-orders/follow-up`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    workOrderId: "WO-1042",
    customerEmail: process.env.DEMO_CUSTOMER_EMAIL ?? "owner@example.com",
    sendingDomain: process.env.SENDING_DOMAIN ?? "repairs.example.com",
    dispatchStatus: "completed",
    photos: [
      { objectKey: "work-orders/WO-1042/after.jpg", caption: "Repaired condenser" }
    ],
    technician: {
      name: "Mina",
      followUp: "Cooling is restored. Check the filter next month."
    }
  })
});

console.log(await response.json());
