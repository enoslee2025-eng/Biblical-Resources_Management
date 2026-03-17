<script setup>
/**
 * AI注释导入中心
 * 支持OCR拍照、PDF、Word文档导入注释数据
 * 智能解析经文引用和注释内容，直接保存到数据库
 */
import { ref, onMounted } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { ElMessage } from 'element-plus'
import { Camera, Document, Reading, Edit, Upload } from '@element-plus/icons-vue'
import { recognizeText, recognizeMultiple, isSupportedImage } from '@/utils/ocrImport'
import { parseDocFile, getResourceDetail, updateResource } from '@/api/resource'
import { BIBLE_BOOK_NAMES } from '@/utils/fileImport'

const router = useRouter()
const route = useRoute()
const { t } = useI18n()

/** 关联的资源ID（从 URL 参数获取） */
const resourceId = ref(null)

/** 现有的注释条目（加载自数据库） */
const existingEntries = ref([])

/** 当前状态 */
const status = ref('idle')
const progressText = ref('')
const progressPercent = ref(0)
let cancelFlag = false

function handleCancel() {
  cancelFlag = true
  status.value = 'idle'
  progressText.value = ''
  progressPercent.value = 0
}

/** 导入结果 */
const parsedEntries = ref([])
const showPreview = ref(false)
const rawText = ref('')
const sourceType = ref('')

/** 是否正在保存到数据库 */
const saving = ref(false)

onMounted(async () => {
  /* 从 URL 获取资源 ID */
  const id = route.query.id
  if (id) {
    resourceId.value = Number(id)
    /* 加载已有的注释数据 */
    try {
      const res = await getResourceDetail(resourceId.value)
      if (res.data?.contentJson) {
        existingEntries.value = JSON.parse(res.data.contentJson) || []
      }
    } catch (e) {
      console.error('加载资源失败:', e)
    }
  }
})

/**
 * 智能经文引用解析
 * 支持多种格式：
 * - 中文全名：创世记1:1、马太福音 3:16
 * - 中文缩写：创1:1、太3:16
 * - 章:节格式：1:1、3:16（在已知书卷上下文中）
 * - 带"第X章"格式：第1章:1
 * - 英文格式：Gen 1:1、Matt 3:16
 */
const BOOK_SHORT_NAMES = {
  '创': 0, '出': 1, '利': 2, '民': 3, '申': 4, '书': 5, '士': 6, '得': 7,
  '撒上': 8, '撒下': 9, '王上': 10, '王下': 11, '代上': 12, '代下': 13,
  '拉': 14, '尼': 15, '斯': 16, '伯': 17, '诗': 18, '箴': 19,
  '传': 20, '歌': 21, '赛': 22, '耶': 23, '哀': 24, '结': 25,
  '但': 26, '何': 27, '珥': 28, '摩': 29, '俄': 30, '拿': 31,
  '弥': 32, '鸿': 33, '哈': 34, '番': 35, '该': 36, '亚': 37, '玛': 38,
  '太': 39, '可': 40, '路': 41, '约': 42, '徒': 43, '罗': 44,
  '林前': 45, '林后': 46, '加': 47, '弗': 48, '腓': 49, '西': 50,
  '帖前': 51, '帖后': 52, '提前': 53, '提后': 54, '多': 55, '门': 56,
  '来': 57, '雅': 58, '彼前': 59, '彼后': 60, '约一': 61, '约二': 62,
  '约三': 63, '犹': 64, '启': 65
}

/**
 * 将原始文本智能解析为注释列表
 * 增强版：支持更多经文引用格式
 */
