<script setup>
/**
 * 素材库编辑器
 * 支持新建和编辑素材类型资源
 * 每个素材项包含标题、类型（图片/音频/视频/链接）、URL、备注
 * 支持拖拽导入、自动保存（每30秒，编辑模式下）
 * 3 个标签页：基本信息、素材列表、预览
 */
import { ref, reactive, onMounted, computed, watch, onBeforeUnmount } from 'vue'
import { useRouter, useRoute, onBeforeRouteLeave } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { showToast, showLoadingToast, closeToast, showConfirmDialog } from 'vant'
import { createResource, getResourceDetail, updateResource } from '@/api/resource'
import ResourceIcon from '@/components/ResourceIcon.vue'
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
  category: ''
})

/** 素材项列表 */
const items = ref([])

/** 新增/编辑素材项表单 */
const newItem = reactive({
  title: '',
  type: 'image',
  url: '',
  notes: ''
})

/** 正在编辑的条目索引（-1 表示不在编辑模式） */
const editingIndex = ref(-1)

/** 条目搜索关键词 */
const entrySearchQuery = ref('')

/** 上次删除的条目（用于撤销） */
const lastDeleted = ref(null)

/** 素材类型选项 */
const typeOptions = computed(() => [
  { text: t('material_item_type_image'), value: 'image' },
  { text: t('material_item_type_audio'), value: 'audio' },
  { text: t('material_item_type_video'), value: 'video' },
  { text: t('material_item_type_link'), value: 'link' }
])

/** 类型显示名称映射 */
const typeLabel = computed(() => ({
  image: t('material_item_type_image'),
  audio: t('material_item_type_audio'),
  video: t('material_item_type_video'),
  link: t('material_item_type_link')
}))

/** 拖拽上传：文件拖入后解析 JSON 素材列表 */
const { isDragOver, onDragOver, onDragLeave, onDrop } = useDragDrop(async (files) => {
  const file = files[0]
  if (!file) return

  /* 仅支持 JSON 文件拖入 */
  if (!file.name.endsWith('.json')) {
    showToast(t('import_error_unsupported'))
    return
  }

  try {
    const text = await file.text()
    const data = JSON.parse(text)
    if (Array.isArray(data)) {
      const validItems = data.filter(d => d.title && d.url)
      if (validItems.length > 0) {
        items.value.push(...validItems.map(d => ({
          title: d.title || '',
          type: d.type || 'link',
          url: d.url || '',
          notes: d.notes || ''
        })))
        showToast(t('import_success', { count: validItems.length }))
      } else {
        showToast(t('import_empty'))
      }
    }
  } catch (e) {
    showToast(t('error'))
  }
})

/** 经过搜索过滤后的素材列表（保留原始索引） */
const filteredItems = computed(() => {
  const list = items.value.map((e, i) => ({ ...e, _realIndex: i }))
  if (!entrySearchQuery.value.trim()) return list
  const q = entrySearchQuery.value.trim().toLowerCase()
  return list.filter(e =>
    e.title.toLowerCase().includes(q) ||
    e.url.toLowerCase().includes(q) ||
    (e.notes && e.notes.toLowerCase().includes(q))
  )
})

/** 自动保存定时器 */
let autoSaveTimer = null

function getSnapshot() {
  return JSON.stringify({ meta: { ...meta }, items: items.value })
}

function markSaved() {
  savedSnapshot = getSnapshot()
  isDirty.value = false
}

function checkDirty() {
  isDirty.value = getSnapshot() !== savedSnapshot
}

watch([() => ({ ...meta }), items], () => checkDirty(), { deep: true })

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
      category: meta.category
    })
    const contentJson = JSON.stringify(items.value)

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
      items.value = JSON.parse(data.contentJson)
    }

    markSaved()
  } catch (e) {
    showToast(t('error'))
  } finally {
    closeToast()
  }
}

/**
 * 添加素材项
 */
function addItem() {
  if (!newItem.title.trim() || !newItem.url.trim()) {
    showToast(t('material_item_title_placeholder'))
    return
  }
  items.value.push({
    title: newItem.title.trim(),
    type: newItem.type,
    url: newItem.url.trim(),
    notes: newItem.notes.trim()
  })
  resetForm()
}

/**
 * 进入编辑模式
 */
function startEdit(index) {
  const item = items.value[index]
  newItem.title = item.title
  newItem.type = item.type
  newItem.url = item.url
  newItem.notes = item.notes || ''
  editingIndex.value = index
}

/**
 * 确认更新素材项
 */
