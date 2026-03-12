<script setup>
/**
 * 导入资源对话框
 * 支持拖拽或点击上传 txt / docx / pdf / json
 * 文件解析完全在浏览器本地完成，不依赖后端
 */
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { ElMessage } from 'element-plus'

const { t } = useI18n()
import mammoth from 'mammoth'
import request from '@/api/request'
// Vite ?url 语法：只获取 worker 文件的 URL，不加载模块本身
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'
import {
  splitIntoChapters,
  detectBookFromContent,
  matchBookFromFileName,
  buildBibleContentJson,
  detectAllBooks,
  parseFullBibleText,
  BIBLE_BOOK_NAMES
} from '@/utils/fileImport'

const props = defineProps({
  /** 资源类型：bible / dictionary / commentary / material */
  resourceType: { type: String, required: true }
})

const emit = defineEmits(['success'])

/** 对话框是否可见 */
const visible = ref(false)

/** 当前选中的文件 */
const selectedFile = ref(null)

/** 解析进度描述 */
const progressText = ref('')

/** 导入状态：idle | parsing | uploading | success | error */
const status = ref('idle')

/** 错误信息 */
const errorMsg = ref('')

/** 是否正在拖拽中 */
const isDragging = ref(false)

/** 资源类型名称 */
const typeNames = {
  bible: () => t('type_bible'),
  dictionary: () => t('type_dictionary'),
  commentary: () => t('type_commentary'),
  material: () => t('type_material')
}

/** 打开对话框 */
function open() {
  visible.value = true
  reset()
}

/** 重置 */
function reset() {
  selectedFile.value = null
  status.value = 'idle'
  errorMsg.value = ''
  progressText.value = ''
}

/** 关闭 */
function handleClose() {
  if (status.value === 'parsing' || status.value === 'uploading') return
  visible.value = false
}

/** input 选择文件 */
function handleFileSelect(e) {
  const file = e.target.files[0]
  if (file) validateAndSet(file)
  e.target.value = ''
}

/** 拖拽放下 */
function handleDrop(e) {
  isDragging.value = false
  const file = e.dataTransfer.files[0]
  if (file) validateAndSet(file)
}

/** 验证并设置文件 */
function validateAndSet(file) {
  const ext = file.name.split('.').pop().toLowerCase()
  if (!['txt', 'doc', 'docx', 'pdf', 'json'].includes(ext)) {
    ElMessage.warning(t('import_format_only'))
    return
  }
  if (file.size > 50 * 1024 * 1024) {
    ElMessage.warning(t('import_size_limit'))
    return
  }
  selectedFile.value = file
  status.value = 'idle'
  errorMsg.value = ''
}

/** 文件图标 */
function getFileIcon(file) {
  const ext = file.name.split('.').pop().toLowerCase()
  return { txt: '📄', doc: '📝', docx: '📝', pdf: '📕', json: '📦' }[ext] || '📄'
}

/** 格式化文件大小 */
function formatSize(bytes) {
  if (bytes < 1024) return bytes + ' B'
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB'
  return (bytes / 1024 / 1024).toFixed(1) + ' MB'
}

/**
 * 读取 txt 文件为字符串
 */
function readAsText(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = e => resolve(e.target.result)
    reader.onerror = reject
    reader.readAsText(file, 'UTF-8')
  })
}

/**
 * 解析 docx 文件，提取纯文字
 */
async function parseDocx(file) {
  const arrayBuffer = await file.arrayBuffer()
  const result = await mammoth.extractRawText({ arrayBuffer })
  return result.value
}

/**
 * 解析 PDF 文件，提取纯文字
 * 动态加载 pdfjs-dist 避免影响启动速度
 */
