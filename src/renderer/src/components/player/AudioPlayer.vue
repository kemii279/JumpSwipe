<template>
  <div class="audio-player">
    <audio
      ref="audioEl"
      :src="src"
      preload="metadata"
      @timeupdate="onTimeUpdate"
      @loadedmetadata="onMetadata"
      @ended="$emit('ended')"
    />

    <!-- トップ左のアクションボタン (シャッフル・リピート) -->
    <div class="audio-top-actions">
      <button
        class="action-btn"
        :class="{ 'is-active': player.isShuffle }"
        title="シャッフル再生"
        @click="player.toggleShuffle"
      >
        <svg
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
        >
          <path d="M16 3h5v5M4 20L21 3M21 16v5h-5M15 15l6 6M4 4l5 5" />
        </svg>
      </button>
      <button
        class="action-btn"
        :class="{ 'is-active': player.isRepeat }"
        title="ループ再生"
        @click="player.toggleRepeat"
      >
        <svg
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
        >
          <path d="M17 2l4 4-4 4" />
          <path d="M3 11v-1a4 4 0 0 1 4-4h14" />
          <path d="M7 22l-4-4 4-4" />
          <path d="M21 13v1a4 4 0 0 1-4 4H3" />
        </svg>
      </button>
    </div>

    <!-- アルバムアート風アイコン -->
    <div class="album-art">
      <div class="album-disc" :class="{ spinning: isPlaying }">
        <div class="disc-inner">
          <svg
            width="32"
            height="32"
            viewBox="0 0 24 24"
            fill="none"
            stroke="white"
            stroke-width="1.5"
          >
            <path d="M9 18V5l12-2v13" />
            <circle cx="6" cy="18" r="3" />
            <circle cx="18" cy="16" r="3" />
          </svg>
        </div>
      </div>
      <div class="album-glow" />
    </div>

    <!-- ファイル名 -->
    <div class="audio-title">
      <p class="audio-filename truncate">{{ fileName }}</p>
    </div>

    <!-- コントロール -->
    <div class="audio-controls">
      <!-- プログレス -->
      <div ref="progressEl" class="progress-area" @click="seek">
        <div class="progress-track">
          <div class="progress-fill" :style="{ width: progressPct + '%' }" />
        </div>
        <div class="time-row">
          <span>{{ formatTime(currentTime) }}</span>
          <span>{{ formatTime(duration) }}</span>
        </div>
      </div>

      <!-- ボタン -->
      <div class="btn-row">
        <button id="btn-audio-prev" class="audio-btn" @click="$emit('prev')">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
            <polygon points="19,20 9,12 19,4" />
            <rect x="5" y="4" width="2" height="16" rx="1" />
          </svg>
        </button>
        <button
          :id="isPlaying ? 'btn-audio-pause' : 'btn-audio-play'"
          class="audio-btn play-pause"
          @click="togglePlay"
        >
          <svg v-if="isPlaying" width="26" height="26" viewBox="0 0 24 24" fill="currentColor">
            <rect x="6" y="4" width="4" height="16" rx="1" />
            <rect x="14" y="4" width="4" height="16" rx="1" />
          </svg>
          <svg v-else width="26" height="26" viewBox="0 0 24 24" fill="currentColor">
            <polygon points="5,3 19,12 5,21" />
          </svg>
        </button>
        <button id="btn-audio-next" class="audio-btn" @click="$emit('next')">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
            <polygon points="5,4 15,12 5,20" />
            <rect x="17" y="4" width="2" height="16" rx="1" />
          </svg>
        </button>
      </div>

      <!-- 音量 -->
      <div class="volume-row">
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
        >
          <polygon points="11,5 6,9 2,9 2,15 6,15 11,19" />
          <path d="M15.54 8.46a5 5 0 010 7.07" />
        </svg>
        <input
          id="audio-volume-slider"
          type="range"
          class="volume-slider"
          min="0"
          max="1"
          step="0.02"
          :value="volume"
          @input="onVolumeChange"
        />
        <span class="volume-pct">{{ Math.round(volume * 100) }}%</span>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, watch, onMounted, onUnmounted } from 'vue'
import { usePlayerStore } from '../../stores/playerStore'
import { useLibraryStore } from '../../stores/libraryStore'

const player = usePlayerStore()
const library = useLibraryStore()

const props = defineProps<{
  src: string
  fileName: string
  isPlaying: boolean
  volume: number
  isMuted: boolean
}>()

const emit = defineEmits<{
  'update:isPlaying': [v: boolean]
  ended: []
  prev: []
  next: []
}>()

const audioEl = ref<HTMLAudioElement>()
const progressEl = ref<HTMLDivElement>()
const currentTime = ref(0)
const duration = ref(0)
const progressPct = ref(0)
const volume = ref(props.volume)

watch(
  () => props.isPlaying,
  async (v) => {
    if (!audioEl.value) return
    if (v) await audioEl.value.play().catch(() => {})
    else audioEl.value.pause()
  }
)

watch(
  () => props.volume,
  (v) => {
    if (audioEl.value) audioEl.value.volume = v
    volume.value = v
  }
)

watch(
  () => props.isMuted,
  (v) => {
    if (audioEl.value) audioEl.value.muted = v
  }
)

function onTimeUpdate(): void {
  if (!audioEl.value) return
  currentTime.value = audioEl.value.currentTime
  progressPct.value = (currentTime.value / duration.value) * 100 || 0
}

function onMetadata(): void {
  if (!audioEl.value) return
  duration.value = audioEl.value.duration
  audioEl.value.volume = props.volume
  if (props.isPlaying) audioEl.value.play().catch(() => {})
}

function togglePlay(): void {
  emit('update:isPlaying', !props.isPlaying)
}

