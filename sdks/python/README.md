# SINT Protocol Python SDK

Python SDK for the [SINT Protocol](https://github.com/pshkv/sint-protocol) gateway.

Mirrors the TypeScript SDK (`sdks/typescript/`).

## Installation

```bash
pip install sint-sdk
```

Or from source:

```bash
cd sdks/python
pip install -e ".[dev]"
```

## Quick Start

```python
import asyncio
from sint import create_sint_client

async def main():
    sint = create_sint_client({"baseUrl": "http://localhost:3000"})

    # Health check
    health = await sint.health()
    print(f"SINT v{health['version']}: {health['status']}")

    # Intercept an action
    decision = await sint.intercept({
        "agentId": "agent-public-key-hex",
        "tokenId": "uuid-v7",
        "resource": "ros2:///cmd_vel",
        "action": "publish",
        "params": {"linear": {"x": 0.5}},
    })
    print(f"Decision: {decision['action']}")

    await sint.close()

asyncio.run(main())
```

## API

All methods mirror the [TypeScript SDK](https://github.com/pshkv/sint-protocol/tree/main/sdks/typescript):

| Method | Description |
|--------|-------------|
| `discovery()` | Fetch `.well-known/sint.json` |
| `health()` | Gateway health check |
| `intercept(request)` | Intercept a single action → `SintDecision` |
| `intercept_batch(requests)` | Intercept multiple actions |
| `pending_approvals()` | List pending human approvals |
| `resolve_approval(id, resolution)` | Approve or deny |
| `ledger(agent_id?, limit)` | Retrieve audit events |
| `schemas()` | List all schemas |
| `schema(name)` | Get a single schema |

## Development

```bash
pip install -e ".[dev]"
pytest
mypy sint/
```
