<script setup>
/**
 * 词典编辑器
 * 支持新建和编辑词典类型资源
 * 每条词条包含词条名和释义
 * 支持批量导入（粘贴文本或上传TXT文件）
 * 支持自动保存（每30秒，编辑模式下）
 */
import { ref, reactive, onMounted, computed, watch, onBeforeUnmount } from 'vue'
import { useRouter, useRoute, onBeforeRouteLeave } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { showToast, showLoadingToast, closeToast, showConfirmDialog } from 'vant'
import { createResource, getResourceDetail, updateResource } from '@/api/resource'
import ResourceIcon from '@/components/ResourceIcon.vue'
import { readFileContent, readMultipleFiles, mergeTexts, isSupportedFile, isDictionaryJsonFormat, parseDictionaryJson } from '@/utils/fileImport'
import { useDragDrop } from '@/composables/useDragDrop'
import VersionHistory from '@/components/VersionHistory.vue'

const { t } = useI18n()
const router = useRouter()
const route = useRoute()

/** 资源ID（编辑模式时有值） */
const resourceId = computed(() => route.params.id ? Number(route.params.id) : null)

/** 是否为编辑模式 */
const isEdit = computed(() => !!resourceId.value)

/** 当前激活的 Tab */
const activeTab = ref(0)

/** 是否正在保存 */
const saving = ref(false)

/** 是否有未保存的修改 */
const isDirty = ref(false)

/** 是否显示版本历史面板 */
const showVersionHistory = ref(false)

/** 保存后的快照 */
let savedSnapshot = ''

/** 基本信息 */
const meta = reactive({
  title: '',
  abbr: '',
  iso: 'zh',
  summary: '',
  copyright: ''
})

/** 词条列表 */
const entries = ref([])

/** 新增词条表单 */
const newEntry = reactive({
  word: '',
  definition: ''
})

/** 是否显示批量导入弹窗 */
const showImportPopup = ref(false)

/** 导入文本内容 */
const importText = ref('')

/** 文件上传输入框 ref */
const fileInput = ref(null)

/** 文件夹上传输入框 ref */
const folderInput = ref(null)

/** 是否正在读取导入文件 */
const importLoading = ref(false)

/** 导入进度 (0-100) */
const importProgress = ref(0)

/** 正在编辑的条目索引（-1 表示不在编辑模式） */
const editingIndex = ref(-1)

/** 条目搜索关键词 */
const entrySearchQuery = ref('')

/** 上次删除的条目（用于撤销） */
const lastDeleted = ref(null)

/** 上次批量导入的条目（用于撤销批量导入） */
const lastBatchImport = ref(null)

/** 导入预览数据 */
const importPreviewData = ref(null)

/** 是否显示导入预览 */
const showImportPreview = ref(false)

/** 导入结果报告 */
const importReport = ref(null)

/** 是否显示导入报告 */
const showImportReport = ref(false)

/** 词条列表可见数量（懒加载） */
const visibleCount = ref(50)

/** 是否还有更多词条可加载 */
const hasMoreEntries = computed(() => filteredEntries.value.length > visibleCount.value)

/** 当前可见的词条列表（截取前 visibleCount 条） */
const visibleEntries = computed(() => filteredEntries.value.slice(0, visibleCount.value))

/** 加载更多词条 */
function loadMoreEntries() {
  visibleCount.value += 50
}

/** 按字母/首字排序词条 */
function sortEntriesAlphabetically() {
  entries.value.sort((a, b) => a.word.localeCompare(b.word))
  showToast(t('dictionary_sorted'))
}

/**
 * 预览：按首字母分组词条
 */
const previewGroups = computed(() => {
  const groups = {}
  entries.value.forEach(entry => {
    const word = (entry.word || '').trim()
    if (!word) return
    const firstChar = word[0].toUpperCase()
    const key = /[A-Z]/.test(firstChar) ? firstChar : firstChar
    if (!groups[key]) {
      groups[key] = { letter: key, words: [] }
    }
    groups[key].words.push(entry)
  })
  return Object.values(groups).sort((a, b) => a.letter.localeCompare(b.letter))
})

/** 预览搜索关键词 */
const previewSearch = ref('')

/** 滚动到指定字母分组 */
function scrollToGroup(letter) {
  const el = document.getElementById('preview-group-' + letter)
  if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' })
}

/** 预览筛选后的分组 */
const filteredPreviewGroups = computed(() => {
  if (!previewSearch.value.trim()) return previewGroups.value
  const kw = previewSearch.value.trim().toLowerCase()
  return previewGroups.value
    .map(g => ({
      ...g,
      words: g.words.filter(w =>
        w.word.toLowerCase().includes(kw) || w.definition.toLowerCase().includes(kw)
      )
    }))
    .filter(g => g.words.length > 0)
})

