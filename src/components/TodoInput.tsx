import React from 'react';
// @ts-ignore - Ink is ESM
import { Box, Text } from 'ink';

interface TodoInputProps {
  value: string;
  mode: 'add' | 'edit' | 'none';
  placeholder?: string;
}

export const TodoInput: React.FC<TodoInputProps> = ({ 
  value, 
  mode,
  placeholder = 'Enter todo text...' 
}) => {
  if (mode === 'none') {
    return null;
  }

  const label = mode === 'add' ? 'Add Todo' : 'Edit Todo';
  const borderColor = mode === 'add' ? 'green' : 'yellow';

  return (
    <Box 
      flexDirection="column" 
      borderStyle="single" 
      borderColor={borderColor}
      paddingX={1}
      marginY={1}
    >
      <Text bold color={borderColor}>{label}:</Text>
      <Box marginTop={1}>
        <Text color="cyan">{'> '}</Text>
        <Text>{value || <Text color="gray" dimColor>{placeholder}</Text>}</Text>
        <Text color="cyan">{'▊'}</Text>
      </Box>
    </Box>
  );
};
