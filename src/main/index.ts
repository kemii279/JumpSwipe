import { app, shell, BrowserWindow, ipcMain, dialog, protocol, nativeImage } from 'electron'
import { join, extname } from 'path'
import { promises as fs, existsSync, createReadStream, statSync } from 'fs'
import { Readable } from 'stream'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import icon from '../../resources/icon.png?asset'
import { nanoid } from 'nanoid'
import {
  type Library,
  type FolderIndex,
  type FolderIndexEntry,
  type ScanResult,
  type MediaItem,
  type SetThumbnailArgs,
  type SetWatchProgressArgs,
  type SetSeriesMetaArgs,
  type MaintenanceIssue,
  type ScanOptions,
  type FirstVideoResult,
  type FindFirstVideoOptions,
  type ThumbnailCache,
  type SearchArgs,
  type SearchResult,
  DEFAULT_SEEK_TIME
} from '../types/media'
import { scanForIssues, applyMaintenanceFix } from './maintenance'
import { syncItemsToBackup, getBackup } from './thumbnailBackup'

// 特権スキームの登録
protocol.registerSchemesAsPrivileged([
  {
    scheme: 'media',
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      corsEnabled: true,
      stream: true,
      bypassCSP: true
    }
  }
])

// ================================================================
//  定数
// ================================================================
app.setName('JumpSwipe')

const VIDEO_EXTS = ['.mp4', '.mkv', '.avi', '.mov', '.webm', '.m4v', '.flv']
const IMAGE_EXTS = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp', '.tiff', '.avif']
const AUDIO_EXTS = ['.mp3', '.flac', '.wav', '.aac', '.ogg', '.m4a', '.opus']

const INDEX_FILENAME = '.mvr_index.json'
const LIBRARY_VERSION = 1

// ================================================================
//  ファイル操作の排他制御 (簡易キュー)
// ================================================================
const fileLocks = new Map<string, Promise<unknown>>()

async function runLocked<T>(path: string, task: () => Promise<T>): Promise<T> {
  const previous = fileLocks.get(path) || Promise.resolve()
  const current = previous
    .then(async () => {
      return await task()
    })
    .catch((err) => {
      console.error(`[FileQueue] Error at ${path}:`, err)
      throw err
    })
  fileLocks.set(path, current)
  // クリーンアップ
  current.finally(() => {
    if (fileLocks.get(path) === current) {
      fileLocks.delete(path)
    }
  })
  return current
}

// ================================================================
//  アプリデータパス
// ================================================================
function getAppDir(): string {
  return app.getPath('userData')
}

function getLibraryPath(): string {
  return join(getAppDir(), 'library.json')
}

// ================================================================
//  検索キャッシュ (永続化)
// ================================================================
const searchCache = new Map<string, SearchResult>()

function getSearchCachePath(): string {
  return join(getAppDir(), 'search_cache.json')
}

async function loadSearchCache(): Promise<void> {
  try {
    const path = getSearchCachePath()
    if (existsSync(path)) {
      const data = await fs.readFile(path, 'utf-8')
      const list: SearchResult[] = JSON.parse(data)
      searchCache.clear()
      for (const item of list) {
        searchCache.set(item.filePath, item)
      }
      console.log(`[SearchCache] Loaded ${searchCache.size} items from disk.`)
    }
  } catch (e) {
    console.warn('[SearchCache] Failed to load cache:', e)
  }
}

async function saveSearchCache(): Promise<void> {
  try {
    const path = getSearchCachePath()
    const list = Array.from(searchCache.values())
    await fs.writeFile(path, JSON.stringify(list, null, 2), 'utf-8')
  } catch (e) {
    console.warn('[SearchCache] Failed to save cache:', e)
  }
}

let cachedLibrary: Library | null = null

async function loadLibraryAsync(): Promise<Library> {
  if (cachedLibrary) return cachedLibrary

  const libPath = getLibraryPath()
  const bakPath = libPath + '.bak'

  return runLocked(libPath, async () => {
    if (cachedLibrary) return cachedLibrary

    const tryLoad = async (path: string): Promise<Library | null> => {
      if (!existsSync(path)) return null
      try {
        const data = await fs.readFile(path, 'utf-8')
        const parsed = JSON.parse(data) as Library
        if (!parsed.series) parsed.series = []
        if (!parsed.thumbnailRegistry) parsed.thumbnailRegistry = []

        // base64 画像データはメモリ上で削除 (仕様)
        for (const entry of parsed.thumbnailRegistry) {
          if (entry.thumbnailBase64) delete entry.thumbnailBase64
        }
        return parsed
      } catch (e) {
        console.error(`[DataSafety] Failed to parse library at ${path}:`, e)
        return null
      }
    }

    // 1. メインファイルの読み込み
    let lib = await tryLoad(libPath)

    // 2. 失敗した場合はバックアップから復旧
    if (!lib) {
      console.warn('[DataSafety] Main library.json is corrupted or missing, trying backup...')
      lib = await tryLoad(bakPath)
      if (lib) {
        console.log('[DataSafety] Successfully recovered library from backup.')
      }
    }

    if (lib) {
      if (!lib.settings) {
        lib.settings = {
          scrollSpeed: 30,
          videoSkipBack: 10,
          videoSkipForward: 10
        }
      }
      cachedLibrary = lib
      return lib
    }

    // 3. 両方失敗した場合
    if (existsSync(libPath)) {
      // 既存の壊れたファイルを保存してリセット (上書きせず退避)
      const corruptedPath = libPath + '.' + Date.now() + '.corrupted'
      await fs.rename(libPath, corruptedPath).catch(() => {})
      console.error(`[DataSafety] All library files corrupted. Original moved to ${corruptedPath}`)
    }

    cachedLibrary = {
      version: LIBRARY_VERSION,
      series: [],
      thumbnailRegistry: [],
      settings: {
        scrollSpeed: 30,
        videoSkipBack: 10,
        videoSkipForward: 10
      }
    }
    return cachedLibrary
  })
}

async function saveLibrary(library: Library): Promise<void> {
  const libPath = getLibraryPath()
  const bakPath = libPath + '.bak'
  const tmpPath = libPath + '.tmp'

  cachedLibrary = library

  await runLocked(libPath, async () => {
    try {
      // 1. バックアップ作成 (既存のメインがあれば)
      if (existsSync(libPath)) {
        await fs.copyFile(libPath, bakPath).catch(() => {})
      }

      // 2. 一時ファイルに書き込み
      await fs.writeFile(tmpPath, JSON.stringify(library, null, 2), 'utf-8')

      // 3. 名前を変更して確定 (Atomic)
      await fs.rename(tmpPath, libPath)
    } catch (e) {
      console.error('[DataSafety] Failed to save library atomically:', e)
      throw e
    }
  })
}

// ================================================================
//  サムネイルキャッシュ読み書き
// ================================================================
async function readThumbnailCache(folderPath: string): Promise<ThumbnailCache> {
  const thumbPath = join(folderPath, '.media-thumbnails.json')
  return runLocked(thumbPath, async () => {
    if (!existsSync(thumbPath)) return {}
    try {
      const data = await fs.readFile(thumbPath, 'utf-8')
      const parsed = JSON.parse(data) as ThumbnailCache
      let modified = false

      // ガベージ検証: 不正なbase64や壊れたエントリを削除
      for (const [key, value] of Object.entries(parsed)) {
        if (!value || typeof value !== 'object') {
          delete parsed[key]
          modified = true
          continue
        }
        const v = value as any
        if (v.base64) {
          const b64 = v.base64 as string
          // data:image/ から始まらない、または短すぎる文字列はゴミと判定
          if (typeof b64 !== 'string' || !b64.startsWith('data:image/') || b64.length < 100) {
            delete parsed[key]
            modified = true
          }
        } else {
          // base64 が無いエントリも不要なら消す（サムネイルキャッシュなので）
          delete parsed[key]
          modified = true
        }
      }

      if (modified) {
        await fs.writeFile(thumbPath, JSON.stringify(parsed, null, 2), 'utf-8')
        console.log(`[Auto-Cleanup] Removed garbage from thumbnail cache: ${folderPath}`)
      }

      return parsed
    } catch {
      // JSONが壊れている場合は空にして上書き準備
      console.warn(`[Auto-Cleanup] Invalid thumbnail cache JSON, resetting: ${folderPath}`)
      return {}
    }
  })
}

