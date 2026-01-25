import { addTodo, allTodos } from '../src/store';

describe('store', () => {
  it('leaks state', () => {
    addTodo({ id: 1 });
    if (allTodos().length < 1) {
      throw new Error('expected todo');
    }
  });
});
