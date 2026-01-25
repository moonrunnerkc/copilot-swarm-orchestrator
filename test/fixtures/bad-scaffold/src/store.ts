let todos = [];

export function addTodo(t: any) {
  todos.push(t);
}

export function allTodos() {
  return todos;
}
