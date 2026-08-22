import { useEffect } from 'react';

export default function IntegrityTracker({ attemptId }: { attemptId: number }) {
    useEffect(() => {
        const logEvent = async (eventType: string, metadata: any = {}) => {
            await fetch(`/api/integrity/${attemptId}/event`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ eventType, metadata })
            });
        };

        const handleVisibilityChange = () => {
            if (document.hidden) {
                logEvent('tab_switch', { timestamp: new Date().toISOString() });
            }
        };

        document.addEventListener('visibilitychange', handleVisibilityChange);
        return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
    }, [attemptId]);

    return null; // Invisible component
}
