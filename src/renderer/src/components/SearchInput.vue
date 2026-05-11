<template>
  <div v-click-outside="closeResults" class="search-container">
    <div class="search-input-wrapper" :class="{ 'is-focused': isFocused }">
      <svg
        class="search-icon"
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2.5"
      >
        <circle cx="11" cy="11" r="8" />
        <line x1="21" y1="21" x2="16.65" y2="16.65" />
      </svg>
      <input
        v-model="query"
        type="text"
        :placeholder="placeholder"
        @focus="isFocused = true"
        @input="onInput"
        @keydown.down.prevent="moveHighlight(1)"
        @keydown.up.prevent="moveHighlight(-1)"
        @keydown.enter="selectHighlighted"
        @keydown.esc="closeResults"
      />
      <button v-if="query" class="btn-clear" @click="clearSearch">
        <span class="material-icons">close</span>
      </button>
    </div>

    <!-- 検索結果ドロップダウン -->
    <Transition name="fade-slide">
      <div v-if="showResults && results.length > 0" class="search-results">
        <div
          v-for="(res, i) in results"
          :key="res.id"
          class="search-result-item"
          :class="{
            'is-highlighted': i === highlightedIndex,
            'is-shortcut': res.isShortcut
          }"
          @mousedown.prevent="selectResult(res)"
          @mouseenter="highlightedIndex = i"
        >
          <div class="result-icon">
            <span class="material-icons">
              {{
                res.isHomeShortcut
                  ? 'home'
                  : res.type === 'video'
                    ? 'movie'
                    : res.type === 'folder'
                      ? 'folder'
                      : res.type === 'image'
                        ? 'image'
                        : 'audiotrack'
              }}
            </span>
          </div>
          <div class="result-info">
            <div class="result-title">{{ res.title || res.fileName }}</div>
            <div class="result-meta">
              {{ res.seriesTitle }}
              <span v-if="res.relativeFolderPath" class="path-sep"> › </span>
              <span v-if="res.relativeFolderPath" class="path-text">{{
                res.relativeFolderPath
              }}</span>
              <span v-if="res.type !== 'folder'" class="path-sep"> › </span>
              <span v-if="res.type !== 'folder'" class="file-text">{{ res.fileName }}</span>
            </div>
          </div>
          <!-- 右に抜けると決定 (1検索につき1回のみ) -->
          <div class="select-trigger" @mouseenter="!hasSelected && selectResult(res)" />
        </div>
      </div>
      <div v-else-if="showResults && query.length >= 2 && !isLoading" class="search-no-results">
        一致する項目が見つかりません
      </div>
    </Transition>

    <div v-if="isLoading" class="search-loading-bar" />
  </div>
</template>

<script setup lang="ts">
import { ref, onUnmounted } from 'vue'
import { useLibraryStore } from '../stores/libraryStore'
import type { SearchResult } from '../../../types/media'

const props = defineProps<{
  placeholder?: string
}>()

const emit = defineEmits<{
  select: [result: SearchResult]
}>()

const library = useLibraryStore()
const query = ref('')
const results = ref<SearchResult[]>([])
const isLoading = ref(false)
const isFocused = ref(false)
const showResults = ref(false)
const highlightedIndex = ref(-1)
const hasSelected = ref(false)

let debounceTimer: any = null
let searchCleanup: (() => void) | null = null

function onInput() {
  hasSelected.value = false // 新しい入力でリセット
  if (debounceTimer) clearTimeout(debounceTimer)

  if (query.value.length < 2) {
    results.value = []
    showResults.value = false
    if (searchCleanup) {
      searchCleanup()
      searchCleanup = null
    }
    return
  }

  isLoading.value = true
  debounceTimer = setTimeout(async () => {
    try {
      // 以前のリスナーを解除
      if (searchCleanup) searchCleanup()

      // ストリーミング結果の待機
      searchCleanup = window.api.onSearchUpdate((partialResults: SearchResult[]) => {
        results.value = partialResults
        showResults.value = true
      })

      // 最終的な結果も取得 (常にグローバル検索)
      const finalResults = await library.search({
        query: query.value
      })

      // 最終結果で上書き（ストリーミングが間に合わなかった分を含める）
      results.value = finalResults
      showResults.value = true
      highlightedIndex.value = -1
    } finally {
      isLoading.value = false
    }
  }, 300)
}

function selectResult(res: SearchResult) {
  console.log('[DEBUG-SEARCH] selectResult called:', {
    id: res.id,
    fileName: res.fileName,
    type: res.type,
    seriesId: res.seriesId,
    targetFolderPath: res.targetFolderPath
  })

  // すでに選択済みの場合は無視するが、短時間でリセットして再試行を可能にする
  if (hasSelected.value) {
    console.warn('[DEBUG-SEARCH] Already selected, ignoring duplicate call')
    return
  }
  hasSelected.value = true

  emit('select', res)

  // 選択後に少し待ってからフラグをリセット（連続発火防止のみに留める）
  setTimeout(() => {
    hasSelected.value = false
  }, 1000)

  query.value = ''
  results.value = []
  closeResults()
}

function clearSearch() {
  query.value = ''
  results.value = []
  showResults.value = false
}

function closeResults() {
  showResults.value = false
  isFocused.value = false
}

function moveHighlight(dir: number) {
  if (!showResults.value || results.value.length === 0) return
  highlightedIndex.value =
    (highlightedIndex.value + dir + results.value.length) % results.value.length
}

