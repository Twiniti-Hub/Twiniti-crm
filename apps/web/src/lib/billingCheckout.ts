/** The server must explicitly permit checkout; an active trial never offers it. */
export function canOfferCheckout(billing: { status: string; checkoutAllowed?: boolean } | null): boolean {
  return billing?.checkoutAllowed === true && !["active", "trialing"].includes(billing.status);
}