function parseEntries(text) {
  const lines = text.split('\n').filter(l => l.trim())
  const entries = []
  let currentEntry = null

  /* 经文引用正则：支持多种格式 */
  const patterns = [
    /* 完整书名 + 章:节，如 "创世记 1:1" "马太福音3：16" */
    /^([\u4e00-\u9fa5]{2,10})\s*(\d+)\s*[：:]\s*(\d+(?:[-–]\d+)?)\s*[：:—\-]?\s*(.*)/,
    /* 缩写 + 章:节，如 "创1:1" "太3:16" "林前1:1" */
    /^([\u4e00-\u9fa5]{1,3})(\d+)\s*[：:]\s*(\d+(?:[-–]\d+)?)\s*[：:—\-]?\s*(.*)/,
    /* 带"第X章"格式，如 "第1章:1" "第3章 16节" */
    /^第(\d+)章\s*[：:]\s*(\d+(?:[-–]\d+)?)\s*[：:—\-]?\s*(.*)/,
    /* 纯章:节格式，如 "1:1" "3:16"（需要上下文判断书卷） */
    /^(\d+)\s*[：:]\s*(\d+(?:[-–]\d+)?)\s*[：:—\-]?\s*(.*)/,
    /* 通用匹配：任何带经文引用格式的行 */
    /^(.{1,20}?\d+[:：]\d+(?:[-–]\d+)?)\s*[：:—\-]?\s*(.*)/
  ]

  for (const line of lines) {
    let matched = false

    for (const pattern of patterns) {
      const match = line.match(pattern)
      if (match) {
        if (currentEntry) entries.push(currentEntry)

        let reference, content
        if (match.length === 5) {
          /* 完整书名/缩写 + 章 + 节 + 内容 */
          reference = `${match[1]}${match[2]}:${match[3]}`
          content = match[4]?.trim() || ''
        } else if (match.length === 4 && pattern === patterns[2]) {
          /* 第X章:节 格式 */
          reference = `第${match[1]}章:${match[2]}`
          content = match[3]?.trim() || ''
        } else if (match.length === 4 && pattern === patterns[3]) {
          /* 纯章:节格式 */
          reference = `${match[1]}:${match[2]}`
          content = match[3]?.trim() || ''
        } else {
          /* 通用格式 */
          reference = match[1]?.trim() || ''
          content = match[2]?.trim() || ''
        }

        currentEntry = { reference: reference.trim(), content }
        matched = true
        break
      }
    }

    if (!matched) {
      if (currentEntry) {
        /* 续行追加到当前注释 */
        currentEntry.content += '\n' + line.trim()
      } else {
        /* 无法匹配的独立行 */
        entries.push({ reference: '', content: line.trim() })
      }
    }
  }
  if (currentEntry) entries.push(currentEntry)

  return entries
}

/**
 * 智能标准化经文引用
 * 将各种格式的引用统一为 "书名 第N章:M" 格式
 */
function normalizeReference(ref) {
  if (!ref) return ref
  const s = ref.trim()

  /* 尝试匹配完整书名 */
  for (let i = 0; i < BIBLE_BOOK_NAMES.length; i++) {
    const name = BIBLE_BOOK_NAMES[i]
    if (s.startsWith(name)) {
      const rest = s.slice(name.length).trim()
      const m = rest.match(/第?(\d+)[章]?\s*[：:]\s*(\d+(?:[-–]\d+)?)/)
      if (m) {
        return `${name} 第${m[1]}章:${m[2]}`
      }
    }
  }

  /* 尝试匹配缩写 */
  for (const [abbr, idx] of Object.entries(BOOK_SHORT_NAMES)) {
    if (s.startsWith(abbr) && s.length > abbr.length) {
      const rest = s.slice(abbr.length).trim()
      const m = rest.match(/(\d+)\s*[：:]\s*(\d+(?:[-–]\d+)?)/)
      if (m) {
        return `${BIBLE_BOOK_NAMES[idx]} 第${m[1]}章:${m[2]}`
      }
    }
  }

  /* 纯章:节格式 - 保留原样（需要上下文确定书卷） */
  return s
}

/**
 * 确认导入 → 直接保存到数据库
 */
