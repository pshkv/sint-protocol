/**
 * SINT Protocol — Physical Constraint Checker.
 *
 * Validates that a request's parameters don't violate the
 * physical constraints in the agent's capability token.
 *
 * This is called BEFORE every physical action. Skipping
 * this check is a safety hazard.
 *
 * @module @sint/gate-policy-gateway/constraint-checker
 */

import type {
  Result,
  SintCapabilityToken,
  SintRequest,
} from "@sint/core";
import { ok, err } from "@sint/core";
import {
  validatePhysicalConstraints,
  type PhysicalActionContext,
} from "@sint/gate-capability-tokens";

/** Constraint check failure details. */
export interface ConstraintViolation {
  readonly constraint: string;
  readonly limit: number | string;
  readonly actual: number | string;
  readonly message: string;
}

/**
 * Extract physical action context from a SINT request.
 * Maps request params and physical context to the format
 * expected by the constraint validator.
 */
export function extractPhysicalContext(
  request: SintRequest,
): PhysicalActionContext {
  return {
    commandedForceNewtons:
      (request.params["force"] as number | undefined) ??
      request.physicalContext?.currentForceNewtons,
    commandedVelocityMps:
      (request.params["velocity"] as number | undefined) ??
      (request.params["linear_velocity"] as number | undefined) ??
      request.physicalContext?.currentVelocityMps,
    position: request.physicalContext?.currentPosition
      ? {
          x: request.physicalContext.currentPosition.x,
          y: request.physicalContext.currentPosition.y,
        }
      : undefined,
    humanPresenceDetected: request.physicalContext?.humanDetected,
  };
}

/**
 * Check all physical constraints for a request against a token.
 *
 * @example
 * ```ts
 * const result = checkConstraints(token, request);
 * if (!result.ok) {
 *   console.error("Constraint violated:", result.error);
 * }
 * ```
 */
export function checkConstraints(
  token: SintCapabilityToken,
  request: SintRequest,
): Result<true, ConstraintViolation[]> {
  const context = extractPhysicalContext(request);
  const violations: ConstraintViolation[] = [];

  // Force check
  if (
    token.constraints.maxForceNewtons !== undefined &&
    context.commandedForceNewtons !== undefined &&
    context.commandedForceNewtons > token.constraints.maxForceNewtons
  ) {
    violations.push({
      constraint: "maxForceNewtons",
      limit: token.constraints.maxForceNewtons,
      actual: context.commandedForceNewtons,
      message: `Force ${context.commandedForceNewtons}N exceeds limit ${token.constraints.maxForceNewtons}N`,
    });
  }

  // Velocity check
  if (
    token.constraints.maxVelocityMps !== undefined &&
    context.commandedVelocityMps !== undefined &&
    context.commandedVelocityMps > token.constraints.maxVelocityMps
  ) {
    violations.push({
      constraint: "maxVelocityMps",
      limit: token.constraints.maxVelocityMps,
      actual: context.commandedVelocityMps,
      message: `Velocity ${context.commandedVelocityMps}m/s exceeds limit ${token.constraints.maxVelocityMps}m/s`,
    });
  }

  // Geofence check
  if (token.constraints.geofence && context.position) {
    const result = validatePhysicalConstraints(
      { geofence: token.constraints.geofence },
      { position: context.position },
    );
    if (!result.ok) {
      violations.push({
        constraint: "geofence",
        limit: "within polygon",
        actual: `(${context.position.x}, ${context.position.y})`,
        message: `Position outside geofence boundary`,
      });
    }
  }

  // Human presence check
  if (
    token.constraints.requiresHumanPresence === true &&
    context.humanPresenceDetected !== true
  ) {
    violations.push({
      constraint: "requiresHumanPresence",
      limit: "true",
      actual: String(context.humanPresenceDetected ?? false),
      message: "Human presence required but not detected",
    });
  }

  if (violations.length > 0) {
    return err(violations);
  }

  return ok(true);
}
