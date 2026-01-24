import assert from 'assert';
import { startServer } from '../src/api/server';
import { resetTodos } from '../src/api/routes/todos';
import { Todo } from '../src/components/TodoList';

describe('Integration Tests', function() {
  let server: any;
  const baseUrl = 'http://localhost:3003';

  before(function() {
    server = startServer(3003);
  });

  after(function(done) {
    server.close(done);
  });

  beforeEach(function() {
    resetTodos();
  });

  describe('End-to-End Todo Workflow', function() {
    it('should handle complete todo lifecycle', async function() {
      // Create a todo
      const createRes = await fetch(`${baseUrl}/api/todos`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: 'Buy groceries' })
      });
      const created = await createRes.json();
      assert.strictEqual(createRes.status, 201);
      assert.strictEqual(created.text, 'Buy groceries');
      assert.strictEqual(created.completed, false);

      // Get all todos - should have 1
      const listRes = await fetch(`${baseUrl}/api/todos`);
      const list = await listRes.json();
      assert.strictEqual(list.length, 1);

      // Mark as completed
      const updateRes = await fetch(`${baseUrl}/api/todos/${created.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ completed: true })
      });
      const updated = await updateRes.json();
      assert.strictEqual(updated.completed, true);

      // Verify completion
      const getRes = await fetch(`${baseUrl}/api/todos/${created.id}`);
      const fetched = await getRes.json();
      assert.strictEqual(fetched.completed, true);

      // Delete the todo
      const deleteRes = await fetch(`${baseUrl}/api/todos/${created.id}`, {
        method: 'DELETE'
      });
      assert.strictEqual(deleteRes.status, 200);

      // Verify deletion
      const finalList = await fetch(`${baseUrl}/api/todos`);
      const finalTodos = await finalList.json();
      assert.strictEqual(finalTodos.length, 0);
    });

    it('should handle multiple todos', async function() {
      const todos = [
        'Write documentation',
        'Review pull requests',
        'Deploy to production'
      ];

      // Create multiple todos
      for (const text of todos) {
        await fetch(`${baseUrl}/api/todos`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text })
        });
      }

      // Get all todos
      const listRes = await fetch(`${baseUrl}/api/todos`);
      const list = await listRes.json();
      assert.strictEqual(list.length, 3);
      assert.deepStrictEqual(
        list.map((t: any) => t.text),
        todos
      );
    });

    it('should maintain todo order', async function() {
      const first = await fetch(`${baseUrl}/api/todos`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: 'First' })
      }).then(r => r.json());

      const second = await fetch(`${baseUrl}/api/todos`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: 'Second' })
      }).then(r => r.json());

      const third = await fetch(`${baseUrl}/api/todos`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: 'Third' })
      }).then(r => r.json());

      const listRes = await fetch(`${baseUrl}/api/todos`);
      const list = await listRes.json();
      
      assert.strictEqual(list[0].id, first.id);
      assert.strictEqual(list[1].id, second.id);
      assert.strictEqual(list[2].id, third.id);
    });
  });

  describe('API-Component Data Compatibility', function() {
    it('should have compatible Todo interfaces', async function() {
      // Create via API
      const apiRes = await fetch(`${baseUrl}/api/todos`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: 'Test compatibility' })
      });
      const apiTodo = await apiRes.json();

      // Verify API todo can be used as component Todo
      const componentTodo: Todo = {
        id: apiTodo.id,
        text: apiTodo.text,
        completed: apiTodo.completed,
        createdAt: new Date(apiTodo.createdAt)
      };

      assert.strictEqual(componentTodo.id, apiTodo.id);
      assert.strictEqual(componentTodo.text, apiTodo.text);
      assert.strictEqual(componentTodo.completed, apiTodo.completed);
      assert.ok(componentTodo.createdAt instanceof Date);
    });

    it('should handle date serialization correctly', async function() {
      const createRes = await fetch(`${baseUrl}/api/todos`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: 'Date test' })
      });
      const todo = await createRes.json();

      // API returns ISO string
      assert.strictEqual(typeof todo.createdAt, 'string');
      
      // Can be parsed to Date
      const date = new Date(todo.createdAt);
      assert.ok(date instanceof Date);
      assert.ok(!isNaN(date.getTime()));
    });
  });

  describe('Concurrent Operations', function() {
    it('should handle simultaneous todo creation', async function() {
      const promises = Array.from({ length: 5 }, (_, i) =>
        fetch(`${baseUrl}/api/todos`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text: `Todo ${i + 1}` })
        })
      );

      const results = await Promise.all(promises);
      const todos = await Promise.all(results.map(r => r.json()));

      // All should succeed
      assert.strictEqual(todos.length, 5);
      
      // All should have unique IDs
      const ids = new Set(todos.map(t => t.id));
      assert.strictEqual(ids.size, 5);

      // Verify all are in the list
      const listRes = await fetch(`${baseUrl}/api/todos`);
      const list = await listRes.json();
      assert.strictEqual(list.length, 5);
    });

    it('should handle concurrent updates to same todo', async function() {
      // Create a todo
      const createRes = await fetch(`${baseUrl}/api/todos`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: 'Original' })
      });
      const todo = await createRes.json();

      // Update text and completion status concurrently
      const [textUpdate, statusUpdate] = await Promise.all([
        fetch(`${baseUrl}/api/todos/${todo.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text: 'Updated text' })
        }),
        fetch(`${baseUrl}/api/todos/${todo.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ completed: true })
        })
      ]);

      assert.strictEqual(textUpdate.status, 200);
      assert.strictEqual(statusUpdate.status, 200);

      // Final state should reflect both updates
      const finalRes = await fetch(`${baseUrl}/api/todos/${todo.id}`);
      const final = await finalRes.json();
      
      // At least one update should have succeeded
      assert.ok(final.text === 'Updated text' || final.completed === true);
    });
  });

  describe('Error Handling', function() {
    it('should handle malformed JSON gracefully', async function() {
      const res = await fetch(`${baseUrl}/api/todos`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: 'not valid json{'
      });

      assert.strictEqual(res.status, 400);
    });

    it('should validate required fields', async function() {
      const res = await fetch(`${baseUrl}/api/todos`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ completed: false })
      });

      assert.strictEqual(res.status, 400);
      const error = await res.json();
      assert.ok(error.error);
    });

    it('should handle invalid todo IDs', async function() {
      const res = await fetch(`${baseUrl}/api/todos/invalid-id-999`);
      assert.strictEqual(res.status, 404);
    });

    it('should reject invalid data types', async function() {
      const createRes = await fetch(`${baseUrl}/api/todos`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: 'Test' })
      });
      const todo = await createRes.json();

      // Try to set text to non-string
      const res = await fetch(`${baseUrl}/api/todos/${todo.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: 12345 })
      });

      assert.strictEqual(res.status, 400);
    });
  });

  describe('State Management', function() {
    it('should maintain state across requests', async function() {
      // Create todos
      await fetch(`${baseUrl}/api/todos`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: 'First' })
      });

      await fetch(`${baseUrl}/api/todos`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: 'Second' })
      });

      // Verify state persists
      const list1 = await fetch(`${baseUrl}/api/todos`).then(r => r.json());
      assert.strictEqual(list1.length, 2);

      // Another request should show same state
      const list2 = await fetch(`${baseUrl}/api/todos`).then(r => r.json());
      assert.strictEqual(list2.length, 2);
      assert.deepStrictEqual(list1, list2);
    });

    it('should increment IDs correctly', async function() {
      const todos = [];
      
      for (let i = 0; i < 3; i++) {
        const res = await fetch(`${baseUrl}/api/todos`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text: `Todo ${i}` })
        });
        todos.push(await res.json());
      }

      // IDs should be sequential
      assert.strictEqual(todos[0].id, '1');
      assert.strictEqual(todos[1].id, '2');
      assert.strictEqual(todos[2].id, '3');
    });
  });

  describe('Health Check Integration', function() {
    it('should respond to health check while handling requests', async function() {
      // Create some todos
      await fetch(`${baseUrl}/api/todos`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: 'Test' })
      });

      // Health check should still work
      const healthRes = await fetch(`${baseUrl}/health`);
      const health = await healthRes.json();
      
      assert.strictEqual(healthRes.status, 200);
      assert.strictEqual(health.status, 'ok');
      assert.ok(health.timestamp);
    });
  });
});
