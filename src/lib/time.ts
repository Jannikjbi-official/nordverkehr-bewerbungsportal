/** Aktuelle Zeit (für Server-Komponenten, die pro Request rendern). */
export const nowMs = () => Date.now();
export const daysAgo = (days: number) => new Date(nowMs() - days * 86_400_000);