async function confirmImport() {
  if (parsedEntries.value.length === 0) return

  /* 标准化经文引用格式 */
  const normalizedEntries = parsedEntries.value.map(entry => ({
    verse: normalizeReference(entry.reference) || entry.reference,
    content: entry.content
  }))

  if (resourceId.value) {
    /* 有资源 ID → 直接保存到数据库 */
    saving.value = true
    try {
      /* 合并已有条目和新导入的条目 */
      const merged = [...existingEntries.value, ...normalizedEntries]
      const contentJson = JSON.stringify(merged)
      await updateResource(resourceId.value, { contentJson })
      ElMessage.success(t('commentary_import_save_success', { count: normalizedEntries.length }))
      /* 返回详情页 */
      router.push(`/commentary/detail/${resourceId.value}`)
    } catch (e) {
      console.error('保存失败:', e)
      ElMessage.error(t('error'))
    } finally {
      saving.value = false
    }
  } else {
    /* 无资源 ID → 存到 sessionStorage 后跳转编辑页 */
    sessionStorage.setItem('commentaryImportData', JSON.stringify(normalizedEntries))
    router.push('/commentary/edit')
  }
}

/** 返回上一页 */
function goBack() {
  if (resourceId.value) {
    router.push(`/commentary/detail/${resourceId.value}`)
  } else {
    router.back()
  }
}

/** ========== 粘贴文本导入 ========== */
const showPasteDialog = ref(false)
const pasteText = ref('')

function handlePasteImport() {
  const text = pasteText.value.trim()
  if (!text) {
    ElMessage.warning(t('import_empty_text'))
    return
  }
  rawText.value = text
  sourceType.value = 'paste'
  parsedEntries.value = parseEntries(text)
  showPreview.value = true
  showPasteDialog.value = false
}

/** ========== OCR 导入 ========== */
const ocrInput = ref(null)

function handleOcrClick() { ocrInput.value?.click() }

async function handleOcrSelect(e) {
  const files = Array.from(e.target.files || [])
  e.target.value = ''
  if (files.length === 0) return

  const validFiles = files.filter(f => isSupportedImage(f))
  if (validFiles.length === 0) {
    ElMessage.warning(t('import_unsupported_image'))
    return
  }

  status.value = 'processing'
  progressText.value = t('import_ocr_recognizing')
  progressPercent.value = 0

  try {
    let text
    if (validFiles.length === 1) {
      text = await recognizeText(validFiles[0], (p) => {
        progressPercent.value = Math.round(p * 100)
      })
    } else {
      text = await recognizeMultiple(validFiles, (cur, total, p) => {
        progressPercent.value = Math.round(((cur - 1 + p) / total) * 100)
      })
    }

    if (!text.trim()) {
      ElMessage.warning(t('import_ocr_empty'))
      status.value = 'idle'
      return
    }

    rawText.value = text
    sourceType.value = 'ocr'
    parsedEntries.value = parseEntries(text)
    showPreview.value = true
    status.value = 'idle'
  } catch (err) {
    console.error('OCR error:', err)
    ElMessage.error(t('import_ocr_failed'))
    status.value = 'idle'
  }
}

/** ========== PDF 导入 ========== */
const pdfInput = ref(null)

function handlePdfClick() { pdfInput.value?.click() }

async function handlePdfSelect(e) {
  const file = e.target.files?.[0]
  e.target.value = ''
  if (!file || !file.name.toLowerCase().endsWith('.pdf')) {
    ElMessage.warning(t('import_pdf_only'))
    return
  }

  status.value = 'processing'
  progressText.value = t('import_pdf_parsing')
  progressPercent.value = 0

  try {
    const pdfjsLib = await import('pdfjs-dist')
    const pdfWorkerUrl = (await import('pdfjs-dist/build/pdf.worker.min.mjs?url')).default
    pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl

    const arrayBuffer = await file.arrayBuffer()
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise
    const totalPages = pdf.numPages
    const pages = []

    for (let i = 1; i <= totalPages; i++) {
      if (cancelFlag) { cancelFlag = false; status.value = 'idle'; return }
      progressPercent.value = Math.round((i / totalPages) * 100)
      progressText.value = t('import_pdf_page_progress', { current: i, total: totalPages })

      const page = await pdf.getPage(i)
      const content = await page.getTextContent()
      const lines = []
      let currentLine = ''
      let lastY = null
      for (const item of content.items) {
        const y = Math.round(item.transform[5])
        if (lastY !== null && Math.abs(y - lastY) > 2) {
          if (currentLine.trim()) lines.push(currentLine.trim())
          currentLine = item.str
        } else {
          currentLine += item.str
        }
        lastY = y
      }
      if (currentLine.trim()) lines.push(currentLine.trim())
      pages.push(lines.join('\n'))
    }

    const text = pages.join('\n')
    if (!text.trim()) {
      ElMessage.warning(t('import_pdf_empty'))
      status.value = 'idle'
      return
    }

    rawText.value = text
    sourceType.value = 'pdf'
    parsedEntries.value = parseEntries(text)
    showPreview.value = true
    status.value = 'idle'
  } catch (err) {
    console.error('PDF error:', err)
    ElMessage.error(t('import_pdf_failed'))
    status.value = 'idle'
  }
}

