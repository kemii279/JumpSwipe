import { promises as fs } from 'fs'
import { join } from 'path'
import { MaintenanceIssue, FolderIndex, Library } from '../types/media'

const INDEX_FILENAME = '.mvr_index.json'
const THUMB_CACHE_FILENAME = '.media-thumbnails.json'

async function fileExists(path: string): Promise<boolean> {
  try {
    await fs.access(path)
    return true
  } catch {
    return false
  }
}

/**
 * ライブラリ全体の不整合（ファイル消失など）をスキャンする
 */
export async function scanForIssues(library: Library): Promise<{ issues: MaintenanceIssue[] }> {
  const allIssues: MaintenanceIssue[] = []

  for (const series of library.series) {
    const indexPath = join(series.folderPath, INDEX_FILENAME)
    if (!(await fileExists(indexPath))) continue

    try {
      const data = await fs.readFile(indexPath, 'utf-8')
      const index: FolderIndex = JSON.parse(data)
      const missingItems: string[] = []

      // 1. 各アイテムの存在確認
      for (const item of index.items) {
        const fullPath = join(series.folderPath, item.fileName)
        if (!(await fileExists(fullPath))) {
          missingItems.push(item.fileName)
        }
      }

      // 2. HERO設定されたファイルの存在確認
      if (index.heroVideoFilename) {
        const heroPath = join(series.folderPath, index.heroVideoFilename)
        if (!(await fileExists(heroPath)) && !missingItems.includes(index.heroVideoFilename)) {
          missingItems.push(index.heroVideoFilename)
        }
      }

      if (missingItems.length > 0) {
        allIssues.push({
          id: `missing-items-${series.id}`,
          seriesId: series.id,
          folderPath: series.folderPath,
          seriesTitle: series.seriesTitle,
          type: 'ITEMS_GONE',
          missingCount: missingItems.length,
          likelyOffline: false,
          missingItems
        })
      }
    } catch (e) {
      console.error(`[Maintenance] Failed to scan ${series.folderPath}:`, e)
    }
  }

  return { issues: allIssues }
}

/**
 * メンテナンス修正を適用する
 */
export async function applyMaintenanceFix(
  _library: Library,
  issue: MaintenanceIssue
): Promise<boolean> {
  const indexPath = join(issue.folderPath, INDEX_FILENAME)
  const thumbPath = join(issue.folderPath, THUMB_CACHE_FILENAME)

  try {
    if (issue.type === 'ITEMS_GONE' && issue.missingItems) {
      // 1. .mvr_index.json から削除
      if (await fileExists(indexPath)) {
        const data = await fs.readFile(indexPath, 'utf-8')
        const index: FolderIndex = JSON.parse(data)
        const beforeCount = index.items.length
        index.items = index.items.filter((item) => !issue.missingItems!.includes(item.fileName))

        // HERO設定が消えたファイルだった場合はクリア
        if (index.heroVideoFilename && issue.missingItems.includes(index.heroVideoFilename)) {
          index.heroVideoFilename = undefined
          index.seriesThumbnailBase64 = undefined
        }

        await fs.writeFile(indexPath, JSON.stringify(index, null, 2), 'utf-8')
        console.log(`[Maintenance] Pruned ${beforeCount - index.items.length} items from index.`)
      }

      // 2. .media-thumbnails.json から削除
      if (await fileExists(thumbPath)) {
        const data = await fs.readFile(thumbPath, 'utf-8')
        const thumbs = JSON.parse(data)
        let changed = false
        for (const fileName of issue.missingItems) {
          if (thumbs[fileName]) {
            delete thumbs[fileName]
            changed = true
          }
        }

        if (changed) {
          if (Object.keys(thumbs).length === 0) {
            await fs.unlink(thumbPath)
          } else {
            await fs.writeFile(thumbPath, JSON.stringify(thumbs, null, 2), 'utf-8')
          }
          console.log(`[Maintenance] Synchronized thumbnail cache.`)
        }
      }
      return true
    }
  } catch (e) {
    console.error('[Maintenance] Failed to apply fix:', e)
  }

  return false
}
