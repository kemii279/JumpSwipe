/**
 * thumbnailCache.ts
 * 動画サムネイルを非同期生成し、フォルダ単位の JSON ファイルに保存する。
 *
 * 保存先: <folderPath>/.media-thumbnails.json
 * フォーマット:
 *   { [fileName]: { base64, seekTime, updatedAt } }
 *
 * 同時実行数を MAX_CONCURRENT に制限し、UI スレッドの詰まりを防ぐ。
 */
import { DEFAULT_SEEK_TIME, type FindFirstVideoOptions } from '../../../types/media'

const CANVAS_WIDTH = 400 // px（仕様書準拠）
const WEBP_QUALITY = 0.82

// ---- 型 ----
export interface ThumbnailEntry {
  base64: string
  seekTime: number
  updatedAt: string
}
export type ThumbnailDB = Record<string, ThumbnailEntry>

// ---- インメモリキャッシュ（フォルダパス → DB） ----
const memoryCache = new Map<string, ThumbnailDB>()
const loadingPromises = new Map<string, Promise<ThumbnailDB>>()

// ---- コンカレンシーセマフォ (動画用と画像用で分離) ----
const MAX_CONCURRENT_VIDEO = 4
const MAX_CONCURRENT_IMAGE = 4

let _runningVideo = 0
const _waitQueueVideo: Array<() => void> = []

function _acquireVideo(): Promise<void> {
  return new Promise((resolve) => {
    if (_runningVideo < MAX_CONCURRENT_VIDEO) {
      _runningVideo++
      resolve()
    } else {
      _waitQueueVideo.push(() => {
        _runningVideo++
        resolve()
      })
    }
  })
}
async function _releaseVideo(): Promise<void> {
  _runningVideo--
  // 次のタスクを開始する前にイベントループを解放（カクつき防止）
  await new Promise((r) => setTimeout(r, 40))
  const next = _waitQueueVideo.shift()
  if (next) next()
}

let _runningImage = 0
const _waitQueueImage: Array<() => void> = []

function _acquireImage(): Promise<void> {
  return new Promise((resolve) => {
    if (_runningImage < MAX_CONCURRENT_IMAGE) {
      _runningImage++
      resolve()
    } else {
      _waitQueueImage.push(() => {
        _runningImage++
        resolve()
      })
    }
  })
}
async function _releaseImage(): Promise<void> {
  _runningImage--
  // 次のタスクを開始する前にイベントループを解放（カクつき防止）
  await new Promise((r) => setTimeout(r, 40))
  const next = _waitQueueImage.shift()
  if (next) next()
}

/**
 * サムネイル生成のキュー状態を取得（負荷計測用）
 */
export function getThumbnailQueueStatus(): {
  video: { running: number; waiting: number }
  image: { running: number; waiting: number }
} {
  return {
    video: {
      running: _runningVideo,
      waiting: _waitQueueVideo.length
    },
    image: {
      running: _runningImage,
      waiting: _waitQueueImage.length
    }
  }
}

// ---- パスユーティリティ ----
export function parentFolder(filePath: string): string {
  const last = Math.max(filePath.lastIndexOf('/'), filePath.lastIndexOf('\\'))
  return last === -1 ? '' : filePath.substring(0, last)
}
export function fileName(filePath: string): string {
  return filePath.replace(/.*[/\\]/, '')
}

// ---- DB 読み書き ----
async function loadDB(folderPath: string): Promise<ThumbnailDB> {
  // 1. すでにメモリにある
  if (memoryCache.has(folderPath)) return memoryCache.get(folderPath)!

  // 2. 現在読み込み中ならその Promise を待つ (Thundering Herd 対策)
  if (loadingPromises.has(folderPath)) return loadingPromises.get(folderPath)!

  // 3. 新規読み込み
  const promise = (async () => {
    try {
      const db = (await window.api.readThumbnailCache(folderPath)) as ThumbnailDB

      // メモリ節約のため、キャッシュが大きくなりすぎたら古いものから削除 (FIFO)
      if (memoryCache.size >= 20) {
        const firstKey = memoryCache.keys().next().value
        if (firstKey) memoryCache.delete(firstKey)
      }

      memoryCache.set(folderPath, db)
      return db
    } catch {
      const empty: ThumbnailDB = {}
      memoryCache.set(folderPath, empty)
      return empty
    } finally {
      loadingPromises.delete(folderPath)
    }
  })()

  loadingPromises.set(folderPath, promise)
  return promise
}

async function saveDB(folderPath: string, db: ThumbnailDB): Promise<void> {
  memoryCache.set(folderPath, db)
  await window.api.writeThumbnailCache(folderPath, db)
}

