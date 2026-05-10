/**
 * 自然順ソート比較関数
 * 数字部分を数値として比較し、1話→2話→10話の順にソートする
 */

// 計算済みのチャンクをキャッシュして高速化
const chunkCache = new Map<string, (string | number)[]>()

function getChunks(s: string): (string | number)[] {
  if (chunkCache.has(s)) return chunkCache.get(s)!

  const re = /(\d+)|(\D+)/g
  const matches = s.match(re) ?? []
  const chunks = matches.map((m) => {
    const n = parseInt(m, 10)
    return isNaN(n) ? m : n
  })

  // キャッシュが大きくなりすぎないように制御（簡易版）
  if (chunkCache.size > 2000) chunkCache.clear()
  chunkCache.set(s, chunks)
  return chunks
}

export function naturalCompare(a: string, b: string): number {
  if (a === b) return 0
  const chunksA = getChunks(a)
  const chunksB = getChunks(b)

  const len = Math.min(chunksA.length, chunksB.length)
  for (let i = 0; i < len; i++) {
    const ca = chunksA[i]
    const cb = chunksB[i]

    if (typeof ca === 'number' && typeof cb === 'number') {
      if (ca !== cb) return ca - cb
    } else {
      const sa = String(ca)
      const sb = String(cb)
      const cmp = sa.localeCompare(sb, 'ja')
      if (cmp !== 0) return cmp
    }
  }
  return chunksA.length - chunksB.length
}

/**
 * 配列を自然順ソートして返す（元配列は変更しない）
 */
export function naturalSort<T>(arr: T[], key: (item: T) => string): T[] {
  return [...arr].sort((a, b) => naturalCompare(key(a), key(b)))
}