async function writeThumbnailCache(folderPath: string, thumbDB: ThumbnailCache): Promise<void> {
  const thumbPath = join(folderPath, '.media-thumbnails.json')
  await runLocked(thumbPath, async () => {
    await fs.writeFile(thumbPath, JSON.stringify(thumbDB, null, 2), 'utf-8')
  })
}

/**
 * folderIndex から fileName でエントリを取得。なければ新規作成。
 */
function getOrCreateEntry(fileName: string, index: FolderIndex): FolderIndexEntry {
  const existing = index.items.find((e) => e.fileName === fileName)
  if (existing) return existing
  const entry: FolderIndexEntry = { fileName }
  index.items.push(entry)
  return entry
}

/**
 * 旧形式のインデックスから、個別のサムネイルを .media-thumbnails.json へ移動する
 */
async function migrateThumbnailsToDedicatedCache(
  folderPath: string,
  items: Record<string, unknown>[]
): Promise<void> {
  const thumbDB = await readThumbnailCache(folderPath)
  let modified = false
  for (const item of items) {
    const i = item as any
    if (i.thumbnailBase64) {
      if (!thumbDB[i.fileName]) {
        thumbDB[i.fileName] = {
          base64: i.thumbnailBase64,
          seekTime: i.seekTime || DEFAULT_SEEK_TIME,
          updatedAt: new Date().toISOString()
        }
        modified = true
      }
    }
  }
  if (modified) {
    await writeThumbnailCache(folderPath, thumbDB)
  }
}

// ================================================================
//  インデックス (フォルダごと) 読み書き
// ================================================================
async function readFolderIndex(folderPath: string): Promise<FolderIndex> {
  return runLocked(join(folderPath, INDEX_FILENAME), async () => {
    const indexPath = join(folderPath, INDEX_FILENAME)
    if (!existsSync(indexPath)) {
      return { version: 1, folderPath, items: [] }
    }
    try {
      const data = await fs.readFile(indexPath, 'utf-8')
      if (!data.trim()) return { version: 1, folderPath, items: [] }
      const parsed = JSON.parse(data) as FolderIndex
      if (!Array.isArray(parsed.items)) return { version: 1, folderPath, items: [] }

      let indexNeedsSave = false

      // 移行チェック: 個別のサムネイルがあれば専用ファイルへ移動
      const hasLegacyThumbs = parsed.items.some((i: any) => i.thumbnailBase64)
      if (hasLegacyThumbs) {
        // ゴミデータは移行しないようにフィルタ
        const validItemsForMigration = parsed.items.filter((item: any) => {
          const b64 = item.thumbnailBase64 as string | undefined
          return (
            b64 && typeof b64 === 'string' && b64.startsWith('data:image/') && b64.length >= 100
          )
        })

        await migrateThumbnailsToDedicatedCache(folderPath, validItemsForMigration as any[])
        for (const item of parsed.items) {
          if ((item as any).thumbnailBase64) {
            delete (item as any).thumbnailBase64
            indexNeedsSave = true
          }
        }
      }

      // サニタイズ処理: ゴミデータの検証
      if (parsed.seriesThumbnailBase64) {
        const b64 = parsed.seriesThumbnailBase64
        if (typeof b64 !== 'string' || !b64.startsWith('data:image/') || b64.length < 100) {
          parsed.seriesThumbnailBase64 = undefined
          indexNeedsSave = true
        }
      }

      for (const item of parsed.items) {
        if (
          item.seekTime !== undefined &&
          (typeof item.seekTime !== 'number' || isNaN(item.seekTime))
        ) {
          item.seekTime = undefined
          indexNeedsSave = true
        }
      }

      if (indexNeedsSave) {
        console.log(`[Auto-Cleanup] Removed garbage from index: ${folderPath}`)
        // background save to fix the JSON silently
        fs.writeFile(indexPath, JSON.stringify(parsed, null, 2), 'utf-8').catch(() => {})
      }

      return parsed
    } catch (e) {
      console.warn(`[Auto-Cleanup] Error parsing ${indexPath}, returning empty and overwriting.`, e)
      return { version: 1, folderPath, items: [] }
    }
  })
}

async function writeFolderIndex(folderPath: string, index: FolderIndex): Promise<void> {
  const indexPath = join(folderPath, INDEX_FILENAME)
  const tmpPath = indexPath + '.tmp'

  return runLocked(indexPath, async () => {
    try {
      const cleanIndex = {
        ...index,
        items: index.items.map((item) => {
          const newItem = { ...item } as Record<string, unknown>
          delete newItem.thumbnailBase64
          return newItem as unknown as FolderIndexEntry
        })
      }
      // Atomic write for folder index
      await fs.writeFile(tmpPath, JSON.stringify(cleanIndex, null, 2), 'utf-8')
      await fs.rename(tmpPath, indexPath)
    } catch (e) {
      console.warn(`[JumpSwipe] Cannot write index to ${folderPath}`, e)
    }
  })
}

/** 1タスク分の間隔を与える（cooperative scheduling） */
const yieldToEventLoop = (): Promise<void> => new Promise<void>((resolve) => setImmediate(resolve))