// ---- 動画/画像フレームキャプチャ ----
function captureFrame(videoUrl: string, seekTime: number, name: string): Promise<string> {
  console.log(
    `[DEBUG-THUMB] Starting captureFrame for ${name} at seekTime ${seekTime}s, videoUrl: ${videoUrl}`
  )
  return new Promise((resolve, reject) => {
    const video = document.createElement('video')
    video.src = videoUrl
    video.muted = true
    video.preload = 'metadata'

    const cleanup = () => {
      video.onloadedmetadata = null
      video.onseeked = null
      video.onerror = null
      video.src = ''
      video.load() // リソース解放
    }

    video.onloadedmetadata = () => {
      console.log(
        `[DEBUG-THUMB] Metadata loaded for ${name}. Duration: ${video.duration}s. Seeking to: Math.min(${seekTime}, ${Math.max(0, video.duration - 0.5)})`
      )
      // 動画長より短い位置にシーク
      video.currentTime = Math.min(seekTime, Math.max(0, video.duration - 0.5))
    }

    video.onseeked = () => {
      console.log(
        `[DEBUG-THUMB] Seeked to ${video.currentTime}s for ${name}. Attempting to draw to canvas.`
      )
      // 黒画面対策: seeked イベント直後はまだフレームがレンダリングされていないことがあるため、少し待つ
      setTimeout(() => {
        try {
          const canvas = document.createElement('canvas')
          const aspect = video.videoWidth > 0 ? video.videoHeight / video.videoWidth : 9 / 16
          canvas.width = CANVAS_WIDTH
          canvas.height = Math.round(CANVAS_WIDTH * aspect)

          const ctx = canvas.getContext('2d')
          if (!ctx) {
            cleanup()
            reject(new Error('canvas ctx unavailable'))
            return
          }
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
          const base64 = canvas.toDataURL('image/webp', WEBP_QUALITY)

          // 真っ黒な画像（データが極端に小さい場合）はエラーとして弾く
          if (base64.length < 1000) {
            console.error(
              `[DEBUG-THUMB] Generated base64 is too small (${base64.length} bytes), likely a black frame.`
            )
            cleanup()
            reject(new Error('black frame detected'))
            return
          }

          console.log(
            `[DEBUG-THUMB] Successfully captured frame for ${name}, base64 length: ${base64.length}`
          )
          cleanup()
          resolve(base64)
        } catch (e) {
          console.error(`[DEBUG-THUMB] Exception during canvas operations for ${name}:`, e)
          cleanup()
          reject(e)
        }
      }, 50)
    }

    video.onerror = (e) => {
      console.error(`[DEBUG-THUMB] Video element error for ${name}:`, video.error, e)
      cleanup()
      reject(e)
    }

    // タイムアウト 10 秒
    setTimeout(() => {
      console.error(
        `[DEBUG-THUMB] Thumbnail generation timeout for ${name} after 10000ms. video.readyState=${video.readyState}, video.error=${video.error}`
      )
      cleanup()
      reject(new Error('thumbnail timeout'))
    }, 10000)

    video.load()
  })
}

function captureImageFrame(imageUrl: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'

    img.onload = () => {
      try {
        const canvas = document.createElement('canvas')
        const aspect = img.width > 0 ? img.height / img.width : 9 / 16
        canvas.width = CANVAS_WIDTH
        canvas.height = Math.round(CANVAS_WIDTH * aspect)
        const ctx = canvas.getContext('2d')
        if (!ctx) {
          reject(new Error('canvas ctx unavailable'))
          return
        }
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
        const base64 = canvas.toDataURL('image/webp', WEBP_QUALITY)
        resolve(base64)
      } catch (e) {
        reject(e)
      }
    }

    img.onerror = (e) => reject(e)

    setTimeout(() => reject(new Error('image thumbnail timeout')), 10000)

    img.src = imageUrl
  })
}

// ---- 公開 API ----

/**
 * 動画・画像ファイルのサムネイルを取得する（キャッシュ優先、なければ生成して保存）。
 */
