<script setup>
/**
 * 资源导出页面
 * 显示资源基本信息和内容预览，确认后下载 JSON 文件
 */
import { ref, onMounted } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { showToast, showLoadingToast, closeToast } from 'vant'
import { getResourceDetail, getResourceSummary, togglePublic } from '@/api/resource'
import ResourceIcon from '@/components/ResourceIcon.vue'
import QRCode from 'qrcode'
import { convertBibleToAppFormat, convertCommentaryToAppFormat, convertDictionaryToAppFormat, buildImportQrUrl } from '@/utils/exportFormat'

const { t } = useI18n()
const router = useRouter()
const route = useRoute()

/** 资源ID */
const resourceId = Number(route.params.id)

/** 资源数据 */
const resource = ref(null)

/** 元数据（解析后） */
const metaParsed = ref({})

/** 内容摘要统计 */
const summary = ref(null)

/** 是否正在加载 */
const loading = ref(true)

/** 是否显示二维码弹窗 */
const showQrDialog = ref(false)

/** 二维码图片 Data URL */
const qrImageUrl = ref('')

/**
 * 加载资源详情和摘要
 */
async function loadResource() {
  loading.value = true
  try {
    const [detailRes, summaryRes] = await Promise.all([
      getResourceDetail(resourceId),
      getResourceSummary(resourceId)
    ])

    resource.value = detailRes.data
    summary.value = summaryRes.data

    // 解析 meta
    if (detailRes.data.metaJson) {
      metaParsed.value = JSON.parse(detailRes.data.metaJson)
    }
  } catch (e) {
    showToast(t('error'))
  } finally {
    loading.value = false
  }
}

/**
 * 下载 JSON 文件（主内圣经 APP 兼容格式）
 * 根据资源类型调用对应的格式转换器
 */
