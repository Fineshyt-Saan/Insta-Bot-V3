/**
 * BackgroundTask - Automated Background Polling & Loop System
 * Enables commands and game engines to run scheduled background tasks without blocking.
 */

const { Datum } = require("./collections.js");

class BackgroundTaskFB {
  constructor(config) {
    this.taskID = String(config.taskID || "Unnamed");
    this.bgTask = config.onTask || (async () => {});
    this.bgTaskCondition = config.condition || (async () => true);
    this.onStart = config.onStart || (() => {});
    this.intervalMS = config.intervalMS || 10000;
    this.skips = Math.max(0, Math.floor(this.intervalMS / BackgroundTaskFB.POLL_INTERVAL));
    this.currentSkips = 0;
    this.state = {};
  }

  updateSkip() {
    this.currentSkips++;
    if (this.currentSkips > this.skips) {
      this.currentSkips = 0;
    }
  }

  willSkip() {
    return this.currentSkips > 0;
  }

  static get tasks() {
    if (!global.FloppaBot) global.FloppaBot = {};
    if (!global.FloppaBot.bgTasks) global.FloppaBot.bgTasks = [];
    return global.FloppaBot.bgTasks;
  }

  static POLL_INTERVAL = 5000;

  static loadTasksFromCommands() {
    const commands = global.FloppaBot?.commands || new Map();
    const tasks = [];

    const cmdList = commands instanceof Map ? Array.from(commands.values()) : Object.values(commands);
    for (const cmd of cmdList) {
      if (cmd && Array.isArray(cmd.bgTasks)) {
        for (const t of cmd.bgTasks) {
          if (t instanceof BackgroundTaskFB) {
            tasks.push(t);
          }
        }
      }
    }

    const uniqueTasks = Datum.toUniqueArray(tasks, i => i.taskID);
    global.FloppaBot.bgTasks = uniqueTasks;
    return uniqueTasks;
  }

  static async startPoll(api) {
    const log = global.utils?.log || console;
    const tasks = BackgroundTaskFB.tasks;

    // Run onStart for each task
    for (const task of tasks) {
      try {
        if (typeof task.onStart === "function") {
          task.onStart(task);
        }
      } catch (err) {
        log.error?.("BACKGROUND_TASK", `Error in task ${task.taskID} onStart:`, err.message);
      }
    }

    const intervalId = setInterval(async () => {
      for (const task of tasks) {
        try {
          task.updateSkip();
          if (task.willSkip()) continue;

          const ctx = {
            api,
            usersData: global.db?.usersData,
            threadsData: global.db?.threadsData,
            globalData: global.db?.globalData,
            task
          };

          const shouldRun = await task.bgTaskCondition(ctx, task);
          if (shouldRun) {
            await task.bgTask(ctx, task);
          }
        } catch (err) {
          log.error?.("BACKGROUND_TASK", `Error executing task ${task.taskID}:`, err.message);
        }
      }
    }, BackgroundTaskFB.POLL_INTERVAL);

    return {
      intervalId,
      stop() {
        clearInterval(intervalId);
      }
    };
  }
}

module.exports = BackgroundTaskFB;
module.exports.BackgroundTaskFB = BackgroundTaskFB;
