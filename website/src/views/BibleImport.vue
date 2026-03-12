<script setup>
/**
 * 圣经AI导入中心
 * 步骤1：选择导入方式（OCR拍照/图片、PDF、Word）
 * 解析文件后跳转到 AI排版预览页
 */
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { ElMessage } from 'element-plus'
import { Upload, Camera, Document, Reading } from '@element-plus/icons-vue'
import { useImportFlowStore } from '@/stores/importFlow'
import { recognizeText, recognizeMultiple, isSupportedImage } from '@/utils/ocrImport'

const router = useRouter()
const { t } = useI18n()
const importStore = useImportFlowStore()

/** 当前状态：idle | processing */
const status = ref('idle')

/** 进度信息 */
const progressText = ref('')
const progressPercent = ref(0)

/** 取消标志 */
let cancelFlag = false

/** 取消当前处理 */
function handleCancel() {
  cancelFlag = true
  status.value = 'idle'
  progressText.value = ''
  progressPercent.value = 0
}

/** PDF页码范围对话框 */
const showPageRange = ref(false)
const pdfTotalPages = ref(0)
const pageFrom = ref(1)
const pageTo = ref(100)
let pendingPdfDoc = null
let pendingPdfFileName = ''

/** ========== OCR 导入 ========== */

/** OCR 文件输入引用 */
const ocrInput = ref(null)

/** 点击 OCR 卡片 */
function handleOcrClick() {
  ocrInput.value?.click()
}

/** 选择图片文件 */
async function handleOcrSelect(e) {
  const files = Array.from(e.target.files || [])
  e.target.value = ''

  if (files.length === 0) return

  /* 验证文件类型 */
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
        progressText.value = t('import_ocr_progress', { percent: progressPercent.value })
      })
    } else {
      text = await recognizeMultiple(validFiles, (cur, total, p) => {
        progressPercent.value = Math.round(((cur - 1 + p) / total) * 100)
        progressText.value = t('import_ocr_multi_progress', { current: cur, total, percent: Math.round(p * 100) })
      })
    }

    if (!text.trim()) {
      ElMessage.warning(t('import_ocr_empty'))
      status.value = 'idle'
      return
    }

    importStore.setRawText(text, 'ocr', validFiles[0].name)
    router.push('/bible/import/preview')
  } catch (err) {
    console.error('OCR error:', err)
    ElMessage.error(t('import_ocr_failed'))
    status.value = 'idle'
  }
}

/** ========== PDF 导入 ========== */

const pdfInput = ref(null)

function handlePdfClick() {
  pdfInput.value?.click()
}

