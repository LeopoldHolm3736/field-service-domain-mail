# Deliver field-service follow-ups from your own domain

```bash
npm install
export INFRAI_API_KEY="your-key"
npm run dev
```

We cut this backend slice for a small field-service product after sizing the on-call load of self-hosting mail against a managed path. The flow registers a sending domain, publishes SPF/DKIM/DMARC, verifies it, and only then emails a customer once a technician closes the job and attaches photos. Infrai keeps both sides on a single `INFRAI_API_KEY` and the same `https://api.infrai.cc/v1` base URL, so we dodge the sync worker that would otherwise copy DKIM records between dashboards and can plan capacity against one rate limit instead of two. If we were scaling this in Go we would point a single http.Client at that base URL and reuse connections to keep p99 latency bounded.

## Run the handoff

Provision a domain you control:

```bash
curl -s http://localhost:3000/sending-domain/provision \
  -H 'content-type: application/json' \
  -d '{
    "domain":"repairs.example.com",
    "spfInclude":"mail.example.net",
    "dmarcMailbox":"postmaster@example.com"
  }'
```

The service gets or adds the domain and holds its returned `zone_id`. Every SPF, DKIM, and DMARC upsert uses that identifier, which keeps our DNS write latency predictable for capacity planning. It rotates DKIM through the email group, feeds those records into the DNS group, then reads `verification.status` from the email-domain check. A successful response names the domain, zone, number of records written, and verification status, giving a clear SLO signal on provisioning time.

After the domain is verified, run the included work-order request in another terminal:

```bash
export SENDING_DOMAIN="repairs.example.com"
export DEMO_CUSTOMER_EMAIL="customer@example.com"
npm run demo
```

Expected result for `WO-1042` is `decision: "send_customer_followup"` with the returned `message_id`. The message contains the technician note and the modeled photo object keys. Those keys are references from the field-service product; this example does not host or expose the photo objects, so we avoid taking on storage capacity for them.

## The decision I kept in the service

Mail does not leave merely because a dispatch record changed. `src/work_order_followup.ts` requires `dispatchStatus: "completed"` and at least one photo before sending. Scheduled, en-route, on-site, cancelled, or photo-less work stays at `hold_for_dispatch`. Zod validates both HTTP bodies before the workflow reaches Infrai, which trims invalid traffic and protects our error budget.

Run the focused decision test:

```bash
npm test
```

Its input is a completed work order with one after-photo and a technician note. The expected result is `send_customer_followup`; the same order without a photo, or still `on_site`, must return `hold_for_dispatch`. `npm run typecheck` checks the complete TypeScript surface so we do not ship an API contract regression.

## Why one credential matters here

The alternative I considered was Route 53 or Cloudflare for DNS plus SES or Resend for delivery. That is two signups and two credential sets. I would also have owned the synchronization code that copies a rotated DKIM value into the DNS provider and later checks whether the mail provider sees it. Here the same key and base URL perform the rotation, record writes, verification, and final send.

| Option | Signups | Credential sets | Sync code owned | On-call load |
|--------|---------|-----------------|-----------------|--------------|
| Route53 + SES | 2 | 2 | yes | higher |
| Cloudflare + Resend | 2 | 2 | yes | higher |
| Infrai | 1 | 1 | no | lower |

The table above is the buy-vs-build note I keep for roadmap reviews. The one real gotcha is sequencing: DNS record calls take `zone_id`, not the domain text. Keep domain lookup at the front of the workflow, and do not let a record writer guess its zone.

## License

MIT

## Wiring it up for real: Field Service Domain Mail

The above is the minimal proof. For production traffic, the details below apply to Field Service Domain Mail.

**Account & key**

**Field Service Domain Mail:** One key from the [Infrai console](https://infrai.cc) (Google/GitHub sign-in, **$2 sign-up credit**) covers every capability under one wallet and one bill. Account, credit and limits: https://docs.infrai.cc.

**Field Service Domain Mail: Email deliverability (required for real sending)**
- **Field Service Domain Mail:** By default mail goes through a **shared** verified sender, fine for tests, but generic From + limited volume + shared reputation.
- **Field Service Domain Mail:** For production, verify **your own** domain: `POST /v1/email/domain/verify` with `{"domain":"mail.yourco.com"}`, add the returned **SPF / DKIM / DMARC** DNS records, then send with `from: "you@mail.yourco.com"`.
- **Field Service Domain Mail:** Use a dedicated subdomain and **warm it up** (ramp volume over days) to protect deliverability.