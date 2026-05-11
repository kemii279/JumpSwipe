<template>
  <Transition name="banner">
    <div v-if="visible" id="next-episode-banner" class="next-banner">
      <div class="banner-content">
        <p class="banner-label">次のエピソード</p>
        <p class="banner-title truncate">{{ nextTitle }}</p>

        <!-- カウントダウンバー（動画終了後のみ表示） -->
        <template v-if="isEnded">
          <div class="countdown-track">
            <div class="countdown-fill" :style="{ width: progressPct + '%' }" />
          </div>
          <p class="countdown-text">{{ remaining }}秒後に自動再生</p>
        </template>

        <div class="banner-actions">
          <button id="btn-next-cancel" class="btn-cancel" @click="$emit('cancel')">
            キャンセル
          </button>
        </div>
      </div>
    </div>
  </Transition>
</template>

<script setup lang="ts">
import { ref, computed, watch, onUnmounted } from 'vue'

const props = defineProps<{
  visible: boolean
  nextTitle?: string
  /** カウントダウン秒数（デフォルト5秒） */
  totalSeconds?: number
  /** 動画が終了したか（true でカウントダウン開始） */
  isEnded?: boolean
}>()

const emit = defineEmits<{
  playNow: []
  cancel: []
  countdown: []
}>()

const TOTAL = computed(() => props.totalSeconds ?? 10)
const remaining = ref(TOTAL.value)
let timer: ReturnType<typeof setInterval> | null = null

const progressPct = computed(() => ((TOTAL.value - remaining.value) / TOTAL.value) * 100)

watch(
  () => [props.visible, props.isEnded],
  ([v, ended]) => {
    if (v && ended) {
      // 動画終了時のみカウントダウン開始
      if (!timer) {
        remaining.value = TOTAL.value
        timer = setInterval(() => {
          remaining.value--
          if (remaining.value <= 0) {
            stopTimer()
            emit('countdown')
          }
        }, 1000)
      }
    } else {
      stopTimer()
      if (v) remaining.value = TOTAL.value // 終了前は満タン表示
    }
  },
  { immediate: true }
)

function stopTimer(): void {
  if (timer) {
    clearInterval(timer)
    timer = null
  }
}

onUnmounted(stopTimer)
</script>

<style scoped>
.next-banner {
  position: absolute;
  bottom: 90px;
  right: 24px;
  z-index: 600;
  background: rgba(15, 15, 22, 0.92);
  border: 1px solid rgba(255, 255, 255, 0.15);
  border-radius: 12px;
  padding: 16px;
  width: 240px;
  backdrop-filter: blur(12px);
}

.banner-label {
  font-size: 10px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.8px;
  color: var(--accent-light);
  margin-bottom: 4px;
}

.banner-title {
  font-size: 13px;
  font-weight: 600;
  color: var(--text-primary);
  margin-bottom: 10px;
  max-width: 208px;
}

.countdown-track {
  width: 100%;
  height: 3px;
  background: rgba(255, 255, 255, 0.15);
  border-radius: 2px;
  overflow: hidden;
  margin-bottom: 4px;
}
.countdown-fill {
  height: 100%;
  background: var(--accent);
  border-radius: 2px;
  transition: width 0.9s linear;
}

.countdown-text {
  font-size: 11px;
  color: var(--text-muted);
  margin-bottom: 10px;
}

.banner-actions {
  display: flex;
  gap: 8px;
}

.btn-play-now {
  flex: 1;
  padding: 7px;
  background: var(--accent);
  color: white;
  border: none;
  border-radius: 8px;
  font-size: 12px;
  font-weight: 600;
  font-family: inherit;
  cursor: pointer;
  transition: background 150ms ease;
}
.btn-play-now:hover {
  background: var(--accent-light);
}

.btn-cancel {
  padding: 7px 12px;
  background: rgba(255, 255, 255, 0.08);
  color: rgba(255, 255, 255, 0.65);
  border: none;
  border-radius: 8px;
  font-size: 12px;
  font-family: inherit;
  cursor: pointer;
  transition: background 150ms ease;
}
.btn-cancel:hover {
  background: rgba(255, 255, 255, 0.15);
}

.banner-enter-active {
  transition: all 0.3s ease;
}
.banner-leave-active {
  transition: all 0.2s ease;
}
.banner-enter-from {
  opacity: 0;
  transform: translateY(16px);
}
.banner-leave-to {
  opacity: 0;
  transform: translateY(8px);
}
</style>
