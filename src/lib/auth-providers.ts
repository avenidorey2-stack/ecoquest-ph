/**
 * Google sign-in is offered only when its OAuth credentials are configured — otherwise the
 * button would send people to a broken Google error page.
 */
export function isGoogleEnabled() {
  return Boolean(process.env.AUTH_GOOGLE_ID && process.env.AUTH_GOOGLE_SECRET);
}
