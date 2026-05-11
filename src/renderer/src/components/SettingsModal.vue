<template>
  <Teleport to="body">
    <Transition name="modal-fade">
      <div v-if="visible" class="modal-overlay" @click.self="close">
        <div class="settings-modal">
          <header class="modal-header">
            <div class="header-title">
              <span class="material-icons">settings</span>
              <h2>アプリ設定</h2>
            </div>
            <button class="close-btn" @click="close">
              <span class="material-icons">close</span>
            </button>
          </header>

          <div class="modal-body">
            <!-- スクロール速度設定 -->
            <section class="settings-section">
              <div class="section-header">
                <span class="material-icons">swap_vert</span>
                <h3>ナビゲーション</h3>
              </div>
              <div class="setting-item">
                <div class="setting-info">
                  <label>キーボードスクロール速度</label>
                  <p class="setting-desc">
                    矢印キー（上下）でスクロールする際の移動距離を設定します。
                  </p>
                </div>
                <div class="setting-control">
                  <input
                    v-model.number="tempSettings.scrollSpeed"
                    type="range"
                    min="10"
                    max="200"
                    step="5"
                    class="cyber-range"
                  />
                  <span class="value-display">{{ tempSettings.scrollSpeed }}px</span>
                </div>
              </div>
            </section>

            <!-- 動画送り時間設定 -->
            <section class="settings-section">
              <div class="section-header">
                <span class="material-icons">play_circle_outline</span>
                <h3>動画プレイヤー</h3>
              </div>
              <div class="setting-item">
                <div class="setting-info">
                  <label>戻り時間 (←)</label>
                  <p class="setting-desc">左矢印キーを押した際に巻き戻す秒数。</p>
                </div>
                <div class="setting-control">
                  <input
                    v-model.number="tempSettings.videoSkipBack"
                    type="number"
                    min="1"
                    max="600"
                    class="cyber-input"
                  />
                  <span class="unit">秒</span>
                </div>
              </div>
              <div class="setting-item">
                <div class="setting-info">
                  <label>送り時間 (→)</label>
                  <p class="setting-desc">右矢印キーを押した際にスキップする秒数。</p>
                </div>
                <div class="setting-control">
                  <input
                    v-model.number="tempSettings.videoSkipForward"
                    type="number"
                    min="1"
                    max="600"
                    class="cyber-input"
                  />
                  <span class="unit">秒</span>
                </div>
              </div>
            </section>
          </div>

          <footer class="modal-footer">
            <button class="secondary-btn" @click="close">キャンセル</button>
            <button class="primary-btn" @click="save">
              <span class="material-icons">check</span>
              設定を保存
            </button>
          </footer>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue'
import { useLibraryStore } from '../stores/libraryStore'
import type { AppSettings } from '../../../types/media'

const props = defineProps<{
  visible: boolean
}>()

const emit = defineEmits<{
  close: []
  saved: []
}>()

const library = useLibraryStore()
const tempSettings = ref<AppSettings>({ ...library.settings })

watch(
  () => props.visible,
  (val) => {
    if (val) {
      tempSettings.value = { ...library.settings }
    }
  }
)

function close() {
  emit('close')
}

async function save() {
  await library.updateSettings(tempSettings.value)
  emit('saved')
  close()
}
</script>

<style scoped>
.modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.6);
  backdrop-filter: blur(10px);
  z-index: 2000;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px;
}

.settings-modal {
  width: 100%;
  max-width: 520px;
  background: var(--bg-surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-modal);
  display: flex;
  flex-direction: column;
  overflow: hidden;
  animation: modalIn 0.3s cubic-bezier(0.16, 1, 0.3, 1);
}

@keyframes modalIn {
  from {
    opacity: 0;
    transform: translateY(20px) scale(0.95);
  }
  to {
    opacity: 1;
    transform: translateY(0) scale(1);
  }
}

.modal-header {
  padding: 20px 24px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  border-bottom: 1px solid var(--border);
  background: rgba(255, 255, 255, 0.02);
}

