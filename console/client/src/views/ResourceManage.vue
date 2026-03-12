<!--
  资源管理页面
  展示资源列表，支持按类型筛选和删除操作
-->
<template>
  <div class="resource-manage-page">
    <!-- 页面顶部栏 -->
    <div class="page-header">
      <h2 class="page-title">资源管理</h2>

      <!-- 类型筛选 -->
      <el-select
        v-model="selectedType"
        placeholder="筛选类型"
        clearable
        style="width: 160px"
        @change="handleTypeChange"
        aria-label="资源类型筛选"
      >
        <el-option label="全部" value="" />
        <el-option label="圣经" value="bible" />
        <el-option label="注释" value="commentary" />
        <el-option label="词典" value="dictionary" />
      </el-select>
    </div>

    <!-- 资源列表表格 -->
    <div class="table-container">
      <el-table
        :data="resourceList"
        v-loading="loading"
        stripe
        style="width: 100%"
        empty-text="暂无资源数据"
      >
        <!-- 资源 ID -->
        <el-table-column
          prop="id"
          label="ID"
          width="80"
          align="center"
        />

        <!-- 资源标题 -->
        <el-table-column
          prop="title"
          label="标题"
          min-width="200"
          show-overflow-tooltip
        />

        <!-- 资源类型 -->
        <el-table-column
          prop="type"
          label="类型"
          width="120"
          align="center"
        >
          <template #default="{ row }">
            <el-tag :type="getTypeTagColor(row.type)" effect="light">
              {{ getTypeLabel(row.type) }}
            </el-tag>
          </template>
        </el-table-column>

        <!-- 创建者 ID -->
        <el-table-column
          prop="userId"
          label="创建者ID"
          width="100"
          align="center"
        />

        <!-- 公开状态 -->
        <el-table-column
          prop="isPublic"
          label="公开状态"
          width="100"
          align="center"
        >
          <template #default="{ row }">
            <el-tag :type="row.isPublic ? 'success' : 'info'" effect="plain">
              {{ row.isPublic ? '公开' : '私有' }}
            </el-tag>
          </template>
        </el-table-column>

        <!-- 创建时间 -->
        <el-table-column
          prop="createdAt"
          label="创建时间"
          min-width="180"
        >
          <template #default="{ row }">
            {{ formatTime(row.createdAt) }}
          </template>
        </el-table-column>

        <!-- 操作列 -->
        <el-table-column
          label="操作"
          width="100"
          align="center"
          fixed="right"
        >
          <template #default="{ row }">
            <el-button
              type="danger"
              text
              size="small"
              @click="handleDelete(row)"
            >
              <el-icon><Delete /></el-icon>
              删除
            </el-button>
          </template>
        </el-table-column>
      </el-table>
    </div>
  </div>
</template>

<script setup>
/**
 * 资源管理页面
 * 展示资源列表，支持按类型筛选和删除资源
 */
import { ref, onMounted } from 'vue'
import { getResourceList, deleteResource } from '@/api/resource'
import { ElMessage, ElMessageBox } from 'element-plus'

/** 资源列表数据 */
const resourceList = ref([])

/** 是否正在加载 */
const loading = ref(false)

/** 当前选中的类型筛选 */
const selectedType = ref('')

/**
 * 获取资源列表
 * @param {string} [type] - 资源类型（可选）
 */
async function fetchResources(type) {
  loading.value = true
  try {
    const res = await getResourceList(type || undefined)
    if (res.code === 200) {
      resourceList.value = res.data?.list || res.data || []
    }
  } catch (error) {
    ElMessage.error('获取资源列表失败')
  } finally {
    loading.value = false
  }
}

/**
 * 类型筛选变更处理
 * @param {string} type - 选中的类型
 */
function handleTypeChange(type) {
  fetchResources(type)
}

/**
 * 删除资源
 * 弹出确认对话框后执行删除
 * @param {Object} row - 资源行数据
 */
async function handleDelete(row) {
  try {
    await ElMessageBox.confirm(
      `确定要删除资源「${row.title}」吗？此操作不可撤销。`,
      '确认删除',
      {
        confirmButtonText: '确定删除',
        cancelButtonText: '取消',
        type: 'warning',
        confirmButtonClass: 'el-button--danger'
      }
    )

    // 执行删除
    const res = await deleteResource(row.id)
    if (res.code === 200) {
      ElMessage.success('删除成功')
      // 刷新列表
      fetchResources(selectedType.value)
    } else {
      ElMessage.error(res.message || '删除失败')
    }
  } catch (error) {
    // 用户取消操作或请求失败
    if (error !== 'cancel') {
      ElMessage.error('删除失败，请稍后重试')
    }
  }
}

/**
 * 获取资源类型对应的标签颜色
 * @param {string} type - 资源类型
 * @returns {string} Element Plus Tag 类型
 */
function getTypeTagColor(type) {
  const colorMap = {
    bible: '',         // 默认蓝色
    commentary: 'warning',  // 橙色
    dictionary: 'success'   // 绿色
  }
  return colorMap[type] || 'info'
}

/**
 * 获取资源类型的中文标签
 * @param {string} type - 资源类型
 * @returns {string} 中文标签
 */
function getTypeLabel(type) {
  const labelMap = {
    bible: '圣经',
    commentary: '注释',
    dictionary: '词典'
  }
  return labelMap[type] || type || '未知'
}

/**
 * 格式化时间显示
 * @param {string} time - 时间字符串
 * @returns {string} 格式化后的时间
 */
function formatTime(time) {
  if (!time) return '-'
  const date = new Date(time)
  if (isNaN(date.getTime())) return time
  return date.toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  })
}

// 页面加载时获取数据
onMounted(() => {
  fetchResources()
})
</script>

<style scoped>
/* 资源管理页面 */
.resource-manage-page {
  padding: 4px;
}

/* 页面顶部栏 */
.page-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 20px;
}

.page-title {
  font-size: 18px;
  font-weight: 600;
  color: #303133;
  margin: 0;
}

/* 表格容器 */
.table-container {
  background: #fff;
  border-radius: 10px;
  padding: 20px;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.06);
}
</style>
