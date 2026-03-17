/**
 * SINT Protocol — Event type constants.
 *
 * @module @sint/core/constants/events
 */

/** All SINT event types as string constants for switch/case usage. */
export const SINT_EVENTS = {
  // Lifecycle
  AGENT_REGISTERED: "agent.registered",
  CAPABILITY_GRANTED: "agent.capability.granted",
  CAPABILITY_REVOKED: "agent.capability.revoked",

  // Request/Response
  REQUEST_RECEIVED: "request.received",
  POLICY_EVALUATED: "policy.evaluated",
  APPROVAL_REQUESTED: "approval.requested",
  APPROVAL_GRANTED: "approval.granted",
  APPROVAL_DENIED: "approval.denied",
  APPROVAL_TIMEOUT: "approval.timeout",

  // Execution
  ACTION_STARTED: "action.started",
  ACTION_COMPLETED: "action.completed",
  ACTION_FAILED: "action.failed",
  ACTION_ROLLEDBACK: "action.rolledback",

  // Safety
  ESTOP_TRIGGERED: "safety.estop.triggered",
  GEOFENCE_VIOLATION: "safety.geofence.violation",
  FORCE_EXCEEDED: "safety.force.exceeded",
  HUMAN_DETECTED: "safety.human.detected",
  ANOMALY_DETECTED: "safety.anomaly.detected",

  // Economic
  CAPSULE_PURCHASED: "capsule.purchased",
  TASK_BID_PLACED: "task.bid.placed",
  PAYMENT_SETTLED: "payment.settled",
} as const;
