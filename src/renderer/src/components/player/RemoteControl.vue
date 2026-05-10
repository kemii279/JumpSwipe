<template>
  <div
    id="remote-control"
    class="remote"
    :class="{ 'is-hovering': isHovering }"
    :style="{ left: pos.x + 'px', top: pos.y + 'px' }"
    @mouseenter="isHovering = true"
    @mouseleave="isHovering = false"
    @mousedown="startDrag"
  >
    <!-- エピソード情報 -->
    <div class="remote-header">
      <p class="remote-title truncate">{{ episodeTitle }}</p>
      <p class="remote-time">{{ formatTime(currentTime) }} / {{ formatTime(duration) }}</p>
      <!-- ミニ進捗バー -->
      <div class="remote-progress">
        <div class="remote-progress-fill" :style="{ width: miniProgress + '%' }" />
      </div>
    </div>

    <div class="remote-divider" />

    <!-- ナビ行 -->
    <div class="remote-row">
      <button id="rc-prev" class="rc-btn" title="前話" @click="$emit('prev')">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
          <polygon points="19,20 9,12 19,4" />
          <rect x="5" y="4" width="2" height="16" rx="1" />
        </svg>
        <span>前話</span>
      </button>
      <button
        :id="isPlaying ? 'rc-pause' : 'rc-play'"
        class="rc-btn rc-play"
        @click="$emit('togglePlay')"
      >
        <svg v-if="isPlaying" width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
          <rect x="6" y="4" width="4" height="16" rx="1" />
          <rect x="14" y="4" width="4" height="16" rx="1" />
        </svg>
        <svg v-else width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
          <polygon points="5,3 19,12 5,21" />
        </svg>
      </button>
      <button id="rc-next" class="rc-btn" title="次話" @click="$emit('next')">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
          <polygon points="5,4 15,12 5,20" />
          <rect x="17" y="4" width="2" height="16" rx="1" />
        </svg>
        <span>次話</span>
      </button>
    </div>

    <!-- シーク行 -->
    <div class="remote-row">
      <button id="rc-seek-back" class="rc-btn" title="-10秒" @click="$emit('seek', -10)">
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
        >
          <polyline points="1,4 1,10 7,10" />
          <path d="M3.51 15a9 9 0 102.13-9.36L1 10" />
        </svg>
        <span>-10秒</span>
      </button>
      <button id="rc-seek-fwd" class="rc-btn" title="+10秒" @click="$emit('seek', 10)">
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
        >
          <polyline points="23,4 23,10 17,10" />
          <path d="M20.49 15a9 9 0 11-2.12-9.36L23 10" />
        </svg>
        <span>+10秒</span>
      </button>
    </div>

    <div class="remote-divider" />

    <!-- 音量 -->
    <div class="remote-volume">
      <svg
        width="13"
        height="13"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
      >
        <polygon points="11,5 6,9 2,9 2,15 6,15 11,19" />
        <path d="M19.07 4.93a10 10 0 010 14.14M15.54 8.46a5 5 0 010 7.07" />
      </svg>
      <input
        id="rc-volume"
        type="range"
        class="rc-volume-slider"
        min="0"
        max="1"
        step="0.05"
        :value="volume"
        @input="onVolume"
      />
    </div>

    <div class="remote-divider" />

    <!-- サムネ設定 -->
    <button id="rc-set-thumbnail" class="rc-btn rc-thumb" @click="$emit('setThumbnail')">
      <svg
        width="13"
        height="13"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
      >
        <rect x="3" y="3" width="18" height="18" rx="2" />
        <circle cx="8.5" cy="8.5" r="1.5" />
        <polyline points="21,15 16,10 5,21" />
      </svg>
      サムネ設定
    </button>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import { formatTime } from '../../utils/formatTime'

const props = defineProps<{
  episodeTitle: string
  currentTime: number
  duration: number
  isPlaying: boolean
  volume: number
}>()

