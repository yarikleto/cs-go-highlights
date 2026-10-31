import test from 'node:test';
import assert from 'node:assert/strict';
import { createEventStream } from './eventStream.js';

class FakeEventSource {
  static instances = [];

  constructor(url) {
    this.url = url;
    this.listeners = new Map();
    FakeEventSource.instances.push(this);
  }

  addEventListener(name, listener) {
    this.listeners.set(name, listener);
  }

  emit(name, data) {
    this.listeners.get(name)?.({ data: JSON.stringify(data) });
  }
}

test('createEventStream opens one connection lazily and parses JSON data', () => {
  FakeEventSource.instances = [];
  const events = createEventStream({ url: '/api/events', EventSourceImpl: FakeEventSource });
  assert.equal(FakeEventSource.instances.length, 0);

  const outputs = [];
  const states = [];
  events.subscribe('command-output', data => outputs.push(data));
  events.subscribe('job-state', data => states.push(data));
  FakeEventSource.instances[0].emit('command-output', { text: 'hi' });
  FakeEventSource.instances[0].emit('job-state', { kind: null, id: null });

  assert.equal(FakeEventSource.instances.length, 1);
  assert.equal(FakeEventSource.instances[0].url, '/api/events');
  assert.deepEqual(outputs, [{ text: 'hi' }]);
  assert.deepEqual(states, [{ kind: null, id: null }]);
});

test('unsubscribe stops delivering events to that callback', () => {
  FakeEventSource.instances = [];
  const events = createEventStream({ EventSourceImpl: FakeEventSource });
  const received = [];

  const unsubscribe = events.subscribe('command-output', data => received.push(data));
  unsubscribe();
  FakeEventSource.instances[0].emit('command-output', { text: 'late' });

  assert.deepEqual(received, []);
});
