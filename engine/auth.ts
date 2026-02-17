import { User } from './schema';

const MAX_REQUESTS_PER_MINUTE = 100;
const usage = new Map<string, { count: number, timestamp: number }>();

export function check_rate_limit(user: User): boolean {
    const now = Date.now();
    const user_usage = usage.get(user.id);

    if (user_usage && now - user_usage.timestamp < 60000) {
        if (user_usage.count >= MAX_REQUESTS_PER_MINUTE) {
            return false; // Rate limit exceeded
        }
        user_usage.count++;
    } else {
        usage.set(user.id, { count: 1, timestamp: now });
    }
    return true;
}

export function has_permission(user: User, action: string): boolean {
    // This is a simplified RBAC check. A real implementation would have more granular roles and permissions.
    if (user.role === 'admin') {
        return true;
    }
    if (action === 'create_job' && user.role === 'user') {
        return true;
    }
    return false;
}
