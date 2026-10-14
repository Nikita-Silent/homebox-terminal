export function pieces(n: number) {
  return `${n} шт.`
}

export function pathText(path: { name: string }[]) {
  return path.map(p => p.name).join(' / ')
}
