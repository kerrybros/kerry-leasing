# A2P 10DLC Campaign — Resubmission Packet

Customer Care campaign for the Kerry Leasing Driver Safety Scorecard SMS program.

## Why the first submission failed

Rejected with TCR reason **"issues verifying the Call to Action (CTA)"** (Twilio error class 30909). The
submitted opt-in was employer-only (the fleet business signed on drivers' behalf); there was no
verifiable, affirmative opt-in from the individual message recipient, and no opt-in message/keyword on
record. Website Terms/Privacy and opt-out handling were already compliant and were **not** the problem.

## The fix: verifiable double opt-in

Numbers are never messaged until the driver personally replies **YES**. Implemented in the portal API:

- `driver_contacts.sms_consent_status` — `PENDING → CONFIRMED` (on YES) / `DECLINED` (on STOP-before-confirm).
- Admin action `POST /admin/sms-reports/send-opt-in` sends the one-time confirmation to `PENDING` numbers.
- Twilio inbound webhook records the driver's YES (SID + body + timestamp) as `CONFIRMED`.
- Weekly sender suppresses any contact that is not `CONFIRMED` (`NO_CONSENT` status; never sent).

**Deploy prerequisites (run in an environment with network + DB):**
1. `pnpm --filter @kerry-leasing/api prisma:app:generate`
2. `pnpm --filter @kerry-leasing/api prisma:app:migrate:deploy`
3. Ensure the Twilio inbound webhook points to `/webhooks/twilio/inbound`.
4. Run "send opt-in" for the pilot org; drivers reply YES; then enable weekly sends.

---

## Campaign field values to submit

### Campaign use case
`CUSTOMER_CARE`

### Campaign description
> Recurring weekly SMS from Kerry Brothers Truck Repair (operator of the Kerry Leasing fleet portal,
> kerryleasing.com) to commercial fleet drivers enrolled in the company's driver safety program. Each
> message greets the driver by first name and contains a secure tokenized link to their personalized
> weekly driver safety and performance scorecard. Occasional related service or account messages may
> also be sent. Approximately one message per week.

### How do end-users consent to receive messages? (message flow / CTA)
> Fleet drivers opt in via a verifiable double opt-in. (1) The fleet customer (the driver's employer)
> enrolls in Kerry's driver safety scorecard program, provides driver mobile numbers, and signs a
> written SMS Program Authorization Form. (2) Before any scorecard messages are sent, Kerry sends each
> number a one-time opt-in confirmation text: "Kerry Leasing Driver Safety Scorecard: reply YES to
> receive your weekly driver safety scorecard by text. ~1 msg/week. Msg&data rates may apply. Reply
> HELP for help, STOP to cancel. Terms: https://www.kerryleasing.com/terms". (3) Only numbers that
> reply YES are enrolled and begin receiving the weekly scorecard SMS; numbers that do not reply YES
> are not messaged again. Consent is per-driver and affirmative — the driver's YES reply is stored as
> the consent record. Drivers may opt out anytime by replying STOP and get help via HELP. Program
> terms: https://www.kerryleasing.com/terms. Privacy policy (states that mobile opt-in/consent data is
> never shared or sold to third parties): https://www.kerryleasing.com/privacy. Consent to receive
> messages is not a condition of any purchase.

### Opt-in message
> Kerry Leasing Driver Safety Scorecard: reply YES to receive your weekly driver safety scorecard by
> text. ~1 msg/week. Msg&data rates may apply. Reply HELP for help, STOP to cancel. Terms:
> https://www.kerryleasing.com/terms

### Opt-in keywords
`YES`, `START`

### Sample messages (match what the system actually sends)
1. `Hi Mike, your weekly driver scorecard is ready: https://www.kerryleasing.com/r/ab12cd34ef56gh78`
2. `Hi Sarah, no driving recorded last week. Full scorecard: https://www.kerryleasing.com/r/xy98wv76ut54sr32`

### Opt-out / Help (Twilio Messaging Service managed — leave as configured)
- Opt-out keywords: STOP, STOPALL, UNSUBSCRIBE, CANCEL, END, QUIT, OPTOUT, REVOKE
- Help keywords: HELP, INFO
- Embedded links: Yes · Embedded phone numbers: No · Age-gated: No · Direct lending: No
