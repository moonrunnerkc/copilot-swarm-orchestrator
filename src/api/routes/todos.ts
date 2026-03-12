import { Router, Request, Response } from 'express';

export interface Todo {
  id: string;
  text: string;
  completed: boolean;
  createdAt: string;
}

let todos: Todo[] = [];
let nextId = 1;

export const todoRouter = Router();

// GET /api/todos - Get all todos
todoRouter.get('/', (_req: Request, res: Response) => {
  res.json(todos);
});

// GET /api/todos/:id - Get a single todo
todoRouter.get('/:id', (req: Request, res: Response) => {
  const todo = todos.find(t => t.id === req.params.id);
  if (!todo) {
    return res.status(404).json({ error: 'Todo not found' });
  }
  res.json(todo);
});

// POST /api/todos - Create a new todo
todoRouter.post('/', (req: Request, res: Response) => {
  const { text } = req.body;
  
  if (!text || typeof text !== 'string') {
    return res.status(400).json({ error: 'Text is required' });
  }

  const newTodo: Todo = {
    id: String(nextId++),
    text: text.trim(),
    completed: false,
    createdAt: new Date().toISOString()
  };

  todos.push(newTodo);
  res.status(201).json(newTodo);
});

// PUT /api/todos/:id - Update a todo
todoRouter.put('/:id', (req: Request, res: Response) => {
  const todoIndex = todos.findIndex(t => t.id === req.params.id);
  
  if (todoIndex === -1) {
    return res.status(404).json({ error: 'Todo not found' });
  }

  const { text, completed } = req.body;
  
  if (text !== undefined) {
    if (typeof text !== 'string') {
      return res.status(400).json({ error: 'Text must be a string' });
    }
    todos[todoIndex].text = text.trim();
  }
  
  if (completed !== undefined) {
    if (typeof completed !== 'boolean') {
      return res.status(400).json({ error: 'Completed must be a boolean' });
    }
    todos[todoIndex].completed = completed;
  }

  res.json(todos[todoIndex]);
});

// DELETE /api/todos/:id - Delete a todo
todoRouter.delete('/:id', (req: Request, res: Response) => {
  const todoIndex = todos.findIndex(t => t.id === req.params.id);
  
  if (todoIndex === -1) {
    return res.status(404).json({ error: 'Todo not found' });
  }

  const deleted = todos.splice(todoIndex, 1)[0];
  res.json(deleted);
});

// Helper function to reset todos (useful for testing)
export function resetTodos(): void {
  todos = [];
  nextId = 1;
}
