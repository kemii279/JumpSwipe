<template>
  <Teleport to="body">
    <Transition name="fade">
      <div
        v-if="external.isOpen"
        id="external-player-modal"
        class="ext-modal"
        @click.self="external.close()"
      >
        <div class="ext-inner">
          <!-- ヘッダー -->
          <div class="ext-header">
            <div class="ext-meta">
              <span class="badge badge-external">一時再生</span>
              <span class="ext-filename truncate">{{
                displayTitle(external.currentFile?.fileName)
              }}</span>
              <span v-if="external.files.length > 1" class="playlist-pos">
                {{ external.currentIndex + 1 }} / {{ external.files.length }}
              </span>
            </div>
            <button id="btn-ext-player-close" class="btn-icon close-btn" @click="external.close()">
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

          <!-- ライブラリ検索バナー（単一ファイル時のみ表示） -->
          <Transition name="banner-slide">
            <div v-if="external.showLibraryBanner" class="library-banner">
              <div class="library-banner-content">
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2"
                >
                  <circle cx="12" cy="12" r="10" />
                  <line x1="12" y1="8" x2="12" y2="12" />
                  <line x1="12" y1="16" x2="12.01" y2="16" />
                </svg>
                <span>このファイルはライブラリに登録されています</span>
              </div>
              <div class="library-banner-actions">
                <button class="btn-jump" @click="onJumpToLibrary">通常再生として開く</button>
                <button class="btn-dismiss" @click="external.dismissBanner()">閉じる</button>
              </div>
            </div>
          </Transition>

          <!-- メインエリア（プレイヤー + プレイリスト） -->
          <div class="ext-content">
            <!-- プレイヤー本体 -->
            <div class="ext-body">
              <Transition name="fade" mode="out-in">
                <!--
                  VideoPlayer は既存コンポーネントを再利用。
                  @watch-progress は意図的にバインドしない（一時再生のため保存しない）。
                  next-title は外部プレイリスト内の次のファイル名を表示。
                -->
                <VideoPlayer
                  v-if="external.currentFile?.type === 'video'"
                  :key="external.currentFile?.filePath"
                  :src="external.currentFile?.mediaUrl ?? ''"
                  :is-playing="external.isPlaying"
                  :volume="volume"
                  :is-muted="isMuted"
                  :episode-title="displayTitle(external.currentFile?.fileName)"
                  :next-title="nextFileTitle"
                  @update:is-playing="external.setPlaying"
                  @next="external.next()"
                  @prev="external.prev()"
                />
                <ImageViewer
                  v-else-if="external.currentFile?.type === 'image'"
                  :key="external.currentFile?.filePath"
                  :src="external.currentFile?.mediaUrl ?? ''"
                  :file-name="displayTitle(external.currentFile?.fileName)"
                  @prev="external.prev()"
                  @next="external.next()"
                />
                <AudioPlayer
                  v-else-if="external.currentFile?.type === 'audio'"
                  :key="external.currentFile?.filePath"
                  :src="external.currentFile?.mediaUrl ?? ''"
                  :file-name="displayTitle(external.currentFile?.fileName)"
                  :is-playing="external.isPlaying"
                  :volume="volume"
                  :is-muted="isMuted"
                  @update:is-playing="external.setPlaying"
                  @ended="external.next()"
                  @prev="external.prev()"
                  @next="external.next()"
                />
              </Transition>
            </div>

            <!-- プレイリストサイドバー（複数ファイル時のみ） -->
            <div v-if="external.files.length > 1" class="ext-playlist">
              <div class="playlist-header">プレイリスト</div>
              <ul class="playlist-list">
                <li
                  v-for="(file, i) in external.files"
                  :key="file.filePath"
                  class="playlist-item"
                  :class="{ 'is-active': i === external.currentIndex }"
                  @click="onSelectFile(i)"
                >
                  <!-- ファイルタイプアイコン -->
                  <svg
                    v-if="file.type === 'video'"
                    class="file-icon"
                    width="13"
                    height="13"
                    viewBox="0 0 24 24"
                    fill="currentColor"
                  >
                    <polygon points="5,3 19,12 5,21" />
                  </svg>
                  <svg
                    v-else-if="file.type === 'image'"
                    class="file-icon"
                    width="13"
                    height="13"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="2"
                  >
                    <rect x="3" y="3" width="18" height="18" rx="2" />
                    <polyline points="21,15 16,10 5,21" />
                  </svg>
                  <svg
                    v-else
                    class="file-icon"
                    width="13"
                    height="13"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="2"
                  >
                    <path d="M9 18V5l12-2v13" />
                    <circle cx="6" cy="18" r="3" />
                    <circle cx="18" cy="16" r="3" />
                  </svg>
                  <!-- 拡張子・フォルダ名なしのファイル名 -->
                  <span class="playlist-name">{{ displayTitle(file.fileName) }}</span>
                </li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useExternalPlayerStore } from '../stores/externalPlayerStore'
import VideoPlayer from './player/VideoPlayer.vue'
import ImageViewer from './player/ImageViewer.vue'
import AudioPlayer from './player/AudioPlayer.vue'
import type { SearchResult } from '../../../types/media'

const emit = defineEmits<{
  jumpToLibrary: [result: SearchResult]
}>()

const external = useExternalPlayerStore()

/** 音量・ミュートはこのモーダル内で独立して管理（playerStore と共有しない） */
const volume = ref(1)
const isMuted = ref(false)

/**
 * 拡張子・フォルダ名を除いたファイル名を返す表示用ヘルパー
 */
function displayTitle(fileName: string | undefined): string {
  if (!fileName) return ''
  return fileName.replace(/\.[^/.]+$/, '')
}

