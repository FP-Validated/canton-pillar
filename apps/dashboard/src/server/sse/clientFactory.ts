import { Dispatcher, request } from 'undici';

export type SseMessage = { id?: string; event: string; data: string };
export type StreamOptions = { baseUrl: string; token: string; lastEventId?: string; dispatcher?: Dispatcher };

export async function* createEventStream(path: string, options: StreamOptions): AsyncIterable<SseMessage> {
  const headers: Record<string, string> = { accept: 'text/event-stream', authorization: `Bearer ${options.token}` };
  if (options.lastEventId) headers['last-event-id'] = options.lastEventId;
  const res = await request(`${options.baseUrl.replace(/\/$/, '')}${path}`, { method: 'GET', headers, dispatcher: options.dispatcher });
  if (res.statusCode !== 200) throw new Error(`sse_upstream_${res.statusCode}`);
  let buffer = '';
  for await (const chunk of res.body) {
    buffer += Buffer.from(chunk).toString('utf8');
    let split: number;
    while ((split = buffer.indexOf('\n\n')) >= 0) {
      const raw = buffer.slice(0, split); buffer = buffer.slice(split + 2);
      if (!raw || raw.startsWith(':')) continue;
      const msg: SseMessage = { event: 'message', data: '' };
      for (const line of raw.split('\n')) {
        if (line.startsWith('id:')) msg.id = line.slice(3).trim();
        else if (line.startsWith('event:')) msg.event = line.slice(6).trim();
        else if (line.startsWith('data:')) msg.data += line.slice(5).trim();
      }
      yield msg;
    }
  }
}
