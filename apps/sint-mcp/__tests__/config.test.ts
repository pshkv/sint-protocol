/**
 * SINT MCP — Config tests.
 */

import { describe, it, expect, afterEach } from "vitest";
import { loadConfig, interpolateEnvVars, validateConfig } from "../src/config.js";

describe("Config", () => {
  const envBackup: Record<string, string | undefined> = {};

  function setEnv(key: string, value: string) {
    envBackup[key] = process.env[key];
    process.env[key] = value;
  }

  afterEach(() => {
    for (const [key, value] of Object.entries(envBackup)) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  });

  it("loads defaults when no config source", () => {
    const config = loadConfig([]);
    expect(config.transport).toBe("stdio");
    expect(config.port).toBe(3200);
    expect(config.defaultPolicy).toBe("cautious");
    expect(config.approvalTimeoutMs).toBe(120_000);
    expect(config.servers).toEqual({});
  });

  it("reads transport from CLI args", () => {
    const config = loadConfig(["--sse"]);
    expect(config.transport).toBe("sse");
  });

  it("reads port from CLI args", () => {
    const config = loadConfig(["--port", "4000"]);
    expect(config.port).toBe(4000);
  });

  it("reads policy from CLI args", () => {
    const config = loadConfig(["--policy", "strict"]);
    expect(config.defaultPolicy).toBe("strict");
  });

  it("reads timeout from CLI args", () => {
    const config = loadConfig(["--timeout", "60000"]);
    expect(config.approvalTimeoutMs).toBe(60000);
  });

  it("environment variables override defaults", () => {
    setEnv("SINT_MCP_PORT", "5000");
    setEnv("SINT_MCP_TRANSPORT", "sse");
    setEnv("SINT_MCP_POLICY", "strict");

    const config = loadConfig([]);
    expect(config.port).toBe(5000);
    expect(config.transport).toBe("sse");
    expect(config.defaultPolicy).toBe("strict");
  });

  it("CLI args override env vars", () => {
    setEnv("SINT_MCP_PORT", "5000");
    const config = loadConfig(["--port", "6000"]);
    expect(config.port).toBe(6000);
  });

  it("handles combined CLI args", () => {
    const config = loadConfig(["--sse", "--port", "3300", "--policy", "permissive", "--timeout", "30000"]);
    expect(config.transport).toBe("sse");
    expect(config.port).toBe(3300);
    expect(config.defaultPolicy).toBe("permissive");
    expect(config.approvalTimeoutMs).toBe(30000);
  });
});

describe("interpolateEnvVars", () => {
  const envBackup: Record<string, string | undefined> = {};

  function setEnv(key: string, value: string) {
    envBackup[key] = process.env[key];
    process.env[key] = value;
  }

  afterEach(() => {
    for (const [key, value] of Object.entries(envBackup)) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  });

  it("replaces ${VAR} with environment value", () => {
    setEnv("MY_TOKEN", "abc123");
    expect(interpolateEnvVars('{"token": "${MY_TOKEN}"}')).toBe('{"token": "abc123"}');
  });

  it("replaces missing vars with empty string", () => {
    delete process.env["MISSING_VAR"];
    expect(interpolateEnvVars('{"val": "${MISSING_VAR}"}')).toBe('{"val": ""}');
  });

  it("supports ${VAR:-default} fallback syntax", () => {
    delete process.env["UNSET_VAR"];
    expect(interpolateEnvVars('{"val": "${UNSET_VAR:-fallback}"}')).toBe('{"val": "fallback"}');
  });

  it("uses env value over fallback when set", () => {
    setEnv("SET_VAR", "real");
    expect(interpolateEnvVars('{"val": "${SET_VAR:-fallback}"}')).toBe('{"val": "real"}');
  });

  it("handles multiple interpolations", () => {
    setEnv("A", "1");
    setEnv("B", "2");
    expect(interpolateEnvVars("${A}-${B}")).toBe("1-2");
  });
});

describe("validateConfig", () => {
  const validConfig = {
    servers: {},
    defaultPolicy: "cautious" as const,
    approvalTimeoutMs: 120_000,
    transport: "stdio" as const,
    port: 3200,
  };

  it("accepts valid config", () => {
    expect(() => validateConfig(validConfig)).not.toThrow();
  });

  it("rejects invalid policy", () => {
    expect(() => validateConfig({ ...validConfig, defaultPolicy: "invalid" as any }))
      .toThrow("Invalid policy");
  });

  it("rejects invalid transport", () => {
    expect(() => validateConfig({ ...validConfig, transport: "ws" as any }))
      .toThrow("Invalid transport");
  });

  it("rejects invalid port", () => {
    expect(() => validateConfig({ ...validConfig, port: 0 })).toThrow("Invalid port");
    expect(() => validateConfig({ ...validConfig, port: 70000 })).toThrow("Invalid port");
  });

  it("rejects too-low approval timeout", () => {
    expect(() => validateConfig({ ...validConfig, approvalTimeoutMs: 500 }))
      .toThrow("Approval timeout must be at least");
  });

  it("rejects server with neither command nor url", () => {
    expect(() => validateConfig({
      ...validConfig,
      servers: { bad: {} },
    })).toThrow('must specify either "command" or "url"');
  });

  it("rejects server with both command and url", () => {
    expect(() => validateConfig({
      ...validConfig,
      servers: { bad: { command: "echo", url: "http://localhost" } },
    })).toThrow('cannot specify both');
  });

  it("rejects server with invalid maxTier", () => {
    expect(() => validateConfig({
      ...validConfig,
      servers: { bad: { command: "echo", policy: { maxTier: "T99_invalid" as any } } },
    })).toThrow("invalid maxTier");
  });
});