const emit = defineEmits<{
  prev: []
  next: []
  togglePlay: []
  seek: [delta: number]
  volumeChange: [v: number]
  setThumbnail: []
}>()

const isHovering = ref(false)

const miniProgress = computed(() =>
  props.duration > 0 ? (props.currentTime / props.duration) * 100 : 0
)

// ドラッグ移動
const pos = ref({ x: window.innerWidth - 220, y: window.innerHeight - 340 })
let dragging = false
let dragStart = { mx: 0, my: 0, ox: 0, oy: 0 }

function startDrag(e: MouseEvent): void {
  // ボタン類をクリックした場合はドラッグしない
  if ((e.target as HTMLElement).closest('button, input')) return
  dragging = true
  dragStart = { mx: e.clientX, my: e.clientY, ox: pos.value.x, oy: pos.value.y }
  window.addEventListener('mousemove', onDragMove)
  window.addEventListener('mouseup', stopDrag)
}

function onDragMove(e: MouseEvent): void {
  if (!dragging) return
  pos.value.x = dragStart.ox + (e.clientX - dragStart.mx)
  pos.value.y = dragStart.oy + (e.clientY - dragStart.my)
}

function stopDrag(): void {
  dragging = false
  window.removeEventListener('mousemove', onDragMove)
  window.removeEventListener('mouseup', stopDrag)
}

function onVolume(e: Event): void {
  emit('volumeChange', parseFloat((e.target as HTMLInputElement).value))
}
</script>

<style scoped>
.remote {
  position: fixed;
  z-index: 800;
  background: rgba(15, 15, 22, 0.85);
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 14px;
  padding: 12px;
  width: 200px;
  backdrop-filter: blur(16px);
  opacity: 0.4;
  transition: opacity 300ms ease;
  cursor: grab;
  user-select: none;
}
.remote:active {
  cursor: grabbing;
}
.remote.is-hovering {
  opacity: 1;
}

.remote-header {
  display: flex;
  flex-direction: column;
  gap: 3px;
  margin-bottom: 8px;
}
.remote-title {
  font-size: 11px;
  font-weight: 600;
  color: var(--text-primary);
  max-width: 176px;
}
.remote-time {
  font-size: 10px;
  color: var(--text-muted);
  font-variant-numeric: tabular-nums;
}
.remote-progress {
  height: 2px;
  background: rgba(255, 255, 255, 0.15);
  border-radius: 1px;
  overflow: hidden;
  margin-top: 2px;
}
.remote-progress-fill {
  height: 100%;
  background: var(--accent);
  border-radius: 1px;
}

.remote-divider {
  height: 1px;
  background: rgba(255, 255, 255, 0.08);
  margin: 8px 0;
}

.remote-row {
  display: flex;
  align-items: center;
  justify-content: space-around;
  gap: 4px;
  margin-bottom: 4px;
}

.rc-btn {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 3px;
  background: transparent;
  border: none;
  color: rgba(255, 255, 255, 0.65);
  cursor: pointer;
  padding: 6px;
  border-radius: 8px;
  font-size: 9px;
  font-family: inherit;
  transition: all 150ms ease;
}
.rc-btn:hover {
  background: rgba(255, 255, 255, 0.1);
  color: white;
}

.rc-play {
  width: 36px;
  height: 36px;
  background: var(--accent);
  color: white;
  border-radius: 50%;
  flex-direction: row;
  padding: 0;
  justify-content: center;
}
.rc-play:hover {
  background: var(--accent-light);
}

.remote-volume {
  display: flex;
  align-items: center;
  gap: 6px;
  color: rgba(255, 255, 255, 0.5);
}
.rc-volume-slider {
  flex: 1;
  height: 3px;
  accent-color: var(--accent);
  cursor: pointer;
}

.rc-thumb {
  width: 100%;
  flex-direction: row;
  gap: 6px;
  font-size: 11px;
  padding: 7px 10px;
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.06);
}
.rc-thumb:hover {
  background: rgba(255, 255, 255, 0.12);
}
</style>
