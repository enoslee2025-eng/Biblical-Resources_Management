<script setup>
/**
 * AI词典导入中心
 * 支持OCR拍照、PDF、Word文档导入词典数据
 * 解析后AI自动识别词条和释义
 */
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { ElMessage } from 'element-plus'
import { Camera, Document, Reading } from '@element-plus/icons-vue'
import { recognizeText, recognizeMultiple, isSupportedImage } from '@/utils/ocrImport'

const router = useRouter()
const { t } = useI18n()

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

/**
 * 将原始文本解析为词条列表
 * 规则：每行 "词条名：释义" 或 "词条名 - 释义" 格式
 */
function parseEntries(text) {
  const lines = text.split('\n').filter(l => l.trim())
  const entries = []
  let currentEntry = null

  for (const line of lines) {
    /* 尝试匹配 "词条：释义" 或 "词条 - 释义" 格式 */
    const match = line.match(/^(.{1,30})[：:\-—]\s*(.+)/)
    if (match) {
      if (currentEntry) entries.push(currentEntry)
      currentEntry = { term: match[1].trim(), definition: match[2].trim() }
    } else if (currentEntry) {
      /* 续行追加到当前词条释义 */
      currentEntry.definition += '\n' + line.trim()
    } else {
      /* 无法解析的行作为独立词条 */
      entries.push({ term: line.trim().slice(0, 20), definition: line.trim() })
    }
  }
  if (currentEntry) entries.push(currentEntry)
  return entries
}

/** 完成导入，跳转到词典编辑页 */
function confirmImport() {
  /* 将解析结果存储到 sessionStorage 供编辑页使用 */
  sessionStorage.setItem('dictImportData', JSON.stringify(parsedEntries.value))
  router.push('/dictionary/edit')
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
  if (name.endsWith('.doc') && !name.endsWith('.docx')) {
    ElMessage.warning(t('import_word_doc_hint'))
    return
  }

  status.value = 'processing'
  progressText.value = t('import_word_parsing')
  progressPercent.value = 50

  try {
    const mammoth = (await import('mammoth')).default
    const arrayBuffer = await file.arrayBuffer()
    const result = await mammoth.extractRawText({ arrayBuffer })
    const text = result.value

    if (!text.trim()) {
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
  <div class="dict-import" role="main" :aria-label="t('import_dict_title')">
    <div class="page-header">
      <h2 class="page-title">{{ t('import_dict_title') }}</h2>
      <p class="page-desc">{{ t('import_dict_desc') }}</p>
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
        <h3>{{ t('import_dict_preview') }}</h3>
        <span class="preview-count">{{ t('import_dict_count', { count: parsedEntries.length }) }}</span>
      </div>
      <div class="preview-list">
        <div v-for="(entry, idx) in parsedEntries.slice(0, 50)" :key="idx" class="preview-entry">
          <div class="entry-term">{{ entry.term }}</div>
          <div class="entry-def">{{ entry.definition }}</div>
        </div>
        <div v-if="parsedEntries.length > 50" class="preview-more">
          {{ t('import_dict_more', { count: parsedEntries.length - 50 }) }}
        </div>
      </div>
      <div class="preview-actions">
        <el-button @click="showPreview = false; parsedEntries = []">{{ t('import_cancel') }}</el-button>
        <el-button type="primary" @click="confirmImport">{{ t('import_dict_confirm') }}</el-button>
      </div>
    </div>

    <!-- 导入方式卡片 -->
    <div v-else class="import-cards">
      <div class="import-card" @click="handleOcrClick">
        <div class="card-icon" style="background: #fff6e6; color: #e8a838;">
          <el-icon :size="36"><Camera /></el-icon>
        </div>
        <h3 class="card-title">{{ t('import_ocr') }}</h3>
        <p class="card-desc">{{ t('import_ocr_desc') }}</p>
        <div class="card-formats">PNG / JPG / BMP</div>
        <input ref="ocrInput" type="file" accept="image/*" multiple style="display:none" @change="handleOcrSelect" />
      </div>

      <div class="import-card" @click="handlePdfClick">
        <div class="card-icon" style="background: #fff6e6; color: #e8a838;">
          <el-icon :size="36"><Document /></el-icon>
        </div>
        <h3 class="card-title">{{ t('import_pdf') }}</h3>
        <p class="card-desc">{{ t('import_pdf_desc') }}</p>
        <div class="card-formats">PDF</div>
        <input ref="pdfInput" type="file" accept=".pdf" style="display:none" @change="handlePdfSelect" />
      </div>

      <div class="import-card" @click="handleWordClick">
        <div class="card-icon" style="background: #fff6e6; color: #e8a838;">
          <el-icon :size="36"><Reading /></el-icon>
        </div>
        <h3 class="card-title">{{ t('import_word') }}</h3>
        <p class="card-desc">{{ t('import_word_desc') }}</p>
        <div class="card-formats">DOC / DOCX</div>
        <input ref="wordInput" type="file" accept=".doc,.docx" style="display:none" @change="handleWordSelect" />
      </div>
    </div>
  </div>
</template>

<style scoped>
.dict-import { max-width: 900px; margin: 0 auto; padding: 24px 20px; }
.page-header { margin-bottom: 32px; }
.page-title { font-size: 22px; font-weight: 700; color: #333; margin: 0 0 8px; }
.page-desc { font-size: 14px; color: #999; margin: 0; }

.import-cards { display: grid; grid-template-columns: repeat(3, 1fr); gap: 20px; }
.import-card {
  background: #fff; border: 2px solid #eaeaea; border-radius: 12px;
  padding: 32px 24px; text-align: center; cursor: pointer; transition: all 0.25s;
}
.import-card:hover { border-color: #e8a838; box-shadow: 0 8px 24px rgba(232, 168, 56, 0.12); transform: translateY(-4px); }
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
.preview-list { max-height: 500px; overflow-y: auto; }
.preview-entry { padding: 12px 0; border-bottom: 1px solid #f0f0f0; }
.entry-term { font-size: 15px; font-weight: 600; color: #e8a838; margin-bottom: 4px; }
.entry-def { font-size: 13px; color: #666; line-height: 1.6; white-space: pre-wrap; }
.preview-more { text-align: center; padding: 16px; color: #999; font-size: 13px; }
.preview-actions { display: flex; justify-content: flex-end; gap: 12px; margin-top: 20px; padding-top: 16px; border-top: 1px solid #f0f0f0; }
</style>
