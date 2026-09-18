/**
 * System Telemetry & Statistics Helper
 * Provides real-time metrics for CPU usage, memory consumption, uptime, and load average.
 */

const os = require("os");

function formatUptime(seconds) {
  seconds = Math.floor(seconds);
  const days = Math.floor(seconds / (3600 * 24));
  seconds -= days * 3600 * 24;
  const hours = Math.floor(seconds / 3600);
  seconds -= hours * 3600;
  const minutes = Math.floor(seconds / 60);
  seconds -= minutes * 60;

  const parts = [];
  if (days > 0) parts.push(`${days}d`);
  if (hours > 0) parts.push(`${hours}h`);
  if (minutes > 0) parts.push(`${minutes}m`);
  parts.push(`${seconds}s`);

  return parts.join(" ");
}

function getSystemMetrics() {
  const totalMem = os.totalmem();
  const freeMem = os.freemem();
  const usedMem = totalMem - freeMem;
  const memUsagePercent = ((usedMem / totalMem) * 100).toFixed(1);

  const uptimeSeconds = os.uptime();
  const processUptimeSeconds = process.uptime();
  const loadAvg = os.loadavg();
  const cpus = os.cpus();

  return {
    platform: os.platform(),
    arch: os.arch(),
    nodeVersion: process.version,
    cpuCount: cpus.length,
    cpuModel: cpus[0]?.model || "Generic CPU",
    memory: {
      totalMB: Math.round(totalMem / (1024 * 1024)),
      usedMB: Math.round(usedMem / (1024 * 1024)),
      freeMB: Math.round(freeMem / (1024 * 1024)),
      usagePercent: `${memUsagePercent}%`
    },
    uptime: {
      systemFormatted: formatUptime(uptimeSeconds),
      processFormatted: formatUptime(processUptimeSeconds),
      systemSeconds: uptimeSeconds,
      processSeconds: processUptimeSeconds
    },
    loadAverage: loadAvg.map(l => l.toFixed(2))
  };
}

module.exports = {
  getSystemMetrics,
  formatUptime
};
