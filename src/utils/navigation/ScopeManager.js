import { Scope } from './Scope';

export class ScopeManager {
  constructor() {
    this.rootScope = new Scope(null, true);
    this.currentScope = this.rootScope;
    this.scopes = [this.rootScope];
  }

  pushScope(isFunctionScope = false) {
    const scope = new Scope(this.currentScope, isFunctionScope);
    this.scopes.push(scope);
    this.currentScope = scope;
    return scope;
  }

  popScope() {
    if (this.currentScope.parent) {
      this.currentScope = this.currentScope.parent;
    }
  }

  getNearestFunctionScope() {
    let scope = this.currentScope;
    while (scope) {
      if (scope.isFunctionScope) return scope;
      scope = scope.parent;
    }
    return this.rootScope;
  }

  registerVar(name, token, isBlockScoped) {
    const scope = isBlockScoped ? this.currentScope : this.getNearestFunctionScope();
    if (!scope.variables.has(name)) {
      scope.variables.set(name, token);
    }
  }

  registerUsage(token) {
    this.currentScope.usages.push(token);
  }
}
