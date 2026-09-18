/**
 * @author frnAlt
 * ! Floppa-Chatbot Real-Time Persistent Memory & Diagnostics Engine
 * ! Captures session state, real-time chat history, command metrics, error logs, and AI diagnostic digests.
 */

const fs = require("fs-extra");
const path = require("path");

const DATA_DIR = path.join(process.cwd(), "database/data");
const MEMORY_FILE = path.join(DATA_DIR, "system_memory.json");
const AI_SNAPSHOT_FILE = path.join(DATA_DIR, "ai_debug_snapshot.json");

const MAX_EVENTS = 500;
const MAX_ERRORS = 250;
const MAX_COMMANDS = 250;
const MAX_SESSIONS = 50;

class SystemMemoryDB {
  constructor() {
    this.sessionId = "session_" + Date.now() + "_" + Math.random().toString(36).slice(2, 7);
    this.startTime = Date.now();
    this.dirty = false;
    this.flushTimer = null;

    this.data = {
      version: "1.0.0",
      createdAt: new Date().toISOString(),
      currentSession: {
        sessionId: this.sessionId,
        startTime: new Date().toISOString(),
        startTimestamp: this.startTime,
        status: "starting",
        botID: null,
        botName: null,
        mqttConnected: false,
        mqttDisconnects: 0,
        mqttReconnects: 0,
        lastMqttPing: null,
        totalEventsReceived: 0,
        totalCommandsExecuted: 0,
        totalErrorsCaught: 0
      },
      sessions: [],
      events: [],
      errors: [],
      commands: [],
      stabilityMetrics: {
        lastCheckpointWarning: null,
        cookieLive: null,
        lastCookieCheck: null,
        e2eeErrors: 0,
        httpMercuryFallbacks: 0
      }
    };

    this._load();
    this._startAutoFlush();
    this._hookProcessExit();
  }

  _load() {
    try {
      fs.ensureDirSync(DATA_DIR);
      if (fs.existsSync(MEMORY_FILE)) {
        const saved = fs.readJsonSync(MEMORY_FILE);
        if (saved && typeof saved === "object") {
          if (saved.currentSession && saved.currentSession.sessionId !== this.sessionId) {
            saved.currentSession.endTime = new Date().toISOString();
            saved.currentSession.durationMs = Date.now() - (saved.currentSession.startTimestamp || Date.now());
            this.data.sessions = [saved.currentSession, ...(saved.sessions || [])].slice(0, MAX_SESSIONS);
          } else {
            this.data.sessions = (saved.sessions || []).slice(0, MAX_SESSIONS);
          }
          this.data.events = Array.isArray(saved.events) ? saved.events.slice(-MAX_EVENTS) : [];
          this.data.errors = Array.isArray(saved.errors) ? saved.errors.slice(-MAX_ERRORS) : [];
          this.data.commands = Array.isArray(saved.commands) ? saved.commands.slice(-MAX_COMMANDS) : [];
          if (saved.stabilityMetrics) {
            this.data.stabilityMetrics = { ...this.data.stabilityMetrics, ...saved.stabilityMetrics };
          }
        }
      }
    } catch (e) {
      console.error("[SYSTEM_MEMORY_DB] Error loading existing memory store:", e.message);
    }
  }

  _scheduleFlush() {
    this.dirty = true;
    if (!this.flushTimer) {
      this.flushTimer = setTimeout(() => {
        this.flushTimer = null;
        this.flush().catch(() => {});
      }, 2500);
    }
  }

  _startAutoFlush() {
    setInterval(() => {
      if (this.dirty) {
        this.flush().catch(() => {});
      }
    }, 15000).unref();
  }

  _hookProcessExit() {
    const handleExit = () => {
      this.data.currentSession.status = "stopped";
      this.data.currentSession.endTime = new Date().toISOString();
      this.data.currentSession.durationMs = Date.now() - this.startTime;
      this.flushSync();
    };

    process.on("beforeExit", handleExit);
    process.on("exit", handleExit);
  }

  recordEvent(event, extra = {}) {
    if (!event) return;
    this.data.currentSession.totalEventsReceived++;

    const entry = {
      id: event.messageID || ("evt_" + Date.now() + "_" + Math.random().toString(36).slice(2, 6)),
      timestamp: new Date().toISOString(),
      type: event.type || "unknown",
      threadID: String(event.threadID || "unknown"),
      senderID: String(event.senderID || event.userID || event.author || "unknown"),
      isGroup: event.isGroup !== undefined ? Boolean(event.isGroup) : (event.threadID !== event.senderID),
      bodySnippet: (event.body || "").slice(0, 150),
      hasAttachments: Boolean(event.attachments && event.attachments.length > 0),
      attachmentTypes: event.attachments ? event.attachments.map(a => a.type || "unknown").slice(0, 3) : [],
      ...extra
    };

    this.data.events.push(entry);
    if (this.data.events.length > MAX_EVENTS) {
      this.data.events.splice(0, this.data.events.length - MAX_EVENTS);
    }

    this._scheduleFlush();
  }

