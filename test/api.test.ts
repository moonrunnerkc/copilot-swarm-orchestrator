import assert from 'assert';
import { startServer } from '../src/api/server';
import { resetTodos } from '../src/api/routes/todos';

describe('Todo API', function() {
  let server: any;
  const baseUrl = 'http://localhost:3002';

  before(function() {
    server = startServer(3002);
  });

  after(function(done) {
    server.close(done);
  });

  beforeEach(function() {
    resetTodos();
  });

  describe('GET /api/todos', function() {
    it('should return empty array initially', async function() {
      const res = await fetch(`${baseUrl}/api/todos`);
      const data = await res.json();
      assert.strictEqual(res.status, 200);
      assert.deepStrictEqual(data, []);
    });
  });

  describe('POST /api/todos', function() {
    it('should create a new todo', async function() {
      const res = await fetch(`${baseUrl}/api/todos`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: 'Buy groceries' })
      });
      const data = await res.json();
      assert.strictEqual(res.status, 201);
      assert.strictEqual(data.text, 'Buy groceries');
      assert.strictEqual(data.completed, false);
      assert.ok(data.id);
      assert.ok(data.createdAt);
    });

    it('should reject todo without text', async function() {
      const res = await fetch(`${baseUrl}/api/todos`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({})
      });
      assert.strictEqual(res.status, 400);
    });
  });

  describe('GET /api/todos/:id', function() {
    it('should get a specific todo', async function() {
      const createRes = await fetch(`${baseUrl}/api/todos`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: 'Test task' })
      });
      const created = await createRes.json();

      const getRes = await fetch(`${baseUrl}/api/todos/${created.id}`);
      const data = await getRes.json();
      assert.strictEqual(getRes.status, 200);
      assert.strictEqual(data.id, created.id);
      assert.strictEqual(data.text, 'Test task');
    });

    it('should return 404 for non-existent todo', async function() {
      const res = await fetch(`${baseUrl}/api/todos/999`);
      assert.strictEqual(res.status, 404);
    });
  });

  describe('PUT /api/todos/:id', function() {
    it('should update todo text', async function() {
      const createRes = await fetch(`${baseUrl}/api/todos`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: 'Original text' })
      });
      const created = await createRes.json();

      const updateRes = await fetch(`${baseUrl}/api/todos/${created.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: 'Updated text' })
      });
      const updated = await updateRes.json();
      assert.strictEqual(updateRes.status, 200);
      assert.strictEqual(updated.text, 'Updated text');
    });

    it('should update todo completed status', async function() {
      const createRes = await fetch(`${baseUrl}/api/todos`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: 'Task' })
      });
      const created = await createRes.json();

      const updateRes = await fetch(`${baseUrl}/api/todos/${created.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ completed: true })
      });
      const updated = await updateRes.json();
      assert.strictEqual(updateRes.status, 200);
      assert.strictEqual(updated.completed, true);
    });

    it('should return 404 for non-existent todo', async function() {
      const res = await fetch(`${baseUrl}/api/todos/999`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: 'New text' })
      });
      assert.strictEqual(res.status, 404);
    });
  });

  describe('DELETE /api/todos/:id', function() {
    it('should delete a todo', async function() {
      const createRes = await fetch(`${baseUrl}/api/todos`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: 'To be deleted' })
      });
      const created = await createRes.json();

      const deleteRes = await fetch(`${baseUrl}/api/todos/${created.id}`, {
        method: 'DELETE'
      });
      const deleted = await deleteRes.json();
      assert.strictEqual(deleteRes.status, 200);
      assert.strictEqual(deleted.id, created.id);

      const getRes = await fetch(`${baseUrl}/api/todos/${created.id}`);
      assert.strictEqual(getRes.status, 404);
    });

    it('should return 404 for non-existent todo', async function() {
      const res = await fetch(`${baseUrl}/api/todos/999`, {
        method: 'DELETE'
      });
      assert.strictEqual(res.status, 404);
    });
  });

  describe('Health check', function() {
    it('should return ok status', async function() {
      const res = await fetch(`${baseUrl}/health`);
      const data = await res.json();
      assert.strictEqual(res.status, 200);
      assert.strictEqual(data.status, 'ok');
      assert.ok(data.timestamp);
    });
  });
});