/** 当前正在读取的文件名（进度显示） */
const importFileName = ref('')

/** 拖拽上传：文件拖入后打开导入弹窗并读取内容 */
const { isDragOver, onDragOver, onDragLeave, onDrop } = useDragDrop(async (files) => {
  openImport()
  importLoading.value = true
  importProgress.value = 0
  try {
    const { results, errors } = await readMultipleFiles(files, (current, total, fileName) => {
      importProgress.value = Math.round((current / total) * 100)
      importFileName.value = fileName
    })
    if (results.length === 0) {
      showToast(t('import_no_supported_files'))
      return
    }
    importText.value = results.length === 1 ? results[0].text : mergeTexts(results)
  } catch (err) {
    showToast(t('error'))
  } finally {
    importLoading.value = false
  }
})

/** 搜索时重置可见数量 */
watch(entrySearchQuery, () => { visibleCount.value = 50 })

/** 经过搜索过滤后的条目列表（保留原始索引） */
const filteredEntries = computed(() => {
  const items = entries.value.map((e, i) => ({ ...e, _realIndex: i }))
  if (!entrySearchQuery.value.trim()) return items
  const q = entrySearchQuery.value.trim().toLowerCase()
  return items.filter(e =>
    e.word.toLowerCase().includes(q) || e.definition.toLowerCase().includes(q)
  )
})

/** 自动保存定时器 */
let autoSaveTimer = null

function getSnapshot() {
  return JSON.stringify({ meta: { ...meta }, entries: entries.value })
}

function markSaved() {
  savedSnapshot = getSnapshot()
  isDirty.value = false
}

function checkDirty() {
  isDirty.value = getSnapshot() !== savedSnapshot
}

watch([() => ({ ...meta }), entries], () => checkDirty(), { deep: true })

onBeforeRouteLeave((to, from, next) => {
  if (isDirty.value) {
    showConfirmDialog({
      title: t('editor_unsaved'),
      message: t('editor_unsaved_confirm')
    }).then(() => next()).catch(() => next(false))
  } else {
    next()
  }
})

function onBeforeUnloadHandler(e) {
  if (isDirty.value) { e.preventDefault(); e.returnValue = '' }
}

/**
 * 启动自动保存定时器（每30秒）
 */
function startAutoSave() {
  stopAutoSave()
  autoSaveTimer = setInterval(() => {
    if (isDirty.value && isEdit.value && !saving.value) {
      handleAutoSave()
    }
  }, 30000)
}

/**
 * 停止自动保存定时器
 */
function stopAutoSave() {
  if (autoSaveTimer) {
    clearInterval(autoSaveTimer)
    autoSaveTimer = null
  }
}

/**
 * 执行自动保存（静默保存）
 */
async function handleAutoSave() {
  saving.value = true
  try {
    const metaJson = JSON.stringify({
      title: meta.title,
      abbr: meta.abbr,
      iso: meta.iso,
      summary: meta.summary,
      copyright: meta.copyright
    })
    const contentJson = JSON.stringify(entries.value)

    await updateResource(resourceId.value, {
      title: meta.title,
      metaJson,
      contentJson
    })

    markSaved()
    showToast({ message: t('auto_saved'), duration: 1500 })
  } catch (e) {
    // 自动保存失败不弹错误
  } finally {
    saving.value = false
  }
}

/**
 * 键盘快捷键：Ctrl+S / Cmd+S 保存
 */
function onKeyDown(e) {
  if ((e.ctrlKey || e.metaKey) && e.key === 's') {
    e.preventDefault()
    handleSave()
  }
}

onMounted(() => {
  window.addEventListener('beforeunload', onBeforeUnloadHandler)
  window.addEventListener('keydown', onKeyDown)
  loadResource()
  startAutoSave()
})

onBeforeUnmount(() => {
  window.removeEventListener('beforeunload', onBeforeUnloadHandler)
  window.removeEventListener('keydown', onKeyDown)
  stopAutoSave()
})

/**
 * 加载已有资源
 */
async function loadResource() {
  if (!resourceId.value) {
    markSaved()
    return
  }

  showLoadingToast({ message: t('loading'), forbidClick: true })
  try {
    const res = await getResourceDetail(resourceId.value)
    const data = res.data

    if (data.metaJson) {
      Object.assign(meta, JSON.parse(data.metaJson))
    }
    meta.title = data.title || meta.title

    if (data.contentJson) {
      entries.value = JSON.parse(data.contentJson)
    }

    markSaved()
  } catch (e) {
    showToast(t('error'))
  } finally {
    closeToast()
  }
}