/** ========== Word 导入 ========== */
const wordInput = ref(null)

function handleWordClick() { wordInput.value?.click() }

async function handleWordSelect(e) {
  const file = e.target.files?.[0]
  e.target.value = ''
  const name = file?.name?.toLowerCase() || ''
  if (!file || (!name.endsWith('.docx') && !name.endsWith('.doc'))) {
    ElMessage.warning(t('import_word_only'))
    return
  }
  status.value = 'processing'
  progressText.value = t('import_word_parsing')
  progressPercent.value = 50

  try {
    let text
    const isOldDoc = name.endsWith('.doc') && !name.endsWith('.docx')

    try {
      /* 先尝试 mammoth 解析（支持 .docx 和部分 .doc） */
      const mammoth = (await import('mammoth')).default
      const arrayBuffer = await file.arrayBuffer()
      const result = await mammoth.extractRawText({ arrayBuffer })
      text = result.value
    } catch {
      /* mammoth 解析失败 */
      text = ''
    }

    /* mammoth 返回空内容或失败，且是 .doc 格式 → 调用后端 Apache POI 解析 */
    if ((!text || !text.trim()) && isOldDoc) {
      progressText.value = t('import_doc_server_parsing')
      const res = await parseDocFile(file)
      text = res.data?.text || ''
    }

    if (!text || !text.trim()) {
      ElMessage.warning(t('import_word_empty'))
      status.value = 'idle'
      return
    }

    rawText.value = text
    sourceType.value = 'word'
    parsedEntries.value = parseEntries(text)
    showPreview.value = true
    status.value = 'idle'
  } catch (err) {
    console.error('Word error:', err)
    ElMessage.error(t('import_word_failed'))
    status.value = 'idle'
  }
}
</script>

