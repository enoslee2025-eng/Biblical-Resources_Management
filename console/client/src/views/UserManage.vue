<!--
  用户管理页面
  展示用户列表，支持查看用户ID、创建时间、资源数量
-->
<template>
  <div class="user-manage-page">
    <!-- 页面顶部栏 -->
    <div class="page-header">
      <h2 class="page-title">用户管理</h2>
    </div>

    <!-- 用户列表表格 -->
    <div class="table-container">
      <el-table
        :data="userList"
        v-loading="loading"
        stripe
        style="width: 100%"
        empty-text="暂无用户数据"
      >
        <!-- 用户 ID -->
        <el-table-column
          prop="id"
          label="ID"
          width="80"
          align="center"
        />

        <!-- 用户名 -->
        <el-table-column
          prop="username"
          label="用户名"
          min-width="150"
        />

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

        <!-- 资源数量 -->
        <el-table-column
          prop="resourceCount"
          label="资源数量"
          width="120"
          align="center"
        >
          <template #default="{ row }">
            <el-tag type="info" round>
              {{ row.resourceCount ?? 0 }}
            </el-tag>
          </template>
        </el-table-column>
      </el-table>
    </div>
  </div>
</template>

<script setup>
/**
 * 用户管理页面
 * 展示所有注册用户的列表信息
 */
import { ref, onMounted } from 'vue'
import { getUserList } from '@/api/user'
import { ElMessage } from 'element-plus'

/** 用户列表数据 */
const userList = ref([])

/** 是否正在加载 */
const loading = ref(false)

/**
 * 获取用户列表
 */
async function fetchUsers() {
  loading.value = true
  try {
    const res = await getUserList()
    if (res.code === 200) {
      userList.value = res.data?.list || res.data || []
    }
  } catch (error) {
    ElMessage.error('获取用户列表失败')
  } finally {
    loading.value = false
  }
}

/**
 * 格式化时间显示
 * @param {string} time - 时间字符串
 * @returns {string} 格式化后的时间
 */
function formatTime(time) {
  if (!time) return '-'
  // 将 ISO 时间转为本地格式
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
  fetchUsers()
})
</script>

<style scoped>
/* 用户管理页面 */
.user-manage-page {
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