async function parsePdf(file) {
  const pdfjsLib = await import('pdfjs-dist')
  // 使用 Vite ?url 导入的 worker 路径
  pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl

  const arrayBuffer = await file.arrayBuffer()
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise
  const pages = []

  for (let i = 1; i <= pdf.numPages; i++) {
    progressText.value = t('import_pdf_page_progress', { current: i, total: pdf.numPages })
    const page = await pdf.getPage(i)
    const content = await page.getTextContent()

    // 用 Y 坐标检测换行，保留行结构（书卷名、章节标题才能被识别为独立行）
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

  return pages.join('\n')
}

/**
 * 根据文件类型解析内容
 */
async function parseFile(file) {
  const ext = file.name.split('.').pop().toLowerCase()
  switch (ext) {
    case 'txt':
      return await readAsText(file)
    case 'doc':
      throw new Error(t('import_doc_not_supported'))
    case 'docx':
      return await parseDocx(file)
    case 'pdf':
      return await parsePdf(file)
    case 'json': {
      const text = await readAsText(file)
      try {
        JSON.parse(text) // 验证 JSON 合法
        return text
      } catch {
        throw new Error(t('import_json_format_error'))
      }
    }
    default:
      throw new Error(t('import_unsupported_file'))
  }
}

/**
 * 开始导入
 * 1. 浏览器本地解析文件
 * 2. 把解析好的内容发给后端保存
 */
async function handleImport() {
  if (!selectedFile.value) return

  const file = selectedFile.value
  const ext = file.name.split('.').pop().toLowerCase()
  const title = file.name.replace(/\.[^.]+$/, '') // 用文件名作为标题

  // 第一步：本地解析
  status.value = 'parsing'
  progressText.value = t('import_parsing_file_msg')
  errorMsg.value = ''

  let content
  try {
    content = await parseFile(file)
  } catch (e) {
    status.value = 'error'
    errorMsg.value = t('import_parse_file_error', { error: e.message })
    return
  }

  // 第二步：智能解析（圣经译本需要解析章节经文结构）
  let contentJson = null
  let detectedBookName = ''

  if (props.resourceType === 'bible') {
    progressText.value = t('import_detecting_structure')

    // 先扫描整段文本，看能识别到几卷书
    const allDetected = detectAllBooks(content)

    if (allDetected.length >= 3) {
      // 识别到 3 卷以上 → 整本圣经模式
      progressText.value = t('import_detected_n_books', { count: allDetected.length })
      const { books, detectedCount } = parseFullBibleText(content)
      contentJson = JSON.stringify(books)
      detectedBookName = t('import_full_bible_label', { count: detectedCount })
    } else {
      // 单卷或少数卷 → 原有单卷模式
      let bookIdx = matchBookFromFileName(file.name)
      if (bookIdx < 0 && allDetected.length > 0) {
        bookIdx = allDetected[0].bookIndex
      }
      if (bookIdx < 0) {
        const detected = detectBookFromContent(content)
        if (detected) bookIdx = detected.bookIndex
      }

      if (bookIdx >= 0) {
        detectedBookName = BIBLE_BOOK_NAMES[bookIdx]
      }

      const chapterTexts = splitIntoChapters(content)
      const books = buildBibleContentJson(bookIdx, chapterTexts, 0)
      contentJson = JSON.stringify(books)
    }
  }

  // 第三步：发给后端保存
  status.value = 'uploading'
  progressText.value = t('import_saving_server')

  try {
    await request.post('/private/api/resource/import-content', {
      type: props.resourceType,
      title,
      format: ext,
      content,
      contentJson
    })

    status.value = 'success'
    const bookHint = detectedBookName ? t('import_detected_hint', { name: detectedBookName }) : ''
    ElMessage.success(t('import_success_msg') + bookHint)
    emit('success')
    setTimeout(() => { visible.value = false }, 1200)
  } catch (e) {
    status.value = 'error'
    errorMsg.value = e.response?.data?.message || e.message || t('import_server_save_error')
  }
}

defineExpose({ open })
</script>

<template>
  <el-dialog
    v-model="visible"
    :title="t('import_dialog_title', { type: typeNames[resourceType]() })"
    width="480px"
    :close-on-click-modal="status !== 'parsing' && status !== 'uploading'"
    :before-close="handleClose"
  >
    <!-- 上传区域 -->
    <div
      class="upload-area"
      :class="{
        dragging: isDragging,
        'has-file': selectedFile && status === 'idle',
        success: status === 'success'
      }"
      @dragover.prevent="isDragging = true"
      @dragleave="isDragging = false"
      @drop.prevent="handleDrop"
    >
      <!-- 成功 -->
      <div v-if="status === 'success'" class="upload-state">
        <div class="state-icon">✅</div>
        <p class="state-text">{{ t('import_success_msg') }}</p>
      </div>

      <!-- 解析中 / 上传中 -->
      <div v-else-if="status === 'parsing' || status === 'uploading'" class="upload-state">
        <el-icon class="spinning state-icon-el"><Loading /></el-icon>
        <p class="state-text">{{ progressText }}</p>
      </div>

      <!-- 已选文件（空闲/出错） -->
      <div v-else-if="selectedFile" class="file-preview">
        <div class="file-icon">{{ getFileIcon(selectedFile) }}</div>
        <div class="file-info">
          <div class="file-name">{{ selectedFile.name }}</div>
          <div class="file-size">{{ formatSize(selectedFile.size) }}</div>
        </div>
        <el-button link type="danger" @click="selectedFile = null">{{ t('import_remove_file') }}</el-button>
      </div>

      <!-- 默认拖拽提示 -->
      <div v-else class="upload-hint">
        <div class="upload-icon">📥</div>
        <p class="hint-main">{{ t('import_drag_hint_text') }}</p>
        <label class="select-btn">
          {{ t('import_click_to_select') }}
          <input type="file" accept=".txt,.doc,.docx,.pdf,.json" style="display:none" @change="handleFileSelect" />
        </label>
        <p class="hint-formats">{{ t('import_formats_hint') }}</p>
      </div>
    </div>

    <!-- 错误提示 -->
    <el-alert
      v-if="status === 'error' && errorMsg"
      :title="errorMsg"
      type="error"
      show-icon
      :closable="false"
      style="margin-top: 12px;"
    />

    <template #footer>
      <el-button
        @click="handleClose"
        :disabled="status === 'parsing' || status === 'uploading'"
      >
        {{ t('cancel') }}
      </el-button>
      <el-button
        type="primary"
        :loading="status === 'parsing' || status === 'uploading'"
        :disabled="!selectedFile || status === 'success'"
        @click="handleImport"
      >
        {{ (status === 'parsing' || status === 'uploading') ? t('import_btn_processing') : t('import_btn_start') }}
      </el-button>
    </template>
  </el-dialog>
