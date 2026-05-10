<template>
  <Teleport to="body">
    <Transition name="fade">
      <div v-if="player.isModalOpen" id="player-modal" class="player-modal" @click.self="close">
        <div class="player-inner">
          <!-- ヘッダー -->
          <div class="player-header">
            <div class="player-meta">
              <button
                v-if="['video', 'image'].includes(player.currentItem?.type || '')"
                class="btn-hero"
                :class="{ 'is-active': isCurrentHero }"
                title="この動画/画像をシリーズのHERO（背景）に設定"
                @click="toggleHero"
              >
                <svg
                  width="18"
                  height="18"
                  viewBox="0 0 24 24"
                  :fill="isCurrentHero ? 'currentColor' : 'none'"
                  stroke="currentColor"
                  stroke-width="2"
                >
                  <polygon
                    points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"
                  />
                </svg>
              </button>
              <span class="badge" :class="`badge-${player.currentItem?.type}`">
                {{ typeLabel }}
              </span>
              <span class="player-filename truncate">{{
                player.currentItem?.title || player.currentItem?.fileName
              }}</span>
              <span v-if="player.playlist.length > 1" class="playlist-pos">
                {{ player.currentIndex + 1 }} / {{ player.playlist.length }}
              </span>
            </div>
            <button id="btn-player-close" class="btn-icon close-btn" @click="close">
              <svg
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
              >
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>

          <!-- プレイヤー本体 -->
          <div class="player-body">
            <Transition name="fade" mode="out-in">
              <VideoPlayer
                v-if="player.currentItem?.type === 'video'"
                :key="player.currentItem?.id"
                :src="mediaUrl"
                :is-playing="player.isPlaying"
                :volume="player.volume"
                :is-muted="player.isMuted"
                :episode-title="player.currentItem?.title || player.currentItem?.fileName || ''"
                :next-title="nextItemTitle"
                :series-folder-path="player.currentSeriesFolderPath"
                :file-name="player.currentItem?.fileName"
                @update:is-playing="player.setPlaying"
                @ended="onEnded"
                @prev="player.prev()"
                @next="player.next()"
                @thumbnail-captured="onThumbnailCaptured"
                @watch-progress="onWatchProgress"
              />
              <ImageViewer
                v-else-if="player.currentItem?.type === 'image'"
                :key="player.currentItem?.id"
                :src="mediaUrl"
                :file-name="player.currentItem?.fileName ?? ''"
                @prev="player.prev()"
                @next="player.next()"
              />
              <AudioPlayer
                v-else-if="player.currentItem?.type === 'audio'"
                :key="player.currentItem?.id"
                :src="mediaUrl"
                :file-name="player.currentItem?.fileName ?? ''"
                :is-playing="player.isPlaying"
                :volume="player.volume"
                :is-muted="player.isMuted"
                @update:is-playing="player.setPlaying"
                @ended="onEnded"
                @prev="player.prev()"
                @next="player.next()"
              />
            </Transition>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>

  <!-- トースト -->
  <ToastNotification ref="toastRef" />
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { usePlayerStore } from '../stores/playerStore'
import { useLibraryStore } from '../stores/libraryStore'
import VideoPlayer from './player/VideoPlayer.vue'
import ImageViewer from './player/ImageViewer.vue'
import AudioPlayer from './player/AudioPlayer.vue'
import ToastNotification from './ToastNotification.vue'

const player = usePlayerStore()
const library = useLibraryStore()
const toastRef = ref<InstanceType<typeof ToastNotification>>()

const mediaUrl = computed(() => {
  if (!player.currentItem) return ''
  return `media://local/${encodeURIComponent(player.currentItem.filePath.replace(/\\/g, '/'))}`
})

const typeLabel = computed(() => {
  const map = { video: '動画', image: '画像', audio: '音声', folder: 'フォルダ' }
  return player.currentItem ? map[player.currentItem.type] : ''
})

const nextItemTitle = computed(() => {
  if (player.currentIndex < player.playlist.length - 1) {
    const next = player.playlist[player.currentIndex + 1]
    return next.title || next.fileName
  }
  return ''
})

function close(): void {
  // 終了時に視聴進捗を保存
  player.close()
}

