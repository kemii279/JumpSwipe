<template>
  <div
    ref="containerEl"
    class="image-viewer"
    @wheel.prevent="onWheel"
    @mousedown="startDrag"
    @mousemove="onDrag"
    @mouseup="stopDrag"
    @mouseleave="stopDrag"
    @dblclick="resetZoom"
  >
    <img
      ref="imgEl"
      :src="src"
      :alt="fileName"
      class="viewer-img"
      :style="imgStyle"
      draggable="false"
    />

    <!-- ズームインジケーター -->
    <div class="zoom-indicator" :class="{ visible: showZoomIndicator }">
      {{ Math.round(scale * 100) }}%
    </div>

    <!-- ナビゲーション -->
    <button id="btn-img-prev" class="nav-btn nav-prev" @click.stop="$emit('prev')">
      <svg
        width="20"
        height="20"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2.5"
      >
        <polyline points="15,18 9,12 15,6" />
      </svg>
    </button>
    <button id="btn-img-next" class="nav-btn nav-next" @click.stop="$emit('next')">
      <svg
        width="20"
        height="20"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2.5"
      >
        <polyline points="9,18 15,12 9,6" />
      </svg>
    </button>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted } from 'vue'

const props = defineProps<{
  src: string
  fileName: string
}>()

const emit = defineEmits<{ prev: []; next: [] }>()

const scale = ref(1)
const offsetX = ref(0)
const offsetY = ref(0)
const isDragging = ref(false)
const dragStart = ref({ x: 0, y: 0 })
const showZoomIndicator = ref(false)
let zoomTimer: ReturnType<typeof setTimeout> | null = null

watch(
  () => props.src,
  () => {
    scale.value = 1
    offsetX.value = 0
    offsetY.value = 0
  }
)

const imgStyle = computed(() => ({
  transform: `translate(${offsetX.value}px, ${offsetY.value}px) scale(${scale.value})`,
  cursor: scale.value > 1 ? (isDragging.value ? 'grabbing' : 'grab') : 'default',
  transition: isDragging.value ? 'none' : 'transform 0.2s ease'
}))

function onWheel(e: WheelEvent): void {
  const delta = e.deltaY > 0 ? 0.9 : 1.1
  const newScale = Math.max(0.2, Math.min(8, scale.value * delta))
  scale.value = newScale
  if (newScale <= 1) {
    offsetX.value = 0
    offsetY.value = 0
  }
  triggerZoomIndicator()
}

function startDrag(e: MouseEvent): void {
  if (scale.value <= 1) return
  isDragging.value = true
  dragStart.value = { x: e.clientX - offsetX.value, y: e.clientY - offsetY.value }
}

function onDrag(e: MouseEvent): void {
  if (!isDragging.value) return
  offsetX.value = e.clientX - dragStart.value.x
  offsetY.value = e.clientY - dragStart.value.y
}

function stopDrag(): void {
  isDragging.value = false
}

function resetZoom(): void {
  scale.value = 1
  offsetX.value = 0
  offsetY.value = 0
  triggerZoomIndicator()
}

function triggerZoomIndicator(): void {
  showZoomIndicator.value = true
  if (zoomTimer) clearTimeout(zoomTimer)
  zoomTimer = setTimeout(() => {
    showZoomIndicator.value = false
  }, 1500)
}

function handleKeydown(e: KeyboardEvent) {
  if (e.key === 'ArrowLeft') {
    e.preventDefault()
    emit('prev')
  } else if (e.key === 'ArrowRight') {
    e.preventDefault()
    emit('next')
  }
}

onMounted(() => {
  window.addEventListener('keydown', handleKeydown)
})

onUnmounted(() => {
  window.removeEventListener('keydown', handleKeydown)
  if (zoomTimer) clearTimeout(zoomTimer)
})
</script>

<style scoped>
.image-viewer {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #000;
  position: relative;
  overflow: hidden;
  user-select: none;
}

.viewer-img {
  max-width: 100%;
  max-height: 100%;
  object-fit: contain;
  transform-origin: center;
}

.zoom-indicator {
  position: absolute;
  bottom: 16px;
  left: 50%;
  transform: translateX(-50%);
  background: rgba(0, 0, 0, 0.7);
  color: white;
  padding: 4px 12px;
  border-radius: 100px;
  font-size: 12px;
  font-weight: 600;
  opacity: 0;
  transition: opacity 0.3s;
  pointer-events: none;
}
.zoom-indicator.visible {
  opacity: 1;
}

.nav-btn {
  position: absolute;
  top: 50%;
  transform: translateY(-50%);
  background: rgba(0, 0, 0, 0.5);
  border: 1px solid rgba(255, 255, 255, 0.1);
  color: rgba(255, 255, 255, 0.8);
  width: 44px;
  height: 44px;
  border-radius: 50%;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all var(--transition-fast);
  opacity: 0;
}
.image-viewer:hover .nav-btn {
  opacity: 1;
}
.nav-btn:hover {
  background: rgba(108, 99, 255, 0.7);
  color: white;
  border-color: transparent;
}
.nav-prev {
  left: 16px;
}
.nav-next {
  right: 16px;
}
</style>