// ================================================================
//  フォルダスキャン（1階層のみ）- 非同期版
// ================================================================
async function scanFolder(folderPath: string, options: ScanOptions = {}): Promise<ScanResult> {
  const startTime = performance.now()
  if (!existsSync(folderPath)) {
    return {
      folders: [],
      videos: [],
      images: [],
      audios: [],
      missingCount: 0,
      missingItems: [],
      error: 'Folder not found',
      scanDurationMs: 0
    }
  }

  const folders: MediaItem[] = []
  const videos: MediaItem[] = []
  const images: MediaItem[] = []
  const audios: MediaItem[] = []

  // 1. 物理ファイル一覧を「種類付き」で取得（statを節約）
  let entries: import('fs').Dirent[]
  try {
    entries = await fs.readdir(folderPath, { withFileTypes: true })
  } catch {
    return {
      folders: [],
      videos: [],
      images: [],
      audios: [],
      missingCount: 0,
      missingItems: [],
      error: 'Access denied',
      scanDurationMs: 0
    }
  }

  // 2. インデックスとキャッシュをロード
  const folderIndex = await readFolderIndex(folderPath)
  const thumbDB = await readThumbnailCache(folderPath)
  const library = await loadLibraryAsync()

  // レジストリを Map 化して検索を高速化 (O(1))
  const registryMap = new Map<string, any[]>()
  if (library.thumbnailRegistry) {
    for (const r of library.thumbnailRegistry) {
      if (!registryMap.has(r.fileName)) registryMap.set(r.fileName, [])
      registryMap.get(r.fileName)!.push(r)
    }
  }

  const physicalFileNames = new Set(entries.map((e) => e.name))
  let indexModified = false
  let thumbDBModified = false

  // サムネイルキャッシュの孤立エントリを削除
  for (const key of Object.keys(thumbDB)) {
    if (!physicalFileNames.has(key)) {
      delete thumbDB[key]
      thumbDBModified = true
    }
  }

  // インデックスの同期
  const originalItemCount = folderIndex.items.length
  folderIndex.items = folderIndex.items.filter((item) => physicalFileNames.has(item.fileName))
  if (folderIndex.items.length !== originalItemCount) indexModified = true

  // インデックスを Map 化して高速検索できるようにする
  const folderIndexMap = new Map(folderIndex.items.map((i) => [i.fileName, i]))

  // 3. サブフォルダのインデックスを一括並列読み込み（IOの効率化）
  const subDirEntries = entries.filter((e) => e.isDirectory())
  const subFolderIndexes = await Promise.all(
    subDirEntries.map((d) => readFolderIndex(join(folderPath, d.name)))
  )
  const subFolderIndexMap = new Map(subDirEntries.map((d, i) => [d.name, subFolderIndexes[i]]))

  // 4. メインループ
  let processedCount = 0
  for (const entry of entries) {
    const name = entry.name
    if (name === INDEX_FILENAME || name.startsWith('.') || name.startsWith('$')) continue

    const fullPath = join(folderPath, name)

    // ディレクトリ処理
    if (entry.isDirectory()) {
      const subFolderIndex = subFolderIndexMap.get(name)!
      let idxEntry = folderIndexMap.get(name)
      if (!idxEntry) {
        idxEntry = { fileName: name }
        folderIndex.items.push(idxEntry)
        folderIndexMap.set(name, idxEntry)
        indexModified = true
      }

      folders.push({
        id: nanoid(12),
        fileName: name,
        filePath: fullPath,
        type: 'folder',
        title: idxEntry.title ?? name,
        thumbnailBase64: subFolderIndex.seriesThumbnailBase64,
        fileSize: 0
      })
    }
    // ファイル処理
    else if (entry.isFile()) {
      const ext = extname(name).toLowerCase()
      let type: 'video' | 'image' | 'audio' | null = null
      if (VIDEO_EXTS.includes(ext)) type = 'video'
      else if (IMAGE_EXTS.includes(ext)) type = 'image'
      else if (AUDIO_EXTS.includes(ext)) type = 'audio'

      if (!type) continue

      let idxEntry = folderIndexMap.get(name)
      if (!idxEntry) {
        idxEntry = { fileName: name }
        folderIndex.items.push(idxEntry)
        folderIndexMap.set(name, idxEntry)
        indexModified = true
      }

      // サムネイルがなければレジストリからリカバリー
      if (!thumbDB[name]) {
        const matches = registryMap.get(name)
        if (matches) {
          // fileSizeが必要な場合のみ stat する
          const stat = await fs.stat(fullPath).catch(() => null)
          if (stat) {
            const match = matches.find((m) => m.fileSize === stat.size)
            if (match) {
              idxEntry.seekTime = match.seekTime
              if (match.thumbnailBase64) {
                thumbDB[name] = {
                  base64: match.thumbnailBase64,
                  seekTime: match.seekTime,
                  updatedAt: new Date().toISOString()
                }
                thumbDBModified = true
              }
            }
          }
        }
      }

      // バックアップからのリカバリー（seekTimeがない場合のみ）
      if (idxEntry.seekTime === undefined || idxEntry.seekTime === null) {
        const csvSeekTime = await getBackup(name)
        if (csvSeekTime !== null) {
          idxEntry.seekTime = csvSeekTime
          indexModified = true
        }
      }

      const item: MediaItem = {
        id: nanoid(12),
        fileName: name,
        filePath: fullPath,
        type,
        title: idxEntry.title,
        duration: idxEntry.duration,
        watchedSeconds: idxEntry.watchedSeconds,
        watchedAt: idxEntry.watchedAt,
        thumbnailBase64: thumbDB[name]?.base64,
        seekTime: idxEntry.seekTime,
        // fileSize は今のところ必須ではないので stat せずに index にあれば使う（現在は index にないため 0）
        fileSize: 0
      }

      if (type === 'video') videos.push(item)
      else if (type === 'image') images.push(item)
      else if (type === 'audio') audios.push(item)
    }

    processedCount++
    // 50件ごとにイベントループに譲る（UIフリーズ防止とオーバーヘッドのバランス）
    if (processedCount % 50 === 0) await yieldToEventLoop()
  }

  // 4. 同期と保存
  if (indexModified) await writeFolderIndex(folderPath, folderIndex)
  if (thumbDBModified) await writeThumbnailCache(folderPath, thumbDB)

  // CSVバックアップ同期（軽量化のため上位で行う）
  const backupItems = folderIndex.items
    .filter((i) => i.seekTime !== undefined && i.seekTime !== DEFAULT_SEEK_TIME)
    .map((i) => ({ fileName: i.fileName, seekTime: i.seekTime! }))
  if (backupItems.length > 0) await syncItemsToBackup(backupItems)

  // 【自動学習機能】
  // ユーザーが通常のフォルダ表示を行った際、その最新情報を検索キャッシュに即座に反映させる。
  // これにより、一度閲覧した場所は次回の検索から「物理スキャンなし」で超高速にヒットするようになる。
  const series = library.series.find((s) => folderPath.startsWith(s.folderPath))
  if (series) {
    const seriesId = series.id
    const allScanResults = [...folders, ...videos, ...images, ...audios]
    for (const item of allScanResults) {
      const searchRes: SearchResult = {
        id:
          item.type === 'folder'
            ? `folder-${seriesId}-${item.filePath}`
            : `${seriesId}-${item.filePath}-${item.fileName}`,
        fileName: item.fileName,
        filePath: item.filePath,
        targetFolderPath: folderPath,
        folderPath: folderPath,
        relativeFolderPath: item.filePath.slice(series.folderPath.length).replace(/^[\\/]/, ''),
        seriesId: seriesId,
        seriesTitle: series.seriesTitle || series.folderPath.split(/[\\/]/).pop() || '',
        type: item.type as any,
        title: item.title
      }
      searchCache.set(item.filePath, searchRes)
    }
    if (allScanResults.length > 0) {
      console.log(
        `[DEBUG-SEARCH] Learned ${allScanResults.length} items. Sample: ID=${seriesId}, Name=${allScanResults[0].fileName}`
      )
    }
    saveSearchCache() // 非同期で保存
  }

  const scanDurationMs = Math.round(performance.now() - startTime)

  // 【仮説2への対策】スキャン時にヒーロー情報も一緒に取得して返す（二重I/Oの回避）
  const hero = await findFirstVideoAsync(folderPath, 0, { preferVideo: true }, folderIndex)

  // 軽量モードならここで終了
  if (options.skipMaintenance) {
    return { folders, videos, images, audios, hero, scanDurationMs }
  }

  // メンテナンスモード用の不整合チェック
  const missingItemsList = folderIndex.items
    .filter((item) => !physicalFileNames.has(item.fileName))
    .map((item) => item.fileName)

  return {
    folders,
    videos,
    images,
    audios,
    hero,
    missingCount: missingItemsList.length,
    missingItems: missingItemsList,
    scanDurationMs
  }
}

// ================================================================
//  プロトコルの特権登録 (メディア再生に必須)
// ================================================================
protocol.registerSchemesAsPrivileged([
  {
    scheme: 'media',
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      bypassCSP: true,
      stream: true,
      corsEnabled: true
    }
  }
])

// ================================================================
//  シリーズのサムネイルを再帰的に取得（未設定時のフォールバック）
//  仕様書 §3 シリーズカードの情報源
// ================================================================
/**
 * シリーズのサムネイルを再帰的に取得（未設定時のフォールバック）
 * 非同期版: メインスレッドをブロックしない
 */
