<script setup>
/**
 * AI解析预览页
 * 步骤2：左侧显示原始文本，右侧显示结构化解析结果
 * 使用 BibleVerseParser 解析原始文本为 { book, chapters: [{ chapter, verses }] }
 */
import { ref, computed, onMounted, nextTick } from 'vue'
import { useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { ElMessage } from 'element-plus'
import { ArrowLeft, Check, Refresh, Loading } from '@element-plus/icons-vue'
import { useImportFlowStore } from '@/stores/importFlow'
import { parseBibleText, getParseStats } from '@/utils/bibleVerseParser'

const router = useRouter()
const { t } = useI18n()
const importStore = useImportFlowStore()

/** 解析结果 */
const parseResult = ref({ book: '', chapters: [] })

/** 解析统计 */
const stats = computed(() => getParseStats(parseResult.value))

/** 是否正在解析中 */
const parsing = ref(false)

/** 文本是否过大（超过50KB），不自动解析 */
const isLargeText = computed(() => importStore.rawText.length > 50000)

/** 是否跳过了自动解析 */
const skippedAutoParse = ref(false)

/** 导入方式标签 */
const importTypeLabel = computed(() => {
  const map = { ocr: 'OCR', pdf: 'PDF', word: 'Word' }
  return map[importStore.importType] || ''
})

/** 原始文本行数 */
const rawLineCount = computed(() => {
  return importStore.rawText.split('\n').filter(l => l.trim()).length
})

/** 当前展开的章节索引（-1=全部折叠） */
const expandedChapter = ref(-1)

/** 展开前的滚动位置，关闭时恢复 */
let savedScrollTop = 0

/**
 * 执行解析
 */
async function doParse() {
  parsing.value = true
  await new Promise(r => setTimeout(r, 50))

  try {
    const result = parseBibleText(importStore.rawText)
    parseResult.value = result

    /* 默认展开第一章 */
    if (result.chapters.length > 0) {
      expandedChapter.value = 0
    }
  } catch (err) {
    console.error('Parse error:', err)
    ElMessage.error(t('import_parse_failed'))
  } finally {
    parsing.value = false
  }
}

/**
 * 重新解析
 */
function handleReparse() {
  doParse()
  ElMessage.success(t('import_reparsed'))
}

/**
 * 切换章节展开/折叠
 */
function toggleChapter(idx) {
  const isClosing = expandedChapter.value === idx
  const isSwitching = !isClosing && expandedChapter.value !== -1
  const header = document.querySelectorAll('.chapter-header')[idx]
  const panel = header?.closest('.panel-body')

  if (isClosing) {
    /* 关闭：恢复到展开前的滚动位置 */
    expandedChapter.value = -1
    if (panel) {
      nextTick(() => {
        panel.scrollTo({ top: savedScrollTop, behavior: 'smooth' })
      })
    }
  } else if (isSwitching) {
    /* 切换章：先关闭旧章，重置滚动，再打开新章 */
    expandedChapter.value = -1
    if (panel) panel.scrollTop = 0
    nextTick(() => {
      expandedChapter.value = idx
      nextTick(() => {
        const newHeader = document.querySelectorAll('.chapter-header')[idx]
        const newPanel = newHeader?.closest('.panel-body')
        if (newHeader && newPanel) {
          const offset = newHeader.getBoundingClientRect().top - newPanel.getBoundingClientRect().top + newPanel.scrollTop
          newPanel.scrollTo({ top: offset, behavior: 'smooth' })
        }
      })
    })
  } else {
    /* 展开：记住当前滚动位置，再滚动到章标题 */
    if (panel) savedScrollTop = panel.scrollTop
    expandedChapter.value = idx
    nextTick(() => {
      if (header && panel) {
        const offset = header.getBoundingClientRect().top - panel.getBoundingClientRect().top + panel.scrollTop
        panel.scrollTo({ top: offset, behavior: 'smooth' })
      }
    })
  }
}

/**
 * 返回上一步
 */
function goBack() {
  importStore.goBack()
  router.push('/bible/import')
}

/**
 * 确认解析结果，进入下一步
 */
function handleConfirm() {
  if (parseResult.value.chapters.length === 0) {
    ElMessage.warning(t('import_no_verses'))
    return
  }

  importStore.setParsedData(parseResult.value)
  router.push('/bible/import/save')
}

onMounted(() => {
  if (!importStore.hasData) {
    router.replace('/bible/import')
    return
  }

  if (isLargeText.value) {
    skippedAutoParse.value = true
  } else {
    doParse()
  }
})
</script>

<template>
  <div class="import-preview" role="main" :aria-label="t('import_preview_title')">
    <!-- 顶部操作栏 -->
    <div class="preview-header">
      <div class="header-left">
        <el-button :icon="ArrowLeft" @click="goBack">{{ t('import_back') }}</el-button>
        <h2 class="page-title">{{ t('import_preview_title') }}</h2>
        <el-tag type="info" size="small">{{ importTypeLabel }}</el-tag>
      </div>
      <div class="header-right">
        <el-button :icon="Refresh" @click="handleReparse" :loading="parsing">{{ t('import_reparse') }}</el-button>
        <el-button type="primary" :icon="Check" @click="handleConfirm" :disabled="parseResult.chapters.length === 0">{{ t('import_confirm_format') }}</el-button>
      </div>
    </div>

    <!-- 大文本提示 -->
    <el-alert
      v-if="skippedAutoParse"
      :title="t('import_large_text_title')"
      type="warning"
      show-icon
      :closable="false"
      style="margin-bottom: 12px"
    >
      <template #default>
        <div style="display:flex; align-items:center; gap:8px; margin-top:8px">
          <span style="font-size:13px; color:#e6a23c">{{ t('import_large_text_desc', { size: Math.round(importStore.rawText.length / 1024) }) }}</span>
          <el-button type="warning" size="small" @click="skippedAutoParse = false; doParse()">
            {{ t('import_start_parse') }}
          </el-button>
        </div>
      </template>
    </el-alert>

    <!-- 解析中遮罩 -->
    <div v-if="parsing" class="formatting-overlay">
      <div class="formatting-card">
        <el-icon class="spinning" :size="32" color="#409eff"><Loading /></el-icon>
        <p>{{ t('import_parsing_text') }}</p>
      </div>
    </div>

    <!-- 左右对比区域 -->
    <div class="compare-area">
      <!-- 左侧：原始文本 -->
      <div class="compare-panel">
        <div class="panel-header">
          <span class="panel-title">{{ t('import_raw_text') }}</span>
          <el-tag size="small" type="info">{{ t('import_line_count', { count: rawLineCount }) }}</el-tag>
        </div>
        <div class="panel-body raw-panel">
          <pre class="raw-text">{{ importStore.rawText }}</pre>
        </div>
      </div>

      <!-- 右侧：结构化解析结果 -->
      <div class="compare-panel">
        <div class="panel-header">
          <span class="panel-title">{{ t('import_parse_result') }}</span>
          <div class="parse-stats">
            <el-tag v-if="stats.book" size="small" type="primary">{{ stats.book }}</el-tag>
            <el-tag size="small" type="success">{{ t('import_chapter_count', { count: stats.chapterCount }) }}</el-tag>
            <el-tag size="small" type="warning">{{ t('import_verse_count', { count: stats.verseCount }) }}</el-tag>
          </div>
        </div>
        <div class="panel-body parsed-panel">
          <!-- 无数据提示 -->
          <div v-if="parseResult.chapters.length === 0 && !parsing" class="empty-hint">
            {{ t('import_no_verse_data') }}
          </div>

          <!-- 章节列表 -->
          <div v-for="(ch, idx) in parseResult.chapters" :key="ch.chapter" class="chapter-block">
            <!-- 章标题（可点击折叠） -->
            <div class="chapter-header" :class="{ 'chapter-header-sticky': expandedChapter === idx }" @click="toggleChapter(idx)">
              <span class="chapter-title">{{ t('import_chapter_label', { num: ch.chapter }) }}</span>
              <span class="chapter-info">{{ t('import_verse_count', { count: ch.verses.length }) }}</span>
              <span class="chapter-arrow" :class="{ expanded: expandedChapter === idx }">&#9654;</span>
            </div>

            <!-- 经文列表 -->
            <div v-show="expandedChapter === idx" class="verse-list">
              <div v-for="v in ch.verses" :key="v.verse" class="verse-item">
                <span class="verse-num">{{ v.verse }}</span>
                <span class="verse-text">{{ v.text }}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- 底部提示 -->
    <div class="preview-footer">
      <p class="footer-hint">{{ t('import_preview_hint_v2') }}</p>
    </div>
  </div>
</template>

<style scoped>
.import-preview {
  max-width: 1200px;
  margin: 0 auto;
  padding: 20px;
  display: flex;
  flex-direction: column;
  height: calc(100vh - 100px);
}

.preview-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 16px;
  flex-shrink: 0;
}

