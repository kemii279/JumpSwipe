<template>
  <Teleport to="body">
    <Transition name="toast">
      <div v-if="visible" id="toast-notification" class="toast" :class="`toast-${type}`">
        <svg
          v-if="type === 'success'"
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2.5"
        >
          <path d="M20 6L9 17l-5-5" />
        </svg>
        <svg
          v-else-if="type === 'error'"
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2.5"
        >
          <circle cx="12" cy="12" r="10" />
          <line x1="12" y1="8" x2="12" y2="12" />
          <line x1="12" y1="16" x2="12.01" y2="16" />
        </svg>
        <span>{{ message }}</span>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup lang="ts">
import { ref } from 'vue'

const visible = ref(false)
const message = ref('')
const type = ref<'success' | 'error'>('success')
let timer: ReturnType<typeof setTimeout> | null = null

function show(msg: string, t: 'success' | 'error' = 'success', duration = 2000): void {
  message.value = msg
  type.value = t
  visible.value = true
  if (timer) clearTimeout(timer)
  timer = setTimeout(() => {
    visible.value = false
  }, duration)
}

defineExpose({ show })
</script>

<style scoped>
.toast {
  position: fixed;
  bottom: 32px;
  left: 50%;
  transform: translateX(-50%);
  z-index: 9999;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 20px;
  border-radius: 100px;
  font-size: 13px;
  font-weight: 600;
  box-shadow: 0 4px 24px rgba(0, 0, 0, 0.4);
  pointer-events: none;
  white-space: nowrap;
}
.toast-success {
  background: rgba(0, 210, 140, 0.95);
  color: white;
}
.toast-error {
  background: rgba(255, 80, 80, 0.95);
  color: white;
}

.toast-enter-active {
  transition: all 0.25s ease;
}
.toast-leave-active {
  transition: all 0.2s ease;
}
.toast-enter-from {
  opacity: 0;
  transform: translateX(-50%) translateY(16px);
}
.toast-leave-to {
  opacity: 0;
  transform: translateX(-50%) translateY(8px);
}
</style>
