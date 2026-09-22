# Load Tests — Dosage ReAct Agent

Requires [k6](https://k6.io/) installed (`brew install k6`).

## Scripts

| Script               | Description                                                    |
| -------------------- | -------------------------------------------------------------- |
| `single-agent.k6.js` | 10 concurrent users, 1 agent each. Tests basic throughput.     |
| `multi-agent.k6.js`  | 5 users x 3 agents each. Tests concurrency, cache, contention. |

## Usage

```bash
# Set env vars
export BASE_URL=http://localhost:3001
export AUTH_TOKEN=your-jwt-token

# Run single-agent test
k6 run load-test/single-agent.k6.js

# Run multi-agent test
k6 run load-test/multi-agent.k6.js
```

## Metrics

- `stream_latency_ms` — time from request to full response
- `errors` — rate of non-200 responses
- `contention_events` — resource lock conflicts detected (multi-agent only)
- Standard k6 `http_req_duration` for request-level latency
