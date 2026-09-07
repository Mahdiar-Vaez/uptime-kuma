const dayjs = require("dayjs");
const utc = require("dayjs/plugin/utc");
dayjs.extend(utc);

/**
 * Escape a PDF text string so it is safe inside a PDF content stream.
 * @param {string} value Raw text value.
 * @returns {string} Escaped PDF text.
 */
function escapePdfText(value) {
    return String(value ?? "")
        .replace(/\\/g, "\\\\")
        .replace(/\(/g, "\\(")
        .replace(/\)/g, "\\)")
        .replace(/\r\n|\r|\n/g, " ");
}

/**
 * Build a minimal but valid PDF document for a monitor report.
 * @param {object} report The report details.
 * @returns {Buffer} PDF document as a binary buffer.
 */
async function generateMonitorReportPdf(report) {
    const monitor = report || {};
    const generatedAt = dayjs.utc().format("YYYY-MM-DD HH:mm:ss [UTC]");
    const statusText = monitor.status === 1 ? "UP" : monitor.status === 0 ? "DOWN" : "PENDING";

    const lines = [
        "Service Status Report",
        "",
        `Monitor: ${monitor.name || "Unnamed Monitor"}`,
        `Type: ${monitor.type || "N/A"}`,
        `URL: ${monitor.url || "N/A"}`,
        `Interval: ${monitor.interval || "N/A"} seconds`,
        `Status: ${statusText}`,
        `Generated: ${generatedAt}`,
        "",
        `24h Uptime: ${monitor.uptime24 ?? "N/A"}%`,
        `30d Uptime: ${monitor.uptime30d ?? "N/A"}%`,
        `1y Uptime: ${monitor.uptime1y ?? "N/A"}%`,
        `Avg. Ping: ${monitor.avgPing ?? "N/A"} ms`,
        `SSL Valid: ${monitor.tlsInfo?.valid === true ? "Valid" : "N/A"}`,
        `Cert CN: ${monitor.tlsInfo?.certInfo?.commonName || "N/A"}`,
        `Cert Expires: ${monitor.tlsInfo?.certInfo?.validTo || "N/A"}`,
        `Days Remaining: ${monitor.tlsInfo?.certInfo?.daysRemaining ?? "N/A"}`,
        "",
        "Important Events:",
    ];

    const eventEntries = Array.isArray(monitor.events) ? monitor.events : [];
    eventEntries.slice(0, 8).forEach((event) => {
        const time = event?.time ? dayjs(event.time).format("YYYY-MM-DD HH:mm:ss UTC") : "N/A";
        const status = event?.status === 1 ? "UP" : event?.status === 0 ? "DOWN" : "PENDING";
        lines.push(`- ${time} | ${status} | ${event?.msg || "No message"}`);
    });

    if (eventEntries.length === 0) {
        lines.push("- No important events recorded.");
    }

    const contentLines = lines.map((line) => line.trimEnd());
    let y = 790;
    let pdfText = "";

    contentLines.forEach((line) => {
        pdfText += `BT /F1 12 Tf 50 ${y} Td (${escapePdfText(line)}) Tj ET\n`;
        y -= 18;
    });

    const stream = `BT\n/F1 12 Tf\n50 780 Td\n` + pdfText.replace(/BT\s\/F1\s12\sTf\s50\s\d+\sTd\s\(/g, "");

    const objects = [
        "<< /Type /Catalog /Pages 2 0 R >>",
        "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
        "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
        "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
        `<< /Length ${Buffer.byteLength(stream, "utf8")} >>\nstream\n${stream}\nendstream`,
    ];

    const pdfParts = ["%PDF-1.4\n"];
    const offsets = [0];

    for (let i = 0; i < objects.length; i++) {
        offsets.push(Buffer.byteLength(pdfParts.join(""), "utf8"));
        pdfParts.push(`${i + 1} 0 obj\n${objects[i]}\nendobj\n`);
    }

    const xrefPos = Buffer.byteLength(pdfParts.join(""), "utf8");
    pdfParts.push(`xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`);

    for (let i = 1; i <= objects.length; i++) {
        pdfParts.push(`${String(offsets[i]).padStart(10, "0")} 00000 n \n`);
    }

    pdfParts.push(`trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefPos}\n%%EOF\n`);

    return Buffer.from(pdfParts.join(""), "latin1");
}

module.exports = {
    generateMonitorReportPdf,
};
