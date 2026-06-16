/**
 * SMS body — minimal. Greeting + rank + link to the full one-pager.
 *
 * The substance lives on the linked scorecard page; the SMS just drives
 * the click. Keeps the message inside a single segment for every driver
 * (well under 160 chars), which avoids per-segment Twilio billing surprises.
 */

export interface SmsFormatInput {
  firstName: string;
  noActivity: boolean;
  reportUrl: string;
}

export function formatSmsBody(input: SmsFormatInput): string {
  if (input.noActivity) {
    return `Hi ${input.firstName}, no driving recorded last week. Full scorecard: ${input.reportUrl}`;
  }
  return `Hi ${input.firstName}, your weekly driver scorecard is ready: ${input.reportUrl}`;
}
