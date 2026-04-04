# Industrial Benchmark Report

Generated: 2026-04-04T19:36:31.435Z
Commit: local

Result: PASS

## Totals

- Suites: 2/2 passed
- Tests: 9/9 passed

## Suite Summary

| Suite | Status | Duration (ms) | Tests | Failed |
|---|---:|---:|---:|---:|
| packages/conformance-tests/src/industrial-benchmark-scenarios.test.ts | passed | 61.157 | 7 | 0 |
| packages/conformance-tests/src/industrial-interoperability.test.ts | passed | 35.927 | 2 | 0 |

## Scenario Summary

| Scenario | Status | Duration (ms) |
|---|---:|---:|
| Industrial Benchmark Scenarios human enters aisle: cmd_vel request escalates to T3 | passed | 11.305 |
| Industrial Benchmark Scenarios stale corridor request is deterministically denied | passed | 5.247 |
| Industrial Benchmark Scenarios revocation under load never fails open | passed | 23.423 |
| Industrial Benchmark Scenarios safety-zone breach is deterministically denied | passed | 4.887 |
| Industrial Benchmark Scenarios model swap against token modelConstraints is denied | passed | 4.364 |
| Industrial Benchmark Scenarios edge disconnect never allows T2/T3 fail-open behavior | passed | 8.837 |
| Industrial Benchmark Scenarios multi-fleet conflict path escalates to T3 with approval quorum | passed | 3.157 |
| Industrial Interoperability Conformance warehouse move intent yields equivalent tiering for RMF->ROS2 and Sparkplug paths | passed | 30.879 |
| Industrial Interoperability Conformance A2A -> Open-RMF dispatch path maps into the same gateway approval semantics | passed | 4.927 |
