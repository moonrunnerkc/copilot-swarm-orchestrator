import React, { useState } from 'react';
// @ts-ignore - Ink is ESM
import { Box, Text } from 'ink';

export interface Todo {
  id: string;
  text: string;
  completed: boolean;
  createdAt: Date;
}

interface TodoListProps {
  todos: Todo[];
  onToggle: (id: string) => void;
  onDelete: (id: string) => void;
  onEdit: (id: string, newText: string) => void;
  selectedIndex?: number;
}

export const TodoList: React.FC<TodoListProps> = ({ 
  todos, 
  onToggle, 
  onDelete, 
  onEdit,
  selectedIndex = -1 
}) => {
  if (todos.length === 0) {
    return (
      <Box marginY={1}>
        <Text color="gray" dimColor>No todos yet. Add one to get started!</Text>
      </Box>
    );
  }

  return (
    <Box flexDirection="column" marginY={1}>
      {todos.map((todo, index) => (
        <Box key={todo.id}>
          {selectedIndex === index && <Text color="cyan">{'> '}</Text>}
          {selectedIndex !== index && <Text>{'  '}</Text>}
          <Box width={3}>
            <Text color={todo.completed ? 'green' : 'gray'}>
              {todo.completed ? '✓' : '☐'}
            </Text>
          </Box>
          <Box width={50}>
            <Text 
              color={todo.completed ? 'gray' : 'white'}
              strikethrough={todo.completed}
            >
              {todo.text}
            </Text>
          </Box>
          <Text color="gray" dimColor>
            (id: {todo.id.substring(0, 6)})
          </Text>
        </Box>
      ))}
    </Box>
  );
};