/** 次のファイルのタイトル（VideoPlayer の NextEpisodeBanner 用） */
const nextFileTitle = computed(() => {
  const nextIdx = external.currentIndex + 1
  const next = external.files[nextIdx]
  return next ? displayTitle(next.fileName) : ''
})

function onJumpToLibrary(): void {
  // close() → resetState() で libraryMatch が null になるため、先にキャプチャする
  const match = external.libraryMatch
  if (!match) return
  external.close()
  emit('jumpToLibrary', match)
}

function onSelectFile(index: number): void {
  external.currentIndex = index
  external.isPlaying = true
}

/** Ctrl+ArrowRight/Left でプレイリスト内ナビ */
function handleKeydown(e: KeyboardEvent): void {
  if (!external.isOpen) return
  if (!e.ctrlKey) return

  if (e.key === 'ArrowRight') {
    e.preventDefault()
    e.stopPropagation()
    external.next()
  } else if (e.key === 'ArrowLeft') {
    e.preventDefault()
    e.stopPropagation()
    external.prev()
  }
}

onMounted(() => {
  // capture: true で VideoPlayer の keydown ハンドラより先に捕捉する
  window.addEventListener('keydown', handleKeydown, { capture: true })
})

onUnmounted(() => {
  window.removeEventListener('keydown', handleKeydown, { capture: true })
})
</script>

<style scoped>
.ext-modal {
  position: fixed;
  inset: 0;
  z-index: 3000;
  background: rgba(0, 0, 0, 0.85);
  display: flex;
  align-items: center;
  justify-content: center;
  user-select: none; /* キー操作・クリックで選択状態にならないようにする */
}

.ext-inner {
  position: relative;
  width: 92vw;
  max-width: 1300px;
  height: 90vh;
  background: var(--bg-surface);
  border-radius: var(--radius-xl);
  border: 1px solid var(--border);
  display: flex;
  flex-direction: column;
  overflow: hidden;
  box-shadow: var(--shadow-modal);
}

/* ---- ヘッダー ---- */
.ext-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  border-bottom: 1px solid var(--border);
  flex-shrink: 0;
}

.ext-meta {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
}

.ext-filename {
  font-size: 1.3rem;
  font-weight: 500;
  color: var(--text-secondary);
}

.playlist-pos {
  font-size: 1.1rem;
  color: var(--text-muted);
  flex-shrink: 0;
}

.badge-external {
  display: inline-flex;
  align-items: center;
  padding: 2px 10px;
  border-radius: 100px;
  font-size: 1.1rem;
  font-weight: 600;
  background: rgba(255, 180, 0, 0.15);
  color: #ffb400;
  border: 1px solid rgba(255, 180, 0, 0.3);
  white-space: nowrap;
  flex-shrink: 0;
}

.close-btn {
  flex-shrink: 0;
}

/* ---- ライブラリバナー ---- */
.library-banner {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 10px 16px;
  background: rgba(108, 99, 255, 0.12);
  border-bottom: 1px solid rgba(108, 99, 255, 0.25);
  flex-shrink: 0;
  flex-wrap: wrap;
}

.library-banner-content {
  display: flex;
  align-items: center;
  gap: 8px;
  color: var(--accent-light);
  font-size: 1.2rem;
}

.library-banner-actions {
  display: flex;
  gap: 8px;
}

.btn-jump {
  padding: 5px 14px;
  border-radius: 100px;
  border: 1px solid var(--accent);
  background: var(--accent);
  color: white;
  font-size: 1.2rem;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.15s ease;
}
.btn-jump:hover {
  background: var(--accent-light);
  border-color: var(--accent-light);
}

.btn-dismiss {
  padding: 5px 12px;
  border-radius: 100px;
  border: 1px solid var(--border);
  background: transparent;
  color: var(--text-secondary);
  font-size: 1.2rem;
  cursor: pointer;
  transition: all 0.15s ease;
}
.btn-dismiss:hover {
  background: var(--bg-elevated);
  color: var(--text-primary);
}

/* ---- バナーアニメ ---- */
.banner-slide-enter-active,
.banner-slide-leave-active {
  transition: all 0.25s ease;
  overflow: hidden;
}
.banner-slide-enter-from,
.banner-slide-leave-to {
  opacity: 0;
  max-height: 0;
  padding-top: 0;
  padding-bottom: 0;
}
.banner-slide-enter-to,
.banner-slide-leave-from {
  max-height: 80px;
}

/* ---- メインコンテンツ ---- */
.ext-content {
  display: flex;
  flex: 1;
  min-height: 0;
}

.ext-body {
  flex: 1;
  min-width: 0;
  position: relative;
}

/* ---- プレイリストサイドバー ---- */
.ext-playlist {
  width: 240px;
  flex-shrink: 0;
  border-left: 1px solid var(--border);
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.playlist-header {
  padding: 10px 14px;
  font-size: 1.1rem;
  font-weight: 600;
  color: var(--text-muted);
  border-bottom: 1px solid var(--border);
  flex-shrink: 0;
}

.playlist-list {
  list-style: none;
  overflow-y: auto;
  flex: 1;
}

.playlist-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 9px 14px;
  cursor: pointer;
  border-radius: 0;
  transition: background 0.15s ease;
  font-size: 1.2rem;
  color: var(--text-secondary);
  border-bottom: 1px solid rgba(255, 255, 255, 0.04);
}

.playlist-item:hover {
  background: var(--bg-elevated);
  color: var(--text-primary);
}

.playlist-item.is-active {
  background: rgba(108, 99, 255, 0.15);
  color: var(--accent-light);
  font-weight: 600;
}

.file-icon {
  flex-shrink: 0;
  opacity: 0.7;
}

.playlist-name {
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}

/* ---- フェード ---- */
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.2s ease;
}
.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
</style>
