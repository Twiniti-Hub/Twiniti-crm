// Loop production email revision 0.10.55.9 — TWI-1061.
// Paste this complete file into the matching Hexclave built-in template.
import { type } from "arktype";
import { Button, Container, Heading, Hr, Img, Link, Preview, Section, Text } from "@react-email/components";
import { Subject, NotificationCategory, Props } from "@hexclave/emails";

export const variablesSchema = type({
  "teamDisplayName": "string",
  "teamInvitationLink": "string"
});

export function EmailTemplate({ user, variables }: Props<typeof variablesSchema.infer>) {
  return (
    <>
      <Subject value="You are invited to a team on Loop" />
      <NotificationCategory value="Transactional" />
      <Preview>Your team invitation — Twiniti Loop</Preview>
      <Container style={{ maxWidth: "560px", width: "100%", backgroundColor: "#ffffff", color: "#172033", fontFamily: "Arial, Helvetica, sans-serif", fontSize: "16px", lineHeight: "1.6" }}>
        <Section style={{ textAlign: "center", padding: "8px 0 20px" }}>
          <table role="presentation" align="center" cellPadding="0" cellSpacing="0"><tbody><tr><td align="center">
            <Img src="https://loop.twiniti.ai/branding/loop-logo-light.png" alt="Twiniti Loop" width="160" height="160" style={{ display: "block", margin: "0 auto", border: "0" }} />
          </td></tr></tbody></table>
        </Section>
        <Heading as="h1" style={{ fontSize: "26px", lineHeight: "1.3", margin: "0 0 24px", textAlign: "center" }}>Your team invitation</Heading>
        <Text>Hi{user?.displayName ? ` ${user.displayName}` : ""},</Text>
        <Text>You have been invited to join {variables.teamDisplayName} on Loop. Review and accept the invitation using the button below.</Text>
        
        <Section style={{ textAlign: "center", margin: "28px 0" }}>
          <Button href={variables.teamInvitationLink} style={{ backgroundColor: "#172554", color: "#ffffff", borderRadius: "6px", padding: "14px 24px", fontWeight: "700", textDecoration: "none" }}>Review invitation</Button>
        </Section>
        <Text style={{ fontSize: "12px", color: "#475569" }}>If the button does not work, copy this address into your browser:<br /><Link style={{ wordBreak: "break-all" }} href={variables.teamInvitationLink}>{variables.teamInvitationLink}</Link></Text>
        
        <Hr style={{ borderColor: "#e2e8f0", margin: "28px 0" }} />
        <Text style={{ fontSize: "13px", color: "#475569" }}>Accept only if you recognise the team and were expecting this invitation. Otherwise, you can ignore this email.</Text>
        <Text style={{ fontSize: "12px", color: "#64748b", textAlign: "center" }}>Twiniti Loop · Keep your relationships moving.<br /><Link style={{ wordBreak: "break-all" }} href="https://loop.twiniti.ai">Open Loop</Link></Text>
      </Container>
    </>
  );
}

EmailTemplate.PreviewVariables = {
  "teamDisplayName": "Example Team",
  "teamInvitationLink": "https://example.com/team-invite"
} satisfies typeof variablesSchema.infer;