function updateItem() {
  if (!newItem.title.trim() || !newItem.url.trim()) {
    showToast(t('material_item_title_placeholder'))
    return
  }
  items.value[editingIndex.value] = {
    title: newItem.title.trim(),
    type: newItem.type,
    url: newItem.url.trim(),
    notes: newItem.notes.trim()
  }
  cancelEdit()
}

/**
 * 取消编辑模式
 */
function cancelEdit() {
  editingIndex.value = -1
  resetForm()
}

/**
 * 重置表单
 */
function resetForm() {
  newItem.title = ''
  newItem.type = 'image'
  newItem.url = ''
  newItem.notes = ''
}

/**
 * 删除素材项（支持撤销）
 */
function removeItem(index) {
  const deleted = items.value[index]
  lastDeleted.value = { entry: { ...deleted }, index }
  items.value.splice(index, 1)
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
  const insertAt = Math.min(index, items.value.length)
  items.value.splice(insertAt, 0, entry)
  lastDeleted.value = null
  showToast(t('undo_delete'))
}

/**
 * 上移素材项
 */
function moveItemUp(index) {
  if (index <= 0) return
  const temp = items.value[index]
  items.value.splice(index, 1)
  items.value.splice(index - 1, 0, temp)
}

/**
 * 下移素材项
 */
function moveItemDown(index) {
  if (index >= items.value.length - 1) return
  const temp = items.value[index]
  items.value.splice(index, 1)
  items.value.splice(index + 1, 0, temp)
}

/**
 * 获取素材类型图标
 */
