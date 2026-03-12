import React from 'react';
// @ts-ignore - Ink is ESM
import { render } from 'ink';
import { TodoApp } from './TodoApp';
import { Todo } from './TodoList';

/**
 * Demo showing TodoApp with sample data
 * Run with: node dist/src/components/TodoDemo.js
 */
const sampleTodos: Todo[] = [
  {
    id: 'demo-1',
    text: 'Build React todo components',
    completed: true,
    createdAt: new Date('2024-01-20')
  },
  {
    id: 'demo-2',
    text: 'Add edit and delete functionality',
    completed: true,
    createdAt: new Date('2024-01-21')
  },
  {
    id: 'demo-3',
    text: 'Write tests for components',
    completed: false,
    createdAt: new Date('2024-01-22')
  },
  {
    id: 'demo-4',
    text: 'Deploy to production',
    completed: false,
    createdAt: new Date('2024-01-23')
  }
];

export const TodoDemo = () => {
  return <TodoApp initialTodos={sampleTodos} />;
};

// Allow running directly
if (require.main === module) {
  render(<TodoDemo />);
}
