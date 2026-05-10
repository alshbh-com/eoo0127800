// Convert a phone number into a synthetic email so we can use Supabase
// email/password auth without requiring SMS provider for OTP.
export function phoneToEmail(phone: string): string {
  const digits = phone.replace(/\D+/g, "");
  return `${digits}@or.app`;
}

export function normalizePhone(phone: string): string {
  return phone.replace(/\D+/g, "");
}
