import { applyEditTransaction, serializeScene, deserializeScene } from './cad-geometry-trim.mjs';

/** Bounded undo/redo history for immutable scene-array transactions. */
export class SceneHistory {
  constructor(initialScene = [], { limit = 100 } = {}) {
    if (!Array.isArray(initialScene)) throw new TypeError('Начальная сцена должна быть массивом');
    if (!Number.isInteger(limit) || limit < 1) throw new RangeError('Лимит истории должен быть целым числом ≥ 1');
    this.limit = limit;
    this.current = [...initialScene];
    this.past = [];
    this.future = [];
  }
  get scene() { return this.current; }
  get canUndo() { return this.past.length > 0; }
  get canRedo() { return this.future.length > 0; }
  get undoCount() { return this.past.length; }
  get redoCount() { return this.future.length; }
  apply(transaction) {
    if (!transaction?.ok) return this.current;
    this.past.push(this.current);
    if (this.past.length > this.limit) this.past.shift();
    this.current = applyEditTransaction(this.current, transaction);
    this.future.length = 0;
    return this.current;
  }
  replace(scene, { record = true } = {}) {
    if (!Array.isArray(scene)) throw new TypeError('Сцена должна быть массивом');
    if (record) {
      this.past.push(this.current);
      if (this.past.length > this.limit) this.past.shift();
      this.future.length = 0;
    }
    this.current = [...scene];
    return this.current;
  }
  undo() {
    if (!this.canUndo) return this.current;
    this.future.push(this.current);
    this.current = this.past.pop();
    return this.current;
  }
  redo() {
    if (!this.canRedo) return this.current;
    this.past.push(this.current);
    this.current = this.future.pop();
    if (this.past.length > this.limit) this.past.shift();
    return this.current;
  }
  clear() { this.past.length = 0; this.future.length = 0; }
  snapshot() { return serializeScene(this.current); }
  restore(snapshot, { record = true } = {}) { return this.replace(deserializeScene(snapshot), { record }); }
}
