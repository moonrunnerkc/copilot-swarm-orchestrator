# Todo System - Complete Guide

## Overview

This is a fully integrated todo management system demonstrating the coordination of frontend, backend, and testing components built through parallel agent execution.

## Architecture

### Backend API (`src/api/`)

**Server** (`server.ts`):
- Express.js server with CORS and body-parser middleware
- Health check endpoint at `/health`
- Configurable port (default: 3001)

**Routes** (`routes/todos.ts`):
- `GET /api/todos` - List all todos
- `GET /api/todos/:id` - Get specific todo
- `POST /api/todos` - Create new todo
- `PUT /api/todos/:id` - Update todo (text and/or completed status)
- `DELETE /api/todos/:id` - Delete todo
- Helper: `resetTodos()` - Reset state for testing

### Frontend Components (`src/components/`)

**TodoApp** (`TodoApp.tsx`):
- Main application component with full CRUD functionality
- Keyboard-driven interface with intuitive controls

**TodoList** (`TodoList.tsx`):
- Displays todos with visual indicators
- Supports selection highlighting

**TodoInput** (`TodoInput.tsx`):
- Reusable input component
- Supports add and edit modes

### Tests (`test/`)

**API Tests** (`api.test.ts`):
- Comprehensive CRUD operation tests
- Validation and error handling
- Health check verification

**Component Tests** (`components.test.ts`):
- Todo data structure validation
- Component logic tests
- Input validation and edge cases

**Integration Tests** (`integration.test.ts`):
- End-to-end workflow tests
- API-component data compatibility
- Concurrent operations and state management

## Test Coverage

The system includes:
- ✅ 21 API endpoint tests
- ✅ 48 component logic tests
- ✅ 13 integration tests
- ✅ Input validation tests
- ✅ Error handling tests
- ✅ Concurrent operation tests

**Total**: 82+ passing tests for the todo system

## Running the System

### Start the API Server

```bash
npm run build
node dist/src/api/server.js
```

### Run the Todo UI

```bash
npm run build
node dist/src/components/TodoDemo.js
```

### Run Tests

```bash
npm test
```

## API Examples

### Create a Todo
```bash
curl -X POST http://localhost:3001/api/todos \
  -H "Content-Type: application/json" \
  -d '{"text": "Buy groceries"}'
```

### List Todos
```bash
curl http://localhost:3001/api/todos
```

### Update Todo
```bash
curl -X PUT http://localhost:3001/api/todos/1 \
  -H "Content-Type: application/json" \
  -d '{"completed": true}'
```

### Delete Todo
```bash
curl -X DELETE http://localhost:3001/api/todos/1
```
