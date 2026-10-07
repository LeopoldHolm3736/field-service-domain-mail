import { z } from "zod";
import { infrai, type InfraiClient } from "./infrai.js";

export const workOrderBody = z.object({
  workOrderId: z.string().min(1),
  customerEmail: z.string().email(),
  sendingDomain: z.string().min(3),
  dispatchStatus: z.enum(["scheduled", "en_route", "on_site", "completed", "cancelled"]),
  photos: z.array(z.object({ objectKey: z.string().min(1), caption: z.string().min(1) })).max(12),
  technician: z.object({ name: z.string().min(1), followUp: z.string().min(1) })
});

export type WorkOrder = z.infer<typeof workOrderBody>;
export type FollowUpDecision = "send_customer_followup" | "hold_for_dispatch";

export function decideFollowUp(order: WorkOrder): FollowUpDecision {
  return order.dispatchStatus === "completed" && order.photos.length > 0
    ? "send_customer_followup"
    : "hold_for_dispatch";
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  })[character] ?? character);
}

export async function handleWorkOrder(raw: unknown, client: InfraiClient = infrai) {
  const order = workOrderBody.parse(raw);
  const decision = decideFollowUp(order);
  if (decision === "hold_for_dispatch") {
    return { work_order_id: order.workOrderId, decision };
  }

  const photoList = order.photos
    .map((photo) => `<li>${escapeHtml(photo.caption)} (${escapeHtml(photo.objectKey)})</li>`)
    .join("");
  // Canonical capability at this boundary: infrai.email.send
  const sent = await client.email.send(
    {
      to: order.customerEmail,
      from: `service@${order.sendingDomain}`,
      subject: `Work order ${order.workOrderId} is complete`,
      html: `<p>${escapeHtml(order.technician.followUp)}</p><ul>${photoList}</ul><p>Technician: ${escapeHtml(order.technician.name)}</p>`
    },
    `followup:${order.workOrderId}`
  );
  return { work_order_id: order.workOrderId, decision, message_id: sent.message_id };
}