function handleDownload() {
  if (!resource.value) return

  showLoadingToast({ message: t('loading'), forbidClick: true })

  try {
    const rawContent = resource.value.contentJson ? JSON.parse(resource.value.contentJson) : []
    let exportData

    /* 根据资源类型调用对应的格式转换器 */
    if (resource.value.type === 'bible') {
      exportData = convertBibleToAppFormat(metaParsed.value, rawContent)
    } else if (resource.value.type === 'commentary') {
      exportData = convertCommentaryToAppFormat(metaParsed.value, rawContent)
    } else if (resource.value.type === 'dictionary') {
      exportData = convertDictionaryToAppFormat(metaParsed.value, rawContent)
    } else {
      /* 其他类型保持原格式 */
      exportData = { type: resource.value.type, meta: metaParsed.value, content: rawContent }
    }

    const jsonStr = JSON.stringify(exportData)
    const blob = new Blob([jsonStr], { type: 'application/json;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `${metaParsed.value.abbr || 'resource'}-${resourceId}.json`
    link.click()
    URL.revokeObjectURL(url)

    showToast(t('export_download_success'))
  } catch (e) {
    console.error('导出失败:', e)
    showToast(t('error'))
  } finally {
    closeToast()
  }
}

/**
 * 下载 TXT 文件
 * 将内容转为纯文本格式
 */
function handleDownloadTxt() {
  if (!resource.value) return

  showLoadingToast({ message: t('loading'), forbidClick: true })

  try {
    const content = resource.value.contentJson ? JSON.parse(resource.value.contentJson) : []
    let txtContent = ''

    if (resource.value.type === 'bible') {
      // 圣经：书名 + 章节 + 经文
      for (const book of content) {
        if (!book.chapters) continue
        for (const ch of book.chapters) {
          if (!ch.verses || ch.verses.length === 0) continue
          txtContent += `\n${book.name} ${ch.chapter}\n`
          for (const v of ch.verses) {
            txtContent += `${v.verse}. ${v.text}\n`
          }
        }
      }
    } else if (resource.value.type === 'commentary') {
      // 注释：经文引用 + 注释内容
      for (const entry of content) {
        txtContent += `${entry.verse}\n${entry.content}\n\n`
      }
    } else if (resource.value.type === 'dictionary') {
      // 词典：词条 + 释义
      for (const entry of content) {
        txtContent += `${entry.word}\n${entry.definition}\n\n`
      }
    } else if (resource.value.type === 'material') {
      // 素材：标题 + 类型 + URL + 备注
      for (const item of content) {
        txtContent += `${item.title || ''}\n`
        if (item.type) txtContent += `[${item.type}] `
        if (item.url) txtContent += `${item.url}\n`
        if (item.notes) txtContent += `${item.notes}\n`
        txtContent += '\n'
      }
    }

    const blob = new Blob([txtContent.trim()], { type: 'text/plain;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `${metaParsed.value.abbr || 'resource'}-${resourceId}.txt`
    link.click()
    URL.revokeObjectURL(url)

    showToast(t('export_txt_success'))
  } catch (e) {
    showToast(t('error'))
  } finally {
    closeToast()
  }
}

/**
 * 生成导入二维码
 * 按 zhuneiqr.com 规则生成二维码 URL，供主内圣经 APP 扫描导入
 */
async function handleGenerateQR() {
  const apiBase = window.location.origin
  const type = resource.value?.type || 'bible'

  /* 使用标准 zhuneiqr.com URL 格式 */
  const qrContent = buildImportQrUrl(type, resourceId, apiBase)

  try {
    qrImageUrl.value = await QRCode.toDataURL(qrContent, { width: 256, margin: 2 })
    showQrDialog.value = true
  } catch (e) {
    showToast(t('error'))
  }
}

/**
 * 获取资源类型的中文名
 */
function getTypeName(type) {
  const map = { bible: t('type_bible'), commentary: t('type_commentary'), dictionary: t('type_dictionary'), material: t('type_material') }
  return map[type] || type
}

/**
 * 获取资源类型对应的品牌色
 */
function getTypeColor(type) {
  const colors = {
    bible: 'var(--app-type-bible)',
    commentary: 'var(--app-type-commentary)',
    dictionary: 'var(--app-type-dictionary)',
    material: 'var(--app-type-material, #7a6b8a)'
  }
  return colors[type] || 'var(--app-primary)'
}

/**
 * 获取公开下载链接（供 App 程序员对接）
 */
function getPublicDownloadUrl() {
  return `${window.location.origin}/public/api/resource/download/${resourceId}`
}

/**
 * 复制下载链接到剪贴板
 */
async function handleCopyLink() {
  try {
    await navigator.clipboard.writeText(getPublicDownloadUrl())
    showToast(t('export_link_copied'))
  } catch (e) {
    showToast(t('error'))
  }
}

/**
 * 取消发布（设为私有）
 */
async function handleSetPrivate() {
  try {
    await togglePublic(resourceId, false)
    resource.value.isPublic = 0
    showToast(t('export_unpublished'))
  } catch (e) {
    showToast(t('error'))
  }
}

/**
 * 将资源设为公开
 */
async function handleSetPublic() {
  try {
    await togglePublic(resourceId, true)
    resource.value.isPublic = 1
    showToast(t('public_success'))
  } catch (e) {
    showToast(t('error'))
  }
}

onMounted(() => {
  loadResource()
})
</script>

<template>
  <main class="page" role="main" :aria-label="t('export_title')">
    <!-- 顶部导航 -->
    <van-nav-bar
      :title="t('export_title')"
      left-arrow
      @click-left="router.back()"
    />

    <!-- 加载中 -->
    <div v-if="loading" class="loading-wrapper">
      <van-loading size="36px">{{ t('loading') }}</van-loading>
    </div>

    <!-- 资源信息 -->
    <template v-else-if="resource">
      <!-- 资源展示卡 -->
      <div class="hero-card">
        <div class="hero-icon-block" :style="{ background: getTypeColor(resource.type) }">
          <ResourceIcon :type="resource.type" :size="28" />
        </div>
        <div class="hero-body">
          <h2 class="hero-title">{{ resource.title }}</h2>
          <van-tag :color="getTypeColor(resource.type)" size="medium">
            {{ getTypeName(resource.type) }}
          </van-tag>
          <p v-if="metaParsed.summary" class="hero-summary">{{ metaParsed.summary }}</p>
        </div>
      </div>

      <van-cell-group inset :title="t('export_info')" class="info-group">
        <van-cell
          :title="t('editor_bible_title')"
          :value="resource.title"
          :aria-label="t('editor_bible_title') + ': ' + resource.title"
        />
        <van-cell
          :title="t('export_type')"
          :value="getTypeName(resource.type)"
        />
        <van-cell
          v-if="metaParsed.abbr"
          :title="t('editor_abbr')"
          :value="metaParsed.abbr"
        />
        <van-cell
          v-if="metaParsed.iso"
          :title="t('editor_iso')"
          :value="metaParsed.iso"
        />
      </van-cell-group>

      <!-- 内容预览 -->
      <van-cell-group inset :title="t('export_preview')" class="info-group" v-if="summary">
        <template v-if="resource.type === 'bible'">
          <van-cell
            :value="t('export_preview_books', { filled: summary.filledBooks || 0, total: summary.totalBooks || 66 })"
          >
            <template #title>
              <van-progress
                :percentage="summary.totalBooks ? Math.round((summary.filledBooks || 0) / summary.totalBooks * 100) : 0"
                :show-pivot="false"
                :color="getTypeColor(resource.type)"
                stroke-width="6"
                style="width: 120px"
              />
            </template>
          </van-cell>
          <van-cell
            :value="t('export_preview_chapters', { filled: summary.filledChapters || 0, total: summary.totalChapters || 0 })"
          />
          <van-cell
            :value="t('export_preview_verses', { count: summary.totalVerses || 0 })"
          />
        </template>
        <template v-else>
          <van-cell
            :value="t('export_preview_entries', { count: summary.totalEntries || 0 })"
          />
        </template>
      </van-cell-group>

      <!-- 下载按钮 -->
      <div class="download-section">
        <van-button
          type="primary"
          block
          round
          size="large"
          icon="down"
          @click="handleDownload"
          :aria-label="t('export_confirm_download')"
        >
          {{ t('export_confirm_download') }}
        </van-button>
        <van-button
          block
          round
          size="large"
          plain
          type="primary"
          icon="description"
          class="txt-download-btn"
          @click="handleDownloadTxt"
          :aria-label="t('export_txt')"
        >
          {{ t('export_txt') }}
        </van-button>
        <div class="tip-card">
          <van-icon name="info-o" size="18" color="var(--app-primary)" />
          <span>{{ t('export_tip') }}</span>
        </div>
      </div>

      <!-- 发布与二维码区域 -->
      <div class="qr-section">
        <template v-if="resource.isPublic === 1">
          <!-- 已发布状态：显示公开链接 + 二维码 + 取消发布 -->
          <div class="published-card">
            <div class="published-header">
              <van-icon name="checked" size="20" color="#5a8a6e" />
              <span class="published-title">{{ t('export_published') }}</span>
            </div>
            <div class="published-link">
              <span class="link-label">{{ t('export_download_link') }}</span>
              <div class="link-row">
                <code class="link-url">{{ getPublicDownloadUrl() }}</code>
                <van-button size="small" type="primary" plain @click="handleCopyLink">{{ t('export_copy_link') }}</van-button>
              </div>
              <span class="link-hint">{{ t('export_link_hint') }}</span>
            </div>
          </div>
          <van-button
            block
            round
            size="large"
            plain
            type="primary"
            icon="qr"
            class="qr-btn"
            @click="handleGenerateQR"
            :aria-label="t('qr_import_generate')"
          >
            {{ t('qr_import_generate') }}
          </van-button>
          <van-button
            block
            round
            size="large"
            plain
            type="danger"
            class="unpublish-btn"
            @click="handleSetPrivate"
            :aria-label="t('export_unpublish')"
          >
            {{ t('export_unpublish') }}
          </van-button>
        </template>
        <template v-else>
          <!-- 未发布状态：提示需要发布 -->
          <div class="warning-card" role="note" :aria-label="t('qr_import_need_public')">
            <van-icon name="warning-o" size="18" color="var(--app-warning)" />
            <span>{{ t('qr_import_need_public') }}</span>
          </div>
          <van-button
            block
            round
            size="large"
            type="primary"
            icon="eye-o"
            class="set-public-btn"
            @click="handleSetPublic"
            :aria-label="t('make_public')"
          >
            {{ t('make_public') }}
          </van-button>
        </template>
      </div>

      <!-- 二维码弹窗 -->
      <van-popup
        v-model:show="showQrDialog"
        round
        closeable
        position="bottom"
        :style="{ maxHeight: '80%' }"
        :aria-label="t('qr_import_title')"
        role="dialog"
      >
        <div class="qr-popup">
          <h3 class="qr-popup-title">{{ t('qr_import_title') }}</h3>
          <div class="qr-popup-body">
            <img
              v-if="qrImageUrl"
              :src="qrImageUrl"
              class="qr-image"
              :alt="t('qr_import_title')"
            />
            <p class="qr-hint">{{ t('qr_import_hint') }}</p>
          </div>
        </div>
      </van-popup>
    </template>
  </main>
</template>

<style scoped>
.loading-wrapper {
  display: flex;
  justify-content: center;
  padding: 60px 0;
}

/* 资源展示卡（顶部英雄区） */
.hero-card {
  margin: 16px 16px 0;
  background: var(--app-card-bg);
  border-radius: 12px;
  box-shadow: var(--app-card-shadow);
  display: flex;
  align-items: flex-start;
  overflow: hidden;
  padding: 18px 16px;
  gap: 14px;
}

.hero-icon-block {
  width: 56px;
  height: 56px;
  border-radius: 16px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #fff;
  flex-shrink: 0;
}

.hero-body {
  flex: 1;
}

.hero-title {
  font-size: 20px;
  font-weight: 700;
  color: var(--app-text-primary);
  margin-bottom: 8px;
}

.hero-summary {
  font-size: 13px;
  color: var(--app-text-secondary);
  margin-top: 10px;
  line-height: 1.5;
}

.info-group {
  margin-top: 12px;
}

.download-section {
  padding: 32px 24px;
}

.download-section :deep(.van-button--primary) {
  box-shadow: 0 4px 16px rgba(91, 106, 191, 0.3);
  animation: download-pulse 2s ease-in-out infinite;
}

@keyframes download-pulse {
  0%, 100% { transform: translateY(0); }
  50% { transform: translateY(-3px); }
}

/* TXT 下载按钮 */
.txt-download-btn {
  margin-top: 12px;
}

/* 提示卡片 */
.tip-card {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-top: 16px;
  padding: 12px 16px;
  background: var(--app-primary-light);
  border-radius: 10px;
  font-size: 14px;
  color: var(--app-text-primary);
  line-height: 1.5;
}

/* 二维码区域 */
.qr-section {
  padding: 0 24px 32px;
}

/* 已发布卡片 */
.published-card {
  background: rgba(90, 138, 110, 0.06);
  border: 1px solid rgba(90, 138, 110, 0.2);
  border-radius: 10px;
  padding: 16px;
  margin-bottom: 16px;
}

.published-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 12px;
}

.published-title {
  font-size: 15px;
  font-weight: 600;
  color: #5a8a6e;
}

.published-link {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.link-label {
  font-size: 12px;
  color: var(--app-text-secondary);
}

.link-row {
  display: flex;
  align-items: center;
  gap: 8px;
}

.link-url {
  flex: 1;
  font-size: 12px;
  background: rgba(0, 0, 0, 0.04);
  padding: 8px 10px;
  border-radius: 6px;
  color: var(--app-text-primary);
  word-break: break-all;
  line-height: 1.4;
}

.link-hint {
  font-size: 11px;
  color: var(--app-text-tertiary, #9a948e);
  line-height: 1.4;
}

/* 二维码按钮 */
.qr-btn {
  margin-bottom: 12px;
}

/* 取消发布按钮 */
.unpublish-btn {
  margin-top: 0;
}

/* 设为公开按钮 */
.set-public-btn {
  margin-top: 12px;
}

/* 警告提示卡片 */
.warning-card {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px 16px;
  background: var(--app-warning-light);
  border-radius: 10px;
  font-size: 14px;
  color: var(--app-text-primary);
  line-height: 1.5;
}

/* 二维码弹窗 */
.qr-popup {
  padding: 24px;
}

.qr-popup-title {
  text-align: center;
  font-size: 18px;
  font-weight: 700;
  color: var(--app-text-primary);
  margin-bottom: 24px;
}

.qr-popup-body {
  display: flex;
  flex-direction: column;
  align-items: center;
}

.qr-image {
  width: 256px;
  height: 256px;
  border-radius: 12px;
  background: #fff;
  padding: 8px;
  box-shadow: 0 2px 12px rgba(0, 0, 0, 0.08);
}

.qr-hint {
  margin-top: 20px;
  font-size: 14px;
  color: var(--app-text-secondary);
  text-align: center;
  line-height: 1.5;
  padding-bottom: 16px;
}
</style>