function onEnded(): void {
  player.next()
}

async function onThumbnailCaptured(base64: string, seekTime: number): Promise<void> {
  if (!player.currentItem || !player.currentSeriesFolderPath) return

  // ① 永続化（API経由）
  await library.setThumbnail({
    filePath: player.currentItem.filePath,
    fileName: player.currentItem.fileName,
    thumbnailBase64: base64,
    seekTime,
    seriesFolderPath: player.currentSeriesFolderPath
  })

  // ② レンダラー側のメモリキャッシュを即時更新（戻った時の表示用）
  const { updateMemoryCache } = await import('../utils/thumbnailCache')
  updateMemoryCache(player.currentItem.filePath, base64, seekTime)

  // ③ 現在のアイテムオブジェクトを更新（ContentCardのwatchで検知される）
  if (player.currentItem) {
    player.currentItem.thumbnailBase64 = base64
  }

  toastRef.value?.show('✓ サムネイルを設定しました')
}

async function onWatchProgress(seconds: number, duration: number): Promise<void> {
  await player.saveProgress(seconds, duration)
}

// ---- HERO設定 ----
const currentHeroFileName = ref<string | null>(null)
const isCurrentHero = computed(() => {
  if (!player.currentItem) return false
  return player.currentItem.fileName === currentHeroFileName.value
})

async function fetchHeroInfo() {
  if (player.currentSeriesFolderPath) {
    currentHeroFileName.value = await library.getHero(player.currentSeriesFolderPath)
  }
}

watch(
  () => player.currentSeriesFolderPath,
  (newPath) => {
    if (newPath) fetchHeroInfo()
  },
  { immediate: true }
)

async function toggleHero() {
  if (!player.currentItem || !player.currentSeriesFolderPath) return

  const newValue = isCurrentHero.value ? null : player.currentItem.fileName
  await library.setHero(player.currentSeriesFolderPath, newValue)
  currentHeroFileName.value = newValue

  if (newValue) {
    toastRef.value?.show('✓ この動画をHEROに設定しました')
  } else {
    toastRef.value?.show('✓ HERO設定を解除しました')
  }
}
</script>

<style scoped>
.player-modal {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.92);
  z-index: 1000;
  display: flex;
  align-items: center;
  justify-content: center;
  backdrop-filter: blur(8px);
}

.player-inner {
  width: 92vw;
  height: 90vh;
  max-width: 1400px;
  background: var(--bg-base);
  border-radius: var(--radius-xl);
  border: 1px solid var(--border);
  overflow: hidden;
  display: flex;
  flex-direction: column;
  box-shadow: var(--shadow-modal);
  animation: scaleIn 0.2s ease;
}

.player-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  border-bottom: 1px solid var(--border);
  background: var(--bg-surface);
  gap: 12px;
  flex-shrink: 0;
}

.player-meta {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
  flex: 1;
}

.player-filename {
  font-size: 13px;
  font-weight: 500;
  color: var(--text-secondary);
  flex: 1;
  min-width: 0;
}

.playlist-pos {
  font-size: 12px;
  color: var(--text-muted);
  flex-shrink: 0;
  background: var(--bg-elevated);
  padding: 2px 8px;
  border-radius: 100px;
}

.close-btn {
  color: var(--text-secondary);
  flex-shrink: 0;
}
.close-btn:hover {
  color: var(--danger);
  background: rgba(255, 92, 92, 0.1);
}

.btn-hero {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.1);
  color: var(--text-muted);
  cursor: pointer;
  transition: all 0.2s ease;
  margin-right: 4px;
}
.btn-hero:hover {
  background: rgba(255, 255, 255, 0.1);
  color: var(--text-primary);
  transform: scale(1.1);
}
.btn-hero.is-active {
  background: rgba(255, 193, 7, 0.15);
  border-color: rgba(255, 193, 7, 0.4);
  color: #ffc107;
}
.btn-hero.is-active:hover {
  background: rgba(255, 193, 7, 0.25);
}

.player-body {
  flex: 1;
  overflow: hidden;
  position: relative;
}

.fade-enter-active {
  transition: opacity 0.2s;
}
.fade-leave-active {
  transition: opacity 0.15s;
}
.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
</style>
