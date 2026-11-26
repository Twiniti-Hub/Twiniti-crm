/** Routes that mount Hexclave (and Stripe.js only on these and signed-in CRM shell). */
const HEXCLAVE_ROUTE = /^\/(sign-in|sign-up|forgot-password|accept-invite|billing|onboarding|logout|handler)(\/|$)/;

export function routeNeedsHexclave(pathname: string) {
  return HEXCLAVE_ROUTE.test(pathname);
}