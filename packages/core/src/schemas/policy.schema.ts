/**
 * SINT Protocol — Zod validation schemas for policy gateway requests.
 *
 * @module @sint/core/schemas/policy
 */

import { z } from "zod";
import {
  ed25519PublicKeySchema,
  iso8601Schema,
  uuidV7Schema,
} from "./capability-token.schema.js";

export const physicalContextSchema = z.object({
  humanDetected: z.boolean().optional(),
  currentForceNewtons: z.number().min(0).optional(),
  currentVelocityMps: z.number().min(0).optional(),
  currentPosition: z.object({
    x: z.number(),
    y: z.number(),
    z: z.number(),
  }).optional(),
}).strict();

export const sintRequestSchema = z.object({
  requestId: uuidV7Schema,
  timestamp: iso8601Schema,
  agentId: ed25519PublicKeySchema,
  tokenId: uuidV7Schema,
  resource: z.string().min(1).max(512),
  action: z.string().min(1).max(64),
  params: z.record(z.unknown()),
  physicalContext: physicalContextSchema.optional(),
  recentActions: z.array(z.string()).optional(),
}).strict();

export type ValidatedSintRequest = z.infer<typeof sintRequestSchema>;