async function findFirstVideoAsync(
  folderPath: string,
  depth = 0,
  options: FindFirstVideoOptions = {},
  preloadedIndex?: FolderIndex
): Promise<FirstVideoResult | null> {
  // 探索の深さを制限（無限ループ防止）
  if (depth > 5) return null

  try {
    const folderIndex = preloadedIndex || (await readFolderIndex(folderPath))

    /**
     * 【優先順位 1: ユーザーによる明示的な指定 (HERO設定)】
     * ユーザーが特定の動画または画像をシリーズの顔（HERO）として選んでいる場合、それを最優先する。
     */
    if (folderIndex.heroVideoFilename) {
      const heroPath = join(folderPath, folderIndex.heroVideoFilename)
      if (existsSync(heroPath)) {
        const entry = folderIndex.items.find((i) => i.fileName === folderIndex.heroVideoFilename)
        const ext = extname(folderIndex.heroVideoFilename).toLowerCase()
        const isImg = IMAGE_EXTS.includes(ext)

        return {
          filePath: heroPath,
          seekTime: entry?.seekTime ?? DEFAULT_SEEK_TIME,
          type: isImg ? 'image' : 'video',
          isSpecified: true
        }
      }
    }

    /**
     * 【優先順位 2: 明示的なシリーズサムネイル (キャッシュ)】
     * 動画優先モードでない（カード表示用など）場合で、すでにサムネイル画像が設定されているならそれを使う。
     */
    if (folderIndex.seriesThumbnailBase64 && !options.preferVideo) {
      return {
        thumbnailBase64: folderIndex.seriesThumbnailBase64,
        isSpecified: true
      }
    }

    // インデックスを Map 化して高速検索できるようにする
    const folderIndexMap = new Map(folderIndex.items.map((i) => [i.fileName, i]))

    // 探索で見つかった「仮」の画像を保持する変数
    let firstImage: FirstVideoResult | null = null

    // インデックスにキャッシュされたサムネイルがあれば、とりあえずそれを「仮の画像」の初期値にする
    if (folderIndex.seriesThumbnailBase64) {
      firstImage = {
        thumbnailBase64: folderIndex.seriesThumbnailBase64,
        isSpecified: true
      }
    }

    // カレントディレクトリのファイルを一括取得（ファイル種別付き）
    const entries = await fs.readdir(folderPath, { withFileTypes: true }).catch(() => [])
    // 名前でソート（決定論的な挙動のため）
    entries.sort((a, b) => a.name.localeCompare(b.name))

    /**
     * 【優先順位 3: カレントディレクトリ内の実体ファイル】
     * 動画優先モードなら動画を、そうでなければ最初に見つかった画像ファイルを探す。
     */
    for (const dirent of entries) {
      const name = dirent.name
      if (name === INDEX_FILENAME || name.startsWith('.') || name.startsWith('$')) continue

      const fullPath = join(folderPath, name)
      if (dirent.isFile()) {
        const ext = extname(name).toLowerCase()

        if (VIDEO_EXTS.includes(ext)) {
          // 動画が見つかったら即採用（動画優先モードなら終了、そうでなくても動画は強い候補）
          const entryMeta = folderIndexMap.get(name)
          return {
            filePath: fullPath,
            seekTime: entryMeta?.seekTime ?? DEFAULT_SEEK_TIME,
            type: 'video',
            isSpecified: false
          }
        } else if (IMAGE_EXTS.includes(ext)) {
          // 画像が見つかった場合
          // すでに firstImage があっても、それが「キャッシュ(Base64)」なら「実体ファイル」で上書きする（品質優先）
          if (!firstImage || firstImage.thumbnailBase64) {
            const entryMeta = folderIndexMap.get(name)
            firstImage = {
              filePath: fullPath,
              seekTime: entryMeta?.seekTime ?? DEFAULT_SEEK_TIME,
              type: 'image',
              isSpecified: false
            }
          }
        }
      }
    }

    /**
     * 【優先順位 4: サブディレクトリの再帰探索】
     * カレントディレクトリに何も（動画も画像も）なければ、下の階層を探しに行く。
     * ※「一階層目に画像があったらそれを使って良い」という要望に基づき、
     *   画像ファイルが見つかっている場合は深追い（再帰探索）をせずに終了する。
     */
    if (firstImage && firstImage.filePath) {
      return firstImage
    }

    for (const dirent of entries) {
      const name = dirent.name
      if (name === INDEX_FILENAME || name.startsWith('.') || name.startsWith('$')) continue
      if (dirent.isDirectory()) {
        const fullPath = join(folderPath, name)
        const found = await findFirstVideoAsync(fullPath, depth + 1, options)
        if (found) {
          // サブディレクトリで見つかったものが「明示的な指定」なら即採用
          if (found.isSpecified) return found

          // 動画優先モードで、サブで見つかったのが画像なら、他のディレクトリに動画がないかさらに探す
          const isActuallyVideo = found.type === 'video' && !!found.filePath
          if (options.preferVideo && !isActuallyVideo) {
            // 見つかった画像が「実体ファイル」なら、現在の「キャッシュ画像」より優先して保持
            if (!firstImage || (!firstImage.filePath && found.filePath)) {
              firstImage = found
            }
            continue
          }
          return found
        }
      }
    }

    // すべて探索して動画がなければ、保持していた画像を返す
    if (firstImage) return firstImage
  } catch (e) {
    console.warn(`[findFirstVideoAsync] Error in ${folderPath}:`, e)
  }
  return null
}

// ================================================================
//  ウィンドウ作成
// ================================================================
function createWindow(): void {
  const mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    show: false,
    autoHideMenuBar: true,
    icon: nativeImage.createFromPath(
      process.platform === 'win32' ? join(__dirname, '../../resources/icon.ico') : icon
    ),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false
    }
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow.show()
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

// ================================================================
//  カスタム media:// プロトコル
// ================================================================
function registerMediaProtocol(): void {
  protocol.handle('media', async (request) => {
    const url = new URL(request.url)
    const filePath = decodeURIComponent(
      url.pathname.startsWith('/') ? url.pathname.slice(1) : url.pathname
    )
    console.log(
      `[DEBUG-MAIN] media protocol request URL: ${request.url}, mapped to filePath: ${filePath}`
    )

    try {
      const stat = await fs.stat(filePath)
      const fileSize = stat.size
      const rangeHeader = request.headers.get('Range')

      const ext = extname(filePath).toLowerCase()
      let contentType = 'video/mp4'
      if (ext === '.webm') contentType = 'video/webm'
      else if (ext === '.ogg') contentType = 'video/ogg'
      else if (['.jpg', '.jpeg'].includes(ext)) contentType = 'image/jpeg'
      else if (ext === '.png') contentType = 'image/png'
      else if (ext === '.webp') contentType = 'image/webp'
      else if (ext === '.gif') contentType = 'image/gif'

      if (rangeHeader) {
        const parts = rangeHeader.replace(/bytes=/, '').split('-')
        const start = parseInt(parts[0], 10)
        const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1
        const chunksize = end - start + 1
        const fileStream = createReadStream(filePath, { start, end })
        const webStream = Readable.toWeb(fileStream) as ReadableStream

        return new Response(webStream, {
          status: 206,
          headers: {
            'Content-Range': `bytes ${start}-${end}/${fileSize}`,
            'Accept-Ranges': 'bytes',
            'Content-Length': chunksize.toString(),
            'Content-Type': contentType,
            'Access-Control-Allow-Origin': '*'
          }
        })
      } else {
        // 画像のリサイズ要求（FHD制限）への対応
        const resize = url.searchParams.get('resize')
        if (resize === 'fhd' && IMAGE_EXTS.includes(ext)) {
          const img = nativeImage.createFromPath(filePath)
          const size = img.getSize()
          if (size.width > 1920 || size.height > 1080) {
            // アスペクト比を維持してリサイズ（長辺を1920または1080に合わせる）
            let targetWidth = 1920
            let targetHeight = 1080
            const ratio = size.width / size.height
            if (ratio > 1920 / 1080) {
              targetHeight = Math.round(1920 / ratio)
            } else {
              targetWidth = Math.round(1080 * ratio)
            }

            const resized = img.resize({
              width: targetWidth,
              height: targetHeight,
              quality: 'better'
            })
            // 圧縮してレスポンスを返す（JPEG形式、品質85）
            return new Response(new Uint8Array(resized.toJPEG(85)), {
              status: 200,
              headers: {
                'Content-Type': 'image/jpeg',
                'Access-Control-Allow-Origin': '*'
              }
            })
          }
        }

        const fileStream = createReadStream(filePath)
        const webStream = Readable.toWeb(fileStream) as ReadableStream

        return new Response(webStream, {
          status: 200,
          headers: {
            'Content-Length': fileSize.toString(),
            'Content-Type': contentType,
            'Accept-Ranges': 'bytes',
            'Access-Control-Allow-Origin': '*'
          }
        })
      }
    } catch (e) {
      console.error(`[DEBUG-MAIN] Protocol Failed to handle media request for ${filePath}:`, e)
      return new Response('File not found', { status: 404 })
    }
  })
}

