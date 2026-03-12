<script setup>
/**
 * 导出资源对话框
 * 支持选择格式：TXT / Word / PDF / JSON
 * JSON 格式纯前端实现，其他格式调用后端 API
 */
import { ref } from 'vue'
import { ElMessage } from 'element-plus'
import { getExportUrl } from '@/api/resource'
import request from '@/api/request'

const props = defineProps({
  /** 资源类型：bible / dictionary / commentary / material */
  resourceType: { type: String, required: true },
  /** 要导出的资源列表（当前筛选后的） */
  resources: { type: Array, default: () => [] }
})

/** 对话框是否可见 */
const visible = ref(false)

/** 选中的导出格式 */
const selectedFormat = ref('json')

/** 导出状态：idle | exporting | success */
const status = ref('idle')

/** 资源类型名称映射 */
const typeNames = {
  bible: '圣经译本',
  dictionary: '词典',
  commentary: '圣经注释',
  material: '素材库'
}

/** 格式选项 */
const formats = [
  {
    value: 'json',
    label: 'JSON',
    desc: '平台通用格式，可再次导入',
    icon: '📦',
    clientSide: true
  },
  {
    value: 'txt',
    label: 'TXT',
    desc: '纯文本格式，方便查看',
    icon: '📄',
    clientSide: false
  },
  {
    value: 'docx',
    label: 'Word',
    desc: '.docx 格式，可用 Word 打开编辑',
    icon: '📝',
    clientSide: false
  },
  {
    value: 'pdf',
    label: 'PDF',
    desc: '适合打印和分享',
    icon: '📕',
    clientSide: false
  }
]

/** 打开对话框 */
function open() {
  visible.value = true
  status.value = 'idle'
  selectedFormat.value = 'json'
}

/** 执行导出 */
async function handleExport() {
  if (props.resources.length === 0) {
    ElMessage.warning('没有可导出的资源')
    return
  }

  const fmt = selectedFormat.value
  status.value = 'exporting'

  try {
    if (fmt === 'json') {
      // JSON 格式：纯前端直接下载
      exportJson()
    } else {
      // 其他格式：调用后端 API
      await exportViaApi(fmt)
    }
    status.value = 'success'
    ElMessage.success('导出成功！')
    setTimeout(() => { visible.value = false }, 800)
  } catch (e) {
    status.value = 'idle'
    ElMessage.error(e.response?.data?.message || e.message || '导出失败，请检查服务是否启动')
  }
}

/**
 * JSON 格式：直接将资源数据序列化为 JSON 文件下载
 */
function exportJson() {
  const data = {
    exportTime: new Date().toISOString(),
    type: props.resourceType,
    count: props.resources.length,
    items: props.resources
  }
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
  downloadBlob(blob, `${typeNames[props.resourceType]}_导出_${formatDate()}.json`)
}

/**
 * 调用后端 API 导出（TXT / Word / PDF）
 */
async function exportViaApi(format) {
  const ids = props.resources.map(r => r.id)
  const response = await request.post(
    '/private/api/resource/export-batch',
    { type: props.resourceType, format, ids },
    { responseType: 'blob' }
  )

  const extMap = { txt: 'txt', docx: 'docx', pdf: 'pdf' }
  const ext = extMap[format] || format
  const filename = `${typeNames[props.resourceType]}_导出_${formatDate()}.${ext}`
  downloadBlob(response, filename)
}

/** 触发文件下载 */
function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

/** 格式化当前日期为 YYYYMMDD */
function formatDate() {
  const d = new Date()
  return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`
}

defineExpose({ open })
</script>

<template>
  <el-dialog
    v-model="visible"
    :title="`导出${typeNames[resourceType]}`"
    width="440px"
    :close-on-click-modal="status !== 'exporting'"
  >
    <!-- 资源数量提示 -->
    <div class="export-count">
      将导出 <strong>{{ resources.length }}</strong> 个{{ typeNames[resourceType] }}
      <span v-if="resources.length === 0" class="count-empty">（当前列表为空）</span>
    </div>

    <!-- 格式选择 -->
    <div class="format-list">
      <div
        v-for="fmt in formats"
        :key="fmt.value"
        class="format-item"
        :class="{ selected: selectedFormat === fmt.value }"
        @click="selectedFormat = fmt.value"
      >
        <span class="fmt-icon">{{ fmt.icon }}</span>
        <div class="fmt-info">
          <div class="fmt-label">{{ fmt.label }}</div>
          <div class="fmt-desc">{{ fmt.desc }}</div>
        </div>
        <el-icon v-if="selectedFormat === fmt.value" class="fmt-check"><Select /></el-icon>
        <span v-if="fmt.clientSide" class="fmt-tag">无需后端</span>
      </div>
    </div>

    <template #footer>
      <el-button @click="visible = false" :disabled="status === 'exporting'">取消</el-button>
      <el-button
        type="primary"
        :loading="status === 'exporting'"
        :disabled="resources.length === 0"
        @click="handleExport"
      >
        {{ status === 'exporting' ? '导出中...' : '导出' }}
      </el-button>
    </template>
  </el-dialog>
</template>

<style scoped>
.export-count {
  font-size: 14px;
  color: #666;
  margin-bottom: 16px;
  padding: 10px 14px;
  background: #f5f7fa;
  border-radius: 6px;
}

.count-empty {
  color: #f56c6c;
  margin-left: 4px;
}

.format-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.format-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 14px 16px;
  border: 2px solid #e8e8e8;
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.15s;
  position: relative;
}

.format-item:hover {
  border-color: #c6d8ff;
  background: #f8fbff;
}

.format-item.selected {
  border-color: #409eff;
  background: #ecf5ff;
}

.fmt-icon {
  font-size: 24px;
  flex-shrink: 0;
}

.fmt-info {
  flex: 1;
}

.fmt-label {
  font-size: 15px;
  font-weight: 600;
  color: #333;
}

.fmt-desc {
  font-size: 12px;
  color: #999;
  margin-top: 2px;
}

.fmt-check {
  color: #409eff;
  font-size: 18px;
  flex-shrink: 0;
}

.fmt-tag {
  position: absolute;
  top: 8px;
  right: 12px;
  font-size: 10px;
  background: #f0f9eb;
  color: #67c23a;
  border: 1px solid #b3e19d;
  border-radius: 4px;
  padding: 1px 5px;
}
</style>
