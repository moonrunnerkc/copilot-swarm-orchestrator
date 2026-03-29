// Tests the todo API routes and server integration, including validation and CRUD behavior.
import { strict as assert } from 'assert';
import { once } from 'events';
import { AddressInfo } from 'net';
import { startServer } from '../src/api/server';
import { resetTodos } from '../src/api/routes/todos';

type TodoRecord = {
  id: string;
  text: string;
  completed: boolean;
  createdAt: string;
};

const baseUrl = (port: number) => `http://${process.env.TEST_HOST || 'localhost'}:${port}`;

describe('Todo API', () => {
  let server: any;
  let port: number;

  beforeEach(async () => {
    resetTodos();
    server = startServer(0);
    await once(server, 'listening');
    port = (server.address() as AddressInfo).port;
  });

  afterEach(async () => {
    resetTodos();
    if (server) {
      await new Promise<void>((resolve, reject) => {
        server.close((error?: Error) => {
          if (error) reject(error);
          else resolve();
        });
      });
    }
  });

  it('serves a health response with status and timestamp', async () => {
    const res = await fetch(`${baseUrl(port)}/health`);
    assert.strictEqual(res.status, 200);

    const data = await res.json() as { status: string; timestamp: string };
    assert.strictEqual(data.status, 'ok');
    assert.ok(Date.parse(data.timestamp) > 0, 'timestamp should be an ISO date');
  });

  it('starts with an empty todo list', async () => {
    const res = await fetch(`${baseUrl(port)}/api/todos`);
    assert.strictEqual(res.status, 200);

    const data = await res.json() as TodoRecord[];
    assert.deepStrictEqual(data, []);
  });

  it('creates a todo using the API text field and trims surrounding whitespace', async () => {
    const res = await fetch(`${baseUrl(port)}/api/todos`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ text: '  Write backend tests  ' })
    });
    assert.strictEqual(res.status, 201);

    const todo = await res.json() as TodoRecord;
    assert.strictEqual(todo.id, '1');
    assert.strictEqual(todo.text, 'Write backend tests');
    assert.strictEqual(todo.completed, false);
    assert.ok(Date.parse(todo.createdAt) > 0, 'createdAt should be an ISO date');
  });

  it('rejects create requests when text is missing or not a string', async () => {
    const missingText = await fetch(`${baseUrl(port)}/api/todos`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({})
    });
    assert.strictEqual(missingText.status, 400);
    assert.deepStrictEqual(await missingText.json(), { error: 'Text is required' });

    const wrongType = await fetch(`${baseUrl(port)}/api/todos`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ text: 42 })
    });
    assert.strictEqual(wrongType.status, 400);
    assert.deepStrictEqual(await wrongType.json(), { error: 'Text is required' });
  });

  it('returns a created todo by id and 404s for unknown ids', async () => {
    const createRes = await fetch(`${baseUrl(port)}/api/todos`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ text: 'Read docs' })
    });
    const created = await createRes.json() as TodoRecord;

    const getRes = await fetch(`${baseUrl(port)}/api/todos/${created.id}`);
    assert.strictEqual(getRes.status, 200);
    assert.deepStrictEqual(await getRes.json(), created);

    const missingRes = await fetch(`${baseUrl(port)}/api/todos/999`);
    assert.strictEqual(missingRes.status, 404);
    assert.deepStrictEqual(await missingRes.json(), { error: 'Todo not found' });
  });

  it('updates text and completed state while preserving the todo identity', async () => {
    const createRes = await fetch(`${baseUrl(port)}/api/todos`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ text: 'Ship tests' })
    });
    const created = await createRes.json() as TodoRecord;

    const updateRes = await fetch(`${baseUrl(port)}/api/todos/${created.id}`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ text: '  Ship more tests  ', completed: true })
    });
    assert.strictEqual(updateRes.status, 200);

    const updated = await updateRes.json() as TodoRecord;
    assert.strictEqual(updated.id, created.id);
    assert.strictEqual(updated.text, 'Ship more tests');
    assert.strictEqual(updated.completed, true);
    assert.strictEqual(updated.createdAt, created.createdAt);
  });

  it('rejects invalid updates and returns 404 for unknown todos', async () => {
    const createRes = await fetch(`${baseUrl(port)}/api/todos`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ text: 'Keep shape stable' })
    });
    const created = await createRes.json() as TodoRecord;

    const badText = await fetch(`${baseUrl(port)}/api/todos/${created.id}`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ text: 123 })
    });
    assert.strictEqual(badText.status, 400);
    assert.deepStrictEqual(await badText.json(), { error: 'Text must be a string' });

    const badCompleted = await fetch(`${baseUrl(port)}/api/todos/${created.id}`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ completed: 'yes' })
    });
    assert.strictEqual(badCompleted.status, 400);
    assert.deepStrictEqual(await badCompleted.json(), { error: 'Completed must be a boolean' });

    const missing = await fetch(`${baseUrl(port)}/api/todos/999`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ text: 'Nope' })
    });
    assert.strictEqual(missing.status, 404);
    assert.deepStrictEqual(await missing.json(), { error: 'Todo not found' });
  });

  it('deletes todos and resetTodos restores isolated state between runs', async () => {
    const createRes = await fetch(`${baseUrl(port)}/api/todos`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ text: 'Delete me' })
    });
    const created = await createRes.json() as TodoRecord;

    const deleteRes = await fetch(`${baseUrl(port)}/api/todos/${created.id}`, {
      method: 'DELETE'
    });
    assert.strictEqual(deleteRes.status, 200);
    assert.deepStrictEqual(await deleteRes.json(), created);

    const missingDelete = await fetch(`${baseUrl(port)}/api/todos/${created.id}`, {
      method: 'DELETE'
    });
    assert.strictEqual(missingDelete.status, 404);
    assert.deepStrictEqual(await missingDelete.json(), { error: 'Todo not found' });

    resetTodos();
    const afterResetCreate = await fetch(`${baseUrl(port)}/api/todos`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ text: 'Fresh state' })
    });
    const resetTodo = await afterResetCreate.json() as TodoRecord;
    assert.strictEqual(resetTodo.id, '1');
  });
});
