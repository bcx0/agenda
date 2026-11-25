export const revalidated = (globalThis.__TEST_REVALIDATED__ ??= []);
export function revalidatePath(path) {
  revalidated.push(path);
}
export function revalidateTag() {}
export function unstable_noStore() {}