function seek(e: MouseEvent): void {
  if (!progressEl.value || !audioEl.value) return
  const rect = progressEl.value.getBoundingClientRect()
  const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width))
  audioEl.value.currentTime = ratio * duration.value
}

function onVolumeChange(e: Event): void {
  const v = parseFloat((e.target as HTMLInputElement).value)
  if (audioEl.value) audioEl.value.volume = v
  volume.value = v
}

function formatTime(sec: number): string {
  if (!isFinite(sec)) return '0:00'
  const m = Math.floor(sec / 60)
  const s = Math.floor(sec % 60)
  return `${m}:${s.toString().padStart(2, '0')}`
}

function handleKey(e: KeyboardEvent): void {
  if (e.code === 'Space') {
    e.preventDefault()
    togglePlay()
  } else if (e.ctrlKey && e.key === 'ArrowLeft') {
    e.preventDefault()
    emit('prev')
  } else if (e.ctrlKey && e.key === 'ArrowRight') {
    e.preventDefault()
    emit('next')
  } else if (e.key === 'ArrowLeft') {
    e.preventDefault()
    if (audioEl.value) audioEl.value.currentTime = Math.max(0, audioEl.value.currentTime - library.settings.videoSkipBack)
  } else if (e.key === 'ArrowRight') {
    e.preventDefault()
    if (audioEl.value)
      audioEl.value.currentTime = Math.min(duration.value, audioEl.value.currentTime + library.settings.videoSkipForward)
  }
}

onMounted(() => window.addEventListener('keydown', handleKey))
onUnmounted(() => window.removeEventListener('keydown', handleKey))
</script>

<style scoped>
.audio-player {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 28px;
  background: radial-gradient(ellipse at center, #1a1040 0%, var(--bg-base) 70%);
  padding: 40px;
}

/* トップ左のアクションボタン */
.audio-top-actions {
  position: absolute;
  top: 20px;
  left: 20px;
  z-index: 1000;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px;
  background: rgba(0, 0, 0, 0.4);
  backdrop-filter: blur(12px);
  border-radius: 100px;
  border: 1.5px solid rgba(255, 255, 255, 0.12);
  transition: all 0.25s ease;
}

.audio-top-actions .action-btn {
  background: transparent;
  border: none;
  color: rgba(255, 255, 255, 0.75);
  display: flex;
  align-items: center;
  justify-content: center;
  width: 38px;
  height: 38px;
  border-radius: 50%;
  cursor: pointer;
  transition: all 0.2s ease;
}

.audio-top-actions .action-btn:hover {
  background: rgba(255, 255, 255, 0.12);
  color: white;
  transform: scale(1.08);
}

.audio-top-actions .action-btn.is-active {
  color: var(--accent);
  background: rgba(108, 99, 255, 0.15);
}

.album-art {
  position: relative;
  width: 180px;
  height: 180px;
}

.album-disc {
  width: 180px;
  height: 180px;
  border-radius: 50%;
  background: conic-gradient(
    from 0deg,
    #1a1040 0%,
    #2d1b69 20%,
    #1a1040 40%,
    #2d1b69 60%,
    #1a1040 80%,
    #2d1b69 100%
  );
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 8px 40px rgba(108, 99, 255, 0.4);
}

@keyframes spin-disc {
  to {
    transform: rotate(360deg);
  }
}
.album-disc.spinning {
  animation: spin-disc 4s linear infinite;
}

.disc-inner {
  width: 64px;
  height: 64px;
  border-radius: 50%;
  background: var(--bg-base);
  display: flex;
  align-items: center;
  justify-content: center;
}

.album-glow {
  position: absolute;
  inset: -20px;
  border-radius: 50%;
  background: radial-gradient(circle, rgba(108, 99, 255, 0.2) 0%, transparent 70%);
  pointer-events: none;
  animation: pulse 2s ease-in-out infinite;
}

.audio-title {
  text-align: center;
  max-width: 400px;
}
.audio-filename {
  font-size: 16px;
  font-weight: 600;
  color: var(--text-primary);
}

.audio-controls {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 16px;
  width: 100%;
  max-width: 420px;
}

.progress-area {
  width: 100%;
  cursor: pointer;
}
.progress-track {
  height: 4px;
  background: rgba(255, 255, 255, 0.1);
  border-radius: 2px;
  overflow: hidden;
  transition: height 0.15s;
}
.progress-area:hover .progress-track {
  height: 6px;
}
.progress-fill {
  height: 100%;
  background: linear-gradient(90deg, var(--accent), var(--teal));
  border-radius: 2px;
}
.time-row {
  display: flex;
  justify-content: space-between;
  font-size: 11px;
  color: var(--text-muted);
  margin-top: 6px;
  font-variant-numeric: tabular-nums;
}

.btn-row {
  display: flex;
  align-items: center;
  gap: 12px;
}
.audio-btn {
  background: transparent;
  border: none;
  color: var(--text-secondary);
  cursor: pointer;
  padding: 8px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  transition: all var(--transition-fast);
}
.audio-btn:hover {
  color: var(--text-primary);
  background: rgba(255, 255, 255, 0.06);
}
.audio-btn.play-pause {
  background: var(--accent);
  color: white;
  width: 56px;
  height: 56px;
  justify-content: center;
  box-shadow: 0 0 24px var(--accent-glow);
}
.audio-btn.play-pause:hover {
  background: var(--accent-light);
  transform: scale(1.06);
}

.volume-row {
  display: flex;
  align-items: center;
  gap: 8px;
  color: var(--text-muted);
}
.volume-slider {
  width: 120px;
  height: 3px;
  accent-color: var(--accent);
  cursor: pointer;
}
.volume-pct {
  font-size: 11px;
  min-width: 36px;
}
</style>
