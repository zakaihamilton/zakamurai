import { Scope } from './Scope';
import type { JsToken } from './types';

export class ScopeManager {
  rootScope: Scope;
  currentScope: Scope;
  scopes: Scope[];

  constructor() {
    this.rootScope = new Scope(null, true);
    this.currentScope = this.rootScope;
    this.scopes = [this.rootScope];
  }

  pushScope(isFunctionScope = false): Scope {
    const scope = new Scope(this.currentScope, isFunctionScope);
    this.scopes.push(scope);
    this.currentScope = scope;
    return scope;
  }

  popScope(): void {
    if (this.currentScope.parent) {
      this.currentScope = this.currentScope.parent;
    }
  }

  getNearestFunctionScope(): Scope {
    let scope: Scope | null = this.currentScope;
    while (scope) {
      if (scope.isFunctionScope) return scope;
      scope = scope.parent;
    }
    return this.rootScope;
  }

  registerVar(name: string, token: JsToken, isBlockScoped: boolean): void {
    const scope = isBlockScoped ? this.currentScope : this.getNearestFunctionScope();
    if (!scope.variables.has(name)) {
      scope.variables.set(name, token);
    }
  }

  registerUsage(token: JsToken): void {
    this.currentScope.usages.push(token);
  }
}
