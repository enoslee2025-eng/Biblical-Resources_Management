<!--
  管理员登录页面
  居中显示登录卡片，包含用户名、密码输入和登录按钮
-->
<template>
  <div class="login-page">
    <div class="login-card">
      <!-- 标题区域 -->
      <div class="login-header">
        <el-icon :size="36" color="#409eff"><DataBoard /></el-icon>
        <h1 class="login-title">圣经资源制作平台</h1>
        <p class="login-subtitle">后台管理系统</p>
      </div>

      <!-- 登录表单 -->
      <el-form
        ref="formRef"
        :model="formData"
        :rules="formRules"
        label-width="0"
        size="large"
        @submit.prevent="handleLogin"
        aria-label="管理员登录表单"
      >
        <!-- 用户名输入 -->
        <el-form-item prop="username">
          <el-input
            v-model="formData.username"
            placeholder="请输入用户名"
            :prefix-icon="User"
            aria-label="用户名"
            aria-required="true"
          />
        </el-form-item>

        <!-- 密码输入 -->
        <el-form-item prop="password">
          <el-input
            v-model="formData.password"
            type="password"
            placeholder="请输入密码"
            :prefix-icon="Lock"
            show-password
            aria-label="密码"
            aria-required="true"
            @keyup.enter="handleLogin"
          />
        </el-form-item>

        <!-- 错误提示 -->
        <div v-if="errorMessage" class="error-message" role="alert" aria-live="assertive">
          <el-icon><CircleCloseFilled /></el-icon>
          {{ errorMessage }}
        </div>

        <!-- 登录按钮 -->
        <el-form-item>
          <el-button
            type="primary"
            class="login-btn"
            :loading="isLoading"
            :aria-busy="isLoading"
            @click="handleLogin"
          >
            {{ isLoading ? '登录中...' : '登 录' }}
          </el-button>
        </el-form-item>
      </el-form>
    </div>
  </div>
</template>

<script setup>
/**
 * 管理员登录页面
 * 处理管理员登录认证
 */
import { ref, reactive } from 'vue'
import { useRouter } from 'vue-router'
import { useAdminStore } from '@/stores/admin'
import { User, Lock, CircleCloseFilled } from '@element-plus/icons-vue'

/** 路由实例 */
const router = useRouter()

/** 管理员 Store */
const adminStore = useAdminStore()

/** 表单引用 */
const formRef = ref(null)

/** 是否正在加载 */
const isLoading = ref(false)

/** 错误提示信息 */
const errorMessage = ref('')

/** 表单数据 */
const formData = reactive({
  username: '',
  password: ''
})

/** 表单验证规则 */
const formRules = {
  username: [
    { required: true, message: '请输入用户名', trigger: 'blur' }
  ],
  password: [
    { required: true, message: '请输入密码', trigger: 'blur' }
  ]
}

/**
 * 处理登录
 * 验证表单后调用登录接口
 */
async function handleLogin() {
  // 校验表单
  if (!formRef.value) return
  try {
    await formRef.value.validate()
  } catch {
    return
  }

  isLoading.value = true
  errorMessage.value = ''

  try {
    const res = await adminStore.login(formData.username, formData.password)
    if (res.code === 200) {
      // 登录成功，跳转到首页
      router.push('/')
    } else {
      // 显示错误信息
      errorMessage.value = res.message || '登录失败，请检查用户名和密码'
    }
  } catch (error) {
    errorMessage.value = error.response?.data?.message || '登录失败，请稍后重试'
  } finally {
    isLoading.value = false
  }
}
</script>

<style scoped>
/* 登录页面：全屏居中 */
.login-page {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  padding: 20px;
}

/* 登录卡片 */
.login-card {
  width: 400px;
  max-width: 100%;
  background: #fff;
  border-radius: 12px;
  padding: 40px;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.15);
}

/* 标题区域 */
.login-header {
  text-align: center;
  margin-bottom: 32px;
}

.login-title {
  font-size: 22px;
  font-weight: 700;
  color: #303133;
  margin: 12px 0 4px;
}

.login-subtitle {
  font-size: 14px;
  color: #909399;
  margin: 0;
}

/* 错误提示 */
.error-message {
  display: flex;
  align-items: center;
  gap: 6px;
  color: #f56c6c;
  font-size: 13px;
  margin-bottom: 16px;
  padding: 8px 12px;
  background: #fef0f0;
  border-radius: 6px;
}

/* 登录按钮：撑满宽度 */
.login-btn {
  width: 100%;
  height: 44px;
  font-size: 16px;
  border-radius: 8px;
}
</style>
