// Loop production email revision 0.10.55.9 — TWI-1061.
// Paste this complete file into the matching Hexclave built-in template.
import { type } from "arktype";
import { Button, Container, Heading, Hr, Img, Link, Preview, Section, Text } from "@react-email/components";
import { Subject, NotificationCategory, Props } from "@hexclave/emails";

export const variablesSchema = type({
  "magicLink": "string",
  "otp": "string"
});

export function EmailTemplate({ user, variables }: Props<typeof variablesSchema.infer>) {
  return (
    <>
      <Subject value="Your Loop sign-in link and code" />
      <NotificationCategory value="Transactional" />
      <Preview>Sign in to Loop — Twiniti Loop</Preview>
      <Container style={{ maxWidth: "560px", width: "100%", backgroundColor: "#ffffff", color: "#172033", fontFamily: "Arial, Helvetica, sans-serif", fontSize: "16px", lineHeight: "1.6" }}>
        <Section style={{ textAlign: "center", padding: "8px 0 20px" }}>
          <table role="presentation" align="center" cellPadding="0" cellSpacing="0"><tbody><tr><td align="center">
            <Img src="https://loop.twiniti.ai/branding/loop-logo-light.png" alt="Twiniti Loop" width="160" height="160" style={{ display: "block", margin: "0 auto", border: "0" }} />
          </td></tr></tbody></table>
        </Section>
        <Heading as="h1" style={{ fontSize: "26px", lineHeight: "1.3", margin: "0 0 24px", textAlign: "center" }}>Sign in to Loop</Heading>
        <Text>Hi{user?.displayName ? ` ${user.displayName}` : ""},</Text>
        <Text>Use this one-time code on the sign-in screen, or select the button below.</Text>
        <Text style={{ fontFamily: "monospace", fontSize: "30px", fontWeight: "700", letterSpacing: "6px", textAlign: "center", backgroundColor: "#f1f5f9", padding: "20px" }}>{variables.otp}</Text>
        <Section style={{ textAlign: "center", margin: "28px 0" }}>
          <Button href={variables.magicLink} style={{ backgroundColor: "#172554", color: "#ffffff", borderRadius: "6px", padding: "14px 24px", fontWeight: "700", textDecoration: "none" }}>Sign in to Loop</Button>
        </Section>
        <Text style={{ fontSize: "12px", color: "#475569" }}>If the button does not work, copy this address into your browser:<br /><Link style={{ wordBreak: "break-all" }} href={variables.magicLink}>{variables.magicLink}</Link></Text>
        
        <Hr style={{ borderColor: "#e2e8f0", margin: "28px 0" }} />
        <Text style={{ fontSize: "13px", color: "#475569" }}>Never share this code or link. If you did not try to sign in, ignore this email.</Text>
        <Text style={{ fontSize: "12px", color: "#64748b", textAlign: "center" }}>Twiniti Loop · Keep your relationships moving.<br /><Link style={{ wordBreak: "break-all" }} href="https://loop.twiniti.ai">Open Loop</Link></Text>
      </Container>
    </>
  );
}

EmailTemplate.PreviewVariables = {
  "magicLink": "https://example.com/sign-in",
  "otp": "482913"
} satisfies typeof variablesSchema.infer;
