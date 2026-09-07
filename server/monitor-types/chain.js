const { UP, PENDING, DOWN } = require("../../src/util");
const { MonitorType } = require("./monitor-type");
const Monitor = require("../model/monitor");

class ChainMonitorType extends MonitorType {
    name = "chain";
    allowCustomStatus = true;

    /**
     * Parse a chain config stored in monitor.conditions.
     * Supported structure:
     * {
     *   logic: "AND|OR|NOT|SEQUENTIAL",
     *   stages: [{ id: 12, name: "Login" }, { id: 15, name: "Checkout" }],
     *   continueOnFailure: false
     * }
     * @param {object} monitor Monitor bean
     * @returns {{logic: string, stages: Array, continueOnFailure: boolean}}
     */
    parseConfig(monitor) {
        if (!monitor || !monitor.conditions) {
            return {
                logic: "AND",
                stages: [],
                continueOnFailure: false,
            };
        }

        try {
            const parsed = JSON.parse(monitor.conditions);

            if (parsed && typeof parsed === "object") {
                const logic = typeof parsed.logic === "string"
                    ? parsed.logic
                    : (typeof parsed.mode === "string" ? parsed.mode : (parsed.operator || "AND"));

                return {
                    logic: logic.toUpperCase(),
                    stages: Array.isArray(parsed.stages) ? parsed.stages : [],
                    continueOnFailure: Boolean(parsed.continueOnFailure),
                };
            }
        } catch (e) {
            // Ignore invalid JSON and fall back to default logic.
        }

        return {
            logic: "AND",
            stages: [],
            continueOnFailure: false,
        };
    }

    /**
     * Resolve stages in explicit order when configured, otherwise use child monitor order.
     * @param {Array} children
     * @param {Array} configuredStages
     * @returns {Array}
     */
    resolveStages(children, configuredStages) {
        if (Array.isArray(configuredStages) && configuredStages.length > 0) {
            const ordered = [];
            const matchedIds = new Set();

            for (const stage of configuredStages) {
                const stageId = Number(stage.id);
                const matched = children.find((child) => {
                    if (Number(child.id) === stageId) {
                        return true;
                    }

                    if (typeof stage.name === "string") {
                        return (child.name || `#${child.id}`) === stage.name;
                    }

                    return false;
                });

                if (matched) {
                    ordered.push(matched);
                    matchedIds.add(Number(matched.id));
                }
            }

            for (const child of children) {
                if (!matchedIds.has(Number(child.id))) {
                    ordered.push(child);
                }
            }

            return ordered;
        }

        return children.slice().sort((a, b) => Number(a.id) - Number(b.id));
    }

    /**
     * Evaluate dependency logic for the chain.
     * @param {string} logic
     * @param {Array<{id:number, name:string, status:string}>} stages
     * @returns {{status: string, message: string}}
     */
    evaluateLogic(logic, stages) {
        const names = stages.map((stage) => stage.name);
        const downStages = stages.filter((stage) => stage.status === DOWN);
        const pendingStages = stages.filter((stage) => stage.status === PENDING);
        const upStages = stages.filter((stage) => stage.status === UP);

        switch ((logic || "AND").toUpperCase()) {
            case "AND": {
                if (downStages.length > 0) {
                    return {
                        status: DOWN,
                        message: `Chain failed: ${downStages.map((stage) => stage.name).join(", ")}`,
                    };
                }

                if (pendingStages.length > 0) {
                    return {
                        status: PENDING,
                        message: `Chain pending: ${pendingStages.map((stage) => stage.name).join(", ")}`,
                    };
                }

                return {
                    status: UP,
                    message: "All chain stages are up",
                };
            }

            case "OR": {
                if (upStages.length > 0) {
                    return {
                        status: UP,
                        message: `Chain ok: at least one stage is up (${upStages.map((stage) => stage.name).join(", ")})`,
                    };
                }

                if (pendingStages.length > 0) {
                    return {
                        status: PENDING,
                        message: `Chain pending: ${pendingStages.map((stage) => stage.name).join(", ")}`,
                    };
                }

                return {
                    status: DOWN,
                    message: `Chain failed: no stage is up (${names.join(", ")})`,
                };
            }

            case "NOT": {
                if (upStages.length > 0) {
                    return {
                        status: DOWN,
                        message: `Inverse chain failed: ${upStages.map((stage) => stage.name).join(", ")}`,
                    };
                }

                return {
                    status: UP,
                    message: "Inverse chain satisfied: no stage is up",
                };
            }

            case "SEQUENTIAL": {
                for (const stage of stages) {
                    if (stage.status === DOWN) {
                        return {
                            status: DOWN,
                            message: `Sequential chain failed at ${stage.name}`,
                        };
                    }

                    if (stage.status === PENDING) {
                        return {
                            status: PENDING,
                            message: `Sequential chain pending at ${stage.name}`,
                        };
                    }
                }

                return {
                    status: UP,
                    message: "Sequential chain completed successfully",
                };
            }

            default: {
                if (downStages.length > 0) {
                    return {
                        status: DOWN,
                        message: `Chain failed: ${downStages.map((stage) => stage.name).join(", ")}`,
                    };
                }

                if (pendingStages.length > 0) {
                    return {
                        status: PENDING,
                        message: `Chain pending: ${pendingStages.map((stage) => stage.name).join(", ")}`,
                    };
                }

                return {
                    status: UP,
                    message: "All chain stages are up",
                };
            }
        }
    }

    /**
     * @inheritdoc
     */
    async check(monitor, heartbeat, _server) {
        const children = await Monitor.getChildren(monitor.id);
        const config = this.parseConfig(monitor);
        const stages = this.resolveStages(children, config.stages).filter((child) => child && child.active !== false);

        if (stages.length === 0) {
            heartbeat.status = PENDING;
            heartbeat.msg = "Chain empty";
            return;
        }

        const stageResults = [];
        for (const stage of stages) {
            const lastBeat = await Monitor.getPreviousHeartbeat(stage.id);
            const status = lastBeat ? lastBeat.status : PENDING;

            stageResults.push({
                id: stage.id,
                name: stage.name || `#${stage.id}`,
                status,
            });
        }

        const result = this.evaluateLogic(config.logic, stageResults);
        heartbeat.status = result.status;
        heartbeat.msg = result.message;

        if (result.status === UP) {
            return;
        }

        throw new Error(result.message);
    }
}

module.exports = {
    ChainMonitorType,
};
