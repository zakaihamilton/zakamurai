export class Scope {
  constructor(parent = null, isFunctionScope = false) {
    this.parent = parent;
    this.isFunctionScope = isFunctionScope;
    this.variables = new Map();
    this.usages = [];
  }

  find(name) {
    if (this.variables.has(name)) {
      return this.variables.get(name);
    }
    if (this.parent) {
      return this.parent.find(name);
    }
    return null;
  }
}
