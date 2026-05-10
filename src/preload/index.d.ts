import { ElectronAPI } from '@electron-toolkit/preload'
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

declare global {
  interface Window {
    electron: ElectronAPI
    api: {
      search(args: SearchArgs): Promise<SearchResult[]>
      onSearchUpdate(callback: (results: SearchResult[]) => void): () => void
      openFolderDialog(): Promise<FolderDialogResult>
      openImageDialog(): Promise<FolderDialogResult>
      scanFolder(folderPath: string, options?: ScanOptions): Promise<ScanResult>
      getAllSeries(): Promise<SeriesEntry[]>
      saveLibrary(library: Library): Promise<{ success: boolean }>
      registerSeries(folderPath: string): Promise<SeriesEntry>
      setSeriesMeta(args: SetSeriesMetaArgs): Promise<{ success: boolean }>
      deleteSeries(seriesId: string): Promise<{ success: boolean }>
      setThumbnail(args: SetThumbnailArgs): Promise<{ success: boolean }>
      setWatchProgress(args: SetWatchProgressArgs): Promise<{ success: boolean }>
      fileExists(filePath: string): Promise<boolean>
      findFirstVideo(
        folderPath: string,
        options?: FindFirstVideoOptions
      ): Promise<FirstVideoResult | null>
      setFolderThumbnail(args: {
        folderPath: string
        thumbnailBase64: string
      }): Promise<{ success: boolean }>
      readThumbnailCache(folderPath: string): Promise<Record<string, unknown>>
      writeThumbnailCache(
        folderPath: string,
        data: Record<string, unknown>
      ): Promise<{ success: boolean }>
      setHero(folderPath: string, fileName: string | null): Promise<{ success: boolean }>
      getHero(folderPath: string): Promise<string | null>
      scanMaintenance(): Promise<MaintenanceSummary>
      applyMaintenanceFix(issue: MaintenanceIssue): Promise<{ success: boolean }>
      toggleFullscreen(): Promise<boolean>
      setFullscreen(flag: boolean): Promise<boolean>
      getSettings(): Promise<AppSettings>
      updateSettings(settings: AppSettings): Promise<{ success: boolean }>
    }
  }
}
