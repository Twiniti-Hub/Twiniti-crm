import { FormEvent, useEffect, useMemo, useState } from "react";
import { api } from "../lib/api";
import type { Me } from "../lib/me";

type SegmentOption = { id: string; name: string };

type Campaign = {
  id: string;
  name: string;
  status: string;
  subject: string | null;
  htmlBody?: string | null;
  recipientCount?: number | null;
  segmentId?: string | null;
  listId?: string | null;
  scheduledAt?: string | null;
  pendingApproval?: { requestedBy: string; recipientCount: number } | null;
};

function defaultScheduleValue() {
  const date = new Date(Date.now() + 60 * 60 * 1000);
  date.setSeconds(0, 0);
  return date.toISOString().slice(0, 16);
}

export function CampaignsPage() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [segments, setSegments] = useState<SegmentOption[]>([]);
  const [me, setMe] = useState<Me | null>(null);
  const [name, setName] = useState("");
  const [subject, setSubject] = useState("");
  const [htmlBody, setHtmlBody] = useState("<p>Hello {{firstName}}</p>");
  const [segmentId, setSegmentId] = useState("");
  const [approveSchedule, setApproveSchedule] = useState(defaultScheduleValue());
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState<CampaignPreview | null>(null);
  const [previewBusy, setPreviewBusy] = useState(false);
  const previewDialogRef = useRef<HTMLDialogElement>(null);

  const isAdmin = me?.role === "admin" || me?.isSuperAdmin === true;

  async function load() {
    const [campaignRes, segmentRes, meRes] = await Promise.all([
      api("/api/v1/campaigns"),
      api("/api/v1/segments"),
      api("/api/v1/me")
    ]);
    setCampaigns((campaignRes.data ?? []) as Campaign[]);
    setSegments((segmentRes.data ?? []) as SegmentOption[]);
    setMe(meRes as Me);
  }

  useEffect(() => {
    load().catch((err) => setError(err instanceof Error ? err.message : "Failed to load campaigns"));
  }, []);

  const segmentNameById = useMemo(
    () => new Map(segments.map((segment) => [segment.id, segment.name])),
    [segments]
  );

  async function onCreate(event: FormEvent) {
    event.preventDefault();
    if (!segmentId) {
      setError("Choose a segment audience before creating a campaign");
      return;
    }
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      await api("/api/v1/campaigns", {
        method: "POST",
        body: JSON.stringify({ name, subject, htmlBody, segmentId })
      });
      setName("");
      setSubject("");
      await load();
      setMessage("Draft campaign created");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Create failed");
    } finally {
      setBusy(false);
    }
  }

  async function runAction(id: string, action: "preview" | "request-approval" | "approve" | "send") {
    setError(null);
    setMessage(null);
    try {
      const body = action === "approve"
        ? JSON.stringify({ scheduledAt: new Date(approveSchedule).toISOString() })
        : "{}";
      const res = await api(`/api/v1/campaigns/${id}/${action}`, { method: "POST", body });
      setMessage(`${action}: ${JSON.stringify(res.data)}`);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : `${action} failed`);
    } finally {
      setPreviewBusy(false);
    }
  }

  function canPreview(campaign: Campaign) {
    return Boolean(campaign.segmentId || campaign.listId);
  }

  function canRequestApproval(campaign: Campaign) {
    return campaign.status === "draft"
      && Boolean(campaign.segmentId || campaign.listId)
      && Boolean(campaign.subject?.trim())
      && Boolean(campaign.htmlBody?.trim());
  }

  function canApprove(campaign: Campaign) {
    if (!isAdmin || campaign.status !== "review") return false;
    if (campaign.pendingApproval?.requestedBy && me?.id && campaign.pendingApproval.requestedBy === me.id) {
      return false;
    }
    return Boolean(approveSchedule);
  }

  function canSend(campaign: Campaign) {
    if (!isAdmin || campaign.status !== "scheduled") return false;
    if ((campaign.recipientCount ?? 0) <= 0) return false;
    if (campaign.scheduledAt && new Date(campaign.scheduledAt).getTime() > Date.now()) return false;
    return true;
  }

  return (
    <>
      <header className="topbar">
        <div>
          <p className="eyebrow">Outbound</p>
          <h1>Campaigns</h1>
        </div>
      </header>
      {error ? <div className="banner error">{error}</div> : null}
      {message ? <div className="banner info">{message}</div> : null}
      <form className="stack-form" onSubmit={onCreate}>
        <div className="form-row">
          <label>
            Name
            <input value={name} onChange={(e) => setName(e.target.value)} required />
          </label>
          <label>
            Subject
            <input value={subject} onChange={(e) => setSubject(e.target.value)} required />
          </label>
          <label>
            Segment audience
            <select value={segmentId} onChange={(e) => setSegmentId(e.target.value)} required>
              <option value="">Select segment…</option>
              {segments.map((segment) => (
                <option key={segment.id} value={segment.id}>
                  {segment.name}
                </option>
              ))}
            </select>
          </label>
        </div>
        <label>
          HTML body
          <textarea value={htmlBody} onChange={(e) => setHtmlBody(e.target.value)} rows={4} required />
        </label>
        <button className="primary" type="submit" disabled={busy || !segmentId}>
          {busy ? "Creating…" : "Create draft"}
        </button>
      </form>
      <div className="form-row">
        <label>
          Approve schedule (required for approval)
          <input
            type="datetime-local"
            value={approveSchedule}
            onChange={(e) => setApproveSchedule(e.target.value)}
          />
        </label>
      </div>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Name</th>
              <th>Status</th>
              <th>Audience</th>
              <th>Recipients</th>
              <th>Scheduled</th>
              <th>Subject</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {campaigns.map((campaign) => (
              <tr key={campaign.id}>
                <td>{campaign.name}</td>
                <td>
                  <span className="pill">{campaign.status}</span>
                </td>
                <td>
                  {campaign.segmentId
                    ? segmentNameById.get(campaign.segmentId) ?? "Segment"
                    : campaign.listId
                      ? "List"
                      : "—"}
                </td>
                <td>{campaign.recipientCount ?? "—"}</td>
                <td>{campaign.scheduledAt ? new Date(campaign.scheduledAt).toLocaleString() : "—"}</td>
                <td>{campaign.subject ?? "—"}</td>
                <td className="row-actions">
                  <button
                    className="secondary"
                    type="button"
                    disabled={!canPreview(campaign)}
                    onClick={() => runAction(campaign.id, "preview")}
                  >
                    Preview
                  </button>
                  <button
                    className="secondary"
                    type="button"
                    disabled={!canRequestApproval(campaign)}
                    onClick={() => runAction(campaign.id, "request-approval")}
                  >
                    Request approval
                  </button>
                  <button
                    className="secondary"
                    type="button"
                    disabled={!canApprove(campaign)}
                    title={campaign.pendingApproval?.requestedBy === me?.id ? "Another admin must approve your request" : undefined}
                    onClick={() => runAction(campaign.id, "approve")}
                  >
                    Approve
                  </button>
                  <button
                    className="primary"
                    type="button"
                    disabled={!canSend(campaign)}
                    onClick={() => runAction(campaign.id, "send")}
                  >
                    Send
                  </button>
                </td>
              </tr>
            ))}
            {!campaigns.length ? (
              <tr>
                <td colSpan={7}>No campaigns yet.</td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      <dialog
        ref={previewDialogRef}
        className="app-dialog"
        onClose={() => setPreview(null)}
      >
        {preview ? (
          <div className="stack-form dialog-form">
            <div className="panel-heading">
              <div>
                <p className="eyebrow">Preview</p>
                <h3>{preview.subject ?? "Untitled campaign"}</h3>
                <p className="muted">Estimated recipients: {preview.recipientEstimate}</p>
              </div>
              <button className="secondary" type="button" onClick={() => previewDialogRef.current?.close()}>
                Close
              </button>
            </div>
            {preview.previews.length ? (
              preview.previews.map((sample) => (
                <section key={sample.contactId} className="panel inset-panel">
                  <div className="panel-heading">
                    <div>
                      <strong>{sample.email}</strong>
                      {sample.suppressed ? <span className="pill">Suppressed</span> : null}
                    </div>
                  </div>
                  <div
                    className="campaign-preview-html"
                    dangerouslySetInnerHTML={{ __html: sample.html }}
                  />
                </section>
              ))
            ) : (
              <div className="banner info">No sample contacts available for preview.</div>
            )}
          </div>
        ) : null}
      </dialog>
    </>
  );
}