/**
 * 添加词条（新增模式）
 */
function addEntry() {
  if (!newEntry.word.trim() || !newEntry.definition.trim()) {
    showToast(t('dictionary_word_placeholder'))
    return
  }
  entries.value.push({
    word: newEntry.word.trim(),
    definition: newEntry.definition.trim()
  })
  newEntry.word = ''
  newEntry.definition = ''
}

/**
 * 进入编辑模式：点击条目填充表单
 */
function startEdit(index) {
  const entry = entries.value[index]
  newEntry.word = entry.word
  newEntry.definition = entry.definition
  editingIndex.value = index
}

/**
 * 确认更新条目
 */
function updateEntry() {
  if (!newEntry.word.trim() || !newEntry.definition.trim()) {
    showToast(t('dictionary_word_placeholder'))
    return
  }
  entries.value[editingIndex.value] = {
    word: newEntry.word.trim(),
    definition: newEntry.definition.trim()
  }
  cancelEdit()
}

/**
 * 取消编辑模式
 */
function cancelEdit() {
  editingIndex.value = -1
  newEntry.word = ''
  newEntry.definition = ''
}

/**
 * 删除词条（支持撤销）
 */
function removeEntry(index) {
  const deleted = entries.value[index]
  lastDeleted.value = { entry: { ...deleted }, index }
  entries.value.splice(index, 1)
  /* 如果删除的是正在编辑的条目，退出编辑模式 */
  if (editingIndex.value === index) {
    cancelEdit()
  } else if (editingIndex.value > index) {
    editingIndex.value--
  }
  showToast({ message: t('entry_deleted'), duration: 3000 })
}

/**
 * 撤销上次删除
 */
function undoDelete() {
  if (!lastDeleted.value) return
  const { entry, index } = lastDeleted.value
  const insertAt = Math.min(index, entries.value.length)
  entries.value.splice(insertAt, 0, entry)
  lastDeleted.value = null
  showToast(t('undo_delete'))
}

/**
 * 上移条目
 */
function moveEntryUp(index) {
  if (index <= 0) return
  const temp = entries.value[index]
  entries.value.splice(index, 1)
  entries.value.splice(index - 1, 0, temp)
}

/**
 * 下移条目
 */
function moveEntryDown(index) {
  if (index >= entries.value.length - 1) return
  const temp = entries.value[index]
  entries.value.splice(index, 1)
  entries.value.splice(index + 1, 0, temp)
}

/**
 * 打开批量导入弹窗
 */
function openImport() {
  importText.value = ''
  showImportPopup.value = true
}

/**
 * 处理文件选择（支持 TXT/PDF/Word/JSON）
 */
async function onFileSelected(event) {
  const file = event.target.files[0]
  if (!file) return
  event.target.value = ''

  if (!isSupportedFile(file)) {
    showToast(t('import_error_unsupported'))
    return
  }

  importLoading.value = true
  try {
    const { text } = await readFileContent(file)

    /* 检测是否为词典 APP JSON 格式 */
    if (file.name.toLowerCase().endsWith('.json') && isDictionaryJsonFormat(text)) {
      const result = parseDictionaryJson(text)
      if (result) {
        /* 直接导入词条 */
        const newEntries = result.entries.map(e => ({
          word: e.title,
          definition: e.content
        }))
        entries.value.push(...newEntries)

        /* 更新元数据（仅空字段） */
        if (!meta.title && result.meta.title) meta.title = result.meta.title
        if (!meta.abbr && result.meta.abbr) meta.abbr = result.meta.abbr
        if (!meta.iso && result.meta.iso) meta.iso = result.meta.iso
        if (!meta.summary && result.meta.summary) meta.summary = result.meta.summary

        showImportPopup.value = false
        showToast(`JSON 导入成功：${newEntries.length} 条词条`)
        isDirty.value = true
        return
      }
    }

    importText.value = text
  } catch (e) {
    const errorKey = {
      PDF_READ_ERROR: 'import_error_pdf',
      DOCX_READ_ERROR: 'import_error_docx',
      TXT_READ_ERROR: 'import_error_txt'
    }[e.message] || 'error'
    showToast(t(errorKey))
  } finally {
    importLoading.value = false
  }
}

/**
 * 处理文件夹选择（批量导入）
 */
