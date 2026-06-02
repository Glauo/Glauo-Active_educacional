export function navItemMessageKey(href: string): string {
  if (href === "/") return "root";
  return href.replace(/^\//, "").replace(/\//g, "_");
}
