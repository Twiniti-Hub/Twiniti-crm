import type { FastifyInstance } from "fastify";
import {
  boardCardsQuerySchema,
  boardCountsQuerySchema,
  boardMoveSchema,
  boardObjectTypeSchema,
  boardPreferenceSchema,
  createBoardViewSchema,
  updateBoardViewSchema
} from "@twiniti/contracts";
import {
  countBoardLanes,
  createBoardView,
  defaultBoardConfig,
  deleteBoardView,
  getBoardViewByIdForActor,
  getBoardViewForActor,
  getViewPreference,
  listBoardCards,
  listBoardViews,
  moveBoardRecord,
  setViewPreference,
  systemDefaultView,
  updateBoardView,
  type Db
} from "@twiniti/db";
import { z } from "zod";
import { audit, requireActor, requireOrgId, requireUserRole, sendError } from "../auth-hook.js";

export async function registerBoardRoutes(app: FastifyInstance, db: Db) {
  app.get("/api/v1/boards/views", async (request, reply) => {
    try {
      const actor = requireActor(request);
      requireUserRole(actor, "member");
      const query = z.object({ objectType: boardObjectTypeSchema }).parse(request.query);
      const views = await listBoardViews(db, requireOrgId(actor), actor.id, query.objectType);
      const preference = await getViewPreference(db, requireOrgId(actor), actor.id, query.objectType, "board");
      return {
        data: views,
        meta: {
          preferredViewId: preference?.viewId ?? systemDefaultView(query.objectType).id
        }
      };
    } catch (error) {
      return sendError(reply, error);
    }
  });

  app.post("/api/v1/boards/views", async (request, reply) => {
    try {
      const actor = requireActor(request);
      requireUserRole(actor, "member");
      const input = createBoardViewSchema.parse(request.body);
      if (input.visibility === "shared") requireUserRole(actor, "admin");
      const view = await createBoardView(db, {
        organizationId: requireOrgId(actor),
        userId: actor.id,
        name: input.name,
        objectType: input.objectType,
        presentation: input.presentation,
        visibility: input.visibility,
        boardConfig: input.boardConfig,
        filterAst: input.filterAst,
        columns: input.columns
      });
      await audit(db, actor, "board_view.create", "saved_view", view.id, {
        objectType: view.objectType,
        visibility: view.visibility
      });
      reply.code(201);
      return { data: view };
    } catch (error) {
      return sendError(reply, error);
    }
  });

  app.patch("/api/v1/boards/views/:id", async (request, reply) => {
    try {
      const actor = requireActor(request);
      requireUserRole(actor, "member");
      const { id } = request.params as { id: string };
      if (id.startsWith("system-")) {
        return reply.code(400).send({ error: { code: "immutable_default", message: "System default views cannot be modified" } });
      }
      const input = updateBoardViewSchema.parse(request.body);
      const existing = await getBoardViewByIdForActor(db, requireOrgId(actor), actor.id, id);
      if (!existing || existing.systemDefault) {
        return reply.code(404).send({ error: { code: "not_found", message: "Board view not found" } });
      }
      if (existing.visibility === "shared" || input.visibility === "shared") {
        requireUserRole(actor, "admin");
      } else if (existing.createdBy !== actor.id) {
        return reply.code(403).send({ error: { code: "forbidden", message: "Only the creator can update a private view" } });
      }
      const result = await updateBoardView(db, requireOrgId(actor), id, input);
      if (!result) return reply.code(404).send({ error: { code: "not_found", message: "Board view not found" } });
      if ("conflict" in result && result.conflict) {
        return reply.code(409).send({
          error: { code: "version_conflict", message: "Board view version conflict", details: { current: result.current } }
        });
      }
      if (!("view" in result)) {
        return reply.code(500).send({ error: { code: "update_failed", message: "Board view update failed" } });
      }
      await audit(db, actor, "board_view.update", "saved_view", id);
      return { data: result.view };
    } catch (error) {
      return sendError(reply, error);
    }
  });

  app.delete("/api/v1/boards/views/:id", async (request, reply) => {
    try {
      const actor = requireActor(request);
      requireUserRole(actor, "member");
      const { id } = request.params as { id: string };
      if (id.startsWith("system-")) {
        return reply.code(400).send({ error: { code: "immutable_default", message: "System default views cannot be deleted" } });
      }
      const existing = await getBoardViewByIdForActor(db, requireOrgId(actor), actor.id, id);
      if (!existing || existing.systemDefault) {
        return reply.code(404).send({ error: { code: "not_found", message: "Board view not found" } });
      }
      if (existing.visibility === "shared") requireUserRole(actor, "admin");
      else if (existing.createdBy !== actor.id) {
        return reply.code(403).send({ error: { code: "forbidden", message: "Only the creator can delete a private view" } });
      }
      await deleteBoardView(db, requireOrgId(actor), id);
      await audit(db, actor, "board_view.delete", "saved_view", id);
      return { data: { id } };
    } catch (error) {
      return sendError(reply, error);
    }
  });

  app.post("/api/v1/boards/views/:id/copy", async (request, reply) => {
    try {
      const actor = requireActor(request);
      requireUserRole(actor, "member");
      const { id } = request.params as { id: string };
      const body = z.object({
        name: z.string().trim().min(1).max(160).optional(),
        objectType: boardObjectTypeSchema.optional()
      }).parse(request.body ?? {});
      const source = await getBoardViewByIdForActor(db, requireOrgId(actor), actor.id, id);
      if (!source) return reply.code(404).send({ error: { code: "not_found", message: "Board view not found" } });
      const view = await createBoardView(db, {
        organizationId: requireOrgId(actor),
        userId: actor.id,
        name: body.name ?? `${source.name} (copy)`,
        objectType: source.objectType,
        presentation: "board",
        visibility: "private",
        boardConfig: source.boardConfig,
        filterAst: source.filterAst,
        columns: source.columns
      });
      await audit(db, actor, "board_view.copy", "saved_view", view.id, { sourceId: source.id });
      reply.code(201);
      return { data: view };
    } catch (error) {
      return sendError(reply, error);
    }
  });

  app.put("/api/v1/boards/preference", async (request, reply) => {
    try {
      const actor = requireActor(request);
      requireUserRole(actor, "member");
      const input = boardPreferenceSchema.parse(request.body);
      if (input.viewId) {
        const view = await getBoardViewForActor(
          db,
          requireOrgId(actor),
          actor.id,
          input.viewId,
          input.objectType
        );
        if (!view) return reply.code(404).send({ error: { code: "not_found", message: "Board view not found" } });
      }
      const row = await setViewPreference(db, {
        organizationId: requireOrgId(actor),
        userId: actor.id,
        objectType: input.objectType,
        presentation: input.presentation,
        viewId: input.viewId
      });
      return {
        data: {
          objectType: row.objectType,
          presentation: row.presentation,
          viewId: row.viewId
        }
      };
    } catch (error) {
      return sendError(reply, error);
    }
  });

  app.get("/api/v1/boards/counts", async (request, reply) => {
    try {
      const actor = requireActor(request);
      requireUserRole(actor, "member");
      const query = boardCountsQuerySchema.parse(request.query);
      const view = await getBoardViewForActor(
        db,
        requireOrgId(actor),
        actor.id,
        query.viewId,
        query.objectType
      );
      if (!view) return reply.code(404).send({ error: { code: "not_found", message: "Board view not found" } });
      const boardConfig = view.boardConfig ?? defaultBoardConfig(query.objectType);
      const counts = await countBoardLanes(db, requireOrgId(actor), query.objectType, boardConfig, query.query);
      return { data: counts, meta: { viewId: view.id, lanes: boardConfig.lanes } };
    } catch (error) {
      return sendError(reply, error);
    }
  });

  app.get("/api/v1/boards/cards", async (request, reply) => {
    try {
      const actor = requireActor(request);
      requireUserRole(actor, "member");
      const query = boardCardsQuerySchema.parse(request.query);
      const view = await getBoardViewForActor(
        db,
        requireOrgId(actor),
        actor.id,
        query.viewId,
        query.objectType
      );
      if (!view) return reply.code(404).send({ error: { code: "not_found", message: "Board view not found" } });
      const boardConfig = view.boardConfig ?? defaultBoardConfig(query.objectType);
      const page = await listBoardCards(db, requireOrgId(actor), query.objectType, boardConfig, {
        laneId: query.laneId,
        query: query.query,
        limit: query.limit,
        cursor: query.cursor
      });
      return {
        data: page.data,
        meta: {
          limit: query.limit,
          nextCursor: page.nextCursor,
          laneId: query.laneId,
          viewId: view.id
        }
      };
    } catch (error) {
      return sendError(reply, error);
    }
  });

  app.post("/api/v1/boards/move", async (request, reply) => {
    try {
      const actor = requireActor(request);
      requireUserRole(actor, "member");
      const input = boardMoveSchema.parse(request.body);
      const view = await getBoardViewForActor(
        db,
        requireOrgId(actor),
        actor.id,
        input.viewId,
        input.objectType
      );
      if (!view) return reply.code(404).send({ error: { code: "not_found", message: "Board view not found" } });
      const boardConfig = view.boardConfig ?? defaultBoardConfig(input.objectType);
      const result = await moveBoardRecord(db, requireOrgId(actor), {
        objectType: input.objectType,
        recordId: input.recordId,
        laneId: input.laneId,
        version: input.version,
        boardConfig,
        change: { actorType: actor.type, actorId: actor.id, source: "api.board.move" }
      });
      if (!result) {
        return reply.code(404).send({ error: { code: "not_found", message: "Record not found" } });
      }
      if ("error" in result && result.error) {
        return reply.code(400).send({ error: { code: "invalid_move", message: result.error } });
      }
      if ("conflict" in result && result.conflict) {
        return reply.code(409).send({
          error: {
            code: "version_conflict",
            message: "Record version conflict",
            details: { current: result.current }
          }
        });
      }
      if (!("row" in result) || !result.row) {
        return reply.code(500).send({ error: { code: "move_failed", message: "Board move failed" } });
      }
      await audit(db, actor, "board.move", input.objectType, input.recordId, {
        laneId: input.laneId,
        groupingField: boardConfig.groupingField
      });
      return {
        data: {
          id: result.row.id,
          version: result.row.version,
          lifecycleStage: "lifecycleStage" in result.row ? result.row.lifecycleStage : null,
          updatedAt: result.row.updatedAt instanceof Date
            ? result.row.updatedAt.toISOString()
            : String(result.row.updatedAt)
        }
      };
    } catch (error) {
      return sendError(reply, error);
    }
  });
}
