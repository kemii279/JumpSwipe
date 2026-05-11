<template>
  <div class="video-player">
    <video
      ref="videoEl"
      class="video"
      :src="src"
      controls
      preload="metadata"
      tabindex="-1"
      @timeupdate="onTimeUpdate"
      @loadedmetadata="onMetadata"
      @ended="onEnded"
      @click="onVideoClick"
      @keydown="handleKeydown"
      @ratechange="onRateChange"
    />

    <!-- 次話バナー -->
    <NextEpisodeBanner
      :visible="showNextBanner"
      :next-title="nextTitle"
      :is-ended="isEnded"
      @play-now="$emit('next')"
      @cancel="onCancelBanner"
      @countdown="$emit('next')"
    />

    <!-- ★ フローティング「サムネ設定」ボタン（動画右上・常時表示） -->
    <Transition name="thumb-flash">
      <div v-if="thumbCaptureSuccess" key="flash" class="thumb-flash-overlay">
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2">
          <path d="M20 6L9 17l-5-5" />
        </svg>
        <span>サムネを設定しました</span>
      </div>
    </Transition>

    <!-- ★ 右上アクションバー（ナビゲーション & サムネ設定） -->
    <div class="player-top-actions">
      <button
        id="btn-player-prev"
        class="action-btn"
        title="前のエピソード"
        @click.stop="$emit('prev')"
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
          <polygon points="19,20 9,12 19,4" />
          <rect x="5" y="4" width="2" height="16" rx="1" />
        </svg>
      </button>
      <button
        id="btn-player-next"
        class="action-btn"
        title="次のエピソード"
        @click.stop="$emit('next')"
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
          <polygon points="5,4 15,12 5,20" />
          <rect x="17" y="4" width="2" height="16" rx="1" />
        </svg>
      </button>

      <div class="action-sep" />

      <button
        id="btn-float-thumbnail"
        class="action-btn thumb-btn"
        :class="{ 'is-success': thumbCaptureSuccess }"
        title="現在フレームをサムネイルに設定"
        @click.stop="onCaptureThumbnail"
      >
        <svg
          v-if="!thumbCaptureSuccess"
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
        >
          <path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z" />
          <circle cx="12" cy="13" r="4" />
        </svg>
        <svg
          v-else
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="white"
          stroke-width="2.5"
        >
          <path d="M20 6L9 17l-5-5" />
        </svg>
      </button>
    </div>

    <!-- 再生速度表示 -->
    <Transition name="speed-fade">
      <div v-if="showSpeed" class="speed-badge">
        <span class="speed-val">{{ currentSpeed.toFixed(2) }}</span>
        <span class="speed-x">x</span>
      </div>
    </Transition>
  </div>
</template>

<script lang="ts">
/**
 * アプリ起動中（セッション内）のみ再生速度を保持するためのグローバル変数。
 * ストア（永続化）するほどではないため、モジュールスコープのメモリ上で管理。
 */
let sessionPlaybackRate = 1.0
</script>

<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'
import { useLibraryStore } from '../../stores/libraryStore'
import NextEpisodeBanner from './NextEpisodeBanner.vue'

const props = defineProps<{
  src: string
  episodeTitle: string
  nextTitle?: string
  isPlaying: boolean
  volume: number
  isMuted: boolean
  initialTime?: number
}>()

const emit = defineEmits<{
  'update:isPlaying': [val: boolean]
  ended: []
  prev: []
  next: []
  thumbnailCaptured: [base64: string, time: number]
  watchProgress: [time: number, duration: number]
}>()

const library = useLibraryStore()
const videoEl = ref<HTMLVideoElement>()
const currentTime = ref(0)
const duration = ref(0)
const thumbCaptureSuccess = ref(false)
const showNextBanner = ref(false)
const isEnded = ref(false)
const isCancelled = ref(false)
const showSpeed = ref(false)
const currentSpeed = ref(1.0)

let progressTimer: ReturnType<typeof setInterval> | null = null
let flashTimer: ReturnType<typeof setTimeout> | null = null
let speedTimer: ReturnType<typeof setTimeout> | null = null

function onTimeUpdate(): void {
  if (!videoEl.value) return
  currentTime.value = videoEl.value.currentTime
}

