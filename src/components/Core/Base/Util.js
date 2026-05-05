export function create(target, name, fields) {
  for (const key in fields) {
    const func = fields[key];
    if (func) {
      target[key] = func(`${name}.${key}`);
    }
  }
}
