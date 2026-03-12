<script setup>
/**
 * AI素材导入中心
 * 支持批量上传图片、音频、视频等素材文件
 * 自动识别文件类型并分类管理
 */
import { ref, computed } from 'vue'
import { useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { ElMessage } from 'element-plus'
import { Picture, Headset, VideoCamera, UploadFilled, Delete } from '@element-plus/icons-vue'

const router = useRouter()
const { t } = useI18n()

/** 已选文件列表 */
const selectedFiles = ref([])
const showPreview = ref(false)
const fileInput = ref(null)

/** 支持的文件类型映射 */
const typeMap = {
  'image/jpeg': 'image', 'image/png': 'image', 'image/gif': 'image',
  'image/webp': 'image', 'image/bmp': 'image', 'image/svg+xml': 'image',
  'audio/mpeg': 'audio', 'audio/wav': 'audio', 'audio/ogg': 'audio',
  'audio/aac': 'audio', 'audio/flac': 'audio', 'audio/mp4': 'audio',
  'video/mp4': 'video', 'video/webm': 'video', 'video/ogg': 'video',
  'video/quicktime': 'video', 'video/x-msvideo': 'video'
}

/** 根据 MIME 类型获取素材类型 */
function getFileType(file) {
  return typeMap[file.type] || 'other'
}

/** 格式化文件大小 */
function formatSize(bytes) {
  if (bytes < 1024) return bytes + ' B'
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB'
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB'
}

/** 统计信息 */
const stats = computed(() => {
  const counts = { image: 0, audio: 0, video: 0, other: 0 }
  selectedFiles.value.forEach(f => counts[f.fileType]++)
  return counts
})

function handleSelectClick() { fileInput.value?.click() }

/** 选择文件 */
function handleFileSelect(e) {
  const files = Array.from(e.target.files || [])
  e.target.value = ''
  if (files.length === 0) return

  const items = files.map(f => ({
    file: f,
    name: f.name,
    size: f.size,
    sizeText: formatSize(f.size),
    fileType: getFileType(f),
    title: f.name.replace(/\.[^.]+$/, ''),
    preview: null
  }))

  /* 生成图片预览 */
  items.forEach(item => {
    if (item.fileType === 'image') {
      const reader = new FileReader()
      reader.onload = (ev) => { item.preview = ev.target.result }
      reader.readAsDataURL(item.file)
    }
  })

  selectedFiles.value.push(...items)
  showPreview.value = true
}

/** 移除文件 */
function removeFile(idx) {
  selectedFiles.value.splice(idx, 1)
  if (selectedFiles.value.length === 0) showPreview.value = false
}

/** 拖拽上传 */
function handleDrop(e) {
  e.preventDefault()
  const files = Array.from(e.dataTransfer.files || [])
  if (files.length === 0) return

  const items = files.map(f => ({
    file: f,
    name: f.name,
    size: f.size,
    sizeText: formatSize(f.size),
    fileType: getFileType(f),
    title: f.name.replace(/\.[^.]+$/, ''),
    preview: null
  }))

  items.forEach(item => {
    if (item.fileType === 'image') {
      const reader = new FileReader()
      reader.onload = (ev) => { item.preview = ev.target.result }
      reader.readAsDataURL(item.file)
    }
  })

  selectedFiles.value.push(...items)
  showPreview.value = true
}

function handleDragOver(e) { e.preventDefault() }

/** 完成导入，跳转到素材编辑页 */
function confirmImport() {
  const data = selectedFiles.value.map(f => ({
    title: f.title,
    type: f.fileType,
    fileName: f.name,
    size: f.size
  }))
  sessionStorage.setItem('materialImportData', JSON.stringify(data))
  router.push('/material/edit')
}

/** 类型图标颜色 */
function typeColor(type) {
  if (type === 'image') return '#9b59b6'
  if (type === 'audio') return '#3498db'
  if (type === 'video') return '#e74c3c'
  return '#999'
}
</script>

<template>
  <div class="material-import" role="main" :aria-label="t('import_material_title')">
    <div class="page-header">
      <h2 class="page-title">{{ t('import_material_title') }}</h2>
      <p class="page-desc">{{ t('import_material_desc') }}</p>
    </div>

    <!-- 预览已选文件 -->
    <div v-if="showPreview" class="preview-section">
      <div class="preview-header">
        <h3>{{ t('import_material_preview') }}</h3>
        <div class="preview-stats">
          <span v-if="stats.image" class="stat-badge" style="color:#9b59b6;">{{ t('import_material_images', { count: stats.image }) }}</span>
          <span v-if="stats.audio" class="stat-badge" style="color:#3498db;">{{ t('import_material_audios', { count: stats.audio }) }}</span>
          <span v-if="stats.video" class="stat-badge" style="color:#e74c3c;">{{ t('import_material_videos', { count: stats.video }) }}</span>
        </div>
      </div>

      <div class="file-grid">
        <div v-for="(item, idx) in selectedFiles" :key="idx" class="file-card">
          <div class="file-preview">
            <img v-if="item.preview" :src="item.preview" :alt="item.name" class="preview-img" />
            <el-icon v-else-if="item.fileType === 'audio'" :size="40" :color="typeColor('audio')"><Headset /></el-icon>
            <el-icon v-else-if="item.fileType === 'video'" :size="40" :color="typeColor('video')"><VideoCamera /></el-icon>
            <el-icon v-else :size="40" color="#ccc"><Picture /></el-icon>
          </div>
          <div class="file-info">
            <div class="file-name" :title="item.name">{{ item.name }}</div>
            <div class="file-meta">{{ item.sizeText }}</div>
          </div>
          <el-button class="remove-btn" :icon="Delete" circle size="small" @click="removeFile(idx)" />
        </div>
      </div>

      <!-- 继续添加 -->
      <div class="add-more" @click="handleSelectClick">
        <el-icon :size="20"><UploadFilled /></el-icon>
        <span>{{ t('import_material_add_more') }}</span>
      </div>

      <div class="preview-actions">
        <el-button @click="showPreview = false; selectedFiles = []">{{ t('import_cancel') }}</el-button>
        <el-button type="primary" @click="confirmImport">{{ t('import_material_confirm') }}</el-button>
      </div>
    </div>

    <!-- 上传区域 -->
    <div v-else class="upload-area" @drop="handleDrop" @dragover="handleDragOver" @click="handleSelectClick">
      <el-icon :size="64" color="#9b59b6"><UploadFilled /></el-icon>
      <h3 class="upload-title">{{ t('import_material_drop') }}</h3>
      <p class="upload-desc">{{ t('import_material_formats') }}</p>
      <div class="type-badges">
        <span class="type-badge" style="background: #f3e8ff; color: #9b59b6;">
          <el-icon><Picture /></el-icon> {{ t('material_item_type_image') }}
        </span>
        <span class="type-badge" style="background: #e8f4fd; color: #3498db;">
          <el-icon><Headset /></el-icon> {{ t('material_item_type_audio') }}
        </span>
        <span class="type-badge" style="background: #fde8e8; color: #e74c3c;">
          <el-icon><VideoCamera /></el-icon> {{ t('material_item_type_video') }}
        </span>
      </div>
    </div>

    <input ref="fileInput" type="file" multiple accept="image/*,audio/*,video/*" style="display:none" @change="handleFileSelect" />
  </div>
</template>

<style scoped>
.material-import { max-width: 900px; margin: 0 auto; padding: 24px 20px; }
.page-header { margin-bottom: 32px; }
.page-title { font-size: 22px; font-weight: 700; color: #333; margin: 0 0 8px; }
.page-desc { font-size: 14px; color: #999; margin: 0; }

.upload-area {
  border: 2px dashed #d9d9d9; border-radius: 16px; padding: 60px 40px;
  text-align: center; cursor: pointer; transition: all 0.25s; background: #fafafa;
}
.upload-area:hover { border-color: #9b59b6; background: #faf5ff; }
.upload-title { font-size: 18px; font-weight: 600; color: #333; margin: 16px 0 8px; }
.upload-desc { font-size: 13px; color: #999; margin: 0 0 20px; }
.type-badges { display: flex; gap: 12px; justify-content: center; }
.type-badge {
  display: inline-flex; align-items: center; gap: 4px;
  padding: 6px 14px; border-radius: 20px; font-size: 13px; font-weight: 500;
}

.preview-section { background: #fff; border: 1px solid #eaeaea; border-radius: 12px; padding: 24px; }
.preview-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 16px; }
.preview-header h3 { font-size: 16px; font-weight: 600; color: #333; margin: 0; }
.preview-stats { display: flex; gap: 12px; }
.stat-badge { font-size: 13px; font-weight: 500; }

.file-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(160px, 1fr)); gap: 16px; }
.file-card {
  border: 1px solid #f0f0f0; border-radius: 10px; padding: 12px; position: relative;
  transition: box-shadow 0.2s;
}
.file-card:hover { box-shadow: 0 4px 12px rgba(0,0,0,0.06); }
.file-preview {
  width: 100%; height: 100px; display: flex; align-items: center; justify-content: center;
  background: #f8f8f8; border-radius: 8px; overflow: hidden; margin-bottom: 8px;
}
.preview-img { width: 100%; height: 100%; object-fit: cover; }
.file-info { text-align: center; }
.file-name { font-size: 12px; color: #333; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.file-meta { font-size: 11px; color: #999; margin-top: 2px; }
.remove-btn { position: absolute; top: 6px; right: 6px; opacity: 0; transition: opacity 0.2s; }
.file-card:hover .remove-btn { opacity: 1; }

.add-more {
  display: flex; align-items: center; justify-content: center; gap: 8px;
  padding: 16px; margin-top: 16px; border: 1px dashed #d9d9d9; border-radius: 8px;
  cursor: pointer; color: #999; font-size: 14px; transition: all 0.2s;
}
.add-more:hover { border-color: #9b59b6; color: #9b59b6; }

.preview-actions { display: flex; justify-content: flex-end; gap: 12px; margin-top: 20px; padding-top: 16px; border-top: 1px solid #f0f0f0; }
</style>
