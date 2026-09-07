const { describe, test } = require("node:test");
const assert = require("node:assert");
const { ChainMonitorType } = require("../../../server/monitor-types/chain");
const Monitor = require("../../../server/model/monitor");
const { UP, DOWN, PENDING } = require("../../../src/util");

describe("Chain Monitor", () => {
    test("check() returns UP when all chain stages are healthy in AND mode", async () => {
        const originalGetChildren = Monitor.getChildren;
        const originalGetPreviousHeartbeat = Monitor.getPreviousHeartbeat;

        try {
            Monitor.getChildren = async () => [
                { id: 1, name: "login", active: true },
                { id: 2, name: "dashboard", active: true },
            ];
            Monitor.getPreviousHeartbeat = async () => ({ status: UP });

            const chainMonitor = new ChainMonitorType();
            const heartbeat = { status: PENDING, msg: "" };

            await chainMonitor.check({ id: 99, conditions: JSON.stringify({ mode: "and" }) }, heartbeat, {});

            assert.strictEqual(heartbeat.status, UP);
            assert.match(heartbeat.msg, /all chain stages are up|chain ok/i);
        } finally {
            Monitor.getChildren = originalGetChildren;
            Monitor.getPreviousHeartbeat = originalGetPreviousHeartbeat;
        }
    });

    test("check() rejects when a sequential stage fails in order", async () => {
        const originalGetChildren = Monitor.getChildren;
        const originalGetPreviousHeartbeat = Monitor.getPreviousHeartbeat;

        try {
            Monitor.getChildren = async () => [
                { id: 1, name: "login", active: true },
                { id: 2, name: "checkout", active: true },
            ];
            Monitor.getPreviousHeartbeat = async (monitorID) => ({
                status: monitorID === 1 ? DOWN : UP,
            });

            const chainMonitor = new ChainMonitorType();
            const heartbeat = { status: PENDING, msg: "" };

            await assert.rejects(
                chainMonitor.check({ id: 99, conditions: JSON.stringify({ mode: "sequential" }) }, heartbeat, {}),
                /login/i
            );
        } finally {
            Monitor.getChildren = originalGetChildren;
            Monitor.getPreviousHeartbeat = originalGetPreviousHeartbeat;
        }
    });

    test("check() returns UP when OR mode has at least one healthy stage", async () => {
        const originalGetChildren = Monitor.getChildren;
        const originalGetPreviousHeartbeat = Monitor.getPreviousHeartbeat;

        try {
            Monitor.getChildren = async () => [
                { id: 1, name: "api-primary", active: true },
                { id: 2, name: "api-fallback", active: true },
            ];
            Monitor.getPreviousHeartbeat = async (monitorID) => ({
                status: monitorID === 1 ? DOWN : UP,
            });

            const chainMonitor = new ChainMonitorType();
            const heartbeat = { status: PENDING, msg: "" };

            await chainMonitor.check({ id: 99, conditions: JSON.stringify({ mode: "or" }) }, heartbeat, {});

            assert.strictEqual(heartbeat.status, UP);
        } finally {
            Monitor.getChildren = originalGetChildren;
            Monitor.getPreviousHeartbeat = originalGetPreviousHeartbeat;
        }
    });
});
