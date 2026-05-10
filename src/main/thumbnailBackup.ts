import { app } from 'electron'
import { join } from 'path'
import { promises as fs } from 'fs'
import { existsSync } from 'fs'

const CSV_FILENAME = 'thumbnail_history.csv'
const MAX_ENTRIES = 2000
const DEFAULT_SEEK_TIME = 3

interface BackupEntry {
  fileName: string
  seekTime: number
}

function getCSVPath(): string {
  return join(app.getPath('userData'), CSV_FILENAME)
}

/**
 * CSVエスケープ処理 (カンマや引用符を含むファイル名に対応)
 */
function escapeCSV(val: string): string {
  if (val.includes(',') || val.includes('"') || val.includes('\n')) {
    return `"${val.replace(/"/g, '""')}"`
  }
  return val
}

/**
 * CSVアンエスケープ処理
 */
function unescapeCSV(val: string): string {
  if (val.startsWith('"') && val.endsWith('"')) {
    return val.slice(1, -1).replace(/""/g, '"')
  }
  return val
}

/**
 * CSVからエントリを読み込む
 */
async function loadEntriesAsync(): Promise<BackupEntry[]> {
  const path = getCSVPath()
  if (!existsSync(path)) return []

  try {
    const content = await fs.readFile(path, 'utf-8')
    return content
      .split('\n')
      .filter((line) => line.trim() !== '')
      .map((line) => {
        // カンマで分割するが、引用符内のカンマは無視する必要がある
        const parts: string[] = []
        let current = ''
        let inQuotes = false
        for (let i = 0; i < line.length; i++) {
          const char = line[i]
          if (char === '"') inQuotes = !inQuotes
          if (char === ',' && !inQuotes) {
            parts.push(current)
            current = ''
          } else {
            current += char
          }
        }
        parts.push(current)

        if (parts.length < 2) return null
        return {
          fileName: unescapeCSV(parts[0]),
          seekTime: parseFloat(parts[1]) || DEFAULT_SEEK_TIME
        }
      })
      .filter((e): e is BackupEntry => e !== null)
  } catch (e) {
    console.error('[Backup] Failed to load CSV:', e)
    return []
  }
}

/**
 * メモリキャッシュ（ファイル名 -> seekTime）
 */
let backupCache: Map<string, number> | null = null

/**
 * キャッシュをクリア（書き込み時に呼ぶ）
 */
function invalidateCache(): void {
  backupCache = null
}

/**
 * CSVからエントリを読み込み、Map化して返す
 */
async function getBackupMap(): Promise<Map<string, number>> {
  if (backupCache) return backupCache

  const entries = await loadEntriesAsync()
  const map = new Map<string, number>()
  for (const entry of entries) {
    // 重複がある場合は後のもの（最新）で上書きされる
    map.set(entry.fileName, entry.seekTime)
  }
  backupCache = map
  return map
}

/**
 * 指定されたアイテム群でバックアップを更新する (FIFO 2000件)
 */
export async function syncItemsToBackup(
  newItems: { fileName: string; seekTime: number }[]
): Promise<void> {
  const path = getCSVPath()
  let entries = await loadEntriesAsync()
  let modified = false

  for (const item of newItems) {
    // デフォルト値の場合はバックアップ対象外
    if (item.seekTime === DEFAULT_SEEK_TIME) continue

    // 既存の同じファイル名を削除 (最新を後ろに持っていくため)
    const originalLength = entries.length
    entries = entries.filter((e) => e.fileName !== item.fileName)
    entries.push(item)
    if (entries.length !== originalLength || entries[entries.length - 1] !== item) {
      modified = true
    }
  }

  if (!modified && entries.length <= MAX_ENTRIES) return

  // 2000件を超えたら古いものを削除
  if (entries.length > MAX_ENTRIES) {
    entries = entries.slice(entries.length - MAX_ENTRIES)
  }

  try {
    const csvContent = entries.map((e) => `${escapeCSV(e.fileName)},${e.seekTime}`).join('\n')
    await fs.writeFile(path, csvContent, 'utf-8')
    invalidateCache() // 書き込んだらキャッシュをクリア
  } catch (e) {
    console.error('[Backup] Failed to save CSV:', e)
  }
}

/**
 * 特定のファイル名のバックアップを取得する (最新を優先)
 */
export async function getBackup(fileName: string): Promise<number | null> {
  const map = await getBackupMap()
  return map.get(fileName) ?? null
}