// ================================================================
//  外部からのファイル起動サポート
//  「このアプリで再生」から渡されたファイルパスを抽出するヘルパー
// ================================================================
const MEDIA_EXTS = new Set([...VIDEO_EXTS, ...IMAGE_EXTS, ...AUDIO_EXTS])

function extractMediaFilesFromArgv(argv: string[]): string[] {
  // Electron の argv には内部フラグが含まれるため、実ファイルパスのみ抽出する
  // 開発環境では最初の引数がアプリ本体パスなので除外、本番環境では1つ目のみ除外
  const skip = is.dev ? 2 : 1
  return argv.slice(skip).filter((arg) => {
    if (arg.startsWith('--') || arg.startsWith('-')) return false
    const ext = extname(arg).toLowerCase()
    return MEDIA_EXTS.has(ext) && existsSync(arg)
  })
}

/**
 * レンダラーが準備完了後に取りに来る初回起動ファイルのリスト。
 * プル方式で渡すため、モジュールスコープで保持する。
 */
let pendingExternalFiles: string[] = []

// ================================================================
//  App 初期化
// ================================================================
const gotTheLock = app.requestSingleInstanceLock()

if (!gotTheLock) {
  app.quit()
} else {
/** 複数ファイルを「このアプリで開く」したとき Windows が1ファイルずつ
 *  second-instance を発火させる場合に備え、200ms バッファで集約する */
let secondInstanceBuffer: string[] = []
let secondInstanceTimer: ReturnType<typeof setTimeout> | null = null

app.on('second-instance', (_event, argv) => {
  const wins = BrowserWindow.getAllWindows()
  if (wins.length === 0) return

  if (wins[0].isMinimized()) wins[0].restore()
  wins[0].focus()

  const files = extractMediaFilesFromArgv(argv)
  if (files.length === 0) return

  // バッファに追加
  secondInstanceBuffer.push(...files)

  // 既存タイマーをリセットして 200ms 後に送信
  if (secondInstanceTimer) clearTimeout(secondInstanceTimer)
  secondInstanceTimer = setTimeout(() => {
    const batch = [...secondInstanceBuffer]
    secondInstanceBuffer = []
    secondInstanceTimer = null
    wins[0].webContents.send('external:open-files', batch)
  }, 200)
})

  app.whenReady().then(() => {
    electronApp.setAppUserModelId('com.jumpswipe')

    app.on('browser-window-created', (_, window) => {
      optimizer.watchWindowShortcuts(window)

      // 開発中のみ F12 で DevTools を開けるようにする
      if (is.dev) {
        window.webContents.on('before-input-event', (_e, input) => {
          if (input.key === 'F12') {
            window.webContents.toggleDevTools()
          }
        })
      }
    })

    registerMediaProtocol()
    loadSearchCache()

    // 初回起動時に OS から渡されたファイルパスをメモリに保持する。
    // プッシュ方式 (ready-to-show で送信) はレンダラーの準備完了前に屡いてメッセージが失われるため、
    // レンダラーが準備完了後に自分で取りに行くプル方式を使用する。
    pendingExternalFiles = extractMediaFilesFromArgv(process.argv)

    // ----------------------------------------------------------------
    //  IPC ハンドラー
    // ----------------------------------------------------------------

    // § folder:open — フォルダ選択ダイアログ
    ipcMain.handle('folder:open', async () => {
      return dialog.showOpenDialog({ properties: ['openDirectory'] })
    })

    // § external:get-initial-files — レンダラーが準備完了後に初回起動ファイルを取りに来るハンドラ
    // 取得後は消去して二重表示を防ぐ
    ipcMain.handle('external:get-initial-files', () => {
      const files = pendingExternalFiles
      pendingExternalFiles = []
      return files
    })

    // § library:scan — 1階層スキャン
    ipcMain.handle(
      'library:scan',
      async (_event, folderPath: string, options: ScanOptions = {}) => {
        return await scanFolder(folderPath, options)
      }
    )

    // § library:getAll — library.json 全件取得
    ipcMain.handle('library:getAll', async () => {
      const library = await loadLibraryAsync()
      return library.series
    })

    // § library:save — library.json 全体保存（フロントエンド主導）
    ipcMain.handle('library:save', async (_event, library: Library) => {
      await saveLibrary(library)
      return { success: true }
    })

    // § series:register — シリーズを library.json に登録（なければ新規）
    ipcMain.handle('series:register', async (_event, folderPath: string) => {
      const library = await loadLibraryAsync()
      let series = library.series.find((s) => s.folderPath === folderPath)
      if (!series) {
        series = { id: nanoid(12), folderPath }
        library.series.push(series)
        await saveLibrary(library)
      }
      return series
    })

    // § series:setMeta — シリーズタイトル・サムネイルを更新
    ipcMain.handle('series:setMeta', async (_event, args: SetSeriesMetaArgs) => {
      const library = await loadLibraryAsync()
      const series = library.series.find((s) => s.id === args.seriesId)
      if (!series) return { success: false, error: 'シリーズが見つかりません' }

      if (args.seriesTitle !== undefined) series.seriesTitle = args.seriesTitle
      if (args.seriesThumbnailBase64 !== undefined)
        series.seriesThumbnailBase64 = args.seriesThumbnailBase64

      // .mvr_index.json にも反映
      const folderIndex = await readFolderIndex(series.folderPath)
      if (args.seriesTitle !== undefined) folderIndex.seriesTitle = args.seriesTitle
      if (args.seriesThumbnailBase64 !== undefined)
        folderIndex.seriesThumbnailBase64 = args.seriesThumbnailBase64
      await writeFolderIndex(series.folderPath, folderIndex)

      await saveLibrary(library)
      return { success: true }
    })

    // § item:setThumbnail — エピソードサムネイルを保存
    ipcMain.handle('item:setThumbnail', async (_event, args: SetThumbnailArgs) => {
      console.log(
        `[DEBUG-MAIN] item:setThumbnail called for ${args.fileName} at seekTime ${args.seekTime}`
      )
      const now = new Date().toISOString()

      // 1. .mvr_index.json 更新
      const folderIndex = await readFolderIndex(args.seriesFolderPath)
      const entry = getOrCreateEntry(args.fileName, folderIndex)
      entry.seekTime = args.seekTime

      // HEROならシリーズサムネイルも更新
      if (folderIndex.heroVideoFilename === args.fileName) {
        folderIndex.seriesThumbnailBase64 = args.thumbnailBase64
      }
      await writeFolderIndex(args.seriesFolderPath, folderIndex)

      // 2. library.json のレジストリを更新
      const library = await loadLibraryAsync()
      if (!library.thumbnailRegistry) library.thumbnailRegistry = []

      let fileSize = 0
      try {
        fileSize = statSync(args.filePath).size
      } catch {
        /* ignore */
      }

      const existingIdx = library.thumbnailRegistry.findIndex(
        (r) => r.fileName === args.fileName && r.fileSize === fileSize
      )

      const newEntry: any = {
        fileName: args.fileName,
        fileSize,
        seekTime: args.seekTime,
        // 画像は保存しないよう強制
        updatedAt: now
      }

      if (existingIdx >= 0) {
        library.thumbnailRegistry[existingIdx] = {
          ...library.thumbnailRegistry[existingIdx],
          ...newEntry
        }
      } else {
        library.thumbnailRegistry.push(newEntry)
      }

      if (library.thumbnailRegistry.length > 1000) library.thumbnailRegistry.shift()
      await saveLibrary(library)

      // 3. .media-thumbnails.json も更新
      try {
        const thumbCache = await readThumbnailCache(args.seriesFolderPath)
        thumbCache[args.fileName] = {
          base64: args.thumbnailBase64,
          seekTime: args.seekTime,
          updatedAt: now
        }
        await writeThumbnailCache(args.seriesFolderPath, thumbCache)
      } catch (e) {
        console.warn(`[item:setThumbnail] Failed to update cache:`, e)
      }

      await syncItemsToBackup([{ fileName: args.fileName, seekTime: args.seekTime }])
      return { success: true }
    })

    // § item:setWatchProgress — 視聴進捗を保存
    ipcMain.handle('item:setWatchProgress', async (_event, args: SetWatchProgressArgs) => {
      const now = new Date().toISOString()
      const folderIndex = await readFolderIndex(args.seriesFolderPath)
      const entry = getOrCreateEntry(args.fileName, folderIndex)
      entry.watchedSeconds = args.watchedSeconds
      entry.watchedAt = now
      if (args.duration !== undefined) entry.duration = args.duration
      await writeFolderIndex(args.seriesFolderPath, folderIndex)

      const library = await loadLibraryAsync()
      const series = library.series.find((s) => s.folderPath === args.seriesFolderPath)
      if (series) {
        series.lastWatchedAt = now
        series.lastWatchedFile = args.fileName
        series.lastWatchedSeconds = args.watchedSeconds
        await saveLibrary(library)
      }
      return { success: true }
    })

    // § series:delete — シリーズを削除
    ipcMain.handle('series:delete', async (_event, seriesId: string) => {
      const library = await loadLibraryAsync()
      library.series = library.series.filter((s) => s.id !== seriesId)
      await saveLibrary(library)
      return { success: true }
    })

    // § file:exists — ファイル存在確認
    ipcMain.handle('file:exists', (_event, filePath: string) => {
      return existsSync(filePath)
    })

    // § folder:findFirstVideo — 最初の動画パスを再帰探索
    ipcMain.handle(
      'folder:findFirstVideo',
      (_event, folderPath: string, options: FindFirstVideoOptions) =>
        findFirstVideoAsync(folderPath, 0, options)
    )

    // § image:openDialog — 画像選択ダイアログ
    ipcMain.handle('image:openDialog', async () => {
      return dialog.showOpenDialog({
        properties: ['openFile'],
        filters: [{ name: '画像', extensions: ['jpg', 'jpeg', 'png', 'webp'] }]
      })
    })

    // § thumbnail:read — サムネイルキャッシュ読み込み
    ipcMain.handle('thumbnail:read', async (_event, folderPath: string) => {
      console.log(`[DEBUG-MAIN] thumbnail:read requested for folder: ${folderPath}`)
      return await readThumbnailCache(folderPath)
    })

    // § thumbnail:write — サムネイルキャッシュ書き込み
    ipcMain.handle('thumbnail:write', async (_event, folderPath: string, data: ThumbnailCache) => {
      console.log(
        `[DEBUG-MAIN] thumbnail:write requested for folder: ${folderPath}, keys count: ${Object.keys(data).length}`
      )
      try {
        await writeThumbnailCache(folderPath, data)
        return { success: true }
      } catch (e) {
        console.error(`[DEBUG-MAIN] thumbnail:write failed:`, e)
        return { success: false }
      }
    })

    // § folder:setThumbnail — 代表サムネイルを保存
    ipcMain.handle(
      'folder:setThumbnail',
      async (_event, args: { folderPath: string; thumbnailBase64: string }) => {
        const index = await readFolderIndex(args.folderPath)
        index.seriesThumbnailBase64 = args.thumbnailBase64
        await writeFolderIndex(args.folderPath, index)
        return { success: true }
      }
    )

    // § series:setHero — HERO動画設定
    ipcMain.handle(
      'series:setHero',
      async (_event, args: { folderPath: string; fileName: string | null }) => {
        const index = await readFolderIndex(args.folderPath)
        index.heroVideoFilename = args.fileName ?? undefined

        if (args.fileName) {
          try {
            const thumbDB = await readThumbnailCache(args.folderPath)
            if (thumbDB[args.fileName]?.base64) {
              index.seriesThumbnailBase64 = thumbDB[args.fileName].base64
            }
          } catch {
            /* ignore */
          }
        } else {
          index.seriesThumbnailBase64 = undefined
        }

        await writeFolderIndex(args.folderPath, index)
        return { success: true }
      }
    )

    // § series:getHero — HERO動画設定取得
    ipcMain.handle('series:getHero', async (_event, folderPath: string) => {
      const index = await readFolderIndex(folderPath)
      return index.heroVideoFilename || null
    })

    // § maintenance:scan — 不整合チェック
    ipcMain.handle('maintenance:scan', async () => {
      const library = await loadLibraryAsync()
      return await scanForIssues(library)
    })

    // § maintenance:applyFix — 修正実行
    ipcMain.handle('maintenance:applyFix', async (_event, issue: MaintenanceIssue) => {
      const library = await loadLibraryAsync()
      const success = await applyMaintenanceFix(library, issue)
      if (success) await saveLibrary(library)
      return { success }
    })

    // § window:toggleFullscreen — フルスクリーン
    ipcMain.handle('window:toggleFullscreen', (event): boolean => {
      const win = BrowserWindow.fromWebContents(event.sender)
      if (win) {
        const isFull = win.isFullScreen()
        win.setFullScreen(!isFull)
        return !isFull
      }
      return false
    })

    // § window:setFullscreen — フルスクリーン指定
    ipcMain.handle('window:setFullscreen', (event, flag: boolean): boolean => {
      const win = BrowserWindow.fromWebContents(event.sender)
      if (win) {
        win.setFullScreen(flag)
        return flag
      }
      return false
    })

    // § library:search — 動画・ファイルの検索
    ipcMain.handle('library:search', async (event, args: SearchArgs): Promise<SearchResult[]> => {
      const { query, scopePath } = args
      const library = await loadLibraryAsync()
      let targetSeries = library.series
      if (scopePath) {
        targetSeries = library.series.filter((s) => scopePath.startsWith(s.folderPath))
      }

      console.log(
        `[DEBUG-SEARCH] === START SEARCH: "${query}" (Scope: ${scopePath || 'Global'}) ===`
      )
      console.log(
        `[DEBUG-SEARCH] Target Series Paths:`,
        targetSeries.map((s) => s.folderPath)
      )

      if (!query) return []
      const kanjiToNum = (s: string) => {
        const map: { [key: string]: string } = {
          一: '1',
          二: '2',
          三: '3',
          四: '4',
          五: '5',
          六: '6',
          七: '7',
          八: '8',
          九: '9',
          〇: '0',
          十: '10'
        }
        return s.replace(/[一二三四五六七八九〇十]/g, (m) => map[m])
      }

      const results: SearchResult[] = []
      const q = query.normalize('NFKC').toLowerCase()
      const qAlt = kanjiToNum(q)

      // 既に見つかったパスを追跡 (重複防止)
      const foundPaths = new Set<string>()

      // ストリーミング用の制御
      let lastSentTime = Date.now()
      const sendUpdate = () => {
        // 重複を除去して送信
        if (results.length > 0) {
          console.log(`[DEBUG-SEARCH] Sending update to UI, count: ${results.length}`)
        }
        event.sender.send('library:search-update', [...results])
        lastSentTime = Date.now()
      }

      console.log(`[DEBUG-SEARCH] Phase 1: Checking cache (Size: ${searchCache.size})...`)
      // --- Phase 1: インメモリキャッシュからの先行検索 ---
      const cacheMatches: SearchResult[] = []
      for (const item of searchCache.values()) {
        const normName = item.fileName.normalize('NFKC').toLowerCase()
        const normNameAlt = kanjiToNum(normName)
        const normTitle = (item.title || '').normalize('NFKC').toLowerCase()
        const normTitleAlt = kanjiToNum(normTitle)

        if (
          normName.includes(q) ||
          normNameAlt.includes(q) ||
          normName.includes(qAlt) ||
          normTitle.includes(q) ||
          normTitleAlt.includes(q) ||
          normTitle.includes(qAlt)
        ) {
          // 存在確認 (キャッシュが古くなっている可能性があるため)
          try {
            await fs.access(item.filePath)
            await fs.access(item.folderPath)
            cacheMatches.push(item)
            foundPaths.add(item.filePath)
          } catch (err) {
            // ファイルまたはフォルダが消えている場合はキャッシュから削除
            console.log(`[DEBUG-SEARCH] Item NOT found on disk, pruning: ${item.filePath}`, err)
            searchCache.delete(item.filePath)
            // 削除したことを永続化するために即座に保存
            await saveSearchCache()
          }
        }
        if (cacheMatches.length >= 100) break
      }

      if (cacheMatches.length > 0) {
        results.push(...cacheMatches)
        sendUpdate() // キャッシュヒット分を即座に表示
      }

      // Home ショートカットの判定
      const homeKeywords = ['home', 'ほめ', 'ほーむ', 'ホーム']
      if (homeKeywords.some((k) => q.includes(k) || qAlt.includes(k))) {
        results.push({
          id: 'home-shortcut',
          fileName: 'Home',
          filePath: '',
          targetFolderPath: '',
          folderPath: '',
          relativeFolderPath: '',
          seriesId: '',
          seriesTitle: '',
          type: 'folder',
          title: 'ホーム画面に戻る',
          isHomeShortcut: true
        })
      }

      // --- Phase 2: 物理スキャン (未踏フォルダの探索) ---
      // キャッシュにない新しいファイルを見つけるために、実際にディスクを走査する。
      // 【探索戦略: 幅優先探索 (BFS) + 新着優先深掘り】
      // 1. 基本は幅優先で各シリーズを浅く広く巡回し、全体の網羅性を高める。
      // 2. キャッシュに存在しない（＝新着）フォルダを見つけた場合は、そのサブフォルダを
      //    キューの最前列に挿入 (unshift) することで、即座にその中身を徹底的に調べる。
      // 3. すでに記録があるフォルダはキューの最後尾に追加 (push) し、後回しにする。
      let totalFoldersSearched = 0
      const MAX_FOLDERS_PER_SEARCH = 100000
      const MAX_RESULTS_LIMIT = 1000

      const currentScanItems = new Map<string, SearchResult>()
      const fullyScannedFolders = new Set<string>()

      const queue: { dir: string; depth: number; isNew?: boolean }[] = []
      for (const series of [...targetSeries].reverse()) {
        queue.push({ dir: series.folderPath, depth: 0 })
      }

      while (queue.length > 0) {
        const { dir, depth: currentDepth } = queue.shift()!

        if (currentDepth > 20 || totalFoldersSearched > MAX_FOLDERS_PER_SEARCH) continue
        totalFoldersSearched++
        fullyScannedFolders.add(dir)

        // 定期的にイベントループを解放
        if (totalFoldersSearched % 100 === 0) await yieldToEventLoop()

        try {
          // 1. フォルダ自体をチェック
          const folderName = dir.split(/[\\/]/).filter(Boolean).pop() || ''
          const normFolderName = folderName.normalize('NFKC').toLowerCase()
          const normFolderNameAlt = kanjiToNum(normFolderName)

          const series = targetSeries.find((s) => dir.startsWith(s.folderPath))
          if (!series) continue

          const folderRes: SearchResult = {
            id: `folder-${series.id}-${dir}`,
            fileName: folderName,
            filePath: dir,
            targetFolderPath: dir,
            folderPath: dir,
            relativeFolderPath: dir.slice(series.folderPath.length).replace(/^[\\/]/, ''),
            seriesId: series.id,
            seriesTitle: series.seriesTitle || series.folderPath.split(/[\\/]/).pop() || '',
            type: 'folder'
          }
          currentScanItems.set(dir, folderRes)

          // マッチチェック
          if (
            normFolderName.includes(q) ||
            normFolderNameAlt.includes(q) ||
            normFolderName.includes(qAlt)
          ) {
            if (!foundPaths.has(dir) && results.length < MAX_RESULTS_LIMIT) {
              results.push(folderRes)
              foundPaths.add(dir)
              if (Date.now() - lastSentTime > 100) sendUpdate()
            }
          }

          if (results.length >= MAX_RESULTS_LIMIT) break

          // 2. フォルダ内の中身を探索
          const entries = await fs
            .readdir(dir, { withFileTypes: true })
            .catch(() => [] as import('fs').Dirent[])
          const indexPath = join(dir, INDEX_FILENAME)

          let fileItems: { fileName: string; title?: string; isDirectory?: boolean }[] = []
          let indexExists = false
          try {
            await fs.access(indexPath)
            indexExists = true
          } catch {
            /* ignore */
          }

          if (indexExists) {
            try {
              const indexData = await fs.readFile(indexPath, 'utf-8')
              const index: FolderIndex = JSON.parse(indexData)
              if (index.items) fileItems = index.items
            } catch (e) {
              console.error(`Failed to read index at ${indexPath}:`, e)
            }
          }

          if (fileItems.length === 0) {
            fileItems = entries
              .filter((e) => !e.name.startsWith('.') && !e.name.startsWith('$'))
              .map((e) => ({ fileName: e.name, isDirectory: e.isDirectory() }))
          }

          const subDirsToEnQueue: string[] = []

          for (const item of fileItems) {
            const name = item.fileName
            const fullPath = join(dir, name)

            let isDirectory = item.isDirectory
            if (isDirectory === undefined) {
              try {
                const stats = await fs.stat(fullPath)
                isDirectory = stats.isDirectory()
              } catch {
                isDirectory = false
              }
            }

            if (isDirectory) {
              if (!name.startsWith('.') && !name.startsWith('$')) {
                subDirsToEnQueue.push(name)
              }
              continue
            }

            // ファイルの一致チェック
            const normName = name.normalize('NFKC').toLowerCase()
            const normNameAlt = kanjiToNum(normName)
            const normTitle = (item.title || '').normalize('NFKC').toLowerCase()
            const normTitleAlt = kanjiToNum(normTitle)

            const ext = extname(name).toLowerCase()
            if (
              ext &&
              (VIDEO_EXTS.includes(ext) || IMAGE_EXTS.includes(ext) || AUDIO_EXTS.includes(ext))
            ) {
              let type: 'video' | 'image' | 'audio' = 'video'
              if (IMAGE_EXTS.includes(ext)) type = 'image'
              else if (AUDIO_EXTS.includes(ext)) type = 'audio'

              const fileRes: SearchResult = {
                id: `${series.id}-${dir}-${name}`,
                fileName: name,
                filePath: fullPath,
                targetFolderPath: dir,
                folderPath: dir,
                relativeFolderPath: dir.slice(series.folderPath.length).replace(/^[\\/]/, ''),
                seriesId: series.id,
                seriesTitle: series.seriesTitle || series.folderPath.split(/[\\/]/).pop() || '',
                type,
                title: item.title
              }
              currentScanItems.set(fullPath, fileRes)

              if (
                normName.includes(q) ||
                normNameAlt.includes(q) ||
                normName.includes(qAlt) ||
                normTitle.includes(q) ||
                normTitleAlt.includes(q) ||
                normTitle.includes(qAlt)
              ) {
                if (!foundPaths.has(fullPath) && results.length < MAX_RESULTS_LIMIT) {
                  results.push(fileRes)
                  foundPaths.add(fullPath)
                  if (Date.now() - lastSentTime > 100) sendUpdate()
                }
              }
            }
          }

          // サブフォルダをキューに追加
          for (const subDirName of subDirsToEnQueue) {
            const subPath = join(dir, subDirName)
            // キャッシュにないフォルダは「新着」として優先度を上げる（リストの先頭へ）
            const isSubNew = !searchCache.has(subPath)
            if (isSubNew) {
              queue.unshift({ dir: subPath, depth: currentDepth + 1, isNew: true })
            } else {
              queue.push({ dir: subPath, depth: currentDepth + 1 })
            }
          }
        } catch (error) {
          console.error(`Search failed in ${dir}:`, error)
        }
      }

      // 最後に未送信分があれば送信
      sendUpdate()

      // --- Phase 3: キャッシュの突き合わせと更新 ---
      // 登録解除されたシリーズの情報をキャッシュから完全削除 (登録し直した際のID不整合対策)
      const validSeriesIds = new Set(library.series.map((s) => s.id))
      for (const [path, result] of searchCache.entries()) {
        if (result.seriesId && !validSeriesIds.has(result.seriesId)) {
          searchCache.delete(path)
        }
      }

      // 別配列（Map）を作って更新する方針
      // ★ ここで再度最新の searchCache (Phase 1 での削除が反映されたもの) を元にする
      const nextCache = new Map<string, SearchResult>(searchCache)

      // スキャンした範囲について、現在の実態に合わせてキャッシュを更新
      const scannedPaths = Array.from(currentScanItems.keys()).sort()
      const cachedPathsInScope = Array.from(searchCache.keys())
        .filter((p) => {
          const res = searchCache.get(p)
          // 1. 今回走査したフォルダの直下にあるアイテム、または
          // 2. 今回走査したフォルダそのもの
          // のみを取り出す（走査していない場所のキャッシュを保護するため）
          return res && (fullyScannedFolders.has(res.folderPath) || fullyScannedFolders.has(p))
        })
        .sort()

      // ソート済み配列の突き合わせ (2ポインタ)
      let i = 0,
        j = 0
      while (i < scannedPaths.length || j < cachedPathsInScope.length) {
        const pScan = i < scannedPaths.length ? scannedPaths[i] : null
        const pCache = j < cachedPathsInScope.length ? cachedPathsInScope[j] : null

        if (pScan && (!pCache || pScan < pCache)) {
          // 新規発見: キャッシュに追加
          nextCache.set(pScan, currentScanItems.get(pScan)!)
          i++
        } else if (pCache && (!pScan || pCache < pScan)) {
          // キャッシュにあるが実体がない: 削除
          nextCache.delete(pCache)
          j++
        } else {
          // 両方にある: 内容を更新
          nextCache.set(pScan!, currentScanItems.get(pScan!)!)
          i++
          j++
        }
      }

      // 元のキャッシュを上書き
      searchCache.clear()
      for (const [k, v] of nextCache) {
        searchCache.set(k, v)
      }
      await saveSearchCache()

      // フォルダごとのヒット数を集計 (ファイルのみ)
      const folderHitCounts = new Map<string, number>()
      for (const r of results) {
        if (r.type !== 'folder') {
          folderHitCounts.set(
            r.targetFolderPath,
            (folderHitCounts.get(r.targetFolderPath) || 0) + 1
          )
        }
      }

      // 重複を避けるための処理（すでにフォルダとしてヒットしているものはショートカットを作らない）
      const folderHitPaths = new Set(
        results.filter((r) => r.type === 'folder').map((r) => r.filePath)
      )

      const finalResults: SearchResult[] = []
      const processedShortcutFolders = new Set<string>()

      for (const r of results) {
        if (r.type === 'folder') {
          // フォルダ名自体がヒットしたものは必ず表示
          finalResults.push(r)
        } else {
          // ファイルヒット時、そのフォルダがまだフォルダとしてヒットしておらず、かつ5件以上ならショートカットを挿入
          const count = folderHitCounts.get(r.targetFolderPath) || 0
          if (
            count >= 5 &&
            !folderHitPaths.has(r.targetFolderPath) &&
            !processedShortcutFolders.has(r.targetFolderPath)
          ) {
            finalResults.push({
              id: `shortcut-${r.targetFolderPath}`,
              fileName: r.targetFolderPath.split(/[\\/]/).pop() || '',
              filePath: r.targetFolderPath,
              targetFolderPath: r.targetFolderPath,
              folderPath: r.targetFolderPath,
              relativeFolderPath: r.relativeFolderPath,
              seriesId: r.seriesId,
              seriesTitle: r.seriesTitle,
              type: 'folder',
              title: `このフォルダを表示 (${count}件の一致)`,
              isShortcut: true
            })
            processedShortcutFolders.add(r.targetFolderPath)
          }
          finalResults.push(r)
        }
      }

      // 現在のライブラリに存在するシリーズのみを抽出 (削除済みシリーズのキャッシュ混入対策)
      const filteredResults = finalResults.filter(
        (r) => r.isHomeShortcut || validSeriesIds.has(r.seriesId)
      )

      // 【最終チェック】UIに返す前に実体の存在を100%保証する (非同期一括チェック)
      const existences = await Promise.all(
        filteredResults.map(async (r) => {
          if (r.isHomeShortcut) return true
          try {
            await fs.access(r.filePath)
            return true
          } catch {
            // 見つからない場合はキャッシュからも即座に消去しておく
            searchCache.delete(r.filePath)
            return false
          }
        })
      )
      const validResults = filteredResults.filter((_, idx) => existences[idx])

      console.log(`[DEBUG-SEARCH] === END SEARCH: "${query}" (Found: ${validResults.length}) ===`)
      return validResults
    })

    // § library:getSettings — 設定を取得
    ipcMain.handle('library:getSettings', async () => {
      const library = await loadLibraryAsync()
      return library.settings
    })

    // § library:updateSettings — 設定を更新
    ipcMain.handle('library:updateSettings', async (_event, settings: any) => {
      const library = await loadLibraryAsync()
      library.settings = settings
      await saveLibrary(library)
      return { success: true }
    })

    // ウィンドウを作成し、初回起動時のファイルがあれば表示後に送信
    const win = new BrowserWindow({
      width: 1400,
      height: 900,
      show: false,
      autoHideMenuBar: true,
      icon: nativeImage.createFromPath(
        process.platform === 'win32' ? join(__dirname, '../../resources/icon.ico') : icon
      ),
      webPreferences: {
        preload: join(__dirname, '../preload/index.js'),
        sandbox: false
      }
    })

    win.on('ready-to-show', () => {
      win.show()
      // ready-to-show でのプッシュ送信は廃止。
      // レンダラーが external:get-initial-files を呼び出して取りに来る。
    })

    win.webContents.setWindowOpenHandler((details) => {
      shell.openExternal(details.url)
      return { action: 'deny' }
    })

    if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
      win.loadURL(process.env['ELECTRON_RENDERER_URL'])
    } else {
      win.loadFile(join(__dirname, '../renderer/index.html'))
    }

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow()
    })
  })

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit()
  })
}
