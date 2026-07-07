/**
 * SMS DOUBLE OPT-IN — confirmation message.
 *
 * This is the one-time message sent to a rostered driver's number BEFORE any
 * weekly scorecard is delivered. The driver must reply YES to confirm consent.
 *
 * The copy intentionally carries every element A2P 10DLC / CTIA reviewers look
 * for in an opt-in call-to-action:
 *   - the program / brand name        ("Kerry Leasing Driver Safety Scorecard")
 *   - the explicit opt-in instruction ("reply YES")
 *   - message frequency               ("~1 msg/week")
 *   - "Msg&data rates may apply"
 *   - HELP and STOP instructions
 *   - a link to the published Terms
 *
 * Keep this text in sync with the campaign registration's opt-in message and
 * with https://www.kerryleasing.com/terms.
 */

export const OPT_IN_METHOD = 'DOUBLE_OPT_IN_SMS';

export function formatOptInConfirmation(): string {
  return (
    'Kerry Leasing Driver Safety Scorecard: reply YES to receive your weekly ' +
    'driver safety scorecard by text. ~1 msg/week. Msg&data rates may apply. ' +
    'Reply HELP for help, STOP to cancel. Terms: https://www.kerryleasing.com/terms'
  );
}