export async function getCachedThumbnail(
  mediaFilePath: string,
  mediaUrl: string,
  rawSeekTime = DEFAULT_SEEK_TIME,
  type: 'video' | 'image' = 'video'
): Promise<string> {
  const seekTime =
    typeof rawSeekTime === 'number' && !isNaN(rawSeekTime) ? rawSeekTime : DEFAULT_SEEK_TIME
  const folder = parentFolder(mediaFilePath)
  const name = fileName(mediaFilePath)
  if (!folder || !name) {
    console.warn(`[DEBUG-THUMB] getCachedThumbnail invalid path: ${mediaFilePath}`)
    return ''
  }

  console.log(
    `[DEBUG-THUMB] getCachedThumbnail requested for: ${name}, type: ${type}, seekTime: ${seekTime}`
  )

  // Phase 1: キャッシュ確認
  const db = await loadDB(folder)
  const entry = db[name]

  if (type === 'image') {
    if (entry && entry.base64) {
      return entry.base64
    }

    // 画像の場合：UIのレスポンス（体験）優先のため、元画像のURLを即座に返し、
    // 裏で非同期にサムネイル生成を行う（Fire and Forget）
    ;(async () => {
      await _acquireImage()

      try {
        const base64 = await captureImageFrame(mediaUrl)

        if (!base64) return

        const newEntry: ThumbnailEntry = {
          base64,
          seekTime: 0,
          updatedAt: new Date().toISOString()
        }

        // 最新 DB を再取得してマージ
        const freshDB = await loadDB(folder)
        freshDB[name] = newEntry
        await saveDB(folder, freshDB)
      } catch (e) {
        console.error(`[Thumbnail] Image generation failed for ${name}:`, e)
      } finally {
        _releaseImage()
      }
    })()

    return mediaUrl
  } else {
    // 0.01秒の誤差を許容
    if (entry && Math.abs((entry.seekTime ?? 0) - seekTime) < 0.01 && entry.base64) {
      console.log(`[DEBUG-THUMB] Cache HIT for video ${name} at seekTime ${seekTime}.`)
      return entry.base64
    }

    console.log(
      `[DEBUG-THUMB] Cache MISS for video ${name} at seekTime ${seekTime}. Proceeding to capture.`
    )
    await _acquireVideo()

    try {
      console.log(`[DEBUG-THUMB] Acquired video semaphore for ${name}. Starting capture.`)
      // Phase 3: フレームキャプチャ
      const base64 = await captureFrame(mediaUrl, seekTime, name)

      if (!base64) {
        console.warn(`[DEBUG-THUMB] captureFrame returned empty base64 for ${name}`)
        return ''
      }

      console.log(`[DEBUG-THUMB] Saving generated thumbnail for ${name} to DB.`)
      // Phase 4: DB 保存
      const newEntry: ThumbnailEntry = {
        base64,
        seekTime,
        updatedAt: new Date().toISOString()
      }
      const freshDB = await loadDB(folder)
      freshDB[name] = newEntry
      await saveDB(folder, freshDB)

      return base64
    } catch (e) {
      console.error(`[Thumbnail] Generation failed for ${name}:`, e)
      return ''
    } finally {
      _releaseVideo()
    }
  }
}

/**
 * フォルダの代表サムネイルを取得する。
 * 1. フォルダ内の最初の動画を再帰探索
 * 2. その動画の thumbnail キャッシュを返す（なければ生成）
 */
export async function getFolderThumbnail(
  folderPath: string,
  options: FindFirstVideoOptions = {}
): Promise<string> {
  try {
    const result = await window.api.findFirstVideo(folderPath, options)
    if (!result) return ''

    // すでに Base64 サムネイルが解決されている（インデックスにあった）場合は即座に返す
    if (result.thumbnailBase64) return result.thumbnailBase64

    // ファイルパスが見つかった場合は従来通り生成・キャッシュ確認を行う
    if (result.filePath) {
      const { fileToMediaUrl } = await import('./thumbnail')
      const mediaUrl = fileToMediaUrl(result.filePath)
      return await getCachedThumbnail(
        result.filePath,
        mediaUrl,
        result.seekTime ?? DEFAULT_SEEK_TIME,
        result.type ?? 'video'
      )
    }

    return ''
  } catch {
    return ''
  }
}

/**
 * メモリキャッシュを直接更新する（プレイヤーでの手動キャプチャ時などに使用）
 */
export function updateMemoryCache(videoFilePath: string, base64: string, seekTime: number): void {
  const folder = parentFolder(videoFilePath)
  const name = fileName(videoFilePath)
  if (!folder || !name) return

  const db = memoryCache.get(folder) || {}
  db[name] = {
    base64,
    seekTime,
    updatedAt: new Date().toISOString()
  }
  memoryCache.set(folder, db)
}

/**
 * インメモリキャッシュをクリア（フォルダ再スキャン後などに使用）
 */
export function clearMemoryCache(folderPath?: string): void {
  if (folderPath) memoryCache.delete(folderPath)
  else memoryCache.clear()
}
