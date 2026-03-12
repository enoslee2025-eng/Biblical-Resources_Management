<script setup>
/**
 * 用户管理页面（管理员）
 * 表格展示所有用户，支持搜索和管理操作
 */
import { ref, computed, onMounted } from 'vue'
import request from '@/api/request'

/** 用户列表 */
const users = ref([])

/** 加载状态 */
const loading = ref(false)

/** 搜索关键字 */
const searchKeyword = ref('')

/** 筛选后的用户列表 */
const filteredUsers = computed(() => {
  if (!searchKeyword.value.trim()) return users.value
  const kw = searchKeyword.value.trim().toLowerCase()
  return users.value.filter(u =>
    (u.username && u.username.toLowerCase().includes(kw)) ||
    (u.nickname && u.nickname.toLowerCase().includes(kw))
  )
})

/** 加载用户列表 */
async function loadUsers() {
  loading.value = true
  try {
    const res = await request.get('/private/api/user/list')
    users.value = res.data || []
  } catch (e) {
    console.error('加载用户列表失败:', e)
  } finally {
    loading.value = false
  }
}

/** 格式化时间 */
function formatDate(dateStr) {
  if (!dateStr) return ''
  return dateStr.replace('T', ' ').substring(0, 19)
}

onMounted(() => {
  loadUsers()
})
</script>

<template>
  <div class="user-management" v-loading="loading">
    <!-- 工具栏 -->
    <div class="toolbar">
      <span class="total-count">用户列表: {{ filteredUsers.length }}</span>
      <div class="toolbar-right">
        <el-input
          v-model="searchKeyword"
          placeholder="搜索用户,默认所有"
          clearable
          style="width: 250px;"
        >
          <template #append>
            <el-button :icon="'Search'" />
          </template>
        </el-input>
        <el-button type="primary">新增用户</el-button>
      </div>
    </div>

    <!-- 用户表格 -->
    <el-table :data="filteredUsers" stripe style="width: 100%">
      <el-table-column prop="username" label="登录账号" width="140" />
      <el-table-column prop="nickname" label="用户昵称" width="120" />
      <el-table-column prop="role" label="用户角色" width="100" />
      <el-table-column prop="bio" label="用户简介" min-width="150" />
      <el-table-column prop="contact" label="联系信息" width="160" />
      <el-table-column label="最后登录时间" width="180">
        <template #default="{ row }">
          {{ formatDate(row.lastLoginAt) }}
        </template>
      </el-table-column>
      <el-table-column label="操作" width="200" fixed="right">
        <template #default="{ row }">
          <el-link type="primary" style="margin-right: 12px;">修改密码</el-link>
          <el-link type="primary" v-if="row.role !== '管理员'" style="margin-right: 12px;">修改菜单</el-link>
          <el-link type="primary" v-if="row.role !== '管理员'" style="margin-right: 12px;">修改权限</el-link>
          <el-link type="primary">编辑</el-link>
        </template>
      </el-table-column>
    </el-table>
  </div>
</template>

<style scoped>
.toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 20px;
}

.total-count {
  font-size: 14px;
  color: #666;
}

.toolbar-right {
  display: flex;
  align-items: center;
  gap: 12px;
}
</style>
