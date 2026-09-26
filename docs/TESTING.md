# TaskFlow Pro — Test Suite

## Summary
**38 tests pass · 0 fail · 93 expect() calls** across 11 files.

## Engine Unit Tests (19 tests)
| File | Coverage |
|------|----------|
| `cycle-detection.test.ts` | Self-cycle, direct cycle, indirect cycle, valid chain |
| `topological-sort.test.ts` | Linear chain, diamond, disconnected nodes, cyclic throws |
| `readiness.test.ts` | No deps → READY, one dep not DONE → BLOCKED, all DONE → READY, multi-prereq |
| `scheduler.test.ts` | plannedStart, chain propagation, diamond no-compounding (+3d → +3d not +6d) |
| `critical-path.test.ts` | Linear path, diamond picks longest branch |
| `regression.test.ts` | A reverts to IN_PROGRESS; B and C become BLOCKED, status untouched |
| `convergence.test.ts` | Diamond A→B, A→C, B→D, C→D; A shifts +3d; D shifts +3d exactly once |

## Integration Tests (19 tests)
| File | Coverage |
|------|----------|
| `auth.integration.test.ts` | Register, login, JWT validation, logout (9 tests) |
| `dependency.integration.test.ts` | CRUD, cycle detection, graph, critical path, events (5 tests) |
| `task-move.integration.test.ts` | BLOCKED guard and readiness (2 tests) |
| `diamond.integration.test.ts` | Compounding math and regression (2 tests) |

## Known Failure Cases
- **None at this time.** All 38 tests pass. No `test.skip` / `test.todo` markers exist in the suite.
- If a test fails, it is a regression to be fixed, not a documented known failure.

## Running
```bash
bun test
```
