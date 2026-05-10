// src/types/media.ts
// 仕様書 §9-3 に基づく型定義

export type ContentType = 'folder' | 'video' | 'image' | 'audio'

// ================================================================
//  MediaItem — スキャン結果の単一エントリ
// ================================================================
export interface MediaItem {
  id: string
  fileName: string
  filePath: string
  type: ContentType
  title?: string
  duration?: number // 動画・音声のみ（秒）
  watchedSeconds?: number // 動画のみ
  watchedAt?: string // ISO8601
  thumbnailBase64?: string // 動画のみ（data:image/webp;base64,...）
  seekTime?: number // 動画のみ：サムネ生成に使用した秒数
  fileSize?: number // バイト数
}

// ================================================================
//  FolderIndex — フォルダ内 .mvr_index.json の構造
// ================================================================
export interface FolderIndexEntry {
  fileName: string
  title?: string
  duration?: number
  watchedSeconds?: number
  watchedAt?: string
  seekTime?: number // サムネ生成に使用した秒数（Thumbnail_Creation_Specifications.md §2）
}

export interface FolderIndex {
  version: number
  folderPath: string
  seriesTitle?: string
  seriesThumbnailBase64?: string
  heroVideoFilename?: string // 追加
  items: FolderIndexEntry[]
}

// ================================================================
//  SeriesEntry — library.json の各シリーズエントリ
// ================================================================
export interface SeriesEntry {
  id: string
  folderPath: string
  seriesTitle?: string
  seriesThumbnailBase64?: string
  lastWatchedAt?: string
  lastWatchedFile?: string
  lastWatchedSeconds?: number
}

// ================================================================
//  ThumbnailRegistryEntry — メインDB用の共通サムネ保管
// ================================================================
export interface ThumbnailRegistryEntry {
  fileName: string
  fileSize: number
  duration?: number
  seekTime: number
  thumbnailBase64?: string // 非推奨 (今後は保存しない)
  updatedAt: string // ISO8601
}

// ================================================================
//  ThumbnailCache — .media-thumbnails.json の構造
// ================================================================
export interface ThumbnailCacheEntry {
  base64: string
  seekTime: number
  updatedAt: string
}

export type ThumbnailCache = Record<string, ThumbnailCacheEntry>

export interface AppSettings {
  scrollSpeed: number
  videoSkipBack: number
  videoSkipForward: number
}

// ================================================================
//  Library — library.json の全体構造
// ================================================================
export interface Library {
  version: number
  series: SeriesEntry[]
  thumbnailRegistry?: ThumbnailRegistryEntry[] // 追加
  settings?: AppSettings // 追加
}

// ================================================================
//  ScanResult — library:scan IPC の戻り値
// ================================================================
export interface ScanOptions {
  skipMaintenance?: boolean
}

export interface ScanResult {
  folders: MediaItem[] // サブフォルダ（先に表示）
  videos: MediaItem[] // 動画ファイル
  images: MediaItem[] // 画像ファイル
  audios: MediaItem[] // 音声ファイル
  hero?: FirstVideoResult | null // ヒーローコンテンツ（追加）
  missingCount?: number // 実体のないインデックス数
  missingItems?: string[] // 実体のないファイル名のリスト
  error?: string
  scanDurationMs?: number // スキャンにかかった時間（ミリ秒）
}

// ================================================================
//  FolderDialogResult — folder:open IPC の戻り値
// ================================================================
export interface FolderDialogResult {
  canceled: boolean
  filePaths: string[]
}

// ================================================================
//  SetThumbnailArgs / SetWatchProgressArgs — IPC 引数
// ================================================================
export interface SetThumbnailArgs {
  /** エピソードのファイルパス（フォルダパスの導出に使用） */
  filePath: string
  /** 動画ファイル名 */
  fileName: string
  /** data:image/webp;base64,... 形式 */
  thumbnailBase64: string
  /** サムネ生成に使用した秒数 */
  seekTime: number
  /** 所属シリーズの folderPath */
  seriesFolderPath: string
}

export interface SetWatchProgressArgs {
  filePath: string
  fileName: string
  seriesFolderPath: string
  watchedSeconds: number
  duration?: number
}

export interface SetSeriesMetaArgs {
  seriesId: string
  seriesTitle?: string
  seriesThumbnailBase64?: string
}

export interface SetHeroArgs {
  folderPath: string
  fileName: string | null // null の場合は解除
}

// ================================================================
//  Maintenance — メンテナンス関連
// ================================================================
export interface MaintenanceIssue {
  id: string
  seriesId: string
  folderPath: string
  seriesTitle?: string
  type: 'FOLDER_GONE' | 'ITEMS_GONE'
  missingCount: number
  likelyOffline: boolean
  missingItems?: string[] // 具体的なファイル名のリスト
}

export interface MaintenanceSummary {
  issues: MaintenanceIssue[]
  checkedAt: string
}

export const DEFAULT_SEEK_TIME = 3

export interface FirstVideoResult {
  filePath?: string
  seekTime?: number
  type?: 'video' | 'image'
  thumbnailBase64?: string
  isSpecified?: boolean // ユーザーにより明示的に指定されたものか
}

export interface FindFirstVideoOptions {
  preferVideo?: boolean
}

// ================================================================
//  Search — 検索関連
// ================================================================
export interface SearchResult {
  id: string
  fileName: string
  filePath: string
  targetFolderPath: string
  folderPath: string
  relativeFolderPath: string
  seriesId: string
  seriesTitle: string
  type: 'video' | 'image' | 'audio' | 'folder'
  title?: string
  isShortcut?: boolean
  isHomeShortcut?: boolean
}

export interface SearchArgs {
  query: string
  scopePath?: string // 指定があればそのフォルダ以下のみ、なければ全シリーズ
}
