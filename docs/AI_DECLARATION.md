# AI Tools Declaration & Usage Disclosure

> **Transparency Statement**: This project was developed utilizing AI coding assistants and modern generative tools to accelerate architecture design, monorepo configuration, boilerplate generation, and test suite creation.

---

## 1. Development-Time AI Tools Used

| Tool / Assistant | Primary Use Case & Contribution |
| :--- | :--- |
| **Antigravity (Google DeepMind)** | System architecture design, pair programming, mono-repo environment setup, real-time WebSocket debugging, error trace analysis, and integration verification. |
| **OpenCode** | Monorepo scaffolding (Turborepo), initial TypeScript package layout (`@repo/types`, `@repo/db`, `@repo/ui`), and ESLint/Prettier configuration. |
| **GitHub Copilot / LLM Assistance** | Scaffolding repetitive DTO types, Zod validation schemas, React component boilerplate, and unit test mocks. |

---

## 2. Human Oversight & Verification Methodology

While AI tools were utilized to accelerate development speed:

1. **Architecture & Business Logic Verification**: All core DAG engine algorithms (topological sorting, cycle detection, critical path calculation, status regression rules) were manually designed, reviewed, and audited against system requirements.
2. **Automated Testing**: 241 unit, integration, and end-to-end tests were executed across all 9 monorepo packages to guarantee correctness and zero regressions.
3. **Security & Data Sanitization**: Input validation schemas (Zod), JWT authentication middleware, CORS policies, and SQL injection protection (Prisma ORM) were explicitly inspected and verified.

---

## 3. Runtime AI Features vs. Development AI Tools

It is important to distinguish between **Development AI Tools** (used to write code) and **Runtime AI Features** (built into the product):

* **Runtime AI Dependency Suggestion Feature**:
  - Located in `apps/server/src/workers/ai-suggestion.worker.ts` and `apps/server/src/services/ai.service.ts`.
  - Uses OpenAI / OpenRouter LLM API via BullMQ background jobs to analyze project task titles/descriptions and suggest missing dependency relationships.
  - This is a functional user-facing feature of TaskFlow Pro, completely distinct from the development coding assistants listed above.
