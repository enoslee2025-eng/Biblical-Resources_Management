<!--
  仪表盘页面
  展示系统统计数据：用户数、资源数等
-->
<template>
  <div class="dashboard-page">
    <!-- 统计卡片区域 -->
    <el-row :gutter="20">
      <!-- 用户总数 -->
      <el-col :xs="12" :sm="8" :md="8" :lg="4">
        <div class="stat-card">
          <div class="stat-icon" style="background-color: #ecf5ff;">
            <el-icon :size="28" color="#409eff"><User /></el-icon>
          </div>
          <div class="stat-info">
            <div class="stat-value">{{ stats.totalUsers ?? '-' }}</div>
            <div class="stat-label">用户总数</div>
          </div>
        </div>
      </el-col>

      <!-- 资源总数 -->
      <el-col :xs="12" :sm="8" :md="8" :lg="4">
        <div class="stat-card">
          <div class="stat-icon" style="background-color: #f0f9eb;">
            <el-icon :size="28" color="#67c23a"><Folder /></el-icon>
          </div>
          <div class="stat-info">
            <div class="stat-value">{{ stats.totalResources ?? '-' }}</div>
            <div class="stat-label">资源总数</div>
          </div>
        </div>
      </el-col>

      <!-- 圣经译本 -->
      <el-col :xs="12" :sm="8" :md="8" :lg="4">
        <div class="stat-card">
          <div class="stat-icon" style="background-color: #f4ecff;">
            <el-icon :size="28" color="#a855f7"><Reading /></el-icon>
          </div>
          <div class="stat-info">
            <div class="stat-value">{{ stats.totalBibles ?? '-' }}</div>
            <div class="stat-label">圣经译本</div>
          </div>
        </div>
      </el-col>

      <!-- 注释 -->
      <el-col :xs="12" :sm="8" :md="8" :lg="4">
        <div class="stat-card">
          <div class="stat-icon" style="background-color: #fdf6ec;">
            <el-icon :size="28" color="#e6a23c"><ChatDotSquare /></el-icon>
          </div>
          <div class="stat-info">
            <div class="stat-value">{{ stats.totalCommentaries ?? '-' }}</div>
            <div class="stat-label">注释</div>
          </div>
        </div>
      </el-col>

      <!-- 词典 -->
      <el-col :xs="12" :sm="8" :md="8" :lg="4">
        <div class="stat-card">
          <div class="stat-icon" style="background-color: #ecfeff;">
            <el-icon :size="28" color="#06b6d4"><Notebook /></el-icon>
          </div>
          <div class="stat-info">
            <div class="stat-value">{{ stats.totalDictionaries ?? '-' }}</div>
            <div class="stat-label">词典</div>
          </div>
        </div>
      </el-col>

      <!-- 公开资源 -->
      <el-col :xs="12" :sm="8" :md="8" :lg="4">
        <div class="stat-card">
          <div class="stat-icon" style="background-color: #fdf2f8;">
            <el-icon :size="28" color="#ec4899"><Share /></el-icon>
          </div>
          <div class="stat-info">
            <div class="stat-value">{{ stats.totalPublic ?? '-' }}</div>
            <div class="stat-label">公开资源</div>
          </div>
        </div>
      </el-col>
    </el-row>
  </div>
</template>

<script setup>
/**
 * 仪表盘页面
 * 展示系统统计数据（用户数、各类资源数量等）
 */
import { ref, onMounted } from 'vue'
import { getStats } from '@/api/dashboard'
import { ElMessage } from 'element-plus'

/** 统计数据 */
const stats = ref({
  totalUsers: null,
  totalResources: null,
  totalBibles: null,
  totalCommentaries: null,
  totalDictionaries: null,
  totalPublic: null
})

/**
 * 获取仪表盘统计数据
 */
async function fetchStats() {
  try {
    const res = await getStats()
    if (res.code === 200 && res.data) {
      stats.value = res.data
    }
  } catch (error) {
    ElMessage.error('获取统计数据失败')
  }
}

// 页面加载时获取数据
onMounted(() => {
  fetchStats()
})
</script>

<style scoped>
/* 仪表盘页面 */
.dashboard-page {
  padding: 4px;
}

/* 统计卡片 */
.stat-card {
  background: #fff;
  border-radius: 10px;
  padding: 20px;
  display: flex;
  align-items: center;
  gap: 16px;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.06);
  transition: box-shadow 0.2s, transform 0.2s;
  margin-bottom: 20px;
}

.stat-card:hover {
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
  transform: translateY(-2px);
}

/* 图标容器 */
.stat-icon {
  width: 56px;
  height: 56px;
  border-radius: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

/* 统计信息 */
.stat-info {
  flex: 1;
  min-width: 0;
}

/* 数值 */
.stat-value {
  font-size: 28px;
  font-weight: 700;
  color: #303133;
  line-height: 1.2;
}

/* 标签 */
.stat-label {
  font-size: 13px;
  color: #909399;
  margin-top: 4px;
}
</style>
