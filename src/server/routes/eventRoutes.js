const HEARTBEAT_INTERVAL_MS = 15_000;

export function eventRoutes({ jobRunner }) {
  return [{ method: 'GET', path: '/api/events', handler: ({ req, res }) => streamJobEvents(req, res, jobRunner) }];
}

function streamJobEvents(req, res, jobRunner) {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
  });

  const { state, events } = jobRunner.snapshot();
  writeEvent(res, 'job-state', state);
  for (const { name, data } of events) writeEvent(res, name, data);

  const unsubscribe = jobRunner.subscribe((name, data) => writeEvent(res, name, data));
  const heartbeat = setInterval(() => res.write(': heartbeat\n\n'), HEARTBEAT_INTERVAL_MS);

  req.on('close', () => {
    clearInterval(heartbeat);
    unsubscribe();
  });
}

function writeEvent(res, name, data) {
  res.write(`event: ${name}\ndata: ${JSON.stringify(data)}\n\n`);
}
