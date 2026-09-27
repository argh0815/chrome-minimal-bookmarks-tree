export default class PersistentSet<T> {
  private readonly key: string;
  private elements: Set<T>;

  constructor(key: string) {
    this.key = key;
    this.elements = new Set<T>();
    this.load();
  }

  add(id: T): void {
    if (this.elements.has(id)) {
      return;
    }
    this.elements.add(id);
    this.save();
  }

  remove(id: T): void {
    if (!this.elements.has(id)) {
      return;
    }
    this.elements.delete(id);
    this.save();
  }

  clear() {
    this.elements.clear();
    this.save();
  }

  contains(id: T): boolean {
    return this.elements.has(id);
  }

  load(): void {
    const elements = localStorage.getItem(this.key);
    if (elements !== null) {
      this.elements = new Set(JSON.parse(elements));
    }
  }

  save(): void {
    const data = JSON.stringify(Array.from(this.elements));
    localStorage.setItem(this.key, data);
  }
}
