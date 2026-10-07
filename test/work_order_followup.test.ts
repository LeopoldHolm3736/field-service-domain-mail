import { describe, expect, it } from "vitest";
import { decideFollowUp, workOrderBody } from "../src/work_order_followup.js";

describe("technician follow-up decision", () => {
  const completed = {
    workOrderId: "WO-1042",
    customerEmail: "owner@example.com",
    sendingDomain: "repairs.example.com",
    dispatchStatus: "completed",
    photos: [{ objectKey: "work-orders/WO-1042/after.jpg", caption: "Repaired condenser" }],
    technician: { name: "Mina", followUp: "Cooling is restored. Check the filter next month." }
  };

  it("sends only after completion evidence is attached", () => {
    expect(decideFollowUp(workOrderBody.parse(completed))).toBe("send_customer_followup");
    expect(decideFollowUp(workOrderBody.parse({ ...completed, photos: [] }))).toBe("hold_for_dispatch");
    expect(decideFollowUp(workOrderBody.parse({ ...completed, dispatchStatus: "on_site" }))).toBe("hold_for_dispatch");
  });
});
