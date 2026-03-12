<script setup>
/**
 * 数据生成与保存页
 * 步骤3：预览结构化经文数据，选择译本名称，保存到数据库或导出JSON
 * 支持多章数据（BibleVerseParser 解析结果）
 */
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { ElMessage, ElMessageBox } from 'element-plus'
import { ArrowLeft, Download, Upload, Check } from '@element-plus/icons-vue'
import { useImportFlowStore } from '@/stores/importFlow'
import { BIBLE_BOOK_NAMES, BOOK_CHAPTER_COUNTS } from '@/utils/fileImport'
import request from '@/api/request'

const router = useRouter()
const { t } = useI18n()
const importStore = useImportFlowStore()

/** 选中的书卷索引 */
const selectedBook = ref(-1)

/** 译本名称 */
const versionName = ref('')

/** 保存状态：idle | saving | success */
const saveStatus = ref('idle')

/** 当前展开的章节索引 */
const expandedChapter = ref(0)

/** 解析数据快捷引用 */
const parsedData = computed(() => importStore.parsedData)

/** 当前选中书卷名 */
const selectedBookName = computed(() => {
  if (selectedBook.value < 0) return ''
  return BIBLE_BOOK_NAMES[selectedBook.value]
})

/**
 * 切换章节展开/折叠
 */
function toggleChapter(idx) {
  expandedChapter.value = expandedChapter.value === idx ? -1 : idx
}

/**
 * 根据解析出的书名自动匹配书卷索引
 */
function autoMatchBook() {
  if (!parsedData.value.book) return
  const idx = BIBLE_BOOK_NAMES.indexOf(parsedData.value.book)
  if (idx >= 0) {
    selectedBook.value = idx
  }
}

/**
 * 构建导出用的 JSON 数据
 */
function buildExportJson() {
  return {
    version: versionName.value || t('import_unnamed_version'),
    book: selectedBookName.value || parsedData.value.book,
    bookIndex: selectedBook.value,
    chapters: parsedData.value.chapters.map(ch => ({
      chapter: ch.chapter,
      verses: ch.verses.map(v => ({ verse: v.verse, text: v.text }))
    })),
    exportedAt: new Date().toISOString()
  }
}

/**
 * 导出为 JSON 文件
 */
function handleExportJson() {
  const data = buildExportJson()
  const json = JSON.stringify(data, null, 2)
  const blob = new Blob([json], { type: 'application/json' })
  const url = URL.createObjectURL(blob)

  const bookName = selectedBookName.value || parsedData.value.book || 'bible'
  const a = document.createElement('a')
  a.href = url
  a.download = `${bookName}.json`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)

  ElMessage.success(t('import_json_exported'))
}

/**
 * 保存到数据库
 */
async function handleSaveToDb() {
  if (selectedBook.value < 0) {
    ElMessage.warning(t('import_select_book_first'))
    return
  }

  if (!versionName.value.trim()) {
    ElMessage.warning(t('import_enter_version_name'))
    return
  }

  try {
    await ElMessageBox.confirm(
      t('import_save_confirm_msg_v2', {
        book: selectedBookName.value,
        chapters: parsedData.value.chapters.length,
        count: importStore.totalVerseCount
      }),
      t('import_save_confirm_title'),
      { confirmButtonText: t('import_save_btn'), cancelButtonText: t('import_cancel') }
    )
  } catch {
    return
  }

  saveStatus.value = 'saving'

  try {
    const contentData = [{
      bookIndex: selectedBook.value,
      bookName: selectedBookName.value,
      chapters: parsedData.value.chapters.map(ch => ({
        chapter: ch.chapter,
        verses: ch.verses.map(v => ({ verse: v.verse, text: v.text }))
      }))
    }]

    await request.post('/private/api/resource/import-content', {
      type: 'bible',
      title: versionName.value,
      format: 'json',
      contentJson: JSON.stringify(contentData)
    })

    saveStatus.value = 'success'
    ElMessage.success(t('import_save_success'))

    setTimeout(() => {
      importStore.reset()
      router.push('/bible')
    }, 2000)
  } catch (err) {
    saveStatus.value = 'idle'
    ElMessage.error(err.message || t('import_save_failed'))
  }
}

/**
 * 返回上一步
 */
function goBack() {
  importStore.goBack()
  router.push('/bible/import/preview')
}

/**
 * 重新开始
 */
function handleRestart() {
  importStore.reset()
  router.push('/bible/import')
}

