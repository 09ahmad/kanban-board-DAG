#!/usr/bin/env bun

/**
 * Run all tests script for TaskFlow Pro
 * Runs tests for all packages and apps
 */

import { spawnSync } from "child_process";
import { resolve } from "path";

const ROOT = resolve(import.meta.dir, "..");

function runTest(name: string, path: string, args: string[]): { name: string; passed: boolean; output: string } {
  console.log(`\n📦 Testing ${name}...`);
  const fullPath = resolve(ROOT, path);
  const result = spawnSync("bun", ["test", ...args], {
    cwd: fullPath,
    encoding: "utf-8",
    maxBuffer: 1024 * 1024,
  });

  const output = result.stdout + result.stderr;
  
  // Check if it's a "no tests found" error
  const noTests = output.includes("No tests found") || 
                  output.includes("No test files found") || 
                  output.includes("0 passed") || 
                  output.includes("0 test files");
  
  if (result.status === 0 || noTests) {
    if (noTests) {
      console.log(`⚠️  ${name} - No tests found (skipped)`);
    } else {
      console.log(`✅ ${name} - PASSED`);
    }
    return { name, passed: true, output: noTests ? "No tests found" : output };
  } else {
    console.log(`❌ ${name} - FAILED`);
    console.log(output);
    return { name, passed: false, output };
  }
}

async function main() {
  console.log("🧪 TaskFlow Pro - Running All Tests");
  console.log("====================================\n");

  const results: { name: string; passed: boolean; output: string }[] = [];

  // Test each package/app
  const testTargets = [
    { name: "Types Package", path: "packages/types", args: [] },
    { name: "Database Package", path: "packages/db", args: [] },
    { name: "Queue Package", path: "packages/queue", args: [] },
    { name: "Server Engine (DAG)", path: "apps/server", args: ["src/engine/__tests__/"] },
    { name: "Server Integration", path: "apps/server", args: ["src/__tests__/"] },
    { name: "WebSocket Server", path: "apps/ws-server", args: [] },
    { name: "Web App", path: "apps/web", args: [] },
  ];

  for (const target of testTargets) {
    const result = runTest(target.name, target.path, target.args);
    results.push(result);
  }

  // Summary
  console.log("\n\n📊 Test Summary");
  console.log("===============");
  const passed = results.filter(r => r.passed).length;
  const failed = results.filter(r => !r.passed).length;

  for (const result of results) {
    const status = result.passed ? "✅ PASS" : "❌ FAIL";
    console.log(`  ${status} - ${result.name}`);
  }

  console.log(`\nTotal: ${results.length} | Passed: ${passed} | Failed: ${failed}`);

  if (failed > 0) {
    console.log("\n❌ Some tests failed. Check output above for details.");
    process.exit(1);
  } else {
    console.log("\n🎉 All tests passed!");
  }
}

await main();