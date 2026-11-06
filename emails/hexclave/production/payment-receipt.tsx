// Loop production email revision 0.10.55.10 (no Preview; Section logo) — TWI-1061.
// Paste this complete file into the matching Hexclave built-in template.
import { type } from "arktype";
import { Button, Container, Heading, Hr, Img, Link, Section, Text } from "@react-email/components";
import { Subject, NotificationCategory, Props } from "@hexclave/emails";

export const variablesSchema = type({
  "productName": "string",
  "quantity": "number",
  "amount": "string",
  "receiptLink": "string?"
});

export function EmailTemplate({ user, variables }: Props<typeof variablesSchema.infer>) {
  return (
    <>
      <Subject value="Your Loop payment receipt" />
      <NotificationCategory value="Transactional" />
      <Container style={{ maxWidth: "560px", width: "100%", backgroundColor: "#ffffff", color: "#172033", fontFamily: "Arial, Helvetica, sans-serif", fontSize: "16px", lineHeight: "1.6" }}>
        <Section style={{ textAlign: "center", padding: "8px 0 20px" }}>
          <Img src="https://loop.twiniti.ai/branding/loop-logo-light.png" alt="Twiniti Loop" width="160" height="160" style={{ display: "block", margin: "0 auto", border: "0" }} />
        </Section>
        <Heading as="h1" style={{ fontSize: "26px", lineHeight: "1.3", margin: "0 0 24px", textAlign: "center" }}>Payment received</Heading>
        <Text>Hi{user?.displayName ? ` ${user.displayName}` : ""},</Text>
        <Text>Thank you. Your payment for {variables.productName} has been received.</Text>
        <Text style={{ fontSize: "20px", fontWeight: "700" }}>Amount paid: {variables.amount}</Text><Text>Quantity: {variables.quantity}</Text>
        {variables.receiptLink ? <>
        <Section style={{ textAlign: "center", margin: "28px 0" }}>
          <Button href={variables.receiptLink} style={{ backgroundColor: "#172554", color: "#ffffff", borderRadius: "6px", padding: "14px 24px", fontWeight: "700", textDecoration: "none" }}>View receipt</Button>
        </Section>
        <Text style={{ fontSize: "12px", color: "#475569" }}>If the button does not work, copy this address into your browser:<br /><Link style={{ wordBreak: "break-all" }} href={variables.receiptLink}>{variables.receiptLink}</Link></Text>
        </> : null}
        <Text><Link href="https://loop.twiniti.ai/billing">Open Loop Billing</Link> and select the workspace associated with this payment.</Text>
        <Hr style={{ borderColor: "#e2e8f0", margin: "28px 0" }} />
        <Text style={{ fontSize: "13px", color: "#475569" }}>Keep this email for your records. You can review your plan and payment details in Loop Billing.</Text>
        <Text style={{ fontSize: "12px", color: "#64748b", textAlign: "center" }}>Twiniti Loop · Keep your relationships moving.<br /><Link style={{ wordBreak: "break-all" }} href="https://loop.twiniti.ai">Open Loop</Link></Text>
      </Container>
    </>
  );
}

EmailTemplate.PreviewVariables = {
  "productName": "Loop Personal",
  "quantity": 1,
  "amount": "$9.00",
  "receiptLink": "https://example.com/receipt"
} satisfies typeof variablesSchema.infer;
