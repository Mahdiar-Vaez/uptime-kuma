const { describe, test } = require("node:test");
const assert = require("node:assert");
const { generateMonitorReportPdf } = require("../../server/reporting");

describe("Service PDF Reporting", () => {
    test("generateMonitorReportPdf returns a valid PDF binary for a monitor summary", async () => {
        const pdfBuffer = await generateMonitorReportPdf({
            id: 42,
            name: "API Gateway",
            type: "http",
            url: "https://example.com",
            interval: 60,
            status: 1,
            uptime24: 99.98,
            uptime30d: 99.7,
            uptime1y: 99.5,
            avgPing: 125,
            tlsInfo: {
                valid: true,
                certInfo: {
                    commonName: "example.com",
                    validTo: "2039-01-01T00:00:00.000Z",
                    daysRemaining: 365,
                },
            },
            events: [
                { time: "2024-06-03T12:00:00.000Z", status: 1, msg: "Recovered after 12m downtime" },
            ],
        });

        assert.ok(Buffer.isBuffer(pdfBuffer));
        assert.ok(pdfBuffer.length > 1000);
        assert.ok(pdfBuffer.toString("binary").includes("%PDF"));
        assert.ok(pdfBuffer.toString("utf8").includes("API Gateway"));
    });
});
