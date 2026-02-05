export interface LogEntry {
  timestamp: string;
  result: {
    isMalicious: boolean;
    confidence: number;
    threatType: string;
    layer: string;
    latencyMs: number;
  };
  inputHash: string;
  context?: Record<string, unknown>;
}

export interface LoggerConfig {
  endpoint?: string;
  batchSize?: number;
  flushIntervalMs?: number;
  includeStackTrace?: boolean;
  redactInput?: boolean;
  maxRetries?: number;
}

export class Logger {
  private queue: LogEntry[] = [];
  private config: Required<LoggerConfig>;
  private flushTimer?: ReturnType<typeof setInterval>;
  private stats = {
    totalChecks: 0,
    detections: 0,
    totalLatency: 0,
    byThreatType: new Map<string, number>()
  };

  constructor(config: LoggerConfig = {}) {
    this.config = {
      endpoint: '',
      batchSize: 10,
      flushIntervalMs: 5000,
      includeStackTrace: false,
      redactInput: true,
      maxRetries: 3,
      ...config
    };

    if (this.config.endpoint) {
      this.startFlushTimer();
    }
  }

  async log(entry: LogEntry): Promise<void> {
    // Update stats
    this.stats.totalChecks++;
    this.stats.totalLatency += entry.result.latencyMs;
    
    if (entry.result.isMalicious) {
      this.stats.detections++;
      const current = this.stats.byThreatType.get(entry.result.threatType) || 0;
      this.stats.byThreatType.set(entry.result.threatType, current + 1);
    }

    // Add to queue
    this.queue.push(entry);

    // Flush if batch size reached
    if (this.queue.length >= this.config.batchSize) {
      await this.flush();
    }

    // Console log for immediate visibility
    if (entry.result.isMalicious) {
      console.warn(`[PromptArmor] Threat detected: ${entry.result.threatType}`, {
        confidence: entry.result.confidence,
        inputHash: entry.inputHash,
        timestamp: entry.timestamp
      });
    }
  }

  async flush(): Promise<void> {
    if (this.queue.length === 0) return;

    const batch = [...this.queue];
    this.queue = [];

    // Log to console
    console.log(`[PromptArmor] Flushing ${batch.length} log entries`);

    // Send to endpoint if configured
    if (this.config.endpoint) {
      await this.sendToEndpoint(batch);
    }

    // Store locally if in browser
    if (typeof window !== 'undefined') {
      this.storeLocally(batch);
    }
  }

  private async sendToEndpoint(batch: LogEntry[]): Promise<void> {
    let retries = 0;
    
    while (retries < this.config.maxRetries) {
      try {
        const response = await fetch(this.config.endpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            batch,
            metadata: {
              timestamp: new Date().toISOString(),
              count: batch.length
            }
          })
        });

        if (response.ok) {
          return;
        }

        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      } catch (error) {
        retries++;
        if (retries >= this.config.maxRetries) {
          console.error('[PromptArmor] Failed to send logs:', error);
          // Re-queue for later
          this.queue.unshift(...batch);
        } else {
          // Exponential backoff
          await this.delay(Math.pow(2, retries) * 100);
        }
      }
    }
  }

  private storeLocally(batch: LogEntry[]): void {
    try {
      const existing = localStorage.getItem('prompt_armor_logs');
      const logs = existing ? JSON.parse(existing) : [];
      
      // Keep only last 1000 entries
      const combined = [...logs, ...batch];
      if (combined.length > 1000) {
        combined.splice(0, combined.length - 1000);
      }
      
      localStorage.setItem('prompt_armor_logs', JSON.stringify(combined));
    } catch (error) {
      console.error('[PromptArmor] Failed to store logs locally:', error);
    }
  }

  private startFlushTimer(): void {
    this.flushTimer = setInterval(() => {
      this.flush();
    }, this.config.flushIntervalMs);
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  getStats(): { totalChecks: number; detections: number; averageLatency: number } {
    return {
      totalChecks: this.stats.totalChecks,
      detections: this.stats.detections,
      averageLatency: this.stats.totalChecks > 0 
        ? this.stats.totalLatency / this.stats.totalChecks 
        : 0
    };
  }

  getThreatBreakdown(): Record<string, number> {
    const result: Record<string, number> = {};
    for (const [threat, count] of this.stats.byThreatType.entries()) {
      result[threat] = count;
    }
    return result;
  }

  getRecentLogs(count = 100): LogEntry[] {
    if (typeof window === 'undefined') return [];
    
    try {
      const existing = localStorage.getItem('prompt_armor_logs');
      const logs = existing ? JSON.parse(existing) : [];
      return logs.slice(-count);
    } catch {
      return [];
    }
  }

  clearLogs(): void {
    this.queue = [];
    if (typeof window !== 'undefined') {
      localStorage.removeItem('prompt_armor_logs');
    }
    this.stats = {
      totalChecks: 0,
      detections: 0,
      totalLatency: 0,
      byThreatType: new Map()
    };
  }

  async export(): Promise<string> {
    await this.flush();
    
    const data = {
      stats: this.getStats(),
      threatBreakdown: this.getThreatBreakdown(),
      logs: typeof window !== 'undefined' ? this.getRecentLogs(1000) : []
    };

    return JSON.stringify(data, null, 2);
  }

  destroy(): void {
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
    }
    this.flush();
  }
}

export default Logger;
