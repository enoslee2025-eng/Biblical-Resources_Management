<script setup>
/**
 * 登录页面 — 教会风格设计
 * 全屏背景 + 居中白色卡片
 * 支持：账号密码登录、扫码登录、管理员直接进入（开发用）
 */
import { ref, reactive, onMounted, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { useUserStore } from '@/stores/user'
import request from '@/api/request'
import { createQr, getQrStatus } from '@/api/auth'
import QRCode from 'qrcode'

const router = useRouter()
const userStore = useUserStore()
const { t } = useI18n()

/** 当前登录方式：password | qr */
const loginMode = ref('password')

// ==================== 账号密码登录 ====================

/** 登录表单数据 */
const loginForm = reactive({ username: '', password: '' })

/** 是否正在登录 */
const loading = ref(false)

/** 错误消息 */
const errorMsg = ref('')

/** 表单引用 */
const formRef = ref()

/** 表单校验规则 */
const rules = {
  username: [{ required: true, message: t('login_username_required'), trigger: 'blur' }],
  password: [{ required: true, message: t('login_password_required'), trigger: 'blur' }]
}

/** 提交账号密码登录 */
async function handleLogin() {
  try {
    await formRef.value.validate()
  } catch {
    return
  }
  loading.value = true
  errorMsg.value = ''
  try {
    const res = await request.post('/public/api/auth/login', {
      username: loginForm.username,
      password: loginForm.password
    })
    userStore.setToken(res.data.token)
    if (res.data.user) userStore.setUserInfo(res.data.user)
    router.push('/')
  } catch (e) {
    errorMsg.value = e.response?.data?.message || t('login_network_error')
  } finally {
    loading.value = false
  }
}

// ==================== 管理员直接进入（开发用） ====================

async function quickAdminLogin() {
  loading.value = true
  errorMsg.value = ''
  try {
    const res = await request.post('/public/api/auth/dev-login')
    userStore.setToken(res.data)
    userStore.setUserInfo({
      id: 1,
      username: 'admin',
      nickname: '管理员',
      role: '管理员'
    })
    router.push('/')
  } catch (e) {
    userStore.setToken('dev-admin-token-bypass')
    userStore.setUserInfo({ id: 1, username: 'admin', nickname: '管理员（本地模式）', role: '管理员' })
    router.push('/')
  } finally {
    loading.value = false
  }
}

// ==================== 扫码登录 ====================

const qrImageUrl = ref('')
const qrStatus = ref('loading')
const qrSessionId = ref('')
let pollTimer = null
const countdown = ref(180)
let countdownTimer = null

function getApiBaseUrl() {
  return window.location.origin
}

async function loadQrCode() {
  qrStatus.value = 'loading'
  qrImageUrl.value = ''
  clearTimers()

  try {
    const res = await createQr()
    const { id } = res.data
    qrSessionId.value = id

    const apiBase = getApiBaseUrl()
    const getUrl = `${apiBase}/public/api/auth/qr/status?id=${id}&uid=AuidA`
    const postUrl = `${apiBase}/public/api/auth/qr/confirm?id=${id}&uid=AuidA`
    const qrContent = `https://zhuneiqr.com/index.html?page=open-login-resource-website-end&get=${encodeURIComponent(getUrl)}&post=${encodeURIComponent(postUrl)}`

    qrImageUrl.value = await QRCode.toDataURL(qrContent, {
      width: 200,
      margin: 2,
      color: { dark: '#3a3a3a', light: '#ffffff' }
    })

    qrStatus.value = 'waiting'
    startPolling()
    startCountdown()
  } catch (e) {
    qrStatus.value = 'error'
  }
}

function startPolling() {
  pollTimer = setInterval(async () => {
    try {
      const res = await getQrStatus(qrSessionId.value)
      const data = res.data

      if (data.state === 2) {
        clearTimers()
        qrStatus.value = 'expired'
      } else if (data.status === 'scanned') {
        qrStatus.value = 'scanned'
      } else if (data.status === 'confirmed' && data.token) {
        clearTimers()
        qrStatus.value = 'confirmed'
        userStore.setToken(data.token)
        if (data.user) userStore.setUserInfo(data.user)
        setTimeout(() => router.push('/'), 800)
      } else if (data.status === 'expired') {
        clearTimers()
        qrStatus.value = 'expired'
      }
    } catch {
      /* 轮询失败忽略 */
    }
  }, 3000)
}

function startCountdown() {
  countdown.value = 180
  countdownTimer = setInterval(() => {
    countdown.value--
    if (countdown.value <= 0) {
      clearTimers()
      qrStatus.value = 'expired'
    }
  }, 1000)
}

function clearTimers() {
  if (pollTimer) { clearInterval(pollTimer); pollTimer = null }
  if (countdownTimer) { clearInterval(countdownTimer); countdownTimer = null }
}

function switchToQr() {
  loginMode.value = 'qr'
  errorMsg.value = ''
  loadQrCode()
}

function switchToPassword() {
  loginMode.value = 'password'
  clearTimers()
}

onUnmounted(() => clearTimers())
</script>

<template>
  <div class="login-page">
    <!-- 背景装饰 -->
    <div class="login-bg"></div>

    <div class="login-card">
      <!-- Logo 区域 -->
      <div class="login-header">
        <div class="logo-area">
          <span class="logo-text">{{ t('nav_bible') }}</span>
          <span class="logo-badge">Bible Pro</span>
        </div>
        <div class="login-divider"></div>
        <h2 class="login-title">{{ t('login_title') }}</h2>
        <p class="login-subtitle">{{ t('login_subtitle') }}</p>
      </div>

      <!-- 登录方式切换 Tab -->
      <div class="login-tabs">
        <button
          class="tab-btn"
          :class="{ active: loginMode === 'password' }"
          @click="switchToPassword"
        >
          {{ t('login_tab_password') }}
        </button>
        <button
          class="tab-btn"
          :class="{ active: loginMode === 'qr' }"
          @click="switchToQr"
        >
          {{ t('login_tab_qr') }}
        </button>
      </div>

      <!-- 账号密码登录 -->
      <div v-if="loginMode === 'password'">
        <el-form
          ref="formRef"
          :model="loginForm"
          :rules="rules"
          size="large"
          @keyup.enter="handleLogin"
        >
          <el-form-item prop="username">
            <el-input
              v-model="loginForm.username"
              :placeholder="t('login_username_ph')"
              :prefix-icon="'User'"
            />
          </el-form-item>
          <el-form-item prop="password">
            <el-input
              v-model="loginForm.password"
              type="password"
              :placeholder="t('login_password_ph')"
              :prefix-icon="'Lock'"
              show-password
            />
          </el-form-item>

          <el-alert
            v-if="errorMsg"
            :title="errorMsg"
            type="error"
            show-icon
            :closable="false"
            style="margin-bottom: 16px;"
          />

          <el-form-item>
            <button
              type="button"
              class="btn-church login-btn"
              :disabled="loading"
              @click="handleLogin"
            >
              {{ loading ? t('login_loading') : t('login_btn') }}
            </button>
          </el-form-item>
        </el-form>
      </div>

      <!-- 扫码登录 -->
      <div v-else class="qr-section">
        <div v-if="qrStatus === 'loading'" class="qr-placeholder">
          <el-icon class="spinning"><Loading /></el-icon>
          <p>{{ t('qr_loading') }}</p>
        </div>

        <div v-else-if="qrStatus === 'error'" class="qr-placeholder qr-error">
          <el-icon><CircleClose /></el-icon>
          <p>{{ t('login_network_error') }}</p>
          <button class="btn-church-outline" style="padding: 8px 20px; font-size: 12px;" @click="loadQrCode">{{ t('qr_refresh') }}</button>
        </div>

        <div v-else-if="qrStatus === 'expired'" class="qr-placeholder qr-expired">
          <div class="qr-img-wrap expired">
            <img :src="qrImageUrl" class="qr-img dimmed" />
            <div class="qr-overlay" @click="loadQrCode">
              <el-icon><Refresh /></el-icon>
              <span>{{ t('qr_refresh') }}</span>
            </div>
          </div>
        </div>

        <div v-else-if="qrStatus === 'scanned'" class="qr-placeholder qr-scanned">
          <el-icon><CircleCheck /></el-icon>
          <p>{{ t('qr_scanned_title') }}</p>
          <p class="qr-hint">{{ t('qr_scanned') }}</p>
        </div>

        <div v-else-if="qrStatus === 'confirmed'" class="qr-placeholder qr-confirmed">
          <el-icon><CircleCheck /></el-icon>
          <p>{{ t('login_success') }}</p>
        </div>

        <div v-else class="qr-img-wrap">
          <img :src="qrImageUrl" class="qr-img" />
        </div>

        <p v-if="qrStatus === 'waiting'" class="qr-hint">
          {{ t('login_subtitle') }}
          <span class="countdown">{{ countdown }}s</span>
        </p>
        <p v-if="qrStatus === 'waiting'" class="qr-tip">{{ t('qr_scanned') }}</p>
      </div>

      <!-- 管理员直接进入（开发用） -->
      <div class="quick-entry">
        <a class="dev-link" @click="quickAdminLogin">
          {{ t('dev_skip_login') }} &raquo;
        </a>
      </div>
    </div>
  </div>
</template>

<style scoped>
.login-page {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  position: relative;
  background: url('/images/login-bg.jpg') center / cover no-repeat;
}

.login-bg {
  position: absolute;
  inset: 0;
  background:
    linear-gradient(135deg, rgba(44, 66, 96, 0.85) 0%, rgba(26, 42, 62, 0.9) 100%);
  pointer-events: none;
}

.login-card {
  position: relative;
  width: 420px;
  background: #fff;
  padding: 48px 40px;
  box-shadow: 0 24px 80px rgba(0, 0, 0, 0.2);
  animation: fadeInUp 0.6s ease-out;
}

.login-header {
  text-align: center;
  margin-bottom: 32px;
}

.logo-area {
  display: inline-flex;
  flex-direction: column;
  align-items: center;
  margin-bottom: 20px;
}

.logo-text {
  font-size: 32px;
  font-weight: 700;
  color: var(--church-charcoal, #3a3a3a);
  letter-spacing: 6px;
  font-family: var(--font-heading);
}

.logo-badge {
  font-size: 10px;
  background: #b33a2b;
  color: #fff;
  padding: 2px 14px 4px;
  border-radius: 0 0 12px 12px;
  font-weight: 600;
  margin-top: 2px;
  letter-spacing: 1.5px;
}

.login-divider {
  width: 40px;
  height: 2px;
  background: var(--church-gold, #c9a96e);
  margin: 0 auto 16px;
}

.login-title {
  font-family: var(--font-heading);
  font-size: 16px;
  font-weight: 600;
  color: var(--church-charcoal, #3a3a3a);
  letter-spacing: 3px;
  text-transform: uppercase;
  margin: 0 0 6px;
}

.login-subtitle {
  font-size: 13px;
  color: var(--church-warm-gray, #8a8178);
  margin: 0;
}

/* Tab 切换 */
.login-tabs {
  display: flex;
  border-bottom: 1px solid var(--church-border, #e0d8cf);
  margin-bottom: 28px;
}

.tab-btn {
  flex: 1;
  padding: 12px 0;
  border: none;
  background: none;
  cursor: pointer;
  font-size: 13px;
  color: var(--church-warm-gray, #8a8178);
  font-weight: 500;
  letter-spacing: 1px;
  transition: all 0.3s;
  border-bottom: 2px solid transparent;
  margin-bottom: -1px;
}

.tab-btn.active {
  color: var(--church-navy, #3d5a80);
  border-bottom-color: var(--church-navy, #3d5a80);
}

/* 登录按钮 */
.login-btn {
  width: 100%;
  justify-content: center;
  padding: 14px 32px;
}

.login-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

/* 扫码区域 */
.qr-section {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 8px 0 16px;
}

.qr-img-wrap {
  position: relative;
  width: 200px;
  height: 200px;
  border: 2px solid var(--church-border, #e0d8cf);
  border-radius: 4px;
  overflow: hidden;
}

.qr-img {
  width: 100%;
  height: 100%;
  display: block;
}

.qr-img.dimmed {
  filter: blur(3px) brightness(0.6);
}

.qr-overlay {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  cursor: pointer;
  color: #fff;
  font-size: 14px;
  font-weight: 600;
}

.qr-overlay .el-icon {
  font-size: 32px;
}

.qr-placeholder {
  width: 200px;
  height: 200px;
  border: 2px solid var(--church-border, #e0d8cf);
  border-radius: 4px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 10px;
  color: var(--church-warm-gray, #8a8178);
  font-size: 14px;
}

.qr-placeholder .el-icon {
  font-size: 40px;
}

.qr-error .el-icon { color: var(--app-danger, #c05050); }

.qr-scanned .el-icon,
.qr-confirmed .el-icon {
  color: #5a8a6e;
  font-size: 48px;
}

.qr-scanned p,
.qr-confirmed p {
  color: var(--church-charcoal, #3a3a3a);
  font-weight: 600;
}

.qr-hint {
  margin-top: 14px;
  font-size: 13px;
  color: var(--church-warm-gray, #8a8178);
  text-align: center;
}

.qr-tip {
  margin-top: 4px;
  font-size: 12px;
  color: var(--app-text-tertiary, #9a948e);
  text-align: center;
}

.countdown {
  display: inline-block;
  margin-left: 6px;
  color: var(--church-navy, #3d5a80);
  font-weight: 600;
}

.spinning {
  animation: spin 1s linear infinite;
  font-size: 36px !important;
}

@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

/* 管理员入口 */
.quick-entry {
  text-align: center;
  margin-top: 20px;
  padding-top: 16px;
  border-top: 1px solid var(--church-border, #e0d8cf);
}

.dev-link {
  font-size: 12px;
  color: var(--church-warm-gray, #8a8178);
  cursor: pointer;
  letter-spacing: 0.5px;
  transition: color 0.2s;
}

.dev-link:hover {
  color: var(--church-navy, #3d5a80);
}
</style>
