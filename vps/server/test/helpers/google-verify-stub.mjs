// © 2026 وطن النهار — بديل اختبار لمكتبة Google: الرمز هو JSON بترميز base64url
export async function verifyGoogleIdToken(credential) {
  const payload = JSON.parse(Buffer.from(String(credential), 'base64url').toString('utf8'));
  return payload;
}
