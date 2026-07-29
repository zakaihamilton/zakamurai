import type { JsToken } from './types';

export class Scope {
  parent: Scope | null;
  isFunctionScope: boolean;
  variables: Map<string, JsToken>;
  usages: JsToken[];

  constructor(parent: Scope | null = null, isFunctionScope = false) {
    this.parent = parent;
    this.isFunctionScope = isFunctionScope;
    this.variables = new Map();
    this.usages = [];
  }

  find(name: string): JsToken | null {
    if (this.variables.has(name)) {
      return this.variables.get(name) ?? null;
    }
    if (this.parent) {
      return this.parent.find(name);
    }
    return null;
  }
}
