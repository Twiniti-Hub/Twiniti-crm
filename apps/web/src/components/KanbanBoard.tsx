import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  closestCorners,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent
} from "@dnd-kit/core";
import { useDraggable } from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { Link } from "react-router";
import { api } from "../lib/api";
import {
  defaultLanes,
  formatUpdatedAt,
  type BoardCard,
  type BoardLane,
  type BoardObjectType
} from "../lib/board";

type LaneState = {
  cards: BoardCard[];
  nextCursor: string | null;
  loading: boolean;
  count: number;
};

type Props = {
  objectType: BoardObjectType;
  detailPath: (id: string) => string;
  searchQuery: string;
  refreshKey?: number;
};

function CardBody({ card, objectType }: { card: BoardCard; objectType: BoardObjectType }) {
  if (objectType === "contact") {
    return (
      <>
        <strong>{card.name}</strong>
        <small>{card.email}</small>
        <small>{card.primaryCompany?.name ?? "No company"}</small>
        <small className="muted">Updated {formatUpdatedAt(card.updatedAt)}</small>
      </>
    );
  }
  return (
    <>
      <strong>{card.name}</strong>
      <small>{card.domain ?? "No domain"}</small>
      <small>{card.industry ?? "No industry"} · {card.contactCount ?? 0} contacts</small>
      <small className="muted">Updated {formatUpdatedAt(card.updatedAt)}</small>
    </>
  );
}

function BoardCardItem({
  card,
  objectType,
  detailPath,
  lanes,
  onMove
}: {
  card: BoardCard;
  objectType: BoardObjectType;
  detailPath: (id: string) => string;
  lanes: BoardLane[];
  onMove: (card: BoardCard, laneId: string) => Promise<void>;
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: card.id,
    data: { card }
  });
  const style = {
    transform: CSS.Translate.toString(transform),
    opacity: isDragging ? 0.4 : 1
  };
  const moveTargets = lanes.filter((lane) => lane.kind !== "other");

  return (
    <article ref={setNodeRef} style={style} className="kanban-card" {...listeners} {...attributes}>
      <div className="kanban-card-body">
        <Link to={detailPath(card.id)} onClick={(event) => event.stopPropagation()}>
          <CardBody card={card} objectType={objectType} />
        </Link>
      </div>
      <label className="kanban-move">
        Move to…
        <select
          aria-label={`Move ${card.name}`}
          defaultValue=""
          onClick={(event) => event.stopPropagation()}
          onPointerDown={(event) => event.stopPropagation()}
          onChange={(event) => {
            const laneId = event.target.value;
            event.target.value = "";
            if (laneId) void onMove(card, laneId);
          }}
        >
          <option value="" disabled>
            Select lane
          </option>
          {moveTargets.map((lane) => (
            <option key={lane.id} value={lane.id}>
              {lane.label}
            </option>
          ))}
        </select>
      </label>
    </article>
  );
}

function LaneColumn({
  lane,
  state,
  objectType,
  detailPath,
  lanes,
  onLoadMore,
  onMove
}: {
  lane: BoardLane;
  state: LaneState;
  objectType: BoardObjectType;
  detailPath: (id: string) => string;
  lanes: BoardLane[];
  onLoadMore: (laneId: string) => void;
  onMove: (card: BoardCard, laneId: string) => Promise<void>;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: lane.id });
  return (
    <section ref={setNodeRef} className={`kanban-lane${isOver ? " is-over" : ""}`}>
      <header className="kanban-lane-header">
        <h3>{lane.label}</h3>
        <span className="pill">{state.count}</span>
      </header>
      <div className="kanban-lane-cards">
        {state.cards.map((card) => (
          <BoardCardItem
            key={card.id}
            card={card}
            objectType={objectType}
            detailPath={detailPath}
            lanes={lanes}
            onMove={onMove}
          />
        ))}
        {!state.cards.length && !state.loading ? (
          <p className="muted kanban-empty">No records in this lane.</p>
        ) : null}
        {state.loading ? <p className="muted">Loading…</p> : null}
      </div>
      {state.nextCursor ? (
        <button className="secondary" type="button" onClick={() => onLoadMore(lane.id)} disabled={state.loading}>
          Load more
        </button>
      ) : null}
    </section>
  );
}