.header-left {
  display: flex;
  align-items: center;
  gap: 12px;
}

.header-right {
  display: flex;
  align-items: center;
  gap: 8px;
}

.page-title {
  font-size: 18px;
  font-weight: 600;
  color: #333;
  margin: 0;
}

/* 对比区域 */
.compare-area {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 16px;
  flex: 1;
  min-height: 0;
}

.compare-panel {
  background: #fff;
  border: 1px solid #e8e8e8;
  border-radius: 8px;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  border-bottom: 1px solid #f0f0f0;
  flex-shrink: 0;
}

.panel-title {
  font-size: 14px;
  font-weight: 600;
  color: #333;
}

.parse-stats {
  display: flex;
  gap: 6px;
}

.panel-body {
  flex: 1;
  overflow: auto;
  padding: 0;
}

.raw-panel {
  padding: 16px;
}

.parsed-panel {
  padding: 0;
}

.raw-text {
  font-size: 13px;
  line-height: 1.8;
  color: #666;
  white-space: pre-wrap;
  word-break: break-all;
  margin: 0;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
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
  padding: 10px 16px;
  cursor: pointer;
  background: #fafafa;
  user-select: none;
  transition: background 0.15s;
}

.chapter-header-sticky {
  position: sticky;
  top: 0;
  z-index: 10;
  border-bottom: 1px solid #e8e8e8;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.06);
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

/* 经文列表 */
.verse-list {
  padding: 4px 16px 8px;
}

.verse-item {
  display: grid;
  grid-template-columns: auto 1fr;
  column-gap: 6px;
  align-items: baseline;
  padding: 3px 0;
  line-height: 1.7;
  font-size: 14px;
}

.verse-num {
  color: #409eff;
  font-weight: 600;
  font-size: 12px;
  user-select: none;
  text-align: right;
  min-width: 24px;
}

.verse-text {
  color: #333;
}

.empty-hint {
  text-align: center;
  padding: 40px 20px;
  color: #999;
  font-size: 14px;
}

/* 排版中遮罩 */
.formatting-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(255, 255, 255, 0.85);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 2000;
}

.formatting-card {
  text-align: center;
}

.formatting-card p {
  font-size: 15px;
  color: #666;
  margin-top: 12px;
}

.spinning {
  animation: spin 1s linear infinite;
}

@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

/* 底部提示 */
.preview-footer {
  margin-top: 12px;
  flex-shrink: 0;
}

.footer-hint {
  font-size: 13px;
  color: #999;
  margin: 0;
  text-align: center;
}

/* 响应式 */
@media (max-width: 768px) {
  .compare-area {
    grid-template-columns: 1fr;
  }
  .preview-header {
    flex-direction: column;
    align-items: flex-start;
    gap: 8px;
  }
}
</style>
