import React, { useState } from 'react';
// @ts-ignore - Ink is ESM
import { Box, Text, useInput } from 'ink';
import { TodoInput } from './TodoInput';
import { Todo, TodoList } from './TodoList';

interface TodoAppProps {
  initialTodos?: Todo[];
}

type Mode = 'normal' | 'add' | 'edit' | 'delete';

export const TodoApp: React.FC<TodoAppProps> = ({ initialTodos = [] }) => {
  const [todos, setTodos] = useState<Todo[]>(initialTodos);
  const [mode, setMode] = useState<Mode>('normal');
  const [inputValue, setInputValue] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [statusMessage, setStatusMessage] = useState('');

  const showStatus = (message: string, duration = 2000) => {
    setStatusMessage(message);
    setTimeout(() => setStatusMessage(''), duration);
  };

  useInput((input: string, key: { return?: boolean; escape?: boolean; upArrow?: boolean; downArrow?: boolean; backspace?: boolean; delete?: boolean; ctrl?: boolean; meta?: boolean }) => {
    if (mode === 'add' || mode === 'edit') {
      // Handle input modes
      if (key.return) {
        if (inputValue.trim()) {
          if (mode === 'add') {
            const newTodo: Todo = {
              id: Math.random().toString(36).substring(2, 11),
              text: inputValue.trim(),
              completed: false,
              createdAt: new Date()
            };
            setTodos(prev => [...prev, newTodo]);
            showStatus(`Added: "${inputValue.trim()}"`);
          } else if (mode === 'edit' && todos[selectedIndex]) {
            const updatedTodos = [...todos];
            updatedTodos[selectedIndex] = {
              ...updatedTodos[selectedIndex],
              text: inputValue.trim()
            };
            setTodos(updatedTodos);
            showStatus(`Updated: "${inputValue.trim()}"`);
          }
          setInputValue('');
          setMode('normal');
        }
      } else if (key.escape) {
        setInputValue('');
        setMode('normal');
        showStatus('Cancelled');
      } else if (key.backspace || key.delete) {
        setInputValue(prev => prev.slice(0, -1));
      } else if (input && !key.ctrl && !key.meta) {
        setInputValue(prev => prev + input);
      }
    } else if (mode === 'delete') {
      // Confirm delete
      if (input === 'y' || input === 'Y') {
        if (todos[selectedIndex]) {
          const deleted = todos[selectedIndex];
          setTodos(prev => prev.filter((_, idx) => idx !== selectedIndex));
          setSelectedIndex(Math.max(0, Math.min(selectedIndex, todos.length - 2)));
          showStatus(`Deleted: "${deleted.text}"`);
        }
        setMode('normal');
      } else if (input === 'n' || input === 'N' || key.escape) {
        setMode('normal');
        showStatus('Delete cancelled');
      }
    } else {
      // Normal mode navigation
      if (key.upArrow || input === 'k') {
        setSelectedIndex(prev => Math.max(0, prev - 1));
      } else if (key.downArrow || input === 'j') {
        setSelectedIndex(prev => Math.min(todos.length - 1, prev + 1));
      } else if (input === 'a') {
        setMode('add');
        setInputValue('');
      } else if (input === 'e' && todos.length > 0) {
        setMode('edit');
        setInputValue(todos[selectedIndex]?.text || '');
      } else if (input === 'd' && todos.length > 0) {
        setMode('delete');
      } else if (input === ' ' && todos.length > 0) {
        // Toggle completed
        const updatedTodos = [...todos];
        updatedTodos[selectedIndex] = {
          ...updatedTodos[selectedIndex],
          completed: !updatedTodos[selectedIndex].completed
        };
        setTodos(updatedTodos);
        showStatus(updatedTodos[selectedIndex].completed ? 'Marked complete' : 'Marked incomplete');
      } else if (input === 'c') {
        // Clear completed
        const beforeCount = todos.length;
        setTodos(prev => prev.filter(t => !t.completed));
        const afterCount = todos.filter(t => !t.completed).length;
        showStatus(`Cleared ${beforeCount - afterCount} completed todo(s)`);
        setSelectedIndex(0);
      }
    }
  });

  const handleToggle = (id: string) => {
    setTodos(prev =>
      prev.map(todo =>
        todo.id === id ? { ...todo, completed: !todo.completed } : todo
      )
    );
  };

  const handleDelete = (id: string) => {
    setTodos(prev => prev.filter(todo => todo.id !== id));
  };

  const handleEdit = (id: string, newText: string) => {
    setTodos(prev =>
      prev.map(todo =>
        todo.id === id ? { ...todo, text: newText } : todo
      )
    );
  };

  const completedCount = todos.filter(t => t.completed).length;

  return (
    <Box flexDirection="column" padding={1}>
      {/* Header */}
      <Box marginBottom={1}>
        <Text bold color="magenta">📝 Todo Manager</Text>
      </Box>

      {/* Stats */}
      <Box marginBottom={1}>
        <Text>
          <Text bold>Total: </Text>
          <Text color="cyan">{todos.length}</Text>
          <Text bold> | Completed: </Text>
          <Text color="green">{completedCount}</Text>
          <Text bold> | Active: </Text>
          <Text color="yellow">{todos.length - completedCount}</Text>
        </Text>
      </Box>

      {/* Todo List */}
      <TodoList
        todos={todos}
        onToggle={handleToggle}
        onDelete={handleDelete}
        onEdit={handleEdit}
        selectedIndex={mode === 'normal' ? selectedIndex : -1}
      />

      {/* Input Area */}
      <TodoInput
        value={inputValue}
        mode={mode === 'add' ? 'add' : mode === 'edit' ? 'edit' : 'none'}
      />

      {/* Delete Confirmation */}
      {mode === 'delete' && todos[selectedIndex] && (
        <Box borderStyle="single" borderColor="red" paddingX={1} marginY={1}>
          <Text color="red">
            Delete "{todos[selectedIndex].text}"? (y/n)
          </Text>
        </Box>
      )}

      {/* Status Message */}
      {statusMessage && (
        <Box marginTop={1}>
          <Text color="cyan">ℹ️  {statusMessage}</Text>
        </Box>
      )}

      {/* Help */}
      <Box marginTop={1} borderStyle="single" borderColor="gray" paddingX={1}>
        <Text color="gray">
          {mode === 'normal'
            ? 'a:add | e:edit | d:delete | space:toggle | c:clear completed | ↑↓/jk:navigate | Ctrl+C:exit'
            : mode === 'delete'
            ? 'y:confirm | n/Esc:cancel'
            : 'Enter:save | Esc:cancel'
          }
        </Text>
      </Box>
    </Box>
  );
};

export default TodoApp;
