export function createEventStream({ url = '/api/events', EventSourceImpl = globalThis.EventSource } = {}) {
  const callbacksByName = new Map();
  let source = null;

  function subscribe(name, callback) {
    if (!source) source = new EventSourceImpl(url);
    if (!callbacksByName.has(name)) listenTo(name);

    callbacksByName.get(name).add(callback);
    return () => callbacksByName.get(name).delete(callback);
  }

  function listenTo(name) {
    const callbacks = new Set();
    callbacksByName.set(name, callbacks);
    source.addEventListener(name, (event) => {
      const data = JSON.parse(event.data);
      for (const callback of callbacks) callback(data);
    });
  }

  return { subscribe };
}