function getTypeIcon(type) {
  const map = { image: 'photo-o', audio: 'music-o', video: 'video-o', link: 'link-o' }
  return map[type] || 'link-o'
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
      category: meta.category
    })
    const contentJson = JSON.stringify(items.value)

    if (isEdit.value) {
      await updateResource(resourceId.value, {
        title: meta.title,
        metaJson,
        contentJson
      })
    } else {
      const res = await createResource({
        type: 'material',
        title: meta.title,
        metaJson
      })
      const newId = res.data.id
      await updateResource(newId, { contentJson })
      router.replace(`/material/edit/${newId}`)
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
  <main class="page" role="main" :aria-label="isEdit ? t('material_title') : t('material_new_title')">
    <van-nav-bar
      :title="isEdit ? t('material_title') : t('material_new_title')"
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
    <div class="editor-banner" style="background: linear-gradient(135deg, #9c27b0 0%, #7b1fa2 100%)">
      <div class="banner-icon" aria-hidden="true">
        <ResourceIcon type="material" :size="28" />
      </div>
      <div class="banner-text">
        <h2 class="banner-title">{{ meta.title || t('material_new_title') }}</h2>
        <p class="banner-subtitle">{{ t('type_material') }}</p>
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
            <van-field v-model="meta.category" :label="t('material_category')" :placeholder="t('material_category_placeholder')" />
            <van-field v-model="meta.summary" :label="t('editor_summary')" :placeholder="t('editor_summary_placeholder')" type="textarea" rows="3" />
          </van-cell-group>
        </van-form>
      </van-tab>

      <!-- 素材列表 -->
      <van-tab :title="t('material_items')">
        <div class="content-section" @dragover.prevent="onDragOver" @dragleave="onDragLeave" @drop="onDrop" :class="{ 'drag-over': isDragOver }">
          <!-- 拖拽遮罩 -->
          <div v-if="isDragOver" class="drag-overlay" aria-live="polite">
            <van-icon name="upgrade" size="48" />
            <span>{{ t('import_drag_hint') }}</span>
          </div>

          <!-- 编辑提示条 -->
          <div v-if="editingIndex >= 0" class="editing-bar" role="status">
            {{ t('editing_entry') }}: {{ items[editingIndex]?.title }}
          </div>

          <!-- 新增/编辑表单 -->
          <van-cell-group inset>
            <van-field v-model="newItem.title" :label="t('material_item_title')" :placeholder="t('material_item_title_placeholder')" />
            <van-field :label="t('material_item_type')" :aria-label="t('material_item_type')">
              <template #input>
                <van-radio-group v-model="newItem.type" direction="horizontal">
                  <van-radio v-for="opt in typeOptions" :key="opt.value" :name="opt.value">{{ opt.text }}</van-radio>
                </van-radio-group>
              </template>
            </van-field>
            <van-field v-model="newItem.url" :label="t('material_item_url')" :placeholder="t('material_item_url_placeholder')" />
            <van-field v-model="newItem.notes" :label="t('material_item_notes')" :placeholder="t('material_item_notes_placeholder')" type="textarea" rows="2" />
          </van-cell-group>
          <div class="action-btn-row">
            <template v-if="editingIndex >= 0">
              <van-button type="primary" size="small" icon="success" @click="updateItem">
                {{ t('material_update') }}
              </van-button>
              <van-button plain size="small" @click="cancelEdit">
                {{ t('cancel_edit') }}
              </van-button>
            </template>
            <template v-else>
              <van-button plain type="primary" size="small" icon="plus" @click="addItem">
                {{ t('material_add') }}
              </van-button>
            </template>
          </div>

          <!-- 撤销删除按钮 -->
          <div v-if="lastDeleted" class="undo-bar" @click="undoDelete">
            <van-icon name="replay" size="16" />
            <span>{{ t('undo') }}: {{ lastDeleted.entry.title }}</span>
          </div>

          <!-- 条目搜索（有条目时显示） -->
          <van-search
            v-if="items.length > 3"
            v-model="entrySearchQuery"
            :placeholder="t('editor_search_entries')"
            shape="round"
            class="entry-search"
            :aria-label="t('editor_search_entries')"
          />

          <!-- 素材列表 -->
          <van-empty v-if="items.length === 0" :description="t('material_empty')" />
          <van-cell-group inset v-else class="entries-list">
            <van-swipe-cell v-for="(item, index) in filteredItems" :key="item.title + item._realIndex">
              <van-cell
                :title="item.title"
                :label="item.url"
                :class="{ 'editing-cell': editingIndex === item._realIndex }"
                clickable
                @click="startEdit(item._realIndex)"
              >
                <template #icon>
                  <van-icon :name="getTypeIcon(item.type)" size="20" class="item-type-icon" :class="'type-' + item.type" />
                </template>
                <template #right-icon>
                  <div class="entry-actions">
                    <van-icon v-if="!entrySearchQuery" name="arrow-up" size="16" color="var(--app-text-tertiary)" @click.stop="moveItemUp(item._realIndex)" :aria-label="t('editor_move_up')" />
                    <van-icon v-if="!entrySearchQuery" name="arrow-down" size="16" color="var(--app-text-tertiary)" @click.stop="moveItemDown(item._realIndex)" :aria-label="t('editor_move_down')" />
                    <van-icon name="edit" size="16" color="var(--app-text-tertiary)" />
                  </div>
                </template>
              </van-cell>
              <template #right>
                <van-button square type="danger" :text="t('delete')" class="swipe-btn" @click="removeItem(item._realIndex)" />
              </template>
            </van-swipe-cell>
          </van-cell-group>
        </div>
      </van-tab>

      <!-- 预览 -->
      <van-tab :title="t('editor_preview')">
        <div class="preview-section">
          <van-empty v-if="items.length === 0" :description="t('material_empty')" />
          <div v-else class="preview-grid">
            <div
              v-for="(item, index) in items"
              :key="index"
              class="preview-card"
            >
              <!-- 图片类型显示缩略图 -->
              <div class="preview-thumb" :class="'thumb-' + item.type">
                <img v-if="item.type === 'image' && item.url" :src="item.url" :alt="item.title" class="preview-img" @error="(e) => e.target.style.display='none'" />
                <van-icon v-else :name="getTypeIcon(item.type)" size="32" />
              </div>
              <div class="preview-info">
                <span class="preview-title">{{ item.title }}</span>
                <span class="preview-type">{{ typeLabel[item.type] }}</span>
              </div>
            </div>
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
  background: rgba(156, 39, 176, 0.06);
  border-radius: 8px;
  color: #9c27b0;
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

/* 素材类型图标 */
.item-type-icon {
  margin-right: 8px;
}

.type-image { color: #4caf50; }
.type-audio { color: #ff9800; }
.type-video { color: #f44336; }
.type-link { color: #2196f3; }

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

/* 预览网格 */
.preview-section {
  padding: 12px;
}

.preview-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
  gap: 12px;
}

.preview-card {
  background: var(--app-card-bg, #fff);
  border: 1px solid var(--app-border, #eee);
  border-radius: 10px;
  overflow: hidden;
  transition: box-shadow 0.2s;
}

.preview-card:active {
  box-shadow: 0 2px 8px rgba(0,0,0,0.1);
}

.preview-thumb {
  width: 100%;
  height: 100px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--app-bg, #f5f5f5);
  color: #999;
  overflow: hidden;
}

.thumb-image { background: #e8f5e9; color: #4caf50; }
.thumb-audio { background: #fff3e0; color: #ff9800; }
.thumb-video { background: #ffebee; color: #f44336; }
.thumb-link { background: #e3f2fd; color: #2196f3; }

.preview-img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.preview-info {
  padding: 8px 10px;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.preview-title {
  font-size: 13px;
  font-weight: 500;
  color: var(--app-text-primary, #333);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.preview-type {
  font-size: 11px;
  color: var(--app-text-tertiary, #999);
}
</style>
