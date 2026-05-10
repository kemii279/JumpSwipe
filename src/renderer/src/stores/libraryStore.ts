import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type {
  SeriesEntry,
  SetThumbnailArgs,
  SetWatchProgressArgs,
  SetSeriesMetaArgs,
  SearchArgs,
  SearchResult,
  AppSettings
} from '../../../types/media'

export const useLibraryStore = defineStore('library', () => {
  const series = ref<SeriesEntry[]>([])
  const isLoading = ref(false)

  // ---- Computed ----
  const lastWatchedSeries = computed<SeriesEntry | null>(() => {
    if (series.value.length === 0) return null
    return (
      [...series.value]
        .filter((s) => s.lastWatchedAt)
        .sort((a, b) => {
          const ta = a.lastWatchedAt ? new Date(a.lastWatchedAt).getTime() : 0
          const tb = b.lastWatchedAt ? new Date(b.lastWatchedAt).getTime() : 0
          return tb - ta
        })[0] ?? null
    )
  })

  const watchingSeries = computed<SeriesEntry[]>(() =>
    series.value
      .filter((s) => s.lastWatchedAt)
      .sort((a, b) => {
        const ta = a.lastWatchedAt ? new Date(a.lastWatchedAt).getTime() : 0
        const tb = b.lastWatchedAt ? new Date(b.lastWatchedAt).getTime() : 0
        return tb - ta
      })
  )

  // ---- Load ----
  async function loadSeries(): Promise<void> {
    isLoading.value = true
    try {
      series.value = await window.api.getAllSeries()
    } finally {
      isLoading.value = false
    }
  }

  // ---- フォルダ追加（シリーズ登録） ----
  async function addSeriesFromFolder(folderPath: string): Promise<SeriesEntry> {
    isLoading.value = true
    try {
      const entry = await window.api.registerSeries(folderPath)
      // まだリストになければ追加
      if (!series.value.find((s) => s.id === entry.id)) {
        series.value.push(entry)
      }
      return entry
    } finally {
      isLoading.value = false
    }
  }

  // ---- シリーズ削除 ----
  async function deleteSeries(seriesId: string): Promise<void> {
    await window.api.deleteSeries(seriesId)
    series.value = series.value.filter((s) => s.id !== seriesId)
  }

  // ---- シリーズメタ更新 ----
  async function setSeriesMeta(args: SetSeriesMetaArgs): Promise<void> {
    await window.api.setSeriesMeta(args)
    const s = series.value.find((s) => s.id === args.seriesId)
    if (s) {
      if (args.seriesTitle !== undefined) s.seriesTitle = args.seriesTitle
      if (args.seriesThumbnailBase64 !== undefined)
        s.seriesThumbnailBase64 = args.seriesThumbnailBase64
    }
  }

  // ---- サムネイル設定 ----
  async function setThumbnail(args: SetThumbnailArgs): Promise<void> {
    await window.api.setThumbnail(args)
  }

  // ---- 視聴進捗保存 ----
  async function setWatchProgress(args: SetWatchProgressArgs): Promise<void> {
    await window.api.setWatchProgress(args)
    // library内の lastWatched も更新
    const s = series.value.find((s) => s.folderPath === args.seriesFolderPath)
    if (s) {
      s.lastWatchedAt = new Date().toISOString()
      s.lastWatchedFile = args.fileName
      s.lastWatchedSeconds = args.watchedSeconds
    }
  }

  // ---- HERO設定 ----
  async function setHero(folderPath: string, fileName: string | null): Promise<void> {
    await window.api.setHero(folderPath, fileName)
  }

  async function getHero(folderPath: string): Promise<string | null> {
    return await window.api.getHero(folderPath)
  }

  // ---- Settings ----
  const settings = ref<AppSettings>({
    scrollSpeed: 30,
    videoSkipBack: 10,
    videoSkipForward: 10
  })

  async function loadSettings(): Promise<void> {
    const s = await window.api.getSettings()
    if (s) settings.value = s
  }

  async function updateSettings(newSettings: AppSettings): Promise<void> {
    const res = await window.api.updateSettings(JSON.parse(JSON.stringify(newSettings)))
    if (res.success) {
      settings.value = { ...newSettings }
    }
  }

  // ---- 検索 ----
  async function search(args: SearchArgs): Promise<SearchResult[]> {
    return await window.api.search(args)
  }

  return {
    series,
    isLoading,
    settings,
    lastWatchedSeries,
    watchingSeries,
    loadSeries,
    loadSettings,
    updateSettings,
    addSeriesFromFolder,
    deleteSeries,
    setSeriesMeta,
    setThumbnail,
    setWatchProgress,
    setHero,
    getHero,
    search
  }
})
