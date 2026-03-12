<script setup>
/**
 * 资源列表页（通用）
 * 圣经译本、词典、注释、素材库共用此页面
 * 风格与首页 DataCenter 保持一致
 */
import { ref, computed, onMounted, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { getResourceList, deleteResource } from '@/api/resource'
import { ElMessage, ElMessageBox } from 'element-plus'
import ImportDialog from '@/components/ImportDialog.vue'
import ExportDialog from '@/components/ExportDialog.vue'
import CreateCommentaryDialog from '@/components/CreateCommentaryDialog.vue'
import CreateDictionaryDialog from '@/components/CreateDictionaryDialog.vue'
import { getLocalList, deleteLocal, isLocalId } from '@/utils/localStore'
import { Reading, Notebook, Document, Grid, Plus, ArrowRight, Search, Delete, Upload } from '@element-plus/icons-vue'

const { t } = useI18n()

const route = useRoute()
const router = useRouter()

/** 资源类型配置 */
const typeConfig = computed(() => ({
  bible: { title: t('type_bible'), addText: t('resource_add_bible'), addPath: '/bible/edit', icon: Reading, color: '#3d5a80' },
  dictionary: { title: t('type_dictionary'), addText: t('resource_add_dictionary'), addPath: '/dictionary/edit', icon: Notebook, color: '#b8914a' },
  commentary: { title: t('type_commentary'), addText: t('resource_add_commentary'), addPath: '/commentary/edit', icon: Document, color: '#5a8a6e' },
  material: { title: t('type_material'), addText: t('resource_add_material'), addPath: '/material/edit', icon: Grid, color: '#7a6b8a' }
}))

/** 当前资源类型 */
const resourceType = computed(() => route.meta.resourceType || 'bible')

/** 配置 */
const config = computed(() => typeConfig.value[resourceType.value] || typeConfig.value.bible)

/** 资源列表 */
const resources = ref([])

/** 加载状态 */
const loading = ref(false)

/** 搜索关键字 */
const searchKeyword = ref('')

/** 是否显示搜索框 */
const showSearch = ref(false)

/** 语言筛选 */
const selectedLanguage = ref('')

/** 分页 */
const currentPage = ref(1)
const pageSize = 24

/** 所有可用语言 */
const languages = computed(() => {
  const langSet = new Set()
  resources.value.forEach(r => {
    const meta = tryParseJson(r.metaJson)
    if (meta && meta.language) {
      langSet.add(meta.language)
    }
  })
  return Array.from(langSet).sort()
})

/** 筛选后的资源 */
const filteredResources = computed(() => {
  let list = resources.value

  /** 语言筛选 */
  if (selectedLanguage.value) {
    list = list.filter(r => {
      const meta = tryParseJson(r.metaJson)
      return meta && meta.language === selectedLanguage.value
    })
  }

  /** 关键字搜索 */
  if (searchKeyword.value.trim()) {
    const kw = searchKeyword.value.trim().toLowerCase()
    list = list.filter(r => r.title && r.title.toLowerCase().includes(kw))
  }

  return list
})

/** 当前页数据 */
const pagedResources = computed(() => {
  const start = (currentPage.value - 1) * pageSize
  return filteredResources.value.slice(start, start + pageSize)
})

/** 解析 JSON */
function tryParseJson(str) {
  try { return JSON.parse(str) } catch { return null }
}

/** 获取语言显示文本 */
function getLanguage(resource) {
  const meta = tryParseJson(resource.metaJson)
  return meta?.language || ''
}

/** 获取资源摘要信息 */
function getSummary(resource) {
  return tryParseJson(resource.summaryJson)
}

/** 获取圣经完成度百分比 */
function getBibleProgress(resource) {
  const summary = getSummary(resource)
  if (!summary || !summary.totalBooks) return -1
  return Math.round((summary.filledBooks / summary.totalBooks) * 100)
}

/** 获取圣经进度文本 */
function getBibleProgressText(resource) {
  const summary = getSummary(resource)
  if (!summary) return ''
  return `${summary.filledBooks || 0}/${summary.totalBooks || 66}`
}

/** 获取条目数文本 */
function getEntryCountText(resource) {
  const summary = getSummary(resource)
  if (!summary || summary.entryCount === undefined) return ''
  return `${summary.entryCount}`
}

/** 加载资源列表（后端失败时自动合并本地数据） */
async function loadResources() {
  loading.value = true
  try {
    const res = await getResourceList(resourceType.value)
    const serverData = res.data || []
    // 合并本地保存的数据（本地独有的，后端没有的）
    const localData = getLocalList(resourceType.value)
    const serverIds = new Set(serverData.map(r => String(r.id)))
    const localOnly = localData.filter(r => !serverIds.has(String(r.id)))
    resources.value = [...serverData, ...localOnly]
  } catch (e) {
    // 后端不可用，展示本地数据
    resources.value = getLocalList(resourceType.value)
    if (resources.value.length > 0) {
      ElMessage.warning(t('resource_backend_unavailable'))
    }
  } finally {
    loading.value = false
  }
}

/** 点击卡片进入详情 */
function handleCardClick(resource) {
  const type = resourceType.value
  if (type === 'bible') {
    router.push(`/bible/detail/${resource.id}`)
  } else if (type === 'commentary') {
    router.push(`/commentary/detail/${resource.id}`)
  } else if (type === 'dictionary') {
    router.push(`/dictionary/detail/${resource.id}`)
  } else {
    router.push(`/${type}/edit/${resource.id}`)
  }
}

/** 跳转到发布/导出页面 */
function handlePublish(resource, event) {
  event.stopPropagation()
  router.push(`/export/${resource.id}`)
}

/** 导入对话框引用 */
const importDialogRef = ref()

/** 导出对话框引用 */
const exportDialogRef = ref()

/** 新增注释对话框引用 */
const createCommentaryRef = ref()

/** 新增词典对话框引用 */
const createDictionaryRef = ref()

/** 新增资源 */
function handleAdd() {
  if (resourceType.value === 'commentary') {
    createCommentaryRef.value?.open()
    return
  }
  if (resourceType.value === 'dictionary') {
    createDictionaryRef.value?.open()
    return
  }
  router.push(config.value.addPath)
}

/** 打开导入对话框 */
function handleImport() {
  importDialogRef.value?.open()
}

/** 打开导出对话框 */
function handleExport() {
  exportDialogRef.value?.open()
}

/** 导入成功后刷新列表 */
function handleImportSuccess() {
  loadResources()
}

/** 删除资源 */
async function handleDelete(resource, event) {
  event.stopPropagation()
  try {
    await ElMessageBox.confirm(t('resource_delete_confirm_msg', { title: resource.title }), t('resource_delete_confirm_title'), {
      confirmButtonText: t('resource_confirm_delete_btn'),
      cancelButtonText: t('cancel'),
      confirmButtonClass: 'el-button--danger',
      type: 'warning'
    })
  } catch {
    return
  }
  try {
    if (isLocalId(resource.id)) {
      deleteLocal(resourceType.value, resource.id)
    } else {
      await deleteResource(resource.id)
    }
    ElMessage.success(t('resource_delete_success'))
    loadResources()
  } catch (e) {
    ElMessage.error(t('resource_delete_failed') + (e.response?.data?.message || e.message))
  }
}

/** 搜索 */
function handleSearch() {
  currentPage.value = 1
}

/** 监听路由变化重新加载 */
watch(() => route.meta.resourceType, () => {
  searchKeyword.value = ''
  selectedLanguage.value = ''
  currentPage.value = 1
  loadResources()
})

onMounted(() => {
  loadResources()
})
</script>

<template>
  <div class="resource-page" v-loading="loading">
    <!-- 标题区 -->
    <div class="page-header">
      <div class="header-left">
        <div class="header-icon" :style="{ backgroundColor: config.color + '15', color: config.color }">
          <el-icon :size="22"><component :is="config.icon" /></el-icon>
        </div>
        <div class="header-info">
          <h2 class="page-title">{{ config.title }}</h2>
          <span class="page-count">{{ t('resource_item_count') }}: {{ filteredResources.length }}</span>
        </div>
      </div>
      <div class="header-actions">
        <!-- 搜索按钮 -->
        <div class="action-btn" @click="showSearch = !showSearch" role="button" :aria-label="t('search')">
          <el-icon :size="16"><Search /></el-icon>
        </div>
        <!-- 导入 -->
        <div class="action-btn" @click="handleImport" role="button" :aria-label="t('resource_import')">
          <span class="action-text">{{ t('resource_import') }}</span>
        </div>
        <!-- 导出 -->
        <div class="action-btn" @click="handleExport" role="button" :aria-label="t('resource_export')">
          <span class="action-text">{{ t('resource_export') }}</span>
        </div>
        <!-- 新增 -->
        <div class="add-btn" :style="{ background: config.color }" @click="handleAdd" role="button" :aria-label="config.addText">
          <el-icon :size="14"><Plus /></el-icon>
          <span>{{ config.addText }}</span>
        </div>
      </div>
    </div>

    <!-- 搜索/筛选栏（展开式） -->
    <div v-if="showSearch" class="filter-bar">
      <el-input
        v-model="searchKeyword"
        :placeholder="t('resource_enter_keyword')"
        clearable
        size="default"
        @keyup.enter="handleSearch"
        @clear="handleSearch"
        style="max-width: 280px;"
      >
        <template #prefix>
          <el-icon><Search /></el-icon>
        </template>
      </el-input>
      <el-select
        v-if="resourceType !== 'material' && languages.length > 0"
        v-model="selectedLanguage"
        :placeholder="t('resource_select_language')"
        clearable
        size="default"
        style="width: 140px;"
        @change="currentPage = 1"
      >
        <el-option
          v-for="lang in languages"
          :key="lang"
          :label="lang"
          :value="lang"
        />
      </el-select>
    </div>

    <!-- 导入对话框 -->
    <ImportDialog
      ref="importDialogRef"
      :resource-type="resourceType"
      @success="handleImportSuccess"
    />

    <!-- 导出对话框 -->
    <ExportDialog
      ref="exportDialogRef"
      :resource-type="resourceType"
      :resources="filteredResources"
    />

    <!-- 新增注释对话框 -->
    <CreateCommentaryDialog
      ref="createCommentaryRef"
      @success="loadResources"
    />

    <!-- 新增词典对话框 -->
    <CreateDictionaryDialog
      ref="createDictionaryRef"
      @success="loadResources"
    />

    <!-- 资源列表 -->
    <div class="resource-list-card">
      <div v-if="pagedResources.length > 0" class="resource-items">
        <div
          v-for="resource in pagedResources"
          :key="resource.id"
          class="resource-item"
          @click="handleCardClick(resource)"
        >
          <!-- 类型图标 -->
          <div class="item-icon" :style="{ backgroundColor: config.color + '15', color: config.color }">
            <el-icon :size="18"><component :is="config.icon" /></el-icon>
          </div>

          <!-- 资源信息 -->
          <div class="item-body">
            <span class="item-title">{{ resource.title }}</span>
            <div class="item-meta">
              <span v-if="getLanguage(resource)" class="item-lang">{{ getLanguage(resource) }}</span>
              <!-- 圣经进度 -->
              <template v-if="resourceType === 'bible' && getBibleProgress(resource) >= 0">
                <div class="item-progress">
                  <el-progress :percentage="getBibleProgress(resource)" :stroke-width="4" :show-text="false" :color="config.color" />
                </div>
                <span class="item-progress-text">{{ getBibleProgressText(resource) }} {{ t('resource_book_unit') }}</span>
              </template>
              <!-- 词典/注释条目数 -->
              <span v-else-if="getEntryCountText(resource)" class="item-entry">{{ getEntryCountText(resource) }} {{ t('resource_entry_unit') }}</span>
            </div>
          </div>

          <!-- 发布/导出按钮（hover显示） -->
          <div class="item-publish" @click="handlePublish(resource, $event)" role="button" :aria-label="t('resource_publish')">
            <el-icon :size="14"><Upload /></el-icon>
          </div>

          <!-- 删除按钮（hover显示） -->
          <div class="item-delete" @click="handleDelete(resource, $event)" role="button" :aria-label="t('delete')">
            <el-icon :size="14"><Delete /></el-icon>
          </div>

          <!-- 右箭头 -->
          <el-icon class="item-arrow"><ArrowRight /></el-icon>
        </div>
      </div>

      <!-- 空状态 -->
      <el-empty
        v-if="!loading && filteredResources.length === 0"
        :description="t('resource_no_data')"
        :image-size="80"
      />
    </div>

    <!-- 分页 -->
    <div class="pagination" v-if="filteredResources.length > pageSize">
      <el-pagination
        v-model:current-page="currentPage"
        :page-size="pageSize"
        :total="filteredResources.length"
        layout="prev, pager, next"
        background
        small
      />
    </div>
  </div>
</template>

<style scoped>
.resource-page {
  max-width: 1000px;
  margin: 0 auto;
  padding: 40px 32px;
  min-height: 400px;
}

/* 标题区 */
.page-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 28px;
  flex-wrap: wrap;
  gap: 12px;
}

