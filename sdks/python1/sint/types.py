from typing import TypedDict, List, Optional, Any

class PolicyDecision(TypedDict):
    decision: str
    reason: Optional[str]

class SintCapabilityToken(TypedDict):
    token: str
    expires_at: str