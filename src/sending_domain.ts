import { z } from "zod";
import { InfraiError, infrai, type DnsRecord, type InfraiClient } from "./infrai.js";

export const sendingDomainBody = z.object({
  domain: z.string().min(3),
  spfInclude: z.string().min(3),
  dmarcMailbox: z.string().email()
});

export type SendingDomainInput = z.infer<typeof sendingDomainBody>;

async function zoneIdFor(client: InfraiClient, domain: string): Promise<string> {
  try {
    return (await client.dns.domain.get(domain)).zone_id;
  } catch (error) {
    if (!(error instanceof InfraiError) || error.status !== 404) throw error;
    return (await client.dns.domain.add(domain, `domain:${domain}`)).zone_id;
  }
}

export async function provisionSendingDomain(raw: unknown, client: InfraiClient = infrai) {
  const input = sendingDomainBody.parse(raw);
  const zone_id = await zoneIdFor(client, input.domain);
  const rotation = await client.email.domain.rotate_dkim(`dkim:${input.domain}`);
  const records: DnsRecord[] = [
    {
      record_type: "TXT",
      name: input.domain,
      content: `v=spf1 include:${input.spfInclude} -all`,
      ttl: 300
    },
    {
      record_type: "TXT",
      name: `_dmarc.${input.domain}`,
      content: `v=DMARC1; p=quarantine; rua=mailto:${input.dmarcMailbox}`,
      ttl: 300
    },
    ...rotation.records.map((record) => ({
      record_type: record.record_type,
      name: record.name,
      content: record.content,
      ...(record.ttl === undefined ? {} : { ttl: record.ttl }),
      ...(record.priority === undefined ? {} : { priority: record.priority })
    }))
  ];

  await Promise.all(
    records.map((record) =>
      client.dns.record.upsert(
        { zone_id, ...record },
        `dns:${zone_id}:${record.record_type}:${record.name}`
      )
    )
  );
  const checked = await client.email.domain.verify(input.domain, `verify:${input.domain}`);
  return {
    domain: input.domain,
    zone_id,
    records_written: records.length,
    verification_status: checked.verification.status
  };
}
