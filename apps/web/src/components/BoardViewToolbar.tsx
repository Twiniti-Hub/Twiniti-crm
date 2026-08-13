import { FormEvent, useEffect, useState } from "react";
import { api } from "../lib/api";
import { defaultLanes, type BoardObjectType } from "../lib/board";

type BoardView = {
  id: string;
  name: string;
  objectType: BoardObjectType;
  visibility: "private" | "shared";
  systemDefault?: boolean;
  boardConfig?: {
    groupingField: string;
    lanes: ReturnType<typeof defaultLanes>;
    cardFields: string[];
    sort: { field: string; direction: "asc" | "desc" };
    filters: Record<string, unknown>;
  };
};

type Props = {
  objectType: BoardObjectType;
  selectedViewId: string | null;
  onViewChange: (viewId: string | null) => void;
  canManageShared?: boolean;
};

export function BoardViewToolbar({
  objectType,
  selectedViewId,
  onViewChange,
  canManageShared = false
}: Props) {
  const [views, setViews] = useState<BoardView[]>([]);
  const [preferredViewId, setPreferredViewId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function loadViews() {
    const res = await api(`/api/v1/boards/views?objectType=${objectType}`);
    const nextViews = (res.data ?? []) as BoardView[];
    setViews(nextViews);
    const preferred = (res.meta?.preferredViewId as string | null | undefined) ?? nextViews[0]?.id ?? null;
    setPreferredViewId(preferred);
    if (!selectedViewId && preferred) onViewChange(preferred);
  }

  useEffect(() => {
    loadViews().catch((err) => setError(err instanceof Error ? err.message : "Failed to load views"));
  }, [objectType]);

  const selected = views.find((view) => view.id === selectedViewId) ?? views[0] ?? null;

  async function savePrivateView(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const boardConfig = selected?.boardConfig ?? {
        groupingField: "lifecycle_stage",
        lanes: defaultLanes(objectType),
        cardFields: objectType === "contact"
          ? ["name", "email", "primaryCompany", "updatedAt"]
          : ["name", "domain", "industry", "contactCount", "updatedAt"],
        sort: { field: "updated_at", direction: "desc" as const },
        filters: {}
      };
      const created = await api("/api/v1/boards/views", {
        method: "POST",
        body: JSON.stringify({
          name: name.trim() || `${objectType === "contact" ? "Contact" : "Company"} board`,
          objectType,
          presentation: "board",
          visibility: "private",
          boardConfig
        })
      });
      const view = created.data as BoardView;
      setName("");
      setMessage(`Saved private view “${view.name}”.`);
      await loadViews();
      onViewChange(view.id);
      await api("/api/v1/boards/preference", {
        method: "PUT",
        body: JSON.stringify({ objectType, presentation: "board", viewId: view.id })
      });
      setPreferredViewId(view.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save view");
    } finally {
      setBusy(false);
    }
  }

  async function copySelected() {
    if (!selected) return;
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const res = await api(`/api/v1/boards/views/${selected.id}/copy`, {
        method: "POST",
        body: JSON.stringify({ name: `${selected.name} (copy)` })
      });
      const view = res.data as BoardView;
      setMessage(`Copied “${view.name}”.`);
      await loadViews();
      onViewChange(view.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not copy view");
    } finally {
      setBusy(false);
    }
  }

  async function publishShared() {
    if (!selected || selected.systemDefault || !canManageShared) return;
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      await api(`/api/v1/boards/views/${selected.id}`, {
        method: "PATCH",
        body: JSON.stringify({ visibility: "shared" })
      });
      setMessage(`Published “${selected.name}” as a shared view.`);
      await loadViews();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not publish shared view");
    } finally {
      setBusy(false);
    }
  }

  async function setPreferred() {
    if (!selected) return;
    setBusy(true);
    setError(null);
    try {
      await api("/api/v1/boards/preference", {
        method: "PUT",
        body: JSON.stringify({
          objectType,
          presentation: "board",
          viewId: selected.systemDefault ? null : selected.id
        })
      });
      setPreferredViewId(selected.id);
      setMessage(`Preferred board updated.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not set preference");
    } finally {
      setBusy(false);
    }
  }

  async function resetDefault() {
    onViewChange(`system-${objectType}-board`);
    setMessage("Using the immutable system default board.");
  }

  return (
    <section className="board-view-toolbar panel">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">Board views</p>
          <h3>Private and shared boards</h3>
        </div>
        <span className="muted">System defaults stay immutable. Customization saves a private view.</span>
      </div>
      {error ? <div className="banner error">{error}</div> : null}
      {message ? <div className="banner info">{message}</div> : null}
      <div className="toolbar-actions">
        <label className="compact-field">
          Active view
          <select
            value={selected?.id ?? ""}
            onChange={(event) => onViewChange(event.target.value || null)}
          >
            {views.map((view) => (
              <option key={view.id} value={view.id}>
                {view.name}
                {view.visibility === "shared" ? " (shared)" : ""}
                {view.systemDefault ? " (default)" : ""}
                {preferredViewId === view.id ? " ★" : ""}
              </option>
            ))}
          </select>
        </label>
        <button className="secondary" type="button" disabled={busy || !selected} onClick={() => void setPreferred()}>
          Prefer this view
        </button>
        <button className="secondary" type="button" disabled={busy || !selected} onClick={() => void copySelected()}>
          Copy
        </button>
        <button className="secondary" type="button" disabled={busy} onClick={resetDefault}>
          Reset default
        </button>
        {canManageShared && selected && !selected.systemDefault && selected.visibility === "private" ? (
          <button className="secondary" type="button" disabled={busy} onClick={() => void publishShared()}>
            Publish shared
          </button>
        ) : null}
      </div>
      <form className="toolbar-actions" onSubmit={savePrivateView}>
        <label className="filter-field">
          Save current as private view
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="My pipeline"
            maxLength={160}
          />
        </label>
        <button className="primary" type="submit" disabled={busy}>
          {busy ? "Saving…" : "Save private"}
        </button>
      </form>
    </section>
  );
}
