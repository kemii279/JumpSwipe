/**
 * externalPlayerStore.ts
 *
 * 外部からの「このアプリで再生」に対応する一時的な再生状態を管理するストア。
 *
 * 【設計上の制約】
 * - playerStore とは完全に独立しており、相互に干渉しない。
 * - 視聴履歴・視聴進捗・サムネイルの保存は一切行わない。
 * - アプリを閉じるかプレイヤーを閉じると、状態は完全にリセットされる。
 * - ライブラリ検索は再生をブロックせずバックグラウンドで行い、
 *   一致が見つかった場合のみバナー通知を表示する。
 */

import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { useLibraryStore } from './libraryStore'
import type { SearchResult } from '../../../types/media'

/** ファイルパスから拡張子（ドット付き）を返す */
function extname(filePath: string): string {
  const idx = filePath.lastIndexOf('.')
  const sep = Math.max(filePath.lastIndexOf('/'), filePath.lastIndexOf('\\'))
  return idx > sep ? filePath.slice(idx) : ''
}

export type ExternalFileType = 'video' | 'image' | 'audio'

export interface ExternalFile {
  /** ファイルの絶対パス */
  filePath: string
  /** ファイル名（表示用） */
  fileName: string
  /** ファイルタイプ */
  type: ExternalFileType
  /** media:// プロトコル経由のURL */
  mediaUrl: string
}

const VIDEO_EXTS = new Set(['.mp4', '.mkv', '.avi', '.mov', '.webm', '.m4v', '.flv'])
const IMAGE_EXTS = new Set(['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp', '.tiff', '.avif'])
const AUDIO_EXTS = new Set(['.mp3', '.flac', '.wav', '.aac', '.ogg', '.m4a', '.opus'])

function detectType(filePath: string): ExternalFileType | null {
  const ext = extname(filePath).toLowerCase()
  if (VIDEO_EXTS.has(ext)) return 'video'
  if (IMAGE_EXTS.has(ext)) return 'image'
  if (AUDIO_EXTS.has(ext)) return 'audio'
  return null
}

function toMediaUrl(filePath: string): string {
  return `media://local/${encodeURIComponent(filePath.replace(/\\/g, '/'))}`
}

export const useExternalPlayerStore = defineStore('externalPlayer', () => {
  const library = useLibraryStore()

  /** モーダルが開いているか */
  const isOpen = ref(false)

  /** 一時ファイルリスト */
  const files = ref<ExternalFile[]>([])

  /** 現在再生中のインデックス */
  const currentIndex = ref(0)

  /** 再生中かどうか */
  const isPlaying = ref(false)

  /** ライブラリ検索でファイルが見つかった場合の結果 */
  const libraryMatch = ref<SearchResult | null>(null)

  /** バナー通知の表示フラグ */
  const showLibraryBanner = ref(false)

  /** 現在のファイル */
  const currentFile = computed<ExternalFile | null>(() => files.value[currentIndex.value] ?? null)

  /**
   * 外部ファイルを受け取り、一時プレイヤーを起動する。
   * 既に開いている場合は破棄して再生成（Q2の仕様）。
   */
  function openFiles(filePaths: string[]): void {
    // 既存の一時プレイヤーがあれば破棄（再生成）
    if (isOpen.value) {
      resetState()
    }

    const parsed: ExternalFile[] = filePaths
      .map((p) => {
        const type = detectType(p)
        if (!type) return null
        const fileName = p.split(/[\\/]/).pop() ?? p
        return { filePath: p, fileName, type, mediaUrl: toMediaUrl(p) }
      })
      .filter((f): f is ExternalFile => f !== null)

    if (parsed.length === 0) return

    files.value = parsed
    currentIndex.value = 0
    isPlaying.value = true
    isOpen.value = true

    // 複数ファイル指定時はライブラリ検索は一切行わない。
    // 単一ファイルの場合のみ、動画ファイルかどうか検索する。
    if (parsed.length === 1) {
      const firstVideo = parsed.find((f) => f.type === 'video')
      if (firstVideo) {
        searchLibraryInBackground(firstVideo.filePath, firstVideo.fileName)
      }
    }
  }

  /**
   * ライブラリ内に同一ファイルが存在するか非同期で検索する。
   * 見つかった場合はバナーを表示する（再生はブロックしない）。
   */
  async function searchLibraryInBackground(filePath: string, fileName: string): Promise<void> {
    try {
      // 拡張子を除いたファイル名で検索
      const query = fileName.replace(/\.[^/.]+$/, '')
      console.log('[ExternalPlayer] Searching library for:', query, '| filePath:', filePath)
      const results = await library.search({ query })
      console.log(
        '[ExternalPlayer] Search results:',
        results.length,
        results.map((r) => r.filePath)
      )

      // パスが完全一致するものだけ信頼する（同名ファイルの誤検知を防ぐ）
      const normalizedTarget = filePath.replace(/\\/g, '/').toLowerCase()
      const match = results.find(
        (r) => r.filePath.replace(/\\/g, '/').toLowerCase() === normalizedTarget
      )
      console.log('[ExternalPlayer] Match found:', !!match, match?.filePath)

      if (match) {
        libraryMatch.value = match
        showLibraryBanner.value = true
      }
    } catch (e) {
      // 検索失敗は無視（一時再生には影響しない）
      console.warn('[ExternalPlayer] Library search failed:', e)
    }
  }

  function setPlaying(v: boolean): void {
    isPlaying.value = v
  }

  function next(): void {
    if (currentIndex.value < files.value.length - 1) {
      currentIndex.value++
      isPlaying.value = true
    }
  }

  function prev(): void {
    if (currentIndex.value > 0) {
      currentIndex.value--
      isPlaying.value = true
    }
  }

  function dismissBanner(): void {
    showLibraryBanner.value = false
  }

  function close(): void {
    resetState()
  }

  function resetState(): void {
    isOpen.value = false
    files.value = []
    currentIndex.value = 0
    isPlaying.value = false
    libraryMatch.value = null
    showLibraryBanner.value = false
  }

  return {
    isOpen,
    files,
    currentIndex,
    isPlaying,
    currentFile,
    libraryMatch,
    showLibraryBanner,
    openFiles,
    setPlaying,
    next,
    prev,
    dismissBanner,
    close
  }
})
