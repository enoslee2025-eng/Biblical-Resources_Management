<script setup>
/**
 * 注释编辑器
 * 支持新建和编辑注释类型资源
 * 每条注释关联一段经文引用，并填写注释内容
 * 支持批量导入（粘贴文本或上传TXT文件）
 * 支持自动保存（每30秒，编辑模式下）
 */
import { ref, reactive, onMounted, computed, watch, onBeforeUnmount } from 'vue'
import { useRouter, useRoute, onBeforeRouteLeave } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { showToast, showLoadingToast, closeToast } from 'vant'
import { ElMessageBox } from 'element-plus'
import { createResource, getResourceDetail, updateResource } from '@/api/resource'
import ResourceIcon from '@/components/ResourceIcon.vue'
import { readFileContent, readMultipleFiles, mergeTexts, isSupportedFile, isCommentaryJsonFormat, parseCommentaryJson, BIBLE_BOOK_NAMES } from '@/utils/fileImport'
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
  summary: ''
})

/** 注释条目列表 */
const entries = ref([])

/** 新增注释表单 */
const newEntry = reactive({
  verse: '',
  content: ''
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

/** 经过搜索过滤后的条目列表（保留原始索引） */
const filteredEntries = computed(() => {
  const items = entries.value.map((e, i) => ({ ...e, _realIndex: i }))
  if (!entrySearchQuery.value.trim()) return items
  const q = entrySearchQuery.value.trim().toLowerCase()
  return items.filter(e =>
    e.verse.toLowerCase().includes(q) || e.content.toLowerCase().includes(q)
  )
})

/** 自动保存定时器 */
let autoSaveTimer = null

/**
 * 生成内容快照
 */
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
    ElMessageBox.confirm(t('editor_unsaved_confirm'), t('editor_unsaved'), {
      confirmButtonText: t('confirm'),
      cancelButtonText: t('cancel'),
      type: 'warning'
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
      summary: meta.summary
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
 * 添加注释条目（新增模式）
 */
function addEntry() {
  if (!newEntry.verse.trim() || !newEntry.content.trim()) {
    showToast(t('commentary_verse_placeholder'))
    return
  }
  entries.value.push({
    verse: newEntry.verse.trim(),
    content: newEntry.content.trim()
  })
  newEntry.verse = ''
  newEntry.content = ''
}

/**
 * 进入编辑模式：点击条目填充表单
 */
function startEdit(index) {
  const entry = entries.value[index]
  newEntry.verse = entry.verse
  newEntry.content = entry.content
  editingIndex.value = index
}

/**
 * 确认更新条目
 */
function updateEntry() {
  if (!newEntry.verse.trim() || !newEntry.content.trim()) {
    showToast(t('commentary_verse_placeholder'))
    return
  }
  entries.value[editingIndex.value] = {
    verse: newEntry.verse.trim(),
    content: newEntry.content.trim()
  }
  cancelEdit()
}

/**
 * 取消编辑模式
 */
function cancelEdit() {
  editingIndex.value = -1
  newEntry.verse = ''
  newEntry.content = ''
}

/**
 * 删除注释条目（支持撤销）
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

    /* 检测是否为注释 APP JSON 格式 */
    if (file.name.toLowerCase().endsWith('.json') && isCommentaryJsonFormat(text)) {
      const result = parseCommentaryJson(text)
      if (result) {
        /* 将注释数据转为编辑器的 entries 格式 */
        const newEntries = []
        for (const [key, items] of Object.entries(result.chapters)) {
          if (!Array.isArray(items) || items.length === 0) continue
          /* 解析键 b{n}c{m} */
          const m = key.match(/^b(\d+)c(\d+)$/)
          if (!m) continue
          const bookNum = parseInt(m[1])
          const chNum = parseInt(m[2])
          const bookName = BIBLE_BOOK_NAMES[bookNum - 1] || t('commentary_book_fallback', { num: bookNum })
          const chLabel = chNum === 0 ? t('commentary_intro_label') : t('commentary_chapter_unit', { num: chNum })

          for (const item of items) {
            if (item.r === 1) continue /* 跳过引用类型，取直接内容 */
            const verseRef = item.v
              ? `${bookName} ${chLabel}:${item.v.replace(/#/g, '').replace(/;/g, ',').replace(/,$/, '')}`
              : `${bookName} ${chLabel}`
            let content = item.c || ''
            /* 如果是引用类型且有 links，尝试获取实际内容 */
            if (item.r === 1 && result.links[item.c]) {
              content = result.links[item.c].c || ''
            }
            if (!content) continue
            newEntries.push({
              verse: verseRef,
              content: content
            })
          }
        }

        entries.value.push(...newEntries)

        /* 更新元数据 */
        if (!meta.title && result.meta.title) meta.title = result.meta.title
        if (!meta.abbr && result.meta.abbr) meta.abbr = result.meta.abbr
        if (!meta.iso && result.meta.iso) meta.iso = result.meta.iso
        if (!meta.summary && result.meta.summary) meta.summary = result.meta.summary

        showImportPopup.value = false
        showToast(t('commentary_json_import_success', { count: newEntries.length }))
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
 * 解析导入文本为条目数组
 * 格式：每条注释占两行（第一行经文引用，第二行注释内容），用空行或 --- 分隔
 */
function parseImportText(text) {
  const blocks = text.split(/\n\s*(?:---\s*\n\s*)?\n/).filter(b => b.trim())
  const parsed = []
  const skipped = []

  for (const block of blocks) {
    const lines = block.split('\n').filter(l => l.trim())
    if (lines.length >= 2) {
      parsed.push({
        verse: lines[0].trim(),
        content: lines.slice(1).join('\n').trim()
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

  /* 检测重复条目 */
  const existingVerses = new Set(entries.value.map(e => e.verse.trim().toLowerCase()))
  const duplicates = parsed.filter(p => existingVerses.has(p.verse.toLowerCase()))

  importPreviewData.value = {
    entries: parsed,
    preview: parsed.slice(0, 5),
    hasMore: parsed.length > 5,
    totalCount: parsed.length,
    skippedCount: skipped.length,
    duplicateCount: duplicates.length,
    duplicateVerses: duplicates.slice(0, 3).map(d => d.verse)
  }

  showImportPreview.value = true
}

/**
 * 确认批量导入注释（从预览确认）
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

  /* 添加所有条目 */
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
      summary: meta.summary
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
        type: 'commentary',
        title: meta.title,
        metaJson
      })
      const newId = res.data.id
      await updateResource(newId, { contentJson })
      router.replace(`/commentary/edit/${newId}`)
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
  <main class="page" role="main" :aria-label="isEdit ? t('commentary_title') : t('commentary_new_title')">
    <van-nav-bar
      :title="isEdit ? t('commentary_title') : t('commentary_new_title')"
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
    <div class="editor-banner" style="background: linear-gradient(135deg, #4CAF7D 0%, #3A8F65 100%)">
      <div class="banner-icon" aria-hidden="true">
        <ResourceIcon type="commentary" :size="28" />
      </div>
      <div class="banner-text">
        <h2 class="banner-title">{{ meta.title || t('commentary_new_title') }}</h2>
        <p class="banner-subtitle">{{ t('type_commentary') }}</p>
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
          </van-cell-group>
        </van-form>
      </van-tab>

      <!-- 注释内容 -->
      <van-tab :title="t('commentary_entries')">
        <div class="content-section" @dragover.prevent="onDragOver" @dragleave="onDragLeave" @drop="onDrop" :class="{ 'drag-over': isDragOver }">
          <!-- 拖拽遮罩 -->
          <div v-if="isDragOver" class="drag-overlay" aria-live="polite">
            <van-icon name="upgrade" size="48" />
            <span>{{ t('import_drag_hint') }}</span>
          </div>
          <!-- 编辑提示条 -->
          <div v-if="editingIndex >= 0" class="editing-bar" role="status">
            {{ t('editing_entry') }}: {{ entries[editingIndex]?.verse }}
          </div>

          <!-- 新增/编辑表单 -->
          <van-cell-group inset>
            <van-field v-model="newEntry.verse" :label="t('commentary_verse')" :placeholder="t('commentary_verse_placeholder')" />
            <van-field v-model="newEntry.content" :label="t('commentary_content')" :placeholder="t('commentary_content_placeholder')" type="textarea" rows="4" />
          </van-cell-group>
          <div class="action-btn-row">
            <template v-if="editingIndex >= 0">
              <van-button type="primary" size="small" icon="success" @click="updateEntry">
                {{ t('commentary_update') }}
              </van-button>
              <van-button plain size="small" @click="cancelEdit">
                {{ t('cancel_edit') }}
              </van-button>
            </template>
            <template v-else>
              <van-button plain type="primary" size="small" icon="plus" @click="addEntry">
                {{ t('commentary_add') }}
              </van-button>
              <van-button plain type="primary" size="small" icon="upgrade" @click="openImport">
                {{ t('import_title') }}
              </van-button>
            </template>
          </div>

          <!-- 撤销删除按钮 -->
          <div v-if="lastDeleted" class="undo-bar" @click="undoDelete">
            <van-icon name="replay" size="16" />
            <span>{{ t('undo') }}: {{ lastDeleted.entry.verse }}</span>
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

          <!-- 条目列表 -->
          <van-empty v-if="entries.length === 0" :description="t('commentary_empty')" />
          <van-cell-group inset v-else class="entries-list">
            <van-swipe-cell v-for="(entry, index) in filteredEntries" :key="entry.verse + entry._realIndex">
              <van-cell
                :title="entry.verse"
                :label="entry.content"
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
              :placeholder="t('import_commentary_placeholder')"
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

            <!-- 重复条目警告 -->
            <div v-if="importPreviewData.duplicateCount > 0" class="preview-warning">
              {{ t('import_duplicate_warning', { count: importPreviewData.duplicateCount }) }}
              <span v-if="importPreviewData.duplicateVerses.length > 0" class="duplicate-list">
                ({{ importPreviewData.duplicateVerses.join(', ') }}{{ importPreviewData.duplicateCount > 3 ? '...' : '' }})
              </span>
            </div>

            <!-- 跳过条目提示 -->
            <div v-if="importPreviewData.skippedCount > 0" class="preview-info">
              {{ t('import_format_error', { count: importPreviewData.skippedCount }) }}
            </div>

            <!-- 预览内容 -->
            <div class="import-preview-content">
              <div v-for="(entry, idx) in importPreviewData.preview" :key="idx" class="preview-entry">
                <strong class="preview-entry-verse">{{ entry.verse }}</strong>
                <p class="preview-entry-content">{{ entry.content }}</p>
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
  max-width: 240px;
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
</style>