async function handlePdfSelect(e) {
  const file = e.target.files?.[0]
  e.target.value = ''
  if (!file) return

  if (!file.name.toLowerCase().endsWith('.pdf')) {
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
    const pages = []

    for (let i = 1; i <= pdf.numPages; i++) {
      progressPercent.value = Math.round((i / pdf.numPages) * 100)
      progressText.value = t('import_pdf_page_progress', { current: i, total: pdf.numPages })

      /* 每50页让UI刷新一次进度条，避免界面冻住 */
      if (i % 50 === 0) {
        await new Promise(r => setTimeout(r, 0))
      }

      const page = await pdf.getPage(i)
      const content = await page.getTextContent()

      /* 用Y坐标检测换行 */
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

    progressText.value = t('import_pdf_merging')
    progressPercent.value = 100

    /* 让UI先刷新进度提示，再处理大文本拼接 */
    await new Promise(r => setTimeout(r, 100))

    const text = pages.join('\n')
    if (!text.trim()) {
      ElMessage.warning(t('import_pdf_empty'))
      status.value = 'idle'
      return
    }

    /* 大文件警告：超过500页时截断避免卡顿 */
    const MAX_CHARS = 2000000
    let finalText = text
    if (text.length > MAX_CHARS) {
      finalText = text.slice(0, MAX_CHARS)
      ElMessage.warning(t('import_pdf_truncated'))
    }

    importStore.setRawText(finalText, 'pdf', file.name)

    /* 等UI更新后再跳转 */
    await new Promise(r => setTimeout(r, 50))
    router.push('/bible/import/preview')
  } catch (err) {
    console.error('PDF error:', err)
    ElMessage.error(t('import_pdf_failed'))
    status.value = 'idle'
  }
}

/** ========== Word 导入 ========== */

const wordInput = ref(null)

function handleWordClick() {
  wordInput.value?.click()
}

async function handleWordSelect(e) {
  const file = e.target.files?.[0]
  e.target.value = ''
  if (!file) return

  const fileName = file.name.toLowerCase()
  if (!fileName.endsWith('.docx') && !fileName.endsWith('.doc')) {
    ElMessage.warning(t('import_word_only'))
    return
  }
  if (fileName.endsWith('.doc') && !fileName.endsWith('.docx')) {
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

    importStore.setRawText(text, 'word', file.name)
    router.push('/bible/import/preview')
  } catch (err) {
    console.error('Word error:', err)
    ElMessage.error(t('import_word_failed'))
    status.value = 'idle'
  }
}
</script>

<template>
  <div class="bible-import" role="main" :aria-label="t('import_title')">
    <!-- 页面标题 -->
    <div class="page-header">
      <h2 class="page-title">{{ t('import_title') }}</h2>
      <p class="page-desc">{{ t('import_desc') }}</p>
    </div>

    <!-- 处理中遮罩 -->
    <div v-if="status === 'processing'" class="processing-overlay">
      <div class="processing-card">
        <el-progress :percentage="progressPercent" :stroke-width="8" :show-text="false" />
        <p class="processing-text">{{ progressText }}</p>
        <p class="processing-hint">{{ t('import_please_wait') }}</p>
        <el-button type="danger" plain size="small" style="margin-top: 16px" @click="handleCancel">
          {{ t('import_cancel_btn') }}
        </el-button>
      </div>
    </div>

    <!-- PDF页码范围选择对话框 -->
    <el-dialog
      v-model="showPageRange"
      :title="t('import_pdf_range_title')"
      width="420px"
      :close-on-click-modal="false"
    >
      <p class="range-hint">{{ t('import_pdf_range_hint', { total: pdfTotalPages }) }}</p>
      <div class="range-inputs">
        <div class="range-field">
          <label>{{ t('import_pdf_from') }}</label>
          <el-input-number v-model="pageFrom" :min="1" :max="pdfTotalPages" size="large" />
        </div>
        <span class="range-sep">~</span>
        <div class="range-field">
          <label>{{ t('import_pdf_to') }}</label>
          <el-input-number v-model="pageTo" :min="pageFrom" :max="pdfTotalPages" size="large" />
        </div>
      </div>
      <p class="range-count">{{ t('import_pdf_range_count', { count: Math.max(0, pageTo - pageFrom + 1) }) }}</p>
      <template #footer>
        <el-button @click="showPageRange = false; pendingPdfDoc = null">{{ t('import_cancel') }}</el-button>
        <el-button type="primary" @click="handlePageRangeConfirm">{{ t('import_pdf_start_parse') }}</el-button>
      </template>
    </el-dialog>

    <!-- 三种导入方式卡片 -->
    <div class="import-cards">
      <!-- OCR 拍照/图片导入 -->
      <div class="import-card ocr-card" @click="handleOcrClick" role="button" :aria-label="t('import_ocr')">
        <div class="card-icon ocr-icon">
          <el-icon :size="40"><Camera /></el-icon>
        </div>
        <h3 class="card-title">{{ t('import_ocr') }}</h3>
        <p class="card-desc">{{ t('import_ocr_desc') }}</p>
        <div class="card-formats">PNG / JPG / BMP / WebP</div>
        <input
          ref="ocrInput"
          type="file"
          accept="image/*"
          multiple
          style="display:none"
          @change="handleOcrSelect"
        />
      </div>

      <!-- PDF 导入 -->
      <div class="import-card pdf-card" @click="handlePdfClick" role="button" :aria-label="t('import_pdf')">
        <div class="card-icon pdf-icon">
          <el-icon :size="40"><Document /></el-icon>
        </div>
        <h3 class="card-title">{{ t('import_pdf') }}</h3>
        <p class="card-desc">{{ t('import_pdf_desc') }}</p>
        <div class="card-formats">PDF</div>
        <input
          ref="pdfInput"
          type="file"
          accept=".pdf"
          style="display:none"
          @change="handlePdfSelect"
        />
      </div>

      <!-- Word 导入 -->
      <div class="import-card word-card" @click="handleWordClick" role="button" :aria-label="t('import_word')">
        <div class="card-icon word-icon">
          <el-icon :size="40"><Reading /></el-icon>
        </div>
        <h3 class="card-title">{{ t('import_word') }}</h3>
        <p class="card-desc">{{ t('import_word_desc') }}</p>
        <div class="card-formats">DOC / DOCX</div>
        <input
          ref="wordInput"
          type="file"
          accept=".doc,.docx"
          style="display:none"
          @change="handleWordSelect"
        />
      </div>
    </div>

    <!-- 流程说明 -->
    <div class="flow-steps">
      <h3 class="flow-title">{{ t('import_flow_title') }}</h3>
      <div class="steps-row">
        <div class="step-item">
          <div class="step-num">1</div>
          <span>{{ t('import_step1') }}</span>
        </div>
        <div class="step-arrow">&rarr;</div>
        <div class="step-item">
          <div class="step-num">2</div>
          <span>{{ t('import_step2') }}</span>
        </div>
        <div class="step-arrow">&rarr;</div>
        <div class="step-item">
          <div class="step-num">3</div>
          <span>{{ t('import_step3') }}</span>
        </div>
        <div class="step-arrow">&rarr;</div>
        <div class="step-item">
          <div class="step-num">4</div>
          <span>{{ t('import_step4') }}</span>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.bible-import {
  max-width: 900px;
  margin: 0 auto;
  padding: 24px 20px;
}

.page-header {
  margin-bottom: 32px;
}

.page-title {
  font-size: 22px;
  font-weight: 700;
  color: #333;
  margin: 0 0 8px;
}

.page-desc {
  font-size: 14px;
  color: #999;
  margin: 0;
}

/* 导入卡片 */
.import-cards {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 20px;
  margin-bottom: 40px;
}

.import-card {
  background: #fff;
  border: 2px solid #e8e8e8;
  border-radius: 12px;
  padding: 32px 24px;
  text-align: center;
  cursor: pointer;
  transition: all 0.25s;
}

.import-card:hover {
  border-color: #409eff;
  box-shadow: 0 8px 24px rgba(64, 158, 255, 0.12);
  transform: translateY(-4px);
}

.card-icon {
  width: 80px;
  height: 80px;
  border-radius: 20px;
  display: flex;
  align-items: center;
  justify-content: center;
  margin: 0 auto 16px;
}

.ocr-icon { background: #e8f4ff; color: #409eff; }
.pdf-icon { background: #fff0e6; color: #e6a23c; }
.word-icon { background: #e8f8ef; color: #67c23a; }

.card-title {
  font-size: 18px;
  font-weight: 600;
  color: #333;
  margin: 0 0 8px;
}

.card-desc {
  font-size: 13px;
  color: #999;
  margin: 0 0 12px;
  line-height: 1.5;
}

.card-formats {
  display: inline-block;
  padding: 4px 12px;
  background: #f5f7fa;
  border-radius: 20px;
  font-size: 12px;
  color: #999;
}

/* 处理中遮罩 */
.processing-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 2000;
}

.processing-card {
  background: #fff;
  border-radius: 12px;
  padding: 40px 48px;
  text-align: center;
  min-width: 320px;
}

.processing-text {
  font-size: 15px;
  color: #333;
  margin: 16px 0 4px;
  font-weight: 500;
}

.processing-hint {
  font-size: 13px;
  color: #999;
  margin: 0;
}

/* 页码范围选择 */
.range-hint {
  font-size: 14px;
  color: #666;
  margin: 0 0 20px;
  line-height: 1.6;
}

.range-inputs {
  display: flex;
  align-items: flex-end;
  gap: 12px;
  justify-content: center;
  margin-bottom: 12px;
}

.range-field {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.range-field label {
  font-size: 13px;
  color: #999;
}

.range-sep {
  font-size: 20px;
  color: #ccc;
  padding-bottom: 6px;
}

.range-count {
  text-align: center;
  font-size: 13px;
  color: #409eff;
  margin: 0;
}

/* 流程说明 */
.flow-steps {
  background: #fff;
  border: 1px solid #e8e8e8;
  border-radius: 12px;
  padding: 24px;
}

.flow-title {
  font-size: 16px;
  font-weight: 600;
  color: #333;
  margin: 0 0 20px;
}

.steps-row {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 12px;
  flex-wrap: wrap;
}

.step-item {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 14px;
  color: #666;
}

.step-num {
  width: 28px;
  height: 28px;
  border-radius: 50%;
  background: #409eff;
  color: #fff;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 13px;
  font-weight: 600;
  flex-shrink: 0;
}

.step-arrow {
  color: #ccc;
  font-size: 18px;
}

/* 响应式 */
@media (max-width: 680px) {
  .import-cards {
    grid-template-columns: 1fr;
  }
  .steps-row {
    flex-direction: column;
  }
  .step-arrow {
    transform: rotate(90deg);
  }
}
</style>
