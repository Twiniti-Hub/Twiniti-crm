// Loop production email revision 0.10.55.10 (no Preview; Section logo) — TWI-1061.
// Paste this complete file into the matching Hexclave built-in template.
import { type } from "arktype";
import { Button, Container, Heading, Hr, Img, Link, Section, Text } from "@react-email/components";
import { Subject, NotificationCategory, Props } from "@hexclave/emails";

export const variablesSchema = type({
  "productName": "string",
  "trialEndDate": "string"
});

export function EmailTemplate({ user, variables }: Props<typeof variablesSchema.infer>) {
  return (
    <>
      <Subject value="Your Loop trial is ending soon" />
      <NotificationCategory value="Transactional" />
      <Container style={{ maxWidth: "560px", width: "100%", backgroundColor: "#ffffff", color: "#172033", fontFamily: "Arial, Helvetica, sans-serif", fontSize: "16px", lineHeight: "1.6" }}>
        <Section style={{ textAlign: "center", padding: "8px 0 20px" }}>
          <Img src="https://loop.twiniti.ai/branding/loop-logo-light.png" alt="Twiniti Loop" width="160" height="160" style={{ display: "block", margin: "0 auto", border: "0" }} />
        </Section>
        <Heading as="h1" style={{ fontSize: "26px", lineHeight: "1.3", margin: "0 0 24px", textAlign: "center" }}>Your trial is ending soon</Heading>
        <Text>Hi{user?.displayName ? ` ${user.displayName}` : ""},</Text>
        <Text>Your free trial of {variables.productName} ends on {variables.trialEndDate}.</Text>
        <Text>To continue after your trial, open Billing, select the correct workspace and check your payment method.</Text><Text>If you have added a payment method, your subscription may renew under the terms shown in Billing. If you have not added one, your cardless trial will not automatically charge a card; access may pause when the trial ends.</Text>
        <Section style={{ textAlign: "center", margin: "28px 0" }}>
          <Button href={"https://loop.twiniti.ai/billing"} style={{ backgroundColor: "#172554", color: "#ffffff", borderRadius: "6px", padding: "14px 24px", fontWeight: "700", textDecoration: "none" }}>Open Billing</Button>
        </Section>
        <Text style={{ fontSize: "12px", color: "#475569" }}>If the button does not work, copy this address into your browser:<br /><Link style={{ wordBreak: "break-all" }} href={"https://loop.twiniti.ai/billing"}>{"https://loop.twiniti.ai/billing"}</Link></Text>

        <Hr style={{ borderColor: "#e2e8f0", margin: "28px 0" }} />
        <Text style={{ fontSize: "13px", color: "#475569" }}>Review your subscription in Billing before the trial ends. You can manage your plan there.</Text>
        <Text style={{ fontSize: "12px", color: "#64748b", textAlign: "center" }}>Twiniti Loop · Keep your relationships moving.<br /><Link style={{ wordBreak: "break-all" }} href="https://loop.twiniti.ai">Open Loop</Link></Text>
      </Container>
    </>
  );
}

EmailTemplate.PreviewVariables = {
  "productName": "Loop Personal",
  "trialEndDate": "10 November 2026, 12:00 UTC"
} satisfies typeof variablesSchema.infer;
