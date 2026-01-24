# React Todo Components

Terminal-based todo management UI built with React and Ink.

## Components

### TodoApp
Main component that provides full todo CRUD functionality.

**Features:**
- ✅ Add new todos
- ✏️ Edit existing todos
- 🗑️ Delete todos
- ☑️ Toggle completion status
- 🧹 Clear completed todos
- ⌨️ Keyboard navigation

**Props:**
- `initialTodos?: Todo[]` - Optional array of initial todos

**Keyboard Shortcuts:**
- `a` - Add new todo
- `e` - Edit selected todo
- `d` - Delete selected todo
- `Space` - Toggle completion
- `c` - Clear all completed todos
- `↑/k` - Navigate up
- `↓/j` - Navigate down
- `Enter` - Confirm input
- `Esc` - Cancel input
- `Ctrl+C` - Exit

### TodoList
Displays a list of todos with selection highlighting.

**Props:**
- `todos: Todo[]` - Array of todo items
- `onToggle: (id: string) => void` - Callback for toggling completion
- `onDelete: (id: string) => void` - Callback for deleting a todo
- `onEdit: (id: string, newText: string) => void` - Callback for editing
- `selectedIndex?: number` - Currently selected item index

### TodoInput
Input field for adding or editing todos.

**Props:**
- `value: string` - Current input value
- `mode: 'add' | 'edit' | 'none'` - Input mode
- `placeholder?: string` - Optional placeholder text

## Data Structure

```typescript
interface Todo {
  id: string;
  text: string;
  completed: boolean;
  createdAt: Date;
}
```

## Usage Example

```typescript
import { TodoApp } from './components/TodoApp';
import { render } from 'ink';

// Basic usage
render(<TodoApp />);

// With initial todos
const todos = [
  {
    id: '1',
    text: 'Complete project',
    completed: false,
    createdAt: new Date()
  }
];

render(<TodoApp initialTodos={todos} />);
```

## Running the Demo

```bash
npm run build
node dist/src/components/TodoDemo.js
```

## Testing

The todo data structure is tested in `test/todo-structure.test.ts`.
