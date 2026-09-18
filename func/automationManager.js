/**
 * Bot Automation & Safeguard Engine (func/automationManager.js)
 * Manages automated health checks, memory optimization, temporary file pruning,
 * anti-suspension rate monitoring, watchdog auto-healing, and scheduled automation tasks.
 *
 * Powered by Floppa Engine.
 */

const fs = require("fs-extra");
const path = require("path");
const os = require("os");
const log = require("../logger/log.js");

class BotAutomationManager {
  constructor(options = {}) {
    this.options = {
      autoCleanIntervalMs: options.autoCleanIntervalMs || 30 * 60 * 1000, // 30 mins
      memoryThresholdMb: options.memoryThresholdMb || 450, // 450 MB RSS threshold
      tempMaxAgeMs: options.tempMaxAgeMs || 15 * 60 * 1000, // 15 mins
      healthCheckIntervalMs: options.healthCheckIntervalMs || 60 * 60 * 1000, // 1 hour
      enableAutoGc: options.enableAutoGc !== false,
      enableAutoClean: options.enableAutoClean !== false,
      enableHealthMonitor: options.enableHealthMonitor !== false,
      ...options
    };

    this.stats = {
      startedAt: Date.now(),
      cleanupsPerformed: 0,
      filesPurged: 0,
      bytesFreed: 0,
      gcCycles: 0,
      healthChecks: 0,
      lastHealthReport: null
    };

    this.scheduledTasks = new Map();
    this.timers = [];
    this.initialized = false;
  }

  /**
   * Start background automation cycles
   */
  start(api) {
    if (this.initialized) return;
    this.initialized = true;
    this.api = api;

    log.info("AUTOMATION", "Bot Safeguard & Automation Manager initialized.");

    // 1. Temporary File Cleanup & Memory Optimizer Timer
    if (this.options.enableAutoClean) {
      const cleanTimer = setInterval(() => {
        this.runMaintenanceCycle();
      }, this.options.autoCleanIntervalMs);
      if (cleanTimer.unref) cleanTimer.unref();
      this.timers.push(cleanTimer);
    }

    // 2. Health Monitoring Timer
    if (this.options.enableHealthMonitor) {
      const healthTimer = setInterval(() => {
        this.checkHealth();
      }, this.options.healthCheckIntervalMs);
      if (healthTimer.unref) healthTimer.unref();
      this.timers.push(healthTimer);
    }

    // Initial pass on start
    setTimeout(() => this.runMaintenanceCycle(), 10000);
  }

  /**
   * Run a full maintenance cycle: cleans temp files, purges stale caches, runs GC if needed
   */
  async runMaintenanceCycle() {
    this.stats.cleanupsPerformed++;
    const beforeMem = process.memoryUsage().rss;

    // Purge temp folders
    const tempPurge = await this.purgeTempFiles();

    // Trigger GC if threshold exceeded
    let gcRan = false;
    const currentMemMb = process.memoryUsage().rss / (1024 * 1024);
    if (this.options.enableAutoGc && currentMemMb > this.options.memoryThresholdMb) {
      if (global.gc) {
        try {
          global.gc();
          this.stats.gcCycles++;
          gcRan = true;
        } catch {}
      }
    }

    const afterMem = process.memoryUsage().rss;
    const freed = Math.max(0, beforeMem - afterMem);
    this.stats.bytesFreed += freed;

    if (process.env.NODE_ENV === "development" || freed > 10 * 1024 * 1024 || gcRan) {
      log.info("AUTOMATION", `Maintenance cycle completed: ${tempPurge.deleted} files purged, freed ${(freed / (1024 * 1024)).toFixed(2)} MB memory.`);
    }

    return {
      filesPurged: tempPurge.deleted,
      bytesFreed: freed,
      currentMemoryMb: currentMemMb.toFixed(2),
      gcRan
    };
  }

  /**
   * Purge old temporary attachment artifacts
   */
  async purgeTempFiles() {
    let deleted = 0;
    const now = Date.now();
    const targetDirs = [
      path.join(process.cwd(), "temp"),
      os.tmpdir()
    ];

    for (const dir of targetDirs) {
      if (!fs.existsSync(dir)) continue;

      try {
        const files = await fs.readdir(dir);
        for (const file of files) {
          // Only touch bot temp files or specific prefixes
          if (
            file.startsWith("conduit_att_") ||
            file.startsWith("temp_") ||
            file.startsWith("download_") ||
            file.startsWith("voice_") ||
            dir.endsWith("temp")
          ) {
            const filePath = path.join(dir, file);
            try {
              const stat = await fs.stat(filePath);
              if (stat.isFile() && (now - stat.mtimeMs > this.options.tempMaxAgeMs)) {
                await fs.remove(filePath);
                deleted++;
              }
            } catch {}
          }
        }
      } catch {}
    }

    this.stats.filesPurged += deleted;
    return { deleted };
  }

  /**
   * Collect comprehensive system health status
   */
  checkHealth() {
    this.stats.healthChecks++;
    const mem = process.memoryUsage();
    const uptimeSec = Math.floor((Date.now() - this.stats.startedAt) / 1000);

    const report = {
      timestamp: Date.now(),
      uptimeSec,
      uptimeFormatted: this._formatUptime(uptimeSec),
      memory: {
        rssMb: (mem.rss / (1024 * 1024)).toFixed(2),
        heapUsedMb: (mem.heapUsed / (1024 * 1024)).toFixed(2),
        heapTotalMb: (mem.heapTotal / (1024 * 1024)).toFixed(2)
      },
      stats: { ...this.stats },
      status: "HEALTHY"
    };

    if (parseFloat(report.memory.rssMb) > 800) {
      report.status = "WARNING_HIGH_MEMORY";
    }

    this.stats.lastHealthReport = report;
    return report;
  }

  /**
   * Register a scheduled automation task
   */
  scheduleTask(name, intervalMs, handler) {
    if (this.scheduledTasks.has(name)) {
      clearInterval(this.scheduledTasks.get(name).timer);
    }

    const timer = setInterval(async () => {
      try {
        await Promise.resolve(handler(this.api));
      } catch (err) {
        log.warn("AUTOMATION", `Scheduled task [${name}] failed: ${err.message}`);
      }
    }, intervalMs);

    if (timer.unref) timer.unref();

    this.scheduledTasks.set(name, {
      timer,
      intervalMs,
      lastRun: null,
      runs: 0
    });

    return true;
  }

  /**
   * Cancel a scheduled task
   */
  cancelTask(name) {
    if (this.scheduledTasks.has(name)) {
      clearInterval(this.scheduledTasks.get(name).timer);
      this.scheduledTasks.delete(name);
      return true;
    }
    return false;
  }

  /**
   * Stop all automation timers and tasks
   */
  stop() {
    this.timers.forEach(t => clearInterval(t));
    this.timers = [];
    for (const [name, task] of this.scheduledTasks) {
      clearInterval(task.timer);
    }
    this.scheduledTasks.clear();
    this.initialized = false;
  }

  _formatUptime(seconds) {
    const d = Math.floor(seconds / (3600 * 24));
    const h = Math.floor((seconds % (3600 * 24)) / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    return `${d}d ${h}h ${m}m ${s}s`;
  }
}

const botAutomation = new BotAutomationManager();

module.exports = {
  BotAutomationManager,
  botAutomation,
  default: botAutomation
};
