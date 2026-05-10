<template>
  <Teleport to="body">
    <Transition name="fade">
      <div v-if="visible" id="series-edit-modal" class="modal-bg" @click.self="$emit('close')">
        <div class="modal-box">
          <div class="modal-header">
            <h2 class="modal-title">シリーズ編集</h2>
            <button class="btn-icon" @click="$emit('close')">
              <svg
                width="18"
                height="18"
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

          <div class="modal-body">
            <!-- タイトル -->
            <label class="field-label">シリーズタイトル</label>
            <input
              id="series-title-input"
              v-model="titleInput"
              type="text"
              class="field-input"
              placeholder="タイトルを入力..."
            />

            <!-- サムネイル -->
            <label class="field-label" style="margin-top: 16px">シリーズサムネイル</label>
            <div class="thumb-preview-wrap">
              <img
                v-if="thumbPreview"
                :src="thumbPreview"
                class="thumb-preview"
                alt="サムネイルプレビュー"
              />
              <div v-else class="thumb-preview-empty">
                <svg
                  width="32"
                  height="32"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="1"
                >
                  <rect x="3" y="3" width="18" height="18" rx="2" />
                  <circle cx="8.5" cy="8.5" r="1.5" />
                  <polyline points="21,15 16,10 5,21" />
                </svg>
                <span>サムネイル未設定</span>
              </div>
              <button id="btn-select-series-thumb" class="btn-select-image" @click="selectImage">
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2"
                >
                  <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
                  <polyline points="17,8 12,3 7,8" />
                  <line x1="12" y1="3" x2="12" y2="15" />
                </svg>
                画像を選択
              </button>
            </div>
          </div>

          <div class="modal-footer">
            <button class="btn-cancel" @click="$emit('close')">キャンセル</button>
            <button id="btn-series-edit-save" class="btn-save" @click="onSave">保存</button>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue'

const props = defineProps<{
  visible: boolean
  seriesId: string
  initialTitle?: string
  initialThumbnail?: string
}>()

const emit = defineEmits<{
  close: []
  save: [title: string, thumbnailBase64: string | undefined]
}>()

const titleInput = ref(props.initialTitle ?? '')
const thumbPreview = ref(props.initialThumbnail ?? '')
const newThumbBase64 = ref<string | undefined>(undefined)

watch(
  () => props.visible,
  (v) => {
    if (v) {
      titleInput.value = props.initialTitle ?? ''
      thumbPreview.value = props.initialThumbnail ?? ''
      newThumbBase64.value = undefined
    }
  }
)

async function selectImage(): Promise<void> {
  const result = await window.api.openImageDialog()
  if (result.canceled || result.filePaths.length === 0) return
  const filePath = result.filePaths[0]

  // 画像ファイルを読み込み Base64 変換
  const response = await fetch(`media://local/${encodeURIComponent(filePath.replace(/\\/g, '/'))}`)
  const blob = await response.blob()
  const reader = new FileReader()
  reader.onload = () => {
    // WebPに変換（Canvasを使用）
    const img = new Image()
    img.onload = () => {
      const canvas = document.createElement('canvas')
      // 長辺800px（仕様書 §8-2）
      const maxSide = 800
      let w = img.naturalWidth
      let h = img.naturalHeight
      if (w > h) {
        h = Math.round((h * maxSide) / w)
        w = maxSide
      } else {
        w = Math.round((w * maxSide) / h)
        h = maxSide
      }
      canvas.width = w
      canvas.height = h
      const ctx = canvas.getContext('2d')
      ctx?.drawImage(img, 0, 0, w, h)
      const base64 = canvas.toDataURL('image/webp', 0.9)
      thumbPreview.value = base64
      newThumbBase64.value = base64
    }
    img.src = reader.result as string
  }
  reader.readAsDataURL(blob)
}

function onSave(): void {
  emit('save', titleInput.value, newThumbBase64.value)
}
</script>

<style scoped>
.modal-bg {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.7);
  z-index: 2000;
  display: flex;
  align-items: center;
  justify-content: center;
  backdrop-filter: blur(6px);
}

.modal-box {
  background: var(--bg-surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-xl);
  width: 480px;
  max-width: 95vw;
  box-shadow: var(--shadow-modal);
  animation: scaleIn 0.2s ease;
}

.modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 20px;
  border-bottom: 1px solid var(--border);
}
.modal-title {
  font-size: 16px;
  font-weight: 700;
}

.modal-body {
  padding: 20px;
}

.field-label {
  display: block;
  font-size: 12px;
  font-weight: 600;
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 0.6px;
  margin-bottom: 6px;
}
.field-input {
  width: 100%;
  background: var(--bg-elevated);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  padding: 10px 12px;
  color: var(--text-primary);
  font-family: inherit;
  font-size: 14px;
  outline: none;
  transition: border-color 150ms ease;
  box-sizing: border-box;
}
.field-input:focus {
  border-color: var(--accent);
}

.thumb-preview-wrap {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.thumb-preview {
  width: 100%;
  height: 180px;
  object-fit: cover;
  border-radius: var(--radius-md);
  border: 1px solid var(--border);
}
.thumb-preview-empty {
  width: 100%;
  height: 180px;
  border-radius: var(--radius-md);
  border: 1px dashed var(--border);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  color: var(--text-muted);
  font-size: 12px;
}
.btn-select-image {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 9px 14px;
  background: var(--bg-elevated);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  color: var(--text-secondary);
  font-family: inherit;
  font-size: 13px;
  cursor: pointer;
  transition: all 150ms ease;
}
.btn-select-image:hover {
  border-color: var(--accent);
  color: var(--text-primary);
}

.modal-footer {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  padding: 16px 20px;
  border-top: 1px solid var(--border);
}
.btn-cancel {
  padding: 9px 18px;
  background: transparent;
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  color: var(--text-secondary);
  font-family: inherit;
  font-size: 13px;
  cursor: pointer;
}
.btn-save {
  padding: 9px 22px;
  background: var(--accent);
  border: none;
  border-radius: var(--radius-md);
  color: white;
  font-family: inherit;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  transition: background 150ms ease;
}
.btn-save:hover {
  background: var(--accent-light);
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
