import { createServer } from "node:http";
import { ZodError } from "zod";
import { InfraiError } from "./infrai.js";
import { provisionSendingDomain } from "./sending_domain.js";
import { handleWorkOrder } from "./work_order_followup.js";

async function readJson(request: import("node:http").IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) chunks.push(Buffer.from(chunk));
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

const server = createServer(async (request, response) => {
  response.setHeader("Content-Type", "application/json");
  try {
    if (request.method !== "POST") {
      response.statusCode = 404;
      response.end(JSON.stringify({ error: "route not found" }));
      return;
    }
    const body = await readJson(request);
    const result = request.url === "/sending-domain/provision"
      ? await provisionSendingDomain(body)
      : request.url === "/work-orders/follow-up"
        ? await handleWorkOrder(body)
        : undefined;
    if (!result) {
      response.statusCode = 404;
      response.end(JSON.stringify({ error: "route not found" }));
      return;
    }
    response.statusCode = request.url === "/work-orders/follow-up" ? 202 : 200;
    response.end(JSON.stringify(result));
  } catch (error) {
    if (error instanceof ZodError) {
      response.statusCode = 400;
      response.end(JSON.stringify({ error: "invalid request", issues: error.issues }));
      return;
    }
    if (error instanceof InfraiError) {
      response.statusCode = error.status < 500 ? error.status : 502;
      response.end(JSON.stringify({ error: error.code }));
      return;
    }
    response.statusCode = 500;
    response.end(JSON.stringify({ error: "request could not be processed" }));
  }
});

const port = Number(process.env.PORT ?? "3000");
server.listen(port, () => console.log(`field-service mail listening on http://localhost:${port}`));
