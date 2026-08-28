export async function secret(env: Env, bindingName: string): Promise<string> {
  const binding: unknown = Reflect.get(env, bindingName);
  if (!binding || typeof binding !== "object") throw new Error("Required secret binding is unavailable");
  const getter: unknown = Reflect.get(binding, "get");
  if (typeof getter !== "function") throw new Error("Required secret binding is invalid");
  const resolved: unknown = await Reflect.apply(getter, binding, []);
  if (typeof resolved !== "string" || !resolved) throw new Error("Required secret binding is empty");
  return resolved;
}