</template>

<style scoped>
.upload-area {
  border: 2px dashed #d9d9d9;
  border-radius: 8px;
  padding: 32px 24px;
  text-align: center;
  transition: all 0.2s;
  min-height: 160px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.upload-area.dragging {
  border-color: #409eff;
  background: #ecf5ff;
}

.upload-area.has-file {
  border-style: solid;
  border-color: #409eff;
  background: #f8fbff;
}

.upload-area.success {
  border-color: #67c23a;
  background: #f0f9eb;
}

.upload-hint {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
}

.upload-icon { font-size: 40px; margin-bottom: 4px; }

.hint-main { font-size: 14px; color: #666; margin: 0; }

.select-btn {
  color: #409eff;
  cursor: pointer;
  font-size: 14px;
  font-weight: 500;
  text-decoration: underline;
}

.hint-formats { font-size: 12px; color: #bbb; margin: 4px 0 0; }

.file-preview {
  display: flex;
  align-items: center;
  gap: 12px;
  width: 100%;
  padding: 0 8px;
}

.file-icon { font-size: 32px; flex-shrink: 0; }

.file-info { flex: 1; text-align: left; overflow: hidden; }

.file-name {
  font-size: 14px;
  color: #333;
  font-weight: 500;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.file-size { font-size: 12px; color: #999; margin-top: 4px; }

.upload-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
}

.state-icon { font-size: 44px; }
.state-icon-el { font-size: 40px; color: #409eff; }

.state-text { font-size: 15px; color: #666; margin: 0; font-weight: 500; }

.spinning { animation: spin 1s linear infinite; }

@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}
</style>
