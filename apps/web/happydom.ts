import { GlobalRegistrator } from "@happy-dom/global-registrator";

/**
 * Registers a DOM for React component tests.
 *
 * Preloaded by `apps/web/bunfig.toml` when tests run from that directory, and
 * imported directly by the test files so the repository-root `bun test` run
 * also has a DOM. The guard keeps the two mechanisms from registering twice.
 */
const globals = globalThis as { __taskflowDomRegistered?: boolean };

if (!globals.__taskflowDomRegistered) {
  globals.__taskflowDomRegistered = true;
  GlobalRegistrator.register({ url: "http://localhost:3000" });
}