async function onFolderSelected(event) {
  const files = Array.from(event.target.files)
  if (files.length === 0) return
  event.target.value = ''

  importLoading.value = true
  importProgress.value = 0
  importFileName.value = ''

  try {
    const { results, errors } = await readMultipleFiles(files, (current, total, fileName) => {
      importProgress.value = Math.round((current / total) * 100)
      importFileName.value = fileName
    })

    if (results.length === 0) {
      showToast(t('import_no_supported_files'))
      return
    }

    importText.value = mergeTexts(results)

    if (errors.length > 0) {
      showToast(t('import_folder_with_errors', { success: results.length, fail: errors.length }))
    } else {
      showToast(t('import_folder_result', { success: results.length }))
    }
  } catch (e) {
    showToast(t('error'))
  } finally {
    importLoading.value = false
    closeToast()
  }
}

/**
 * 解析导入文本为词条数组
 * 格式：每条词条占两行（第一行词条名，第二行释义），用空行或 --- 分隔
 */
function parseImportText(text) {
  const blocks = text.split(/\n\s*(?:---\s*\n\s*)?\n/).filter(b => b.trim())
  const parsed = []
  const skipped = []

  for (const block of blocks) {
    const lines = block.split('\n').filter(l => l.trim())
    if (lines.length >= 2) {
      parsed.push({
        word: lines[0].trim(),
        definition: lines.slice(1).join('\n').trim()
      })
    } else if (lines.length === 1) {
      skipped.push(lines[0].trim())
    }
  }

  return { parsed, skipped }
}

/**
 * 生成导入预览（预览后再确认）
 */
function generateImportPreview() {
  const text = importText.value.trim()
  if (!text) {
    showToast(t('import_empty'))
    return
  }

  const { parsed, skipped } = parseImportText(text)
  if (parsed.length === 0) {
    showToast(t('import_all_invalid'))
    return
  }

  /* 检测重复词条 */
  const existingWords = new Set(entries.value.map(e => e.word.trim().toLowerCase()))
  const duplicates = parsed.filter(p => existingWords.has(p.word.toLowerCase()))

  importPreviewData.value = {
    entries: parsed,
    preview: parsed.slice(0, 5),
    hasMore: parsed.length > 5,
    totalCount: parsed.length,
    skippedCount: skipped.length,
    duplicateCount: duplicates.length,
    duplicateWords: duplicates.slice(0, 3).map(d => d.word)
  }

  showImportPreview.value = true
}

/**
 * 确认批量导入词条（从预览确认）
 */
function confirmImport() {
  if (!importPreviewData.value) return

  const newEntries = importPreviewData.value.entries
  const startIndex = entries.value.length

  /* 记录导入前的状态，支持撤销 */
  lastBatchImport.value = {
    startIndex,
    count: newEntries.length
  }

  /* 添加所有词条 */
  entries.value.push(...newEntries)

  /* 生成导入报告 */
  importReport.value = {
    total: newEntries.length,
    skipped: importPreviewData.value.skippedCount,
    duplicates: importPreviewData.value.duplicateCount
  }

  showImportPreview.value = false
  showImportPopup.value = false
  importPreviewData.value = null
  showImportReport.value = true
  checkDirty()
}

/**
 * 撤销批量导入
 */
function undoBatchImport() {
  if (!lastBatchImport.value) return
  const { startIndex, count } = lastBatchImport.value
  entries.value.splice(startIndex, count)
  lastBatchImport.value = null
  showImportReport.value = false
  showToast(t('import_undo_success'))
  checkDirty()
}

/**
 * 保存
 */
async function handleSave() {
  if (!meta.title) {
    showToast(t('editor_bible_title'))
    activeTab.value = 0
    return
  }

  saving.value = true
  showLoadingToast({ message: t('loading'), forbidClick: true })

  try {
    const metaJson = JSON.stringify({
      title: meta.title,
      abbr: meta.abbr,
      iso: meta.iso,
      summary: meta.summary,
      copyright: meta.copyright
    })
    const contentJson = JSON.stringify(entries.value)

    if (isEdit.value) {
      await updateResource(resourceId.value, {
        title: meta.title,
        metaJson,
        contentJson
      })
    } else {
      const res = await createResource({
        type: 'dictionary',
        title: meta.title,
        metaJson
      })
      const newId = res.data.id
      await updateResource(newId, { contentJson })
      router.replace(`/dictionary/edit/${newId}`)
    }

    markSaved()
    showToast(t('editor_save_success'))
  } catch (e) {
    showToast(t('error'))
  } finally {
    saving.value = false
    closeToast()
  }
}
</script>

