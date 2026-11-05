import { useEffect, useState } from "react";
import { api } from "../lib/api";
import type { Me } from "../lib/me";

export function LicenseNotice() {
  const [warning, setWarning] = useState<Me["licenseWarning"]>(null);
  useEffect(() => {
    let stopped = false;
    let timer: ReturnType<typeof setTimeout>;
    const controller = new AbortController();
    const refresh = async () => {
      try {
        const result = await api("/api/v1/me", { signal: AbortSignal.any([controller.signal, AbortSignal.timeout(15000)]) });
        if (!stopped) setWarning((result.data as Me).licenseWarning ?? null);
      } catch { /* Keep the last warning until verification can be read again. */ }
      if (!stopped) timer = setTimeout(refresh, 30_000);
    };
    void refresh();
    return () => { stopped = true; controller.abort(); clearTimeout(timer); };
  }, []);
  if (!warning) return null;
  return <div className="banner warning" role="status">
    <strong>License verification needs attention.</strong>{" "}
    {warning.accessContinues
      ? "Your access remains active while we retry in the background."
      : "We could not verify your license within the temporary access period."}{" "}
    {warning.accessContinues && warning.graceUntil ? `Temporary access ends ${new Date(warning.graceUntil).toLocaleString()}. ` : ""}
    Contact support if this continues. Reference: {warning.reason}.
  </div>;
}
