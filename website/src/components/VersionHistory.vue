<script setup>
/**
 * 版本历史侧边面板组件
 * 从右侧滑出，显示资源的所有历史版本
 * 支持查看版本内容和恢复到指定版本
 */
import { ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { ElMessageBox, ElMessage, ElLoading } from 'element-plus'
import { getVersionList, getVersionDetail, restoreVersion, deleteVersion, clearVersions } from '@/api/resource'

const { t } = useI18n()

const props = defineProps({
  /** 资源ID */
  resourceId: { type: Number, default: null },
  /** 是否显示面板 */
  show: { type: Boolean, default: false }
})

const emit = defineEmits(['update:show', 'restored'])

/** 版本列表 */
const versions = ref([])

/** 是否加载中 */
const loading = ref(false)

/** 当前查看的版本详情 */
const viewingVersion = ref(null)

/** 是否显示版本详情弹窗 */
const showDetail = ref(false)

/**
 * 加载版本列表
 */
async function loadVersions() {
  if (!props.resourceId) return
  loading.value = true
  try {
    const res = await getVersionList(props.resourceId)
    versions.value = res.data || []
  } catch (e) {
    ElMessage.error(t('error'))
  } finally {
    loading.value = false
  }
}

/**
 * 查看版本详情
 */
async function viewVersion(version) {
  const loadingInstance = ElLoading.service({ text: t('loading') })
  try {
    const res = await getVersionDetail(version.id)
    viewingVersion.value = res.data
    showDetail.value = true
  } catch (e) {
    ElMessage.error(t('error'))
  } finally {
    loadingInstance.close()
  }
}

/**
 * 恢复到指定版本
 */
async function handleRestore(version) {
  try {
    await ElMessageBox.confirm(
      t('version_restore_confirm'),
      t('version_restore'),
      { type: 'info', confirmButtonText: t('confirm'), cancelButtonText: t('cancel') }
    )
  } catch {
    return
  }

  try {
    await restoreVersion(props.resourceId, version.id)
    ElMessage.success(t('version_restore_success', { n: version.versionNumber }))
    emit('update:show', false)
    emit('restored')
  } catch (e) {
    ElMessage.error(t('error'))
  }
}

/**
 * 删除单个版本
 */
async function handleDelete(version) {
  try {
    await ElMessageBox.confirm(
      t('version_delete_confirm', { n: version.versionNumber }),
      t('version_delete_title'),
      { type: 'warning', confirmButtonText: t('confirm'), cancelButtonText: t('cancel') }
    )
  } catch {
    return
  }

  try {
    await deleteVersion(version.id)
    ElMessage.success(t('version_delete_success'))
    loadVersions()
  } catch (e) {
    ElMessage.error(t('error'))
  }
}

/**
 * 清空所有版本历史
 */
async function handleClearAll() {
  try {
    await ElMessageBox.confirm(
      t('version_clear_confirm'),
      t('version_clear_title'),
      { type: 'warning', confirmButtonText: t('confirm'), cancelButtonText: t('cancel') }
    )
  } catch {
    return
  }

  try {
    await clearVersions(props.resourceId)
    ElMessage.success(t('version_clear_success'))
    versions.value = []
  } catch (e) {
    ElMessage.error(t('error'))
  }
}

/**
 * 格式化时间
 */
function formatTime(dateStr) {
  if (!dateStr) return ''
  const date = new Date(dateStr)
  const pad = n => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`
}

/**
 * 获取内容预览文本（截取前100字符）
 */
function getContentPreview(contentJson) {
  if (!contentJson) return ''
  try {
    const data = JSON.parse(contentJson)
    if (Array.isArray(data)) {
      return JSON.stringify(data).substring(0, 200) + '...'
    }
    return contentJson.substring(0, 200) + '...'
  } catch {
    return contentJson.substring(0, 200) + '...'
  }
}

/* 面板显示时加载版本列表 */
watch(() => props.show, (val) => {
  if (val && props.resourceId) {
    loadVersions()
  }
})
</script>

<template>
  <van-popup
    :show="show"
    @update:show="emit('update:show', $event)"
    position="right"
    :style="{ width: '50%', height: '100%' }"
    closeable
    close-icon-position="top-left"
  >
    <div class="version-panel" role="region" :aria-label="t('version_history')">
      <div class="panel-header">
        <h3 class="panel-title">{{ t('version_history') }}</h3>
        <van-button v-if="versions.length > 0" plain size="mini" type="danger" icon="delete-o" @click="handleClearAll">
          {{ t('version_clear_all') }}
        </van-button>
      </div>

      <!-- 加载中 -->
      <div v-if="loading" class="panel-loading">
        <van-loading size="24" />
      </div>

      <!-- 空状态 -->
      <van-empty v-else-if="versions.length === 0" :description="t('version_empty')" :image-size="60" />

      <!-- 版本时间线 -->
      <div v-else class="version-timeline">
        <div
          v-for="(ver, index) in versions"
          :key="ver.id"
          class="version-item"
        >
          <div class="timeline-dot" :class="{ 'dot-latest': index === 0 }" />
          <div class="timeline-line" v-if="index < versions.length - 1" />

          <div class="version-card">
            <div class="version-header">
              <span class="version-num">{{ t('version_number', { n: ver.versionNumber }) }}</span>
              <span class="version-time">{{ formatTime(ver.createdAt) }}</span>
            </div>
            <div class="version-title">{{ ver.title }}</div>

            <div class="version-actions">
              <van-button plain size="mini" icon="eye-o" @click="viewVersion(ver)">
                {{ t('version_view') }}
              </van-button>
              <van-button plain size="mini" type="primary" icon="replay" @click="handleRestore(ver)">
                {{ t('version_restore') }}
              </van-button>
              <van-button plain size="mini" type="danger" icon="delete-o" @click="handleDelete(ver)">
                {{ t('version_delete') }}
              </van-button>
            </div>
          </div>
        </div>
      </div>
    </div>
  </van-popup>

  <!-- 版本详情弹窗 -->
  <van-popup
    v-model:show="showDetail"
    round
    position="bottom"
    :style="{ height: '70%' }"
    closeable
  >
    <div class="detail-popup" v-if="viewingVersion">
      <h3 class="detail-title">
        {{ t('version_number', { n: viewingVersion.versionNumber }) }} - {{ viewingVersion.title }}
      </h3>
      <p class="detail-time">{{ formatTime(viewingVersion.createdAt) }}</p>
      <div class="detail-content">
        <pre class="detail-json">{{ getContentPreview(viewingVersion.contentJson) }}</pre>
      </div>
      <div class="detail-actions">
        <van-button type="primary" block round @click="handleRestore(viewingVersion); showDetail = false">
          {{ t('version_restore') }}
        </van-button>
      </div>
    </div>
  </van-popup>
</template>

<style scoped>
.version-panel {
  height: 100%;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 16px 12px 48px;
  border-bottom: 1px solid var(--app-border, #eee);
  flex-shrink: 0;
}

.panel-title {
  font-size: 16px;
  font-weight: 600;
  color: var(--app-text-primary, #333);
  margin: 0;
}

.panel-loading {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
}

/* 时间线 */
.version-timeline {
  flex: 1;
  overflow-y: auto;
  padding: 16px 16px 16px 32px;
}

.version-item {
  position: relative;
  padding-left: 20px;
  padding-bottom: 16px;
}

.timeline-dot {
  position: absolute;
  left: 0;
  top: 6px;
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background: #ddd;
  border: 2px solid #fff;
  box-shadow: 0 0 0 2px #ddd;
}

.dot-latest {
  background: var(--app-primary, #1989fa);
  box-shadow: 0 0 0 2px var(--app-primary, #1989fa);
}

.timeline-line {
  position: absolute;
  left: 4px;
  top: 18px;
  bottom: 0;
  width: 2px;
  background: #eee;
}

.version-card {
  background: var(--app-card-bg, #fff);
  border: 1px solid var(--app-border, #eee);
  border-radius: 8px;
  padding: 12px;
}

.version-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 6px;
}

.version-num {
  font-size: 13px;
  font-weight: 600;
  color: var(--app-primary, #1989fa);
}

.version-time {
  font-size: 11px;
  color: var(--app-text-tertiary, #999);
}

.version-title {
  font-size: 14px;
  color: var(--app-text-primary, #333);
  margin-bottom: 8px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.version-actions {
  display: flex;
  gap: 8px;
}

/* 详情弹窗 */
.detail-popup {
  padding: 20px;
  height: 100%;
  display: flex;
  flex-direction: column;
}

.detail-title {
  font-size: 16px;
  font-weight: 600;
  color: var(--app-text-primary, #333);
  padding-top: 8px;
}

.detail-time {
  font-size: 12px;
  color: var(--app-text-tertiary, #999);
  margin: 4px 0 12px;
}

.detail-content {
  flex: 1;
  overflow-y: auto;
  background: var(--app-bg, #f5f5f5);
  border-radius: 8px;
  padding: 12px;
  margin-bottom: 16px;
}

.detail-json {
  font-size: 12px;
  color: var(--app-text-secondary, #666);
  white-space: pre-wrap;
  word-break: break-all;
  font-family: 'SF Mono', 'Menlo', monospace;
  margin: 0;
}

.detail-actions {
  flex-shrink: 0;
}
</style>
