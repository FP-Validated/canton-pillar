'use client';
import { useEffect, useMemo, useState } from 'react';
import { ReconnectStrategy } from './ReconnectStrategy';
import { ConnectionState } from './ConnectionState';

type LiveEvent = { id: string; type: string; data?: unknown };

export function LiveActivityFeed({ initialEvents = [] }: { initialEvents?: LiveEvent[] }) {
  const [events, setEvents] = useState(initialEvents);
  const [state, setState] = useState<'online' | 'reconnecting'>('reconnecting');
  const strategy = useMemo(() => new ReconnectStrategy(), []);
  useEffect(() => {
    let closed = false; let source: EventSource | undefined; let timer: ReturnType<typeof setTimeout> | undefined;
    const connect = () => {
      const url = strategy.lastEventId ? `/api/realtime/events?last_event_id=${encodeURIComponent(strategy.lastEventId)}` : '/api/realtime/events';
      source = new EventSource(url);
      source.onopen = () => { strategy.reset(); setState('online'); };
      source.onmessage = source.addEventListener.bind(source, 'holding.updated') as any;
      const handler = (message: MessageEvent) => {
        const parsed = JSON.parse(message.data);
        strategy.remember(message.lastEventId || parsed.id);
        setEvents(prev => [{ id: message.lastEventId || parsed.id, type: message.type, data: parsed }, ...prev].slice(0, 25));
      };
      ['holding.updated','balance.updated','ledger_operation.committed','ledger_operation.failed','stream.overflow'].forEach(t => source?.addEventListener(t, handler));
      source.onerror = () => { source?.close(); if (closed) return; setState('reconnecting'); timer = setTimeout(connect, strategy.nextDelayMs()); };
    };
    connect();
    return () => { closed = true; source?.close(); if (timer) clearTimeout(timer); };
  }, [strategy]);
  return <section><h2>Live activity <span>live</span></h2><ConnectionState state={state}/><ul>{events.map(e => <li key={e.id}><strong>{e.type}</strong> <code>{e.id}</code></li>)}</ul></section>;
}