export function KanbanBoard({ objectType, detailPath, searchQuery, refreshKey = 0 }: Props) {
  const lanes = useMemo(() => defaultLanes(objectType), [objectType]);
  const [laneState, setLaneState] = useState<Record<string, LaneState>>(() =>
    Object.fromEntries(lanes.map((lane) => [lane.id, { cards: [], nextCursor: null, loading: false, count: 0 }]))
  );
  const [error, setError] = useState<string | null>(null);
  const [activeCard, setActiveCard] = useState<BoardCard | null>(null);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor)
  );

  async function loadCounts() {
    const params = new URLSearchParams({ objectType });
    if (searchQuery.trim()) params.set("query", searchQuery.trim());
    const res = await api(`/api/v1/boards/counts?${params.toString()}`);
    const counts = (res.data ?? []) as { laneId: string; count: number }[];
    setLaneState((current) => {
      const next = { ...current };
      for (const lane of lanes) {
        const count = counts.find((item) => item.laneId === lane.id)?.count ?? 0;
        next[lane.id] = { ...(next[lane.id] ?? { cards: [], nextCursor: null, loading: false, count: 0 }), count };
      }
      return next;
    });
  }

  async function loadLane(laneId: string, cursor?: string | null, append = false) {
    setLaneState((current) => ({
      ...current,
      [laneId]: { ...current[laneId], loading: true }
    }));
    try {
      const params = new URLSearchParams({
        objectType,
        laneId,
        limit: "25"
      });
      if (searchQuery.trim()) params.set("query", searchQuery.trim());
      if (cursor) params.set("cursor", cursor);
      const res = await api(`/api/v1/boards/cards?${params.toString()}`);
      const cards = (res.data ?? []) as BoardCard[];
      const nextCursor = (res.meta?.nextCursor as string | null | undefined) ?? null;
      setLaneState((current) => ({
        ...current,
        [laneId]: {
          ...current[laneId],
          cards: append ? [...current[laneId].cards, ...cards] : cards,
          nextCursor,
          loading: false
        }
      }));
    } catch (err) {
      setLaneState((current) => ({
        ...current,
        [laneId]: { ...current[laneId], loading: false }
      }));
      throw err;
    }
  }

  async function reloadBoard() {
    setError(null);
    try {
      await loadCounts();
      await Promise.all(lanes.map((lane) => loadLane(lane.id)));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load board");
    }
  }

  useEffect(() => {
    void reloadBoard();
  }, [objectType, searchQuery, refreshKey]);

  async function moveCard(card: BoardCard, laneId: string) {
    setError(null);
    const previous = laneState;
    const fromLaneId = Object.keys(laneState).find((id) => laneState[id].cards.some((item) => item.id === card.id));
    if (!fromLaneId || fromLaneId === laneId) return;

    setLaneState((current) => {
      const next = { ...current };
      next[fromLaneId] = {
        ...next[fromLaneId],
        cards: next[fromLaneId].cards.filter((item) => item.id !== card.id),
        count: Math.max(0, next[fromLaneId].count - 1)
      };
      next[laneId] = {
        ...next[laneId],
        cards: [{ ...card }, ...next[laneId].cards],
        count: next[laneId].count + 1
      };
      return next;
    });

    try {
      await api("/api/v1/boards/move", {
        method: "POST",
        body: JSON.stringify({
          objectType,
          recordId: card.id,
          laneId,
          version: card.version
        })
      });
      await reloadBoard();
    } catch (err) {
      setLaneState(previous);
      setError(err instanceof Error ? err.message : "Move failed");
    }
  }

  function onDragStart(event: DragStartEvent) {
    const card = event.active.data.current?.card as BoardCard | undefined;
    setActiveCard(card ?? null);
  }

  async function onDragEnd(event: DragEndEvent) {
    setActiveCard(null);
    const card = event.active.data.current?.card as BoardCard | undefined;
    const overId = event.over?.id ? String(event.over.id) : null;
    if (!card || !overId) return;
    const targetLane = lanes.find((lane) => lane.id === overId);
    if (!targetLane || targetLane.kind === "other") return;
    await moveCard(card, targetLane.id);
  }

  return (
    <div className="kanban-board-wrap">
      {error ? <div className="banner error">{error}</div> : null}
      <DndContext
        sensors={sensors}
        collisionDetection={closestCorners}
        onDragStart={onDragStart}
        onDragEnd={(event) => {
          void onDragEnd(event);
        }}
      >
        <div className="kanban-board" role="list">
          {lanes.map((lane) => (
            <LaneColumn
              key={lane.id}
              lane={lane}
              state={laneState[lane.id] ?? { cards: [], nextCursor: null, loading: false, count: 0 }}
              objectType={objectType}
              detailPath={detailPath}
              lanes={lanes}
              onLoadMore={(laneId) => {
                const cursor = laneState[laneId]?.nextCursor;
                void loadLane(laneId, cursor, true).catch((err) => {
                  setError(err instanceof Error ? err.message : "Failed to load more");
                });
              }}
              onMove={moveCard}
            />
          ))}
        </div>
        <DragOverlay>
          {activeCard ? (
            <article className="kanban-card is-dragging">
              <CardBody card={activeCard} objectType={objectType} />
            </article>
          ) : null}
        </DragOverlay>
      </DndContext>
      <p className="muted kanban-hint">
        Drag cards between lanes, or use Move to… on a card. Other is read-only for unknown imported values.
      </p>
    </div>
  );
}

export function BoardSearchBar({
  value,
  onChange,
  onApply,
  onClear
}: {
  value: string;
  onChange: (value: string) => void;
  onApply: () => void;
  onClear: () => void;
}) {
  function onSubmit(event: FormEvent) {
    event.preventDefault();
    onApply();
  }
  return (
    <form className="kanban-toolbar" onSubmit={onSubmit}>
      <label className="filter-field">
        Search board
        <input
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder="Filter cards"
        />
      </label>
      <button className="secondary" type="submit">
        Apply
      </button>
      <button className="secondary" type="button" onClick={onClear} disabled={!value}>
        Clear
      </button>
    </form>
  );
}