function onMetadata(): void {
  if (!videoEl.value) return
  duration.value = videoEl.value.duration
  videoEl.value.volume = props.volume
  videoEl.value.muted = props.isMuted
  videoEl.value.playbackRate = sessionPlaybackRate
  currentSpeed.value = sessionPlaybackRate

  // 視聴進捗からの再開
  // ※ 1時間（3600秒）以上の長い動画のみレジュームを適用（短い動画は常に最初から再生）
  const IS_LONG_VIDEO = duration.value >= 3600
  if (IS_LONG_VIDEO && props.initialTime && props.initialTime > 0) {
    const remaining = duration.value - props.initialTime
    // 最後の1分未満なら最初から（終了間際とみなす）
    if (remaining > 60) {
      videoEl.value.currentTime = props.initialTime
    }
  }

  if (props.isPlaying) videoEl.value.play().catch(() => {})
}

function onEnded(): void {
  // 動画が終了したらバナーを強制表示し（キャンセル済みでも終了時は出す）、カウントダウンを開始させる
  if (props.nextTitle) {
    showNextBanner.value = true
    isEnded.value = true
  } else {
    emit('ended')
  }
}

function onCancelBanner(): void {
  showNextBanner.value = false
  isCancelled.value = true
}

// ビデオ要素がフォーカスを奪って独自のショートカットを動かさないようにする
function onVideoClick(): void {
  if (videoEl.value) {
    videoEl.value.blur()
  }
}

// ---- サムネイルキャプチャ ----
async function onCaptureThumbnail(): Promise<void> {
  if (!videoEl.value) return
  const seekTime = videoEl.value.currentTime
  const canvas = document.createElement('canvas')
  const aspect = videoEl.value.videoHeight / videoEl.value.videoWidth
  canvas.width = 400
  canvas.height = Math.round(400 * aspect)
  const ctx = canvas.getContext('2d')
  if (!ctx) return

  ctx.drawImage(videoEl.value, 0, 0, canvas.width, canvas.height)
  const base64 = canvas.toDataURL('image/webp', 0.85)
  emit('thumbnailCaptured', base64, seekTime)

  // 成功フラッシュ演出
  thumbCaptureSuccess.value = true
  if (flashTimer) clearTimeout(flashTimer)
  flashTimer = setTimeout(() => {
    thumbCaptureSuccess.value = false
  }, 2000)
}

function handleKeydown(e: KeyboardEvent): void {
  if (!videoEl.value) return

  const keys = ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown']
  if (!keys.includes(e.key)) return

  // Ctrl+Arrow は emit のみ行い、伝搬を止めない。
  // ExternalPlayerModal など親が capture:true で同じイベントを受け取り、
  // プレイリスト移動を行えるようにするため stopImmediatePropagation を呼ばない。
  if (e.ctrlKey) {
    e.preventDefault()
    if (e.key === 'ArrowLeft') emit('prev')
    else if (e.key === 'ArrowRight') emit('next')
    return
  }

  // Ctrl なし（シーク・倍速）はブラウザ標準挙動を抑制
  e.preventDefault()
  e.stopPropagation()
  e.stopImmediatePropagation()

  if (e.key === 'ArrowLeft') {
    videoEl.value.currentTime = Math.max(
      0,
      videoEl.value.currentTime - library.settings.videoSkipBack
    )
  } else if (e.key === 'ArrowRight') {
    videoEl.value.currentTime = Math.min(
      videoEl.value.duration || Infinity,
      videoEl.value.currentTime + library.settings.videoSkipForward
    )
  } else if (e.key === 'ArrowUp') {
    updatePlaybackRate(0.25)
  } else if (e.key === 'ArrowDown') {
    updatePlaybackRate(-0.25)
  }
}

function updatePlaybackRate(delta: number): void {
  if (!videoEl.value) return
  const newRate = Math.max(0.25, Math.min(3.0, videoEl.value.playbackRate + delta))
  // これにより @ratechange が発火し、onRateChange() が呼ばれる
  videoEl.value.playbackRate = newRate
}

function onRateChange(): void {
  if (!videoEl.value) return
  const newRate = videoEl.value.playbackRate

  // セッション値を更新
  sessionPlaybackRate = newRate
  currentSpeed.value = newRate

  // インジケーターを表示（キーボード操作・標準UI操作の両方で反応させる）
  showSpeed.value = true
  if (speedTimer) clearTimeout(speedTimer)
  speedTimer = setTimeout(() => {
    showSpeed.value = false
  }, 500)
}