<template>
  <main class="page" role="main" :aria-label="isEdit ? t('dictionary_title') : t('dictionary_new_title')">
    <van-nav-bar
      :title="isEdit ? t('dictionary_title') : t('dictionary_new_title')"
      left-arrow
      @click-left="router.push('/')"
    >
      <template #right>
        <van-button v-if="isEdit" plain size="small" @click="showVersionHistory = true" style="margin-right: 8px;">
          {{ t('version_history') }}
        </van-button>
        <van-button type="primary" size="small" :loading="saving" @click="handleSave">
          {{ t('save') }}
        </van-button>
      </template>
    </van-nav-bar>

    <!-- 类型横幅 -->
    <div class="editor-banner" style="background: linear-gradient(135deg, #E8A838 0%, #C08820 100%)">
      <div class="banner-icon" aria-hidden="true">
        <ResourceIcon type="dictionary" :size="28" />
      </div>
      <div class="banner-text">
        <h2 class="banner-title">{{ meta.title || t('dictionary_new_title') }}</h2>
        <p class="banner-subtitle">{{ t('type_dictionary') }}</p>
      </div>
    </div>

    <!-- 未保存提醒 -->
    <div v-if="isDirty" class="dirty-bar" role="status">{{ t('editor_modified') }}</div>

    <van-tabs v-model:active="activeTab" sticky>
      <!-- 基本信息 -->
      <van-tab :title="t('editor_meta')">
        <van-form class="form-section">
          <van-cell-group inset>
            <van-field v-model="meta.title" :label="t('editor_bible_title')" :placeholder="t('editor_bible_title_placeholder')" aria-required="true" />
            <van-field v-model="meta.abbr" :label="t('editor_abbr')" :placeholder="t('editor_abbr_placeholder')" />
            <van-field v-model="meta.iso" :label="t('editor_iso')" :placeholder="t('editor_iso_placeholder')" />
            <van-field v-model="meta.summary" :label="t('editor_summary')" :placeholder="t('editor_summary_placeholder')" type="textarea" rows="3" />
            <van-field v-model="meta.copyright" :label="t('dictionary_copyright')" :placeholder="t('dictionary_copyright_placeholder')" />
          </van-cell-group>
        </van-form>
      </van-tab>

      <!-- 词条内容 -->
      <van-tab :title="entries.length > 0 ? `${t('dictionary_entries')} (${entries.length})` : t('dictionary_entries')">
        <div class="content-section" @dragover.prevent="onDragOver" @dragleave="onDragLeave" @drop="onDrop" :class="{ 'drag-over': isDragOver }">
          <!-- 拖拽遮罩 -->
          <div v-if="isDragOver" class="drag-overlay" aria-live="polite">
            <van-icon name="upgrade" size="48" />
            <span>{{ t('import_drag_hint') }}</span>
          </div>
          <!-- 编辑提示条 -->
          <div v-if="editingIndex >= 0" class="editing-bar" role="status">
            {{ t('editing_entry') }}: {{ entries[editingIndex]?.word }}
          </div>

          <!-- 新增/编辑表单 -->
          <van-cell-group inset>
            <van-field v-model="newEntry.word" :label="t('dictionary_word')" :placeholder="t('dictionary_word_placeholder')" />
            <van-field v-model="newEntry.definition" :label="t('dictionary_definition')" :placeholder="t('dictionary_definition_placeholder')" type="textarea" rows="4" />
          </van-cell-group>
          <div class="action-btn-row">
            <template v-if="editingIndex >= 0">
              <van-button type="primary" size="small" icon="success" @click="updateEntry">
                {{ t('dictionary_update') }}
              </van-button>
              <van-button plain size="small" @click="cancelEdit">
                {{ t('cancel_edit') }}
              </van-button>
            </template>
            <template v-else>
              <van-button plain type="primary" size="small" icon="plus" @click="addEntry">
                {{ t('dictionary_add') }}
              </van-button>
              <van-button plain type="primary" size="small" icon="upgrade" @click="openImport">
                {{ t('import_title') }}
              </van-button>
              <van-button v-if="entries.length > 1" plain size="small" icon="sort" @click="sortEntriesAlphabetically">
                {{ t('dictionary_sort_az') }}
              </van-button>
            </template>
          </div>

          <!-- 撤销删除按钮 -->
          <div v-if="lastDeleted" class="undo-bar" @click="undoDelete">
            <van-icon name="replay" size="16" />
            <span>{{ t('undo') }}: {{ lastDeleted.entry.word }}</span>
          </div>

          <!-- 条目搜索（有条目时显示） -->
          <van-search
            v-if="entries.length > 3"
            v-model="entrySearchQuery"
            :placeholder="t('editor_search_entries')"
            shape="round"
            class="entry-search"
            :aria-label="t('editor_search_entries')"
          />

          <!-- 词条列表 -->
          <van-empty v-if="entries.length === 0" :description="t('dictionary_empty')" />
          <van-cell-group inset v-else class="entries-list">
            <van-swipe-cell v-for="entry in visibleEntries" :key="entry.word + entry._realIndex">
              <van-cell
                :title="entry.word"
                :label="entry.definition"
                :class="{ 'editing-cell': editingIndex === entry._realIndex }"
                clickable
                @click="startEdit(entry._realIndex)"
              >
                <template #right-icon>
                  <div class="entry-actions">
                    <van-icon v-if="!entrySearchQuery" name="arrow-up" size="16" color="var(--app-text-tertiary)" @click.stop="moveEntryUp(entry._realIndex)" :aria-label="t('editor_move_up')" />
                    <van-icon v-if="!entrySearchQuery" name="arrow-down" size="16" color="var(--app-text-tertiary)" @click.stop="moveEntryDown(entry._realIndex)" :aria-label="t('editor_move_down')" />
                    <van-icon name="edit" size="16" color="var(--app-text-tertiary)" />
                  </div>
                </template>
              </van-cell>
              <template #right>
                <van-button square type="danger" :text="t('delete')" class="swipe-btn" @click="removeEntry(entry._realIndex)" />
              </template>
            </van-swipe-cell>
            <!-- 加载更多 -->
            <div v-if="hasMoreEntries" class="load-more-bar" @click="loadMoreEntries">
              <span>{{ t('dictionary_load_more', { remaining: filteredEntries.length - visibleCount }) }}</span>
            </div>
          </van-cell-group>
        </div>

        <!-- 批量导入弹窗 -->
        <van-popup
          v-model:show="showImportPopup"
          round
          position="bottom"
          :style="{ height: '80%' }"
          closeable
        >
          <div class="import-popup">
            <h3 class="import-title">{{ t('import_title') }}</h3>

            <!-- 格式提示 -->
            <p class="import-format-hint">{{ t('import_supported_formats') }}</p>

            <!-- 文件上传按钮组 -->
            <div class="import-file-btn">
              <van-button plain size="small" icon="description" @click="fileInput?.click()" :loading="importLoading">
                {{ t('import_select_files') }}
              </van-button>
              <van-button plain size="small" icon="cluster-o" @click="folderInput?.click()" :loading="importLoading">
                {{ t('import_select_folder') }}
              </van-button>
              <input ref="fileInput" type="file" accept=".txt,.pdf,.docx,.json" style="display: none" @change="onFileSelected" />
              <input ref="folderInput" type="file" webkitdirectory style="display: none" @change="onFolderSelected" />
            </div>

            <!-- 导入进度条 -->
            <div v-if="importLoading && importProgress > 0" class="import-progress-wrapper">
              <van-progress
                :percentage="importProgress"
                :color="'var(--app-primary)'"
                stroke-width="6"
                class="import-progress"
              />
              <p v-if="importFileName" class="import-file-name">{{ importFileName }}</p>
            </div>

            <!-- 文本输入区 -->
            <van-field
              v-model="importText"
              type="textarea"
              rows="12"
              :placeholder="t('import_dictionary_placeholder')"
              :aria-label="t('import_paste')"
              class="import-textarea"
            />

            <!-- 预览导入 -->
            <div class="import-actions">
              <van-button type="primary" block round @click="generateImportPreview" :disabled="importLoading">
                {{ t('import_preview') }}
              </van-button>
            </div>
          </div>
        </van-popup>

        <!-- 导入预览弹窗 -->
        <van-popup
          v-model:show="showImportPreview"
          round
          position="bottom"
          :style="{ height: '60%' }"
          closeable
        >
          <div class="import-popup" v-if="importPreviewData">
            <h3 class="import-title">{{ t('import_preview') }}</h3>
            <p class="import-preview-desc">{{ t('import_preview_desc') }}</p>
            <div class="preview-summary">
              {{ t('import_preview_count', { count: importPreviewData.totalCount }) }}
            </div>

            <!-- 重复词条警告 -->
            <div v-if="importPreviewData.duplicateCount > 0" class="preview-warning">
              {{ t('import_duplicate_warning', { count: importPreviewData.duplicateCount }) }}
              <span v-if="importPreviewData.duplicateWords.length > 0" class="duplicate-list">
                ({{ importPreviewData.duplicateWords.join(', ') }}{{ importPreviewData.duplicateCount > 3 ? '...' : '' }})
              </span>
            </div>

            <!-- 跳过条目提示 -->
            <div v-if="importPreviewData.skippedCount > 0" class="preview-info">
              {{ t('import_format_error', { count: importPreviewData.skippedCount }) }}
            </div>

            <!-- 预览内容 -->
            <div class="import-preview-content">
              <div v-for="(entry, idx) in importPreviewData.preview" :key="idx" class="preview-entry">
                <strong class="preview-entry-verse">{{ entry.word }}</strong>
                <p class="preview-entry-content">{{ entry.definition }}</p>
              </div>
              <p v-if="importPreviewData.hasMore" class="preview-more">...</p>
            </div>

            <div class="import-actions">
              <van-button type="primary" block round @click="confirmImport">
                {{ t('import_confirm') }}
              </van-button>
            </div>
          </div>
        </van-popup>

        <!-- 导入报告弹窗 -->
        <van-popup
          v-model:show="showImportReport"
          round
          position="center"
          :style="{ width: '85%', padding: '24px' }"
          closeable
        >
          <div v-if="importReport" class="import-report">
            <h3 class="report-title">{{ t('import_report_title') }}</h3>
            <div class="report-item report-success">
              {{ t('import_report_added', { count: importReport.total }) }}
            </div>
            <div v-if="importReport.skipped > 0" class="report-item report-skip">
              {{ t('import_report_skipped', { count: importReport.skipped }) }}
            </div>
            <div v-if="importReport.duplicates > 0" class="report-item report-warn">
              {{ t('import_report_duplicates', { count: importReport.duplicates }) }}
            </div>
            <div class="report-actions">
              <van-button plain size="small" @click="undoBatchImport">{{ t('import_undo') }}</van-button>
              <van-button type="primary" size="small" @click="showImportReport = false">{{ t('confirm') }}</van-button>
            </div>
          </div>
        </van-popup>
      </van-tab>

      <!-- 预览 -->
      <van-tab :title="t('dictionary_preview')">
        <div class="preview-section">
          <!-- 预览搜索 -->
          <van-search
            v-model="previewSearch"
            :placeholder="t('dict_detail_search_ph')"
            shape="round"
            class="entry-search"
          />

          <van-empty v-if="entries.length === 0" :description="t('dictionary_empty')" />

          <!-- 字母索引栏 -->
          <div v-if="previewGroups.length > 0" class="preview-letter-bar">
            <span
              v-for="group in previewGroups"
              :key="group.letter"
              class="preview-letter-tag"
              @click="scrollToGroup(group.letter)"
            >
              {{ group.letter }}
            </span>
          </div>

          <!-- 分组列表 -->
          <div v-for="group in filteredPreviewGroups" :key="group.letter" :id="'preview-group-' + group.letter" class="preview-group">
            <div class="preview-group-header">
              <span class="preview-group-letter">{{ group.letter }}</span>
              <span class="preview-group-count">{{ group.words.length }} {{ t('dict_detail_word_unit') }}</span>
            </div>
            <van-cell-group inset>
              <van-cell
                v-for="(entry, idx) in group.words"
                :key="idx"
                :title="entry.word"
                :label="entry.definition"
              />
            </van-cell-group>
          </div>
        </div>
      </van-tab>
    </van-tabs>

    <!-- 版本历史侧边面板 -->
    <VersionHistory
      v-if="isEdit"
      v-model:show="showVersionHistory"
      :resource-id="resourceId"
      @restored="loadResource"
    />
  </main>