.header-left {
  display: flex;
  align-items: center;
  gap: 14px;
}

.header-icon {
  width: 48px;
  height: 48px;
  border-radius: 4px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.header-info {
  display: flex;
  flex-direction: column;
}

.page-title {
  font-family: var(--font-heading);
  font-size: 20px;
  font-weight: 600;
  color: var(--church-charcoal, #3a3a3a);
  letter-spacing: 2px;
  margin: 0;
  line-height: 1.3;
}

.page-count {
  font-size: 12px;
  color: var(--church-warm-gray, #8a8178);
  margin-top: 4px;
  letter-spacing: 0.5px;
}

.header-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

.action-btn {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 8px 16px;
  background: #fff;
  border: 1px solid var(--church-border, #e0d8cf);
  border-radius: 2px;
  cursor: pointer;
  transition: all 0.3s;
  user-select: none;
  color: var(--church-warm-gray, #8a8178);
}

.action-btn:hover {
  border-color: var(--church-navy, #3d5a80);
  color: var(--church-navy, #3d5a80);
}

.action-text {
  font-size: 12px;
  color: inherit;
  letter-spacing: 0.5px;
}

.add-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 9px 20px;
  border-radius: 2px;
  color: #fff;
  font-size: 12px;
  font-weight: 600;
  letter-spacing: 1px;
  cursor: pointer;
  transition: all 0.3s;
  user-select: none;
}

.add-btn:hover {
  opacity: 0.9;
  box-shadow: 0 4px 16px rgba(61, 90, 128, 0.25);
}

/* 筛选栏 */
.filter-bar {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 16px;
  padding: 14px 20px;
  background: #fff;
  border: 1px solid var(--church-border, #e0d8cf);
  border-radius: 4px;
}

/* 资源列表卡片 */
.resource-list-card {
  background: #fff;
  border: 1px solid var(--church-border, #e0d8cf);
  border-radius: 4px;
  overflow: hidden;
}

.resource-items {
  display: flex;
  flex-direction: column;
}

.resource-item {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 16px 20px;
  cursor: pointer;
  transition: background 0.2s;
  position: relative;
}

.resource-item:hover {
  background: var(--church-cream, #f5f0eb);
}

.resource-item + .resource-item {
  border-top: 1px solid var(--church-border, #e0d8cf);
}

.item-icon {
  width: 38px;
  height: 38px;
  border-radius: 4px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.item-body {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.item-title {
  font-size: 14px;
  font-weight: 500;
  color: var(--church-charcoal, #3a3a3a);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.item-meta {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
  color: var(--church-warm-gray, #8a8178);
}

.item-lang {
  color: var(--app-text-secondary, #6b6560);
}

.item-progress {
  width: 80px;
}

.item-progress :deep(.el-progress) {
  width: 100%;
}

.item-progress-text {
  font-size: 11px;
  color: var(--church-warm-gray, #8a8178);
  white-space: nowrap;
}

.item-entry {
  color: var(--church-warm-gray, #8a8178);
}

.item-publish {
  width: 28px;
  height: 28px;
  border-radius: 4px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--app-text-tertiary, #9a948e);
  opacity: 0;
  transition: all 0.2s;
  flex-shrink: 0;
}

.resource-item:hover .item-publish {
  opacity: 1;
}

.item-publish:hover {
  background: rgba(61, 90, 128, 0.08);
  color: var(--church-navy, #3d5a80);
}

.item-delete {
  width: 28px;
  height: 28px;
  border-radius: 4px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--app-text-tertiary, #9a948e);
  opacity: 0;
  transition: all 0.2s;
  flex-shrink: 0;
}

.resource-item:hover .item-delete {
  opacity: 1;
}

.item-delete:hover {
  background: #fdf0f0;
  color: var(--app-danger, #c05050);
}

.item-arrow {
  color: var(--app-text-tertiary, #9a948e);
  flex-shrink: 0;
}

/* 分页 */
.pagination {
  display: flex;
  justify-content: center;
  padding: 24px 0;
}
</style>