.header-title {
  display: flex;
  align-items: center;
  gap: 12px;
}

.header-title .material-icons {
  color: var(--accent);
  font-size: 24px;
}

.header-title h2 {
  font-size: 18px;
  font-weight: 800;
  letter-spacing: -0.5px;
}

.close-btn {
  background: transparent;
  border: none;
  color: var(--text-muted);
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border-radius: 50%;
  transition: all 0.2s;
}

.close-btn:hover {
  background: rgba(255, 255, 255, 0.1);
  color: var(--text-primary);
}

.modal-body {
  padding: 24px;
  display: flex;
  flex-direction: column;
  gap: 32px;
  overflow-y: auto;
  max-height: 70vh;
}

.settings-section {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.section-header {
  display: flex;
  align-items: center;
  gap: 8px;
  color: var(--text-muted);
}

.section-header .material-icons {
  font-size: 18px;
}

.section-header h3 {
  font-size: 12px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 1px;
}

.setting-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 20px;
}

.setting-info {
  flex: 1;
}

.setting-info label {
  display: block;
  font-size: 14px;
  font-weight: 600;
  color: var(--text-primary);
  margin-bottom: 4px;
}

.setting-desc {
  font-size: 12px;
  color: var(--text-muted);
  line-height: 1.4;
}

.setting-control {
  display: flex;
  align-items: center;
  gap: 12px;
  min-width: 160px;
  justify-content: flex-end;
}

.value-display {
  font-size: 13px;
  font-weight: 700;
  color: var(--accent);
  min-width: 45px;
  text-align: right;
  font-variant-numeric: tabular-nums;
}

.unit {
  font-size: 13px;
  color: var(--text-muted);
}

/* Cyber UI Components */
.cyber-range {
  -webkit-appearance: none;
  width: 100px;
  height: 4px;
  background: var(--bg-elevated);
  border-radius: 2px;
  outline: none;
}

.cyber-range::-webkit-slider-thumb {
  -webkit-appearance: none;
  width: 14px;
  height: 14px;
  background: var(--accent);
  border-radius: 50%;
  cursor: pointer;
  box-shadow: 0 0 10px var(--accent-glow);
  transition: all 0.2s;
}

.cyber-range::-webkit-slider-thumb:hover {
  transform: scale(1.2);
  background: var(--accent-light);
}

.cyber-input {
  width: 70px;
  background: var(--bg-elevated);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  color: var(--text-primary);
  padding: 6px 10px;
  font-family: inherit;
  font-size: 13px;
  font-weight: 600;
  text-align: center;
  transition: all 0.2s;
}

.cyber-input:focus {
  border-color: var(--accent);
  box-shadow: 0 0 0 2px var(--accent-glow);
}

.modal-footer {
  padding: 16px 24px;
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 12px;
  background: rgba(255, 255, 255, 0.02);
  border-top: 1px solid var(--border);
}

.secondary-btn {
  padding: 8px 16px;
  background: transparent;
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  color: var(--text-secondary);
  font-size: 13px;
  font-weight: 600;
  transition: all 0.2s;
}

.secondary-btn:hover {
  background: rgba(255, 255, 255, 0.05);
  color: var(--text-primary);
}

.primary-btn {
  padding: 8px 20px;
  background: var(--accent);
  border: none;
  border-radius: var(--radius-md);
  color: white;
  font-size: 13px;
  font-weight: 700;
  display: flex;
  align-items: center;
  gap: 8px;
  box-shadow: 0 4px 12px var(--accent-glow);
  transition: all 0.2s;
}

.primary-btn:hover {
  background: var(--accent-light);
  transform: translateY(-1px);
  box-shadow: 0 6px 16px var(--accent-glow);
}

.primary-btn .material-icons {
  font-size: 18px;
}

/* Transitions */
.modal-fade-enter-active,
.modal-fade-leave-active {
  transition: opacity 0.2s ease;
}

.modal-fade-enter-from,
.modal-fade-leave-to {
  opacity: 0;
}
</style>