// ---- 視聴進捗の定期保存 ----
onMounted(() => {
  // capture: true にすることで、ビデオ要素のネイティブ処理よりも先に捕捉する
  window.addEventListener('keydown', handleKeydown, { capture: true })

  // 定期的な永続化（保存）は30秒おきに行う
  progressTimer = setInterval(() => {
    if (videoEl.value && duration.value > 0) {
      emit('watchProgress', videoEl.value.currentTime, duration.value)
    }
  }, 30000)
})

onUnmounted(() => {
  window.removeEventListener('keydown', handleKeydown, { capture: true })
  if (flashTimer) clearTimeout(flashTimer)
  if (speedTimer) clearTimeout(speedTimer)
  if (progressTimer) clearInterval(progressTimer)

  // 動画を閉じる際（終了時）に最新の進捗を保存
  // ※ @timeupdate により currentTime は常に最新（5秒より高頻度）に更新されている
  if (currentTime.value > 0 && duration.value > 0) {
    emit('watchProgress', currentTime.value, duration.value)
  }

  if (videoEl.value) {
    videoEl.value.pause()
    videoEl.value.src = ''
    videoEl.value.load()
  }
})
</script>

<style scoped>
.video-player {
  position: relative;
  width: 100%;
  height: 100%;
  background: #000;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  user-select: none; /* UIのテキスト選択を禁止 */
}

.video {
  width: 100%;
  height: 100%;
  object-fit: contain;
  outline: none; /* フォーカス時の枠線を消す */
}

/* ---- 右上アクションバー ---- */
.player-top-actions {
  position: absolute;
  top: 20px;
  right: 20px;
  z-index: 1000;

  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px;
  background: rgba(0, 0, 0, 0.4);
  backdrop-filter: blur(12px);
  border-radius: 100px;
  border: 1.5px solid rgba(255, 255, 255, 0.12);

  opacity: 0.3;
  transition: all 0.25s ease;
}

.player-top-actions:hover {
  opacity: 1;
  background: rgba(0, 0, 0, 0.7);
  border-color: rgba(255, 255, 255, 0.25);
  transform: translateY(2px);
}

.action-btn {
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

.action-btn:hover {
  background: rgba(255, 255, 255, 0.12);
  color: white;
  transform: scale(1.08);
}

.action-btn.thumb-btn.is-success {
  background: var(--accent);
  color: white;
  opacity: 1;
}

.action-sep {
  width: 1.5px;
  height: 18px;
  background: rgba(255, 255, 255, 0.15);
  margin: 0 4px;
}

/* ---- キャプチャ成功通知 ---- */
.thumb-flash-overlay {
  position: absolute;
  top: 20px;
  right: 170px; /* アクションバーの左側に表示 */
  z-index: 1000;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 20px;
  background: var(--accent);
  border-radius: 100px;
  color: white;
  font-size: 13px;
  font-weight: 700;
  pointer-events: none;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.4);
}

.thumb-flash-enter-active,
.thumb-flash-leave-active {
  transition: all 0.3s ease;
}
.thumb-flash-enter-from {
  opacity: 0;
  transform: translateX(20px);
}
.thumb-flash-leave-to {
  opacity: 0;
  transform: translateX(10px);
}

/* ---- 再生速度表示 ---- */
.speed-badge {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  z-index: 2000;

  display: flex;
  align-items: baseline;
  gap: 2px;
  padding: 20px 40px;
  background: rgba(0, 0, 0, 0.5);
  backdrop-filter: blur(20px);
  border: 1.5px solid rgba(255, 255, 255, 0.2);
  border-radius: 24px;
  color: white;
  pointer-events: none;
  box-shadow: 0 10px 40px rgba(0, 0, 0, 0.6);
}

.speed-val {
  font-size: 48px;
  font-weight: 900;
  font-family: 'Inter', sans-serif;
  font-variant-numeric: tabular-nums;
}

.speed-x {
  font-size: 24px;
  font-weight: 700;
  opacity: 0.8;
}

.speed-fade-enter-active,
.speed-fade-leave-active {
  transition: all 0.2s cubic-bezier(0.2, 0, 0.2, 1);
}
.speed-fade-enter-from {
  opacity: 0;
  transform: translate(-50%, -40%) scale(0.9);
}
.speed-fade-leave-to {
  opacity: 0;
  transform: translate(-50%, -50%) scale(1.1);
}
</style>
