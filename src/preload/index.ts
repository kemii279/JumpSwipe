import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'
import type {
  Library,
  SeriesEntry,
  ScanResult,
  FolderDialogResult,
  SetThumbnailArgs,
  SetWatchProgressArgs,
  SetSeriesMetaArgs,
  FirstVideoResult,
  MaintenanceIssue,
  MaintenanceSummary,
  ScanOptions,
  FindFirstVideoOptions,
  SearchArgs,
  SearchResult,
  AppSettings
} from '../types/media'

const api = {
  // § library:search — 動画・ファイルの検索
  search: (args: SearchArgs): Promise<SearchResult[]> => ipcRenderer.invoke('library:search', args),
  onSearchUpdate: (callback: (results: SearchResult[]) => void) => {
    const listener = (_event: any, results: SearchResult[]) => callback(results)
    ipcRenderer.on('library:search-update', listener)
    return () => ipcRenderer.removeListener('library:search-update', listener)
  },
  // § folder:open — フォルダ選択ダイアログ
  openFolderDialog: (): Promise<FolderDialogResult> => ipcRenderer.invoke('folder:open'),

  // § image:openDialog — 画像選択ダイアログ
  openImageDialog: (): Promise<FolderDialogResult> => ipcRenderer.invoke('image:openDialog'),

  // § library:scan — 1階層スキャン
  scanFolder: (folderPath: string, options?: ScanOptions): Promise<ScanResult> =>
    ipcRenderer.invoke('library:scan', folderPath, options),

  // § library:getAll — シリーズ全件取得
  getAllSeries: (): Promise<SeriesEntry[]> => ipcRenderer.invoke('library:getAll'),

  // § library:save — library.json 全体保存
  saveLibrary: (library: Library): Promise<{ success: boolean }> =>
    ipcRenderer.invoke('library:save', library),

  // § series:register — シリーズ登録（なければ新規）
  registerSeries: (folderPath: string): Promise<SeriesEntry> =>
    ipcRenderer.invoke('series:register', folderPath),

  // § series:setMeta — シリーズメタ情報更新
  setSeriesMeta: (args: SetSeriesMetaArgs): Promise<{ success: boolean }> =>
    ipcRenderer.invoke('series:setMeta', args),

  // § series:delete — シリーズ削除
  deleteSeries: (seriesId: string): Promise<{ success: boolean }> =>
    ipcRenderer.invoke('series:delete', seriesId),

  // § item:setThumbnail — エピソードサムネイル保存
  setThumbnail: (args: SetThumbnailArgs): Promise<{ success: boolean }> =>
    ipcRenderer.invoke('item:setThumbnail', args),

  // § item:setWatchProgress — 視聴進捗保存
  setWatchProgress: (args: SetWatchProgressArgs): Promise<{ success: boolean }> =>
    ipcRenderer.invoke('item:setWatchProgress', args),

  // § file:exists — ファイル存在確認
  fileExists: (filePath: string): Promise<boolean> => ipcRenderer.invoke('file:exists', filePath),

  // § folder:findFirstVideo — 配下の最初の動画を再帰探索
  findFirstVideo: (
    folderPath: string,
    options?: FindFirstVideoOptions
  ): Promise<FirstVideoResult | null> =>
    ipcRenderer.invoke('folder:findFirstVideo', folderPath, options),

  // § folder:setThumbnail — フォルダサムネイル保存
  setFolderThumbnail: (args: {
    folderPath: string
    thumbnailBase64: string
  }): Promise<{ success: boolean }> => ipcRenderer.invoke('folder:setThumbnail', args),

  // § thumbnail:read — .media-thumbnails.json 読み込み
  readThumbnailCache: (folderPath: string): Promise<Record<string, unknown>> =>
    ipcRenderer.invoke('thumbnail:read', folderPath),

  // § thumbnail:write — .media-thumbnails.json 書き込み
  writeThumbnailCache: (
    folderPath: string,
    data: Record<string, unknown>
  ): Promise<{ success: boolean }> => ipcRenderer.invoke('thumbnail:write', folderPath, data),

  // § series:setHero — 手動HERO設定
  setHero: (folderPath: string, fileName: string | null): Promise<{ success: boolean }> =>
    ipcRenderer.invoke('series:setHero', { folderPath, fileName }),

  // § series:getHero — 手動HERO設定取得
  getHero: (folderPath: string): Promise<string | null> =>
    ipcRenderer.invoke('series:getHero', folderPath),

  // § maintenance:scan — 不整合スキャン
  scanMaintenance: (): Promise<MaintenanceSummary> => ipcRenderer.invoke('maintenance:scan'),

  // § maintenance:applyFix — 指定した修正を実行
  applyMaintenanceFix: (issue: MaintenanceIssue): Promise<{ success: boolean }> =>
    ipcRenderer.invoke('maintenance:applyFix', issue),

  // § window:toggleFullscreen — アプリ全画面トグル
  toggleFullscreen: (): Promise<boolean> => ipcRenderer.invoke('window:toggleFullscreen'),

  // § window:setFullscreen — アプリ全画面指定
  setFullscreen: (flag: boolean): Promise<boolean> =>
    ipcRenderer.invoke('window:setFullscreen', flag),

  // § library:getSettings — 設定取得
  getSettings: (): Promise<AppSettings> => ipcRenderer.invoke('library:getSettings'),

  // § library:updateSettings — 設定更新
  updateSettings: (settings: AppSettings): Promise<{ success: boolean }> =>
    ipcRenderer.invoke('library:updateSettings', settings)
}

if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', electronAPI)
    contextBridge.exposeInMainWorld('api', api)
  } catch (error) {
    console.error(error)
  }
} else {
  // @ts-ignore (define in dts)
  window.electron = electronAPI
  // @ts-ignore (define in dts)
  window.api = api
}
