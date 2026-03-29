// Priority queue data structure: items sorted by numeric priority (lower = higher priority)

/**
 * A priority queue where items with lower numeric priority values are dequeued first.
 */
class PriorityQueue {
  constructor() {
    this._items = [];
  }

  /**
   * Adds an item with a given numeric priority.
   * Lower priority numbers are dequeued first.
   * @param {*} item - The item to enqueue.
   * @param {number} priority - Numeric priority (lower = higher priority).
   */
  enqueue(item, priority) {
    const entry = { item, priority };
    let inserted = false;
    for (let i = 0; i < this._items.length; i++) {
      if (priority < this._items[i].priority) {
        this._items.splice(i, 0, entry);
        inserted = true;
        break;
      }
    }
    if (!inserted) {
      this._items.push(entry);
    }
  }

  /**
   * Removes and returns the highest priority item (lowest priority number).
   * @returns {*} The highest priority item, or undefined if the queue is empty.
   */
  dequeue() {
    if (this._items.length === 0) return undefined;
    return this._items.shift().item;
  }

  /**
   * Returns the highest priority item without removing it.
   * @returns {*} The highest priority item, or undefined if the queue is empty.
   */
  peek() {
    if (this._items.length === 0) return undefined;
    return this._items[0].item;
  }

  /**
   * Returns the number of items in the queue.
   * @returns {number} The queue size.
   */
  size() {
    return this._items.length;
  }

  /**
   * Returns whether the queue is empty.
   * @returns {boolean} True if the queue has no items.
   */
  isEmpty() {
    return this._items.length === 0;
  }
}

export { PriorityQueue };
export default PriorityQueue;
