# Email Inbound Connector

Inbound email channel that accepts attachments and forwards them to
`dosage_agent_react`, mirroring the WhatsApp/Telegram integrations.

## High-level flow

1. SendGrid Inbound Parse receives the email at the MX-pointed domain and
   POSTs a `multipart/form-data` payload to
   `POST /webhooks/email/sendgrid`.
2. The webhook authenticates via a shared token
   (`SENDGRID_INBOUND_WEBHOOK_TOKEN`) and parses the payload into a
   `ParsedInboundEmailDto`.
3. `ProcessInboundEmailUseCase` is idempotent on `Message-ID`:
   - duplicate → ignored;
   - no attachments → ignored, status `IGNORED_NO_ATTACHMENTS`;
   - sender unknown → reply "indirizzo non riconosciuto";
   - sender belongs to exactly one company → dispatch to the agent;
   - sender belongs to multiple companies → reply numbered list with token
     `[INGEST-<id>]` in the subject, wait for user reply.
4. On dispatch the use-case creates a fresh thread
   `email-ingest:<userId>:<companyId>:<nonce>`, persists a `Chat` row so
   the conversation shows up in the webapp, hydrates `WorkingMemory`
   with `uploadedFiles[]`, and calls `createReactAgent` +
   `handleUserMessage` with `requireApproval: true`.
5. `SendIngestionConfirmationEmailUseCase` replies with a riepilogo and a
   deep link to `https://app.seminai.app/chat/<threadId>`. The user
   approves any pending tool call (e.g. `import_from_file`) in the webapp.

## Environment variables

| Variable                                    | Required    | Default                                   | Purpose                                                                                    |
| ------------------------------------------- | ----------- | ----------------------------------------- | ------------------------------------------------------------------------------------------ |
| `SENDGRID_INBOUND_WEBHOOK_TOKEN`            | yes         | —                                         | Shared secret; without it the endpoint returns `503`.                                      |
| `EMAIL_INBOUND_DOMAIN`                      | recommended | `inbox.seminai.app`                       | Display name in logs/templates.                                                            |
| `EMAIL_INBOUND_FROM_ADDRESS`                | recommended | `ai@seminai.app`                          | From address used in outbound replies (delegated to `EmailService`).                       |
| `EMAIL_INGEST_MAX_ATTACHMENTS`              | no          | `20`                                      | Hard cap on the number of attachments per email.                                           |
| `EMAIL_INGEST_MAX_TOTAL_SIZE_BYTES`         | no          | `52428800` (50 MB)                        | Total payload cap.                                                                         |
| `EMAIL_INGEST_MAX_PER_FILE_BYTES`           | no          | `26214400` (25 MB)                        | Per-file cap.                                                                              |
| `EMAIL_INGEST_MAX_DISAMBIGUATION_COMPANIES` | no          | `10`                                      | Max companies listed in the disambiguation reply.                                          |
| `EMAIL_INGEST_FRONTEND_CHAT_URL_TEMPLATE`   | no          | `https://app.seminai.app/chat/{threadId}` | URL placed in the confirmation reply. `{threadId}` is replaced with the encoded thread id. |

`EMAIL_USER` and `EMAIL_PASSWORD` (already used elsewhere) drive outbound
replies via the existing `EmailService` (Gmail SMTP).

## SendGrid setup (DNS + dashboard)

1. **DNS** — add an MX record on the dedicated subdomain (suggested:
   `inbox.seminai.app`) pointing to `mx.sendgrid.net` with priority `10`.
2. **SendGrid dashboard** → Settings → Inbound Parse → Add Host & URL:
   - Receiving domain: `inbox.seminai.app`
   - Destination URL: `https://api.seminai.app/webhooks/email/sendgrid?token=<SENDGRID_INBOUND_WEBHOOK_TOKEN>`
   - Check "POST the raw, full MIME message" → **off** (we want parsed fields).
3. Wait for MX propagation (5–60 minutes), then send a test email to any
   address `@inbox.seminai.app`.

## Local smoke test (no SendGrid required)

```bash
curl -X POST http://localhost:3001/webhooks/email/sendgrid \
  -H "X-Webhook-Token: $SENDGRID_INBOUND_WEBHOOK_TOKEN" \
  -F "from=francemazzi@gmail.com" \
  -F "to=inbox@inbox.seminai.app" \
  -F "subject=Piano colturale 2026" \
  -F "text=Ecco i documenti" \
  -F "headers=Message-ID: <test-$(date +%s)@example.com>" \
  -F "attachment1=@./test-fixtures/piano-colturale.pdf"
```

Verify in `npx prisma studio`:

- `EmailIngestion` row with `status=DISPATCHED` and a non-null `threadId`.
- `EmailAttachment` rows with `gcsUrl` populated.
- `Chat` row with `threadId=<same>`, `category=DOSAGE_AGENT`,
  `metadata.source='email'`.

## Multi-company disambiguation

If `francemazzi@gmail.com` is associated to N companies, the user
receives a reply like:

```
Subject: Re: Piano colturale 2026 [INGEST-ab12cd34]

Ciao Francesco, abbiamo ricevuto la tua email con allegati.
Rispondi indicando il numero corrispondente:

1) Acme Srl
2) Beta Spa

Esempio di risposta: AZIENDA: 2
```

The user replies plain text `AZIENDA: 2`. The webhook receives a new
inbound email whose subject still contains `[INGEST-ab12cd34]`, so the
master use-case routes to `HandleDisambiguationReplyUseCase` which:

1. Looks up the draft by `disambiguationToken`.
2. Verifies `From` matches the original `fromAddress` (anti-spoof basic).
3. Parses the choice via `/(AZIENDA|COMPANY)\s*[:=#]?\s*(\d+)/i` or a
   bare number on a line.
4. Re-fetches the user's companies (the list order from
   `findManyByUserId` is assumed stable in the short reply window).
5. Re-downloads the original attachments from GCS and dispatches to the
   agent.

## Out-of-scope (v1) / known limitations

- Approval of destructive tool calls is **not** parsed from email
  bodies. The reply always points to the webapp.
- ZIP attachments are accepted but **not auto-unzipped** — the agent
  receives the raw buffer.
- Plus-aliases (`francesco+inbox@gmail.com`) are not matched to the
  base address; the sender is treated as unknown.
- SPF/DKIM pass status is not enforced — only `From == draft.from`
  guard for disambiguation replies.
- GCS retention (`email-ingest/...`): set a lifecycle policy of ~90
  days at the bucket level. Out of scope for the application.
- Stale `DISPATCHED` ingestions with no follow-up confirmation are not
  cleaned up automatically (future cron).
- Working-memory cache has a 30-minute TTL; on late disambiguation
  replies attachments are re-downloaded from GCS automatically.
- Sender list cap: at most `EMAIL_INGEST_MAX_DISAMBIGUATION_COMPANIES`
  entries in the reply. Beyond that the user is told to use the webapp.

## Database

New tables (see `prisma/schema.prisma`):

- `EmailIngestion` — one row per inbound email
  (`messageId @unique` for idempotency).
- `EmailAttachment` — raw attachments stored on GCS; `fileId` populated
  only after `import_from_file` persists them as `File` rows.

Migration command (run once after pulling):

```bash
npx prisma migrate dev --name add_email_ingestion
```

## Tests

```bash
npx jest src/test/email-inbound
```

Covers:

- multipart parsing & Message-ID extraction (`SendgridInboundParser`);
- sender resolution branches (`ResolveSenderUseCase`: unknown / 0 / 1 / N);
- idempotency (`ProcessInboundEmailUseCase` rejects duplicate Message-ID).
