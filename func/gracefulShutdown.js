/**
 * Graceful Shutdown Handler
 * Ensures all pending operations, database auto-saves, and socket closures complete cleanly before shutdown
 */

class GracefulShutdown {
	constructor(options = {}) {
		this.options = {
			timeout: options.timeout || 30000,
			...options
		};

		this.pendingOperations = new Map();
		this.shutdownCallbacks = [];
		this.isShuttingDown = false;

		this._setupHandlers();
	}

	startOperation(id, type = 'unknown') {
		if (this.isShuttingDown) {
			throw new Error('Cannot start new operations during shutdown');
		}
		this.pendingOperations.set(id, { type, startTime: Date.now() });
	}

	endOperation(id) {
		this.pendingOperations.delete(id);
	}

	onShutdown(callback, priority = 10) {
		this.shutdownCallbacks.push({ callback, priority });
		this.shutdownCallbacks.sort((a, b) => a.priority - b.priority);
	}

	async shutdown(signal = 'manual') {
		if (this.isShuttingDown) return;
		this.isShuttingDown = true;

		console.log(`\n🛑 Received ${signal}. Starting graceful shutdown...`);

		// Wait for pending operations
		const startTime = Date.now();
		while (this.pendingOperations.size > 0) {
			if (Date.now() - startTime > this.options.timeout) {
				console.log(`⚠️ Timeout waiting for ${this.pendingOperations.size} pending operations:`);
				for (const [id, info] of this.pendingOperations) {
					console.log(`  - ${id} (${info.type}, ${Date.now() - info.startTime}ms)`);
				}
				break;
			}
			console.log(`⏳ Waiting for ${this.pendingOperations.size} pending operations...`);
			await this._delay(500);
		}

		// Run shutdown callbacks
		console.log(`🔄 Running ${this.shutdownCallbacks.length} shutdown tasks...`);
		for (const { callback, priority } of this.shutdownCallbacks) {
			try {
				await Promise.race([
					callback(),
					this._delay(5000).then(() => {
						console.log(`⚠️ Shutdown task (priority ${priority}) timed out`);
					})
				]);
			} catch (err) {
				console.error(`❌ Shutdown task failed:`, err.message);
			}
		}

		console.log('✅ Graceful shutdown complete');
		process.exit(0);
	}

	_setupHandlers() {
		['SIGINT', 'SIGTERM', 'SIGUSR2'].forEach(signal => {
			process.on(signal, () => this.shutdown(signal));
		});

		process.on('message', (msg) => {
			if (msg === 'shutdown') {
				this.shutdown('pm2-shutdown');
			}
		});
	}

	_delay(ms) {
		return new Promise(resolve => setTimeout(resolve, ms));
	}

	getStatus() {
		return {
			isShuttingDown: this.isShuttingDown,
			pendingOperations: this.pendingOperations.size,
			operations: Array.from(this.pendingOperations.entries()).map(([id, info]) => ({
				id,
				...info,
				duration: Date.now() - info.startTime
			})),
			shutdownTasks: this.shutdownCallbacks.length
		};
	}
}

const shutdownManager = new GracefulShutdown();

module.exports = shutdownManager;
