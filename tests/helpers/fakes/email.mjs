// Doublure des emails : enregistrés, jamais envoyés.
export const sentEmails = (globalThis.__TEST_EMAILS__ ??= []);
const record = (type) => async (params) => {
  sentEmails.push({ type, ...params });
  return { ok: true };
};
export const sendBookingConfirmationEmail = record("confirmation");
export const sendBookingUpdatedEmail = record("updated");
export const sendBookingCancelledEmail = record("cancelled");
