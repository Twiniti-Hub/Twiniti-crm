// Templates own their logo; this theme must not add another one.
import { Body, Container, Head, Html } from "@react-email/components";
import { ThemeProps } from "@hexclave/emails";
export function EmailTheme({ children }: ThemeProps) {
  return <Html lang="en"><Head /><Body style={{ margin: "0", padding: "24px 12px", backgroundColor: "#f1f5f9", fontFamily: "Arial, Helvetica, sans-serif" }}><Container style={{ width: "100%", maxWidth: "608px", margin: "0 auto", padding: "24px", backgroundColor: "#ffffff", borderRadius: "8px" }}>{children}</Container></Body></Html>;
}
