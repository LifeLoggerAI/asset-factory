import { Job } from './schema';

export enum LogLevel {
    INFO = 'INFO',
    WARN = 'WARN',
    ERROR = 'ERROR',
}

export interface LogEntry {
    timestamp: Date;
    level: LogLevel;
    message: string;
    details: Record<string, any>;
}

export function log(level: LogLevel, message: string, details: Record<string, any>): void {
    const entry: LogEntry = {
        timestamp: new Date(),
        level,
        message,
        details,
    };
    // In a real implementation, this would write to a dedicated logging service (e.g., Datadog, Logstash, or a dedicated Firestore collection).
    console.log(JSON.stringify(entry));
}

export function audit(job: Job, event: string, details: Record<string, any>): void {
    log(LogLevel.INFO, `AUDIT: ${event} for job ${job.id}`, { ...details, jobId: job.id, userId: job.userId });
}