  recordCommand(commandName, event, durationMs = 0, error = null) {
    this.data.currentSession.totalCommandsExecuted++;

    const entry = {
      timestamp: new Date().toISOString(),
      command: commandName,
      threadID: String(event?.threadID || "unknown"),
      senderID: String(event?.senderID || "unknown"),
      isGroup: Boolean(event?.isGroup),
      durationMs,
      success: !error,
      errorMsg: error ? (error.message || String(error)) : null
    };

    this.data.commands.push(entry);
    if (this.data.commands.length > MAX_COMMANDS) {
      this.data.commands.splice(0, this.data.commands.length - MAX_COMMANDS);
    }

    if (error) {
      this.recordError("COMMAND_EXEC", error, { command: commandName, threadID: event?.threadID, senderID: event?.senderID });
    }

    this._scheduleFlush();
  }

  recordError(source, error, context = {}) {
    this.data.currentSession.totalErrorsCaught++;

    const errMsg = error?.message || (typeof error === "string" ? error : JSON.stringify(error));
    const stack = error?.stack ? error.stack.split("\n").slice(0, 6).join("\n") : null;

    if (errMsg.includes("1545116") || errMsg.includes("E2EE") || errMsg.includes("cutoverHandleInvalidSendToOpen")) {
      this.data.stabilityMetrics.e2eeErrors++;
    }
    if (errMsg.includes("checkpoint") || errMsg.includes("1357004")) {
      this.data.stabilityMetrics.lastCheckpointWarning = new Date().toISOString();
    }

    const entry = {
      id: "err_" + Date.now() + "_" + Math.random().toString(36).slice(2, 6),
      timestamp: new Date().toISOString(),
      source,
      message: errMsg,
      stack,
      context
    };

    this.data.errors.push(entry);
    if (this.data.errors.length > MAX_ERRORS) {
      this.data.errors.splice(0, this.data.errors.length - MAX_ERRORS);
    }

    this.flush().catch(() => {});
  }

  updateSession(update = {}) {
    Object.assign(this.data.currentSession, update);
    this._scheduleFlush();
  }

  updateStability(update = {}) {
    Object.assign(this.data.stabilityMetrics, update);
    this._scheduleFlush();
  }

  generateAISnapshot() {
    const uptimeSec = Math.floor((Date.now() - this.startTime) / 1000);
    const recentErrors = this.data.errors.slice(-15).reverse();
    const recentCommands = this.data.commands.slice(-15).reverse();
    const recentEvents = this.data.events.slice(-15).reverse();

    return {
      generatedAt: new Date().toISOString(),
      systemStatus: {
        sessionId: this.sessionId,
        uptimeSeconds: uptimeSec,
        uptimeHuman: Math.floor(uptimeSec / 60) + "m " + (uptimeSec % 60) + "s",
        status: this.data.currentSession.status,
        botID: this.data.currentSession.botID,
        botName: this.data.currentSession.botName,
        mqttConnected: this.data.currentSession.mqttConnected,
        mqttDisconnects: this.data.currentSession.mqttDisconnects,
        totalEventsCaptured: this.data.currentSession.totalEventsReceived,
        totalCommandsExecuted: this.data.currentSession.totalCommandsExecuted,
        totalErrorsRecorded: this.data.currentSession.totalErrorsCaught
      },
      stability: this.data.stabilityMetrics,
      recentErrors: recentErrors.map(e => ({
        time: e.timestamp,
        source: e.source,
        message: e.message,
        context: e.context
      })),
      recentCommands: recentCommands.map(c => ({
        time: c.timestamp,
        command: c.command,
        threadID: c.threadID,
        durationMs: c.durationMs,
        success: c.success,
        error: c.errorMsg
      })),
      recentChatLogs: recentEvents.map(ev => ({
        time: ev.timestamp,
        type: ev.type,
        threadID: ev.threadID,
        senderID: ev.senderID,
        isGroup: ev.isGroup,
        body: ev.bodySnippet
      })),
      aiDiagnosticSummary: {
        health: this.data.errors.length === 0 ? "EXCELLENT" : (this.data.errors.length < 5 ? "STABLE_WITH_NOTICES" : "ATTENTION_NEEDED"),
        notesForAgent: [
          this.data.stabilityMetrics.lastCheckpointWarning ? ("Checkpoint flag detected at " + this.data.stabilityMetrics.lastCheckpointWarning) : "No active checkpoint restriction detected",
          this.data.currentSession.mqttConnected ? "MQTT real-time message stream is active" : "MQTT not currently connected or reconnecting",
          "Total errors this run: " + this.data.currentSession.totalErrorsCaught
        ]
      }
    };
  }

  getSnapshot() {
    return this.generateAISnapshot();
  }

  async flush() {
    try {
      this.dirty = false;
      this.data.currentSession.uptimeSeconds = Math.floor((Date.now() - this.startTime) / 1000);
      await fs.writeJson(MEMORY_FILE, this.data, { spaces: 2 });
      await fs.writeJson(AI_SNAPSHOT_FILE, this.generateAISnapshot(), { spaces: 2 });
    } catch (e) {
      console.error("[SYSTEM_MEMORY_DB] Error writing memory files:", e.message);
    }
  }

  flushSync() {
    try {
      this.data.currentSession.uptimeSeconds = Math.floor((Date.now() - this.startTime) / 1000);
      fs.writeJsonSync(MEMORY_FILE, this.data, { spaces: 2 });
      fs.writeJsonSync(AI_SNAPSHOT_FILE, this.generateAISnapshot(), { spaces: 2 });
    } catch (_) {}
  }
}

if (!global.systemMemoryDB) {
  global.systemMemoryDB = new SystemMemoryDB();
}

module.exports = global.systemMemoryDB;