<template>
  <div class="commentary-import" role="main" :aria-label="t('import_commentary_title')">
    <!-- 顶部导航 -->
    <div class="page-header">
      <div class="header-left">
        <el-button text @click="goBack" :aria-label="t('back')">
          <el-icon :size="18"><Reading /></el-icon>
          {{ t('back') }}
        </el-button>
      </div>
      <div class="header-info">
        <h2 class="page-title">{{ t('import_commentary_title') }}</h2>
        <p class="page-desc">{{ t('import_commentary_desc') }}</p>
      </div>
    </div>

    <!-- 已有数据提示 -->
    <div v-if="existingEntries.length > 0" class="existing-hint">
      {{ t('import_existing_entries', { count: existingEntries.length }) }}
    </div>

    <!-- 处理中遮罩 -->
    <div v-if="status === 'processing'" class="processing-overlay">
      <div class="processing-card">
        <el-progress :percentage="progressPercent" :stroke-width="8" :show-text="false" />
        <p class="processing-text">{{ progressText }}</p>
        <el-button type="danger" plain size="small" style="margin-top: 12px" @click="handleCancel">{{ t('import_cancel_btn') }}</el-button>
      </div>
    </div>

    <!-- 预览结果 -->
    <div v-if="showPreview" class="preview-section">
      <div class="preview-header">
        <h3>{{ t('import_commentary_preview') }}</h3>
        <span class="preview-count">{{ t('import_commentary_count', { count: parsedEntries.length }) }}</span>
      </div>

      <!-- 智能解析统计 -->
      <div class="parse-stats">
        <div class="stat-item stat-success">
          <span class="stat-num">{{ parsedEntries.filter(e => e.reference).length }}</span>
          <span class="stat-label">{{ t('import_matched_verses') }}</span>
        </div>
        <div class="stat-item stat-warning">
          <span class="stat-num">{{ parsedEntries.filter(e => !e.reference).length }}</span>
          <span class="stat-label">{{ t('import_unmatched_entries') }}</span>
        </div>
      </div>

      <div class="preview-list">
        <div v-for="(entry, idx) in parsedEntries.slice(0, 50)" :key="idx" class="preview-entry">
          <div class="entry-ref" v-if="entry.reference">
            <span class="ref-badge">{{ normalizeReference(entry.reference) || entry.reference }}</span>
          </div>
          <div class="entry-ref entry-ref-empty" v-else>
            <span class="ref-badge ref-badge-empty">{{ t('import_no_ref') }}</span>
          </div>
          <div class="entry-content">{{ entry.content.slice(0, 200) }}{{ entry.content.length > 200 ? '...' : '' }}</div>
        </div>
        <div v-if="parsedEntries.length > 50" class="preview-more">
          {{ t('import_commentary_more', { count: parsedEntries.length - 50 }) }}
        </div>
      </div>
      <div class="preview-actions">
        <el-button @click="showPreview = false; parsedEntries = []">{{ t('import_cancel') }}</el-button>
        <el-button type="primary" @click="confirmImport" :loading="saving">
          {{ resourceId ? t('import_save_to_resource') : t('import_commentary_confirm') }}
        </el-button>
      </div>
    </div>

    <!-- 导入方式卡片 -->
    <div v-else class="import-cards">
      <!-- 粘贴文本 -->
      <div class="import-card" @click="showPasteDialog = true">
        <div class="card-icon" style="background: #e8f4fd; color: #3d5a80;">
          <el-icon :size="36"><Edit /></el-icon>
        </div>
        <h3 class="card-title">{{ t('import_paste_text') }}</h3>
        <p class="card-desc">{{ t('import_paste_text_desc') }}</p>
        <div class="card-formats">{{ t('import_paste_format') }}</div>
      </div>

      <!-- OCR 拍照 -->
      <div class="import-card" @click="handleOcrClick">
        <div class="card-icon" style="background: #e6f7e6; color: #52c41a;">
          <el-icon :size="36"><Camera /></el-icon>
        </div>
        <h3 class="card-title">{{ t('import_ocr') }}</h3>
        <p class="card-desc">{{ t('import_ocr_desc') }}</p>
        <div class="card-formats">PNG / JPG / BMP</div>
        <input ref="ocrInput" type="file" accept="image/*" multiple style="display:none" @change="handleOcrSelect" />
      </div>

      <!-- PDF 导入 -->
      <div class="import-card" @click="handlePdfClick">
        <div class="card-icon" style="background: #fff3e0; color: #e67e22;">
          <el-icon :size="36"><Document /></el-icon>
        </div>
        <h3 class="card-title">{{ t('import_pdf') }}</h3>
        <p class="card-desc">{{ t('import_pdf_desc') }}</p>
        <div class="card-formats">PDF</div>
        <input ref="pdfInput" type="file" accept=".pdf" style="display:none" @change="handlePdfSelect" />
      </div>

      <!-- Word 导入 -->
      <div class="import-card" @click="handleWordClick">
        <div class="card-icon" style="background: #e8f0fe; color: #4285f4;">
          <el-icon :size="36"><Reading /></el-icon>
        </div>
        <h3 class="card-title">{{ t('import_word') }}</h3>
        <p class="card-desc">{{ t('import_word_desc') }}</p>
        <div class="card-formats">DOC / DOCX</div>
        <input ref="wordInput" type="file" accept=".doc,.docx" style="display:none" @change="handleWordSelect" />
      </div>
    </div>

    <!-- 粘贴文本弹窗 -->
    <el-dialog v-model="showPasteDialog" :title="t('import_paste_text')" width="90%" :close-on-click-modal="false">
      <div class="paste-hint">{{ t('import_paste_hint') }}</div>
      <el-input
        v-model="pasteText"
        type="textarea"
        :rows="15"
        :placeholder="t('import_paste_placeholder')"
        :aria-label="t('import_paste_text')"
      />
      <template #footer>
        <el-button @click="showPasteDialog = false">{{ t('cancel') }}</el-button>
        <el-button type="primary" @click="handlePasteImport">{{ t('import_parse_btn') }}</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped>
