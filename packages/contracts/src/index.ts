import { z } from "zod";

export const propertyValueSchema = z.union([
  z.string(),
  z.number(),
  z.boolean(),
  z.null(),
  z.array(z.string())
]);

export const contactSchema = z.object({
  id: z.string().uuid(),
  email: z.string().email(),
  firstName: z.string().nullable(),
  lastName: z.string().nullable(),
  lifecycleStage: z.string().nullable(),
  properties: z.record(propertyValueSchema)
});

export const createContactSchema = z.object({
  email: z.string().email(),
  firstName: z.string().trim().max(100).optional(),
  lastName: z.string().trim().max(100).optional(),
  properties: z.record(propertyValueSchema).default({})
});

export const updateContactSchema = createContactSchema.partial().extend({
  version: z.number().int().nonnegative().optional()
});

export const contactSearchSchema = z.object({
  query: z.string().trim().max(200).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(25),
  cursor: z.string().optional()
});

export const agentIdentitySchema = z.object({
  name: z.string().trim().min(1).max(100),
  purpose: z.string().trim().min(1).max(500),
  scopes: z.array(z.string()).min(1),
  expiresAt: z.string().datetime().nullable()
});

export type Contact = z.infer<typeof contactSchema>;
export type CreateContact = z.infer<typeof createContactSchema>;
export type UpdateContact = z.infer<typeof updateContactSchema>;
export type ContactSearch = z.infer<typeof contactSearchSchema>;
export type AgentIdentity = z.infer<typeof agentIdentitySchema>;
