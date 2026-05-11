import { defineStore } from 'pinia'
import { ref } from 'vue'
import type { MediaItem } from '../../../types/media'
import { useLibraryStore } from './libraryStore'

export const usePlayerStore = defineStore('player', () => {
  const currentItem = ref<MediaItem | null>(null)
  const playlist = ref<MediaItem[]>([])
  const currentIndex = ref(-1)
  const isPlaying = ref(false)
  const isModalOpen = ref(false)
  const volume = ref(1)
  const isMuted = ref(false)
  const isShuffle = ref(false)
  const isRepeat = ref(false)
  /** 現在再生中のシリーズfolderPath */
  const currentSeriesFolderPath = ref<string>('')

  function open(item: MediaItem, items: MediaItem[], seriesFolderPath: string): void {
    currentItem.value = item
    playlist.value = items
    currentIndex.value = items.findIndex((i) => i.id === item.id)
    isModalOpen.value = true
    isPlaying.value = true
    currentSeriesFolderPath.value = seriesFolderPath
  }

  function close(): void {
    isModalOpen.value = false
    isPlaying.value = false
    currentItem.value = null
    playlist.value = []
    currentIndex.value = -1
    currentSeriesFolderPath.value = ''
  }

  function toggleShuffle(): void {
    isShuffle.value = !isShuffle.value
  }

  function toggleRepeat(): void {
    isRepeat.value = !isRepeat.value
  }

  function next(): void {
    if (playlist.value.length === 0) return
    const type = currentItem.value?.type

    if (type === 'audio' && isShuffle.value && playlist.value.length > 1) {
      let nextIdx = currentIndex.value
      // 直前と同じ曲にならないようにランダム選択
      while (nextIdx === currentIndex.value) {
        nextIdx = Math.floor(Math.random() * playlist.value.length)
      }
      currentIndex.value = nextIdx
      currentItem.value = playlist.value[currentIndex.value]
      isPlaying.value = true
    } else if (currentIndex.value < playlist.value.length - 1) {
      currentIndex.value++
      currentItem.value = playlist.value[currentIndex.value]
      isPlaying.value = true
    } else if (type === 'audio' && isRepeat.value) {
      // プレイリストの最後でリピートONなら最初に戻る
      currentIndex.value = 0
      currentItem.value = playlist.value[currentIndex.value]
      isPlaying.value = true
    } else {
      // 終了
      isPlaying.value = false
    }
  }

  function prev(): void {
    if (currentIndex.value > 0) {
      currentIndex.value--
      currentItem.value = playlist.value[currentIndex.value]
      isPlaying.value = true
    }
  }

  function setVolume(v: number): void {
    volume.value = Math.max(0, Math.min(1, v))
  }

  function toggleMute(): void {
    isMuted.value = !isMuted.value
  }

  function setPlaying(v: boolean): void {
    isPlaying.value = v
  }

  /** 視聴進捗を保存 (定期的に呼び出す) */
  async function saveProgress(
    watchedSeconds: number,
    duration: number,
    manualItem: MediaItem | null = null,
    manualSeriesPath: string = ''
  ): Promise<void> {
    const item = manualItem || currentItem.value
    const seriesPath = manualSeriesPath || currentSeriesFolderPath.value

    if (!item || !seriesPath) return

    const library = useLibraryStore()
    await library.setWatchProgress({
      filePath: item.filePath,
      fileName: item.fileName,
      seriesFolderPath: seriesPath,
      watchedSeconds,
      duration
    })

    // メモリ上の値も更新
    item.watchedSeconds = watchedSeconds
    item.duration = duration
  }

  return {
    currentItem,
    playlist,
    currentIndex,
    isPlaying,
    isModalOpen,
    volume,
    isMuted,
    currentSeriesFolderPath,
    isShuffle,
    isRepeat,
    open,
    close,
    next,
    prev,
    setVolume,
    toggleMute,
    setPlaying,
    saveProgress,
    toggleShuffle,
    toggleRepeat
  }
})
