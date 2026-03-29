// Tests a frontend-style fetch client against the real todo HTTP API to prove request flow and field naming.
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

function createTodoFrontendClient(apiBase: string) {
  return {
    async listTodos(): Promise<TodoRecord[]> {
      const res = await fetch(`${apiBase}/api/todos`);
      return res.json() as Promise<TodoRecord[]>;
    },
    async createTodo(text: string): Promise<TodoRecord> {
      const res = await fetch(`${apiBase}/api/todos`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ text })
      });
      return res.json() as Promise<TodoRecord>;
    },
    async toggleTodo(todo: TodoRecord): Promise<TodoRecord> {
      const res = await fetch(`${apiBase}/api/todos/${todo.id}`, {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ completed: !todo.completed })
      });
      return res.json() as Promise<TodoRecord>;
    }
  };
}

describe('Todo frontend HTTP integration', () => {
  let server: any;
  let apiBase: string;

  beforeEach(async () => {
    resetTodos();
    server = startServer(0);
    await once(server, 'listening');
    const port = (server.address() as AddressInfo).port;
    apiBase = `http://${process.env.TEST_HOST || 'localhost'}:${port}`;
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

  it('uses real HTTP calls from a frontend client and keeps the backend text field contract', async () => {
    const client = createTodoFrontendClient(apiBase);

    const created = await client.createTodo('Verify frontend reaches backend');
    assert.strictEqual(created.text, 'Verify frontend reaches backend');
    assert.strictEqual(created.completed, false);
    assert.ok(!('title' in created), 'backend contract should use text, not title');

    const toggled = await client.toggleTodo(created);
    assert.strictEqual(toggled.id, created.id);
    assert.strictEqual(toggled.completed, true);

    const listed = await client.listTodos();
    assert.strictEqual(listed.length, 1);
    assert.deepStrictEqual(listed[0], toggled);
  });
});