</template>

<style scoped>
/* 编辑器类型横幅 */
.editor-banner {
  padding: 14px 20px;
  display: flex;
  align-items: center;
  gap: 14px;
}

.banner-icon {
  width: 44px;
  height: 44px;
  background: rgba(255,255,255,0.2);
  border-radius: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #fff;
  flex-shrink: 0;
}

.banner-title {
  font-size: 16px;
  font-weight: 600;
  color: #fff;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 60vw;
}

.banner-subtitle {
  font-size: 12px;
  color: rgba(255,255,255,0.7);
  margin-top: 2px;
}

.form-section { padding-top: 12px; }
.content-section {
  padding-top: 12px;
  position: relative;
}

/* 拖拽上传样式 */
.drag-over {
  outline: 3px dashed var(--app-primary, #1989fa);
  outline-offset: -3px;
  border-radius: 8px;
}

.drag-overlay {
  position: absolute;
  inset: 0;
  z-index: 10;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  background: rgba(25, 137, 250, 0.06);
  border-radius: 8px;
  color: var(--app-primary, #1989fa);
  font-size: 16px;
  font-weight: 600;
  pointer-events: none;
}
.action-btn-row {
  padding: 12px 16px;
  display: flex;
  gap: 12px;
}
.entries-list { margin-top: 12px; }
.swipe-btn { height: 100%; }

/* 编辑提示条 */
.editing-bar {
  background: var(--app-primary-light);
  color: var(--app-primary);
  text-align: center;
  padding: 6px 12px;
  font-size: 13px;
  font-weight: 500;
  border-bottom: 1px solid var(--app-primary);
}

/* 正在编辑的条目高亮 */
.editing-cell {
  background: var(--app-primary-light) !important;
}

/* 导入格式提示 */
.import-format-hint {
  font-size: 12px;
  color: var(--app-text-secondary);
  padding: 0 0 8px;
}

/* 导入进度 */
.import-progress-wrapper {
  margin: 8px 0 12px;
}

.import-progress {
  margin-bottom: 4px;
}

.import-file-name {
  font-size: 11px;
  color: var(--app-text-tertiary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* 预览弹窗样式 */
.import-preview-desc {
  font-size: 13px;
  color: var(--app-text-secondary);
  padding-bottom: 8px;
}

.preview-summary {
  font-size: 14px;
  font-weight: 600;
  color: var(--app-primary);
  padding: 8px 0 12px;
}

.preview-warning {
  font-size: 13px;
  color: #e65100;
  background: #fff3e0;
  padding: 8px 12px;
  border-radius: 6px;
  margin-bottom: 8px;
}

:root[data-theme="dark"] .preview-warning {
  background: rgba(230, 81, 0, 0.15);
  color: #ffb74d;
}

.duplicate-list {
  font-size: 12px;
  opacity: 0.8;
}

.preview-info {
  font-size: 13px;
  color: var(--app-text-secondary);
  background: var(--app-bg);
  padding: 8px 12px;
  border-radius: 6px;
  margin-bottom: 8px;
}

.import-preview-content {
  max-height: 240px;
  overflow-y: auto;
  padding: 12px;
  background: var(--app-bg);
  border-radius: 8px;
  margin-bottom: 16px;
}

.preview-entry {
  margin-bottom: 12px;
  padding-bottom: 12px;
  border-bottom: 1px solid var(--app-border);
}

.preview-entry:last-child {
  margin-bottom: 0;
  padding-bottom: 0;
  border-bottom: none;
}

.preview-entry-verse {
  font-size: 13px;
  color: var(--app-primary);
  display: block;
  margin-bottom: 4px;
}

.preview-entry-content {
  font-size: 14px;
  color: var(--app-text-primary);
  line-height: 1.6;
}

.preview-more {
  text-align: center;
  color: var(--app-text-tertiary);
  font-size: 16px;
  padding: 4px 0;
}

/* 导入报告弹窗 */
.import-report {
  text-align: center;
}

.report-title {
  font-size: 16px;
  font-weight: 600;
  color: var(--app-text-primary);
  margin-bottom: 16px;
}

.report-item {
  font-size: 14px;
  padding: 8px 0;
  border-bottom: 1px solid var(--app-border);
}

.report-success { color: var(--app-accent); }
.report-skip { color: var(--app-text-secondary); }
.report-warn { color: #e65100; }

:root[data-theme="dark"] .report-warn { color: #ffb74d; }

.report-actions {
  display: flex;
  justify-content: center;
  gap: 12px;
  margin-top: 16px;
}

/* 条目搜索 */
.entry-search {
  padding: 4px 12px;
}

/* 条目操作按钮组 */
.entry-actions {
  display: flex;
  align-items: center;
  gap: 10px;
}

/* 撤销删除条 */
.undo-bar {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 8px 16px;
  margin: 8px 16px 0;
  background: var(--app-primary-light);
  color: var(--app-primary);
  border-radius: 8px;
  font-size: 13px;
  cursor: pointer;
  transition: background 0.2s;
}

.undo-bar:active {
  background: var(--app-primary);
  color: #fff;
}

/* 加载更多 */
.load-more-bar {
  text-align: center;
  padding: 12px 16px;
  color: var(--app-primary);
  font-size: 13px;
  cursor: pointer;
  transition: background 0.2s;
}

.load-more-bar:active {
  background: var(--app-primary-light);
}

/* 预览标签页 */
.preview-section {
  padding-top: 8px;
}

.preview-letter-bar {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  padding: 8px 16px 12px;
}

.preview-letter-tag {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 32px;
  height: 32px;
  padding: 0 6px;
  border-radius: 8px;
  background: var(--app-primary-light);
  color: var(--app-primary);
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s;
}

.preview-letter-tag:active {
  background: var(--app-primary);
  color: #fff;
}

.preview-group {
  margin-bottom: 12px;
}

.preview-group-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 20px;
}

.preview-group-letter {
  font-size: 18px;
  font-weight: 700;
  color: var(--app-primary);
}

.preview-group-count {
  font-size: 12px;
  color: var(--app-text-tertiary);
}
</style>