.commentary-import { max-width: 900px; margin: 0 auto; padding: 24px 20px; }

.page-header { display: flex; align-items: flex-start; gap: 16px; margin-bottom: 24px; }
.header-left { flex-shrink: 0; padding-top: 4px; }
.header-info { flex: 1; }
.page-title { font-size: 22px; font-weight: 700; color: #333; margin: 0 0 8px; }
.page-desc { font-size: 14px; color: #999; margin: 0; }

.existing-hint {
  background: #e8f4fd;
  color: #3d5a80;
  padding: 12px 16px;
  border-radius: 8px;
  font-size: 14px;
  margin-bottom: 20px;
  border: 1px solid rgba(61, 90, 128, 0.2);
}

.import-cards { display: grid; grid-template-columns: repeat(2, 1fr); gap: 20px; }
@media (max-width: 600px) { .import-cards { grid-template-columns: 1fr; } }

.import-card {
  background: #fff; border: 2px solid #eaeaea; border-radius: 12px;
  padding: 32px 24px; text-align: center; cursor: pointer; transition: all 0.25s;
}
.import-card:hover { border-color: #5a8a6e; box-shadow: 0 8px 24px rgba(90, 138, 110, 0.12); transform: translateY(-4px); }
.card-icon { width: 72px; height: 72px; border-radius: 18px; display: flex; align-items: center; justify-content: center; margin: 0 auto 16px; }
.card-title { font-size: 17px; font-weight: 600; color: #333; margin: 0 0 8px; }
.card-desc { font-size: 13px; color: #999; margin: 0 0 12px; line-height: 1.5; }
.card-formats { font-size: 11px; color: #bbb; background: #f8f8f8; padding: 4px 12px; border-radius: 12px; display: inline-block; }

.processing-overlay { position: fixed; inset: 0; z-index: 100; background: rgba(255,255,255,0.85); display: flex; align-items: center; justify-content: center; }
.processing-card { background: #fff; border-radius: 12px; padding: 32px 40px; box-shadow: 0 8px 32px rgba(0,0,0,0.1); text-align: center; min-width: 320px; }
.processing-text { font-size: 14px; color: #333; margin: 12px 0 4px; }

.preview-section { background: #fff; border: 1px solid #eaeaea; border-radius: 12px; padding: 24px; }
.preview-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 16px; }
.preview-header h3 { font-size: 16px; font-weight: 600; color: #333; margin: 0; }
.preview-count { font-size: 13px; color: #999; }

.parse-stats { display: flex; gap: 16px; margin-bottom: 16px; }
.stat-item { display: flex; align-items: center; gap: 8px; padding: 8px 16px; border-radius: 8px; font-size: 13px; }
.stat-success { background: #e6f7e6; color: #389e0d; }
.stat-warning { background: #fff7e6; color: #d48806; }
.stat-num { font-size: 18px; font-weight: 700; }
.stat-label { font-size: 12px; }

.preview-list { max-height: 500px; overflow-y: auto; }
.preview-entry { padding: 12px 0; border-bottom: 1px solid #f0f0f0; }
.entry-ref { margin-bottom: 6px; }
.ref-badge { display: inline-block; padding: 2px 10px; border-radius: 4px; font-size: 13px; font-weight: 600; background: rgba(90, 138, 110, 0.1); color: #5a8a6e; }
.ref-badge-empty { background: #fff7e6; color: #d48806; }
.entry-content { font-size: 13px; color: #666; line-height: 1.6; white-space: pre-wrap; }
.preview-more { text-align: center; padding: 16px; color: #999; font-size: 13px; }
.preview-actions { display: flex; justify-content: flex-end; gap: 12px; margin-top: 20px; padding-top: 16px; border-top: 1px solid #f0f0f0; }

.paste-hint { font-size: 13px; color: #999; margin-bottom: 12px; line-height: 1.6; }
</style>
