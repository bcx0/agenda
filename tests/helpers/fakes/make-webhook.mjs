export function makePayloadFromBooking(input) {
  return { ...input };
}
export async function sendMakeBookingWebhook() {
  return { skipped: true };
}