onMounted(() => {
  if (!importStore.hasParsed) {
    router.replace('/bible/import')
    return
  }
  autoMatchBook()
})
</script>

<template>
  <div class="import-save" role="main" :aria-label="t('import_save_title')">
    <!-- 顶部操作栏 -->
    <div class="save-header">
      <div class="header-left">
        <el-button :icon="ArrowLeft" @click="goBack">{{ t('import_back') }}</el-button>
        <h2 class="page-title">{{ t('import_save_title') }}</h2>
      </div>
      <div class="header-right">
        <el-button @click="handleRestart">{{ t('import_restart') }}</el-button>
      </div>
    </div>

    <div class="save-content">
      <!-- 左侧：配置面板 -->
      <div class="config-panel">
        <h3 class="panel-title">{{ t('import_config_title') }}</h3>

        <!-- 译本名称 -->
        <div class="config-item">
          <label class="config-label">{{ t('import_version_name') }}</label>
          <el-input
            v-model="versionName"
            :placeholder="t('import_version_placeholder')"
            :aria-label="t('import_version_name')"
          />
        </div>

        <!-- 书卷选择 -->
        <div class="config-item">
          <label class="config-label">{{ t('import_select_book') }}</label>
          <el-select
            v-model="selectedBook"
            :placeholder="t('import_book_placeholder')"
            :aria-label="t('import_select_book')"
            filterable
            style="width: 100%"
          >
            <el-option
              v-for="(name, idx) in BIBLE_BOOK_NAMES"
              :key="idx"
              :label="`${idx + 1}. ${name}`"
              :value="idx"
            />
          </el-select>
          <p class="config-hint" v-if="parsedData.book">
            {{ t('import_detected_book_hint', { book: parsedData.book }) }}
          </p>
        </div>

        <!-- 统计信息 -->
        <div class="stats-box">
          <div class="stats-item" v-if="parsedData.book">
            <span class="stats-label">{{ t('import_stats_detected_book') }}</span>
            <span class="stats-value">{{ parsedData.book }}</span>
          </div>
          <div class="stats-item">
            <span class="stats-label">{{ t('import_stats_chapters') }}</span>
            <span class="stats-value">{{ parsedData.chapters.length }}</span>
          </div>
          <div class="stats-item">
            <span class="stats-label">{{ t('import_stats_verses') }}</span>
            <span class="stats-value">{{ importStore.totalVerseCount }}</span>
          </div>
          <div class="stats-item">
            <span class="stats-label">{{ t('import_stats_source') }}</span>
            <span class="stats-value">{{ importStore.importType.toUpperCase() }}</span>
          </div>
          <div class="stats-item" v-if="importStore.fileName">
            <span class="stats-label">{{ t('import_stats_file') }}</span>
            <span class="stats-value file-name">{{ importStore.fileName }}</span>
          </div>
        </div>

        <!-- 操作按钮 -->
        <div class="action-buttons">
          <el-button
            type="primary"
            :icon="Upload"
            size="large"
            :loading="saveStatus === 'saving'"
            :disabled="saveStatus === 'success'"
            @click="handleSaveToDb"
            style="width: 100%"
          >
            {{ saveStatus === 'saving' ? t('import_saving') : saveStatus === 'success' ? t('import_saved') : t('import_save_to_db') }}
          </el-button>
          <el-button
            :icon="Download"
            size="large"
            @click="handleExportJson"
            style="width: 100%"
          >
            {{ t('import_export_json') }}
          </el-button>
        </div>

        <!-- 成功提示 -->
        <div v-if="saveStatus === 'success'" class="success-msg">
          <el-icon :size="20" color="#67c23a"><Check /></el-icon>
          <span>{{ t('import_save_success_hint') }}</span>
        </div>
      </div>

      <!-- 右侧：经文预览（按章节分组） -->
      <div class="preview-panel">
        <div class="panel-header">
          <span class="panel-title-text">{{ t('import_verse_preview') }}</span>
          <el-tag v-if="selectedBook >= 0" size="small">{{ selectedBookName }}</el-tag>
        </div>
        <div class="chapter-list">
          <div v-for="(ch, idx) in parsedData.chapters" :key="ch.chapter" class="chapter-block">
            <div class="chapter-header" @click="toggleChapter(idx)">
              <span class="chapter-title">{{ t('import_chapter_label', { num: ch.chapter }) }}</span>
              <span class="chapter-info">{{ t('import_verse_count', { count: ch.verses.length }) }}</span>
              <span class="chapter-arrow" :class="{ expanded: expandedChapter === idx }">&#9654;</span>
            </div>
            <div v-show="expandedChapter === idx" class="verse-list">
              <div v-for="v in ch.verses" :key="v.verse" class="verse-item">
                <span class="verse-num">{{ v.verse }}</span>
                <span class="verse-text">{{ v.text }}</span>
              </div>
            </div>
          </div>
          <el-empty v-if="!parsedData.chapters.length" :description="t('import_no_verse_data')" />
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.import-save {
  max-width: 1200px;
  margin: 0 auto;
  padding: 20px;
}