function selectHighlighted() {
  if (highlightedIndex.value >= 0 && results.value[highlightedIndex.value]) {
    selectResult(results.value[highlightedIndex.value])
  }
}

// v-click-outside 指令の簡易実装（本来は外部ライブラリ推奨だが、ここでは直接定義）
const vClickOutside = {
  mounted(el: any, binding: any) {
    el.clickOutsideEvent = (event: Event) => {
      if (!(el === event.target || el.contains(event.target))) {
        binding.value()
      }
    }
    document.addEventListener('click', el.clickOutsideEvent)
  },
  unmounted(el: any) {
    document.removeEventListener('click', el.clickOutsideEvent)
  }
}

onUnmounted(() => {
  if (debounceTimer) clearTimeout(debounceTimer)
  if (searchCleanup) searchCleanup()
})
</script>

<style scoped>
.search-container {
  position: relative;
  width: 240px;
  z-index: 100;
}

.search-input-wrapper {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 0 12px;
  height: 34px;
  background: var(--bg-elevated);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
}

.search-input-wrapper.is-focused {
  background: var(--bg-surface);
  border-color: var(--accent);
  box-shadow: 0 0 0 3px rgba(61, 90, 254, 0.15);
  width: 300px;
  transform: translateX(-60px); /* 集中時に左へ伸ばす */
}

.search-icon {
  color: var(--text-muted);
  flex-shrink: 0;
}

.search-input-wrapper.is-focused .search-icon {
  color: var(--accent);
}

input {
  flex: 1;
  background: transparent;
  border: none;
  outline: none;
  color: var(--text-primary);
  font-family: inherit;
  font-size: 13px;
  width: 100%;
}

input::placeholder {
  color: var(--text-muted);
}

.btn-clear {
  background: transparent;
  border: none;
  color: var(--text-muted);
  cursor: pointer;
  display: flex;
  padding: 2px;
  border-radius: 50%;
}
.btn-clear:hover {
  background: rgba(255, 255, 255, 0.1);
  color: var(--text-primary);
}
.btn-clear .material-icons {
  font-size: 16px;
}

/* 検索結果 */
.search-results {
  position: absolute;
  top: calc(100% + 8px);
  right: 0;
  width: 380px;
  max-height: 400px;
  background: rgba(30, 30, 35, 0.85);
  backdrop-filter: blur(20px);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: var(--radius-lg);
  box-shadow: 0 12px 40px rgba(0, 0, 0, 0.5);
  overflow-y: auto;
  padding: 6px;
  z-index: 10000;
}

.search-result-item {
  position: relative;
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 12px;
  border-radius: var(--radius-md);
  cursor: pointer;
  transition: all 0.1s ease;
  user-select: none;
  width: 100%;
  box-sizing: border-box;
}

/* 右端の決定トリガー（マウスを右に抜くと決定） */
.select-trigger {
  position: absolute;
  top: 0;
  right: 0;
  width: 40px;
  height: 100%;
  z-index: 10;
  pointer-events: auto !important;
}

.search-result-item.is-highlighted {
  background: rgba(255, 255, 255, 0.15);
}

.search-result-item:active {
  background: rgba(255, 255, 255, 0.25);
  transform: scale(0.995);
}

.search-result-item.is-shortcut {
  background: rgba(61, 90, 254, 0.15);
  border: 1px solid rgba(61, 90, 254, 0.3);
  margin-bottom: 4px;
}

.search-result-item.is-shortcut.is-highlighted {
  background: rgba(61, 90, 254, 0.25);
}

.search-result-item.is-shortcut .result-icon {
  background: var(--accent);
  color: white;
}

.search-result-item.is-shortcut .result-title {
  color: var(--accent);
  font-weight: 800;
}

.search-result-item > * {
  pointer-events: none;
}

.result-icon {
  width: 32px;
  height: 32px;
  background: rgba(255, 255, 255, 0.05);
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--accent);
  flex-shrink: 0;
}

.result-info {
  flex: 1;
  min-width: 0;
}

.result-title {
  font-size: 13px;
  font-weight: 600;
  color: var(--text-primary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.result-meta {
  font-size: 11px;
  color: rgba(255, 255, 255, 0.4);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  display: flex;
  align-items: center;
  gap: 4px;
}

.path-sep {
  opacity: 0.3;
}

.path-text {
  color: rgba(255, 255, 255, 0.6);
}

.file-text {
  color: rgba(255, 255, 255, 0.4);
}

.search-no-results {
  position: absolute;
  top: calc(100% + 8px);
  right: 0;
  width: 240px;
  padding: 16px;
  background: var(--bg-surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  font-size: 12px;
  color: var(--text-muted);
  text-align: center;
}

.search-loading-bar {
  position: absolute;
  bottom: 0;
  left: 0;
  height: 2px;
  background: var(--accent);
  width: 100%;
  animation: loading-line 1s infinite linear;
  transform-origin: left;
}

@keyframes loading-line {
  0% {
    transform: scaleX(0);
    left: 0;
  }
  50% {
    transform: scaleX(0.5);
    left: 25%;
  }
  100% {
    transform: scaleX(0);
    left: 100%;
  }
}

.fade-slide-enter-active,
.fade-slide-leave-active {
  transition: all 0.2s ease;
}
.fade-slide-enter-from,
.fade-slide-leave-to {
  opacity: 0;
  transform: translateY(-10px);
}
</style>