.save-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 20px;
}

.header-left {
  display: flex;
  align-items: center;
  gap: 12px;
}

.header-right {
  display: flex;
  gap: 8px;
}

.page-title {
  font-size: 18px;
  font-weight: 600;
  color: #333;
  margin: 0;
}

/* 内容区域 */
.save-content {
  display: grid;
  grid-template-columns: 360px 1fr;
  gap: 20px;
  align-items: flex-start;
}

/* 配置面板 */
.config-panel {
  background: #fff;
  border: 1px solid #e8e8e8;
  border-radius: 8px;
  padding: 24px;
}

.panel-title {
  font-size: 16px;
  font-weight: 600;
  color: #333;
  margin: 0 0 20px;
}

.config-item {
  margin-bottom: 20px;
}

.config-label {
  display: block;
  font-size: 13px;
  font-weight: 500;
  color: #666;
  margin-bottom: 6px;
}

.config-hint {
  font-size: 12px;
  color: #409eff;
  margin: 4px 0 0;
}

/* 统计信息 */
.stats-box {
  background: #f8f9fa;
  border-radius: 8px;
  padding: 16px;
  margin-bottom: 20px;
}

.stats-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 6px 0;
}

.stats-item + .stats-item {
  border-top: 1px solid #eee;
}

.stats-label {
  font-size: 13px;
  color: #999;
}

.stats-value {
  font-size: 13px;
  font-weight: 500;
  color: #333;
}

.stats-value.file-name {
  max-width: 160px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* 操作按钮 */
.action-buttons {
  display: flex;
  flex-direction: column;
  gap: 10px;
  align-items: stretch;
}

.action-buttons .el-button {
  margin-left: 0;
}

/* 成功提示 */
.success-msg {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 16px;
  padding: 12px;
  background: #f0f9eb;
  border-radius: 8px;
  font-size: 14px;
  color: #67c23a;
}

/* 预览面板 */
.preview-panel {
  background: #fff;
  border: 1px solid #e8e8e8;
  border-radius: 8px;
  display: flex;
  flex-direction: column;
  max-height: calc(100vh - 160px);
}

.panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 20px;
  border-bottom: 1px solid #f0f0f0;
  flex-shrink: 0;
}

.panel-title-text {
  font-size: 14px;
  font-weight: 600;
  color: #333;
}

.chapter-list {
  flex: 1;
  overflow-y: auto;
}

/* 章节块 */
.chapter-block {
  border-bottom: 1px solid #f0f0f0;
}

.chapter-block:last-child {
  border-bottom: none;
}

.chapter-header {
  display: flex;
  align-items: center;
  padding: 10px 20px;
  cursor: pointer;
  background: #fafafa;
  user-select: none;
  transition: background 0.15s;
}

.chapter-header:hover {
  background: #f0f5ff;
}

.chapter-title {
  font-size: 14px;
  font-weight: 600;
  color: #333;
  flex: 1;
}

.chapter-info {
  font-size: 12px;
  color: #999;
  margin-right: 8px;
}

.chapter-arrow {
  font-size: 10px;
  color: #999;
  transition: transform 0.2s;
}

.chapter-arrow.expanded {
  transform: rotate(90deg);
}

.verse-list {
  padding: 4px 20px 8px;
}

.verse-item {
  padding: 6px 0;
  line-height: 1.8;
  font-size: 15px;
}

.verse-item + .verse-item {
  border-top: 1px solid #f8f8f8;
}

.verse-num {
  color: #409eff;
  font-weight: 600;
  font-size: 13px;
  margin-right: 2px;
}

.verse-text {
  color: #333;
}

/* 响应式 */
@media (max-width: 768px) {
  .save-content {
    grid-template-columns: 1fr;
  }
}
</style>
