<script setup>
/**
 * 登录页面
 * 显示二维码，用户用主内圣经 APP 扫码登录
 * 每3秒轮询一次状态，扫码成功后自动跳转首页
 * 底部提供语言切换按钮
 */
import { ref, onMounted, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { showToast } from 'vant'
import QRCode from 'qrcode'
import { createQr, getQrStatus, devConfirmQr } from '@/api/auth'
import { useUserStore } from '@/stores/user'
import { useSettingsStore } from '@/stores/settings'
import { i18n } from '@/i18n'

const { t, locale } = useI18n()
const settingsStore = useSettingsStore()
const router = useRouter()
const userStore = useUserStore()

/** 二维码图片（Base64） */
const qrImage = ref('')

/** 当前状态：loading / ready / scanned / expired */
const status = ref('loading')

/** 二维码会话ID */
let sessionId = ''

/** 二维码验证码 */
let sessionCode = ''

/** 轮询定时器 */
let pollTimer = null

/**
 * 生成二维码
 */
async function generateQr() {
  status.value = 'loading'
  try {
    const res = await createQr()
    sessionId = res.data.id
    sessionCode = res.data.code
    const code = res.data.code

    // 生成二维码内容：APP 扫码后可解析
    const qrContent = JSON.stringify({
      action: 'qr-login',
      id: sessionId,
      code: code
    })

    // 生成二维码图片
    qrImage.value = await QRCode.toDataURL(qrContent, {
      width: 256,
      margin: 2,
      color: { dark: '#333333' }
    })

    status.value = 'ready'
    startPolling()
  } catch (e) {
    status.value = 'expired'
  }
}

/**
 * 开始轮询二维码状态（每3秒一次）
 */
function startPolling() {
  stopPolling()
  pollTimer = setInterval(async () => {
    try {
      const res = await getQrStatus(sessionId)
      const qrStatus = res.data.status

      if (qrStatus === 1) {
        // 已扫码未确认
        status.value = 'scanned'
      } else if (qrStatus === 2) {
        // 已登录，保存Token并跳转
        stopPolling()
        userStore.setToken(res.data.token)
        showToast(t('login_success'))
        router.push('/')
      } else if (qrStatus === 3) {
        // 已过期
        stopPolling()
        status.value = 'expired'
      }
    } catch (e) {
      // 轮询出错不做处理，等下次轮询
    }
  }, 3000)
}

/**
 * 停止轮询
 */
function stopPolling() {
  if (pollTimer) {
    clearInterval(pollTimer)
    pollTimer = null
  }
}

/**
 * 【开发测试用】模拟APP扫码确认
 * 点击后直接调用确认接口，跳过APP扫码步骤
 */
async function devLogin() {
  if (!sessionId || !sessionCode) {
    showToast(t('login_wait_qr'))
    return
  }
  try {
    await devConfirmQr(sessionId, sessionCode)
    // 确认后轮询会自动检测到状态变化并跳转
    showToast(t('login_dev_success'))
  } catch (e) {
    showToast(t('login_dev_failed'))
  }
}

/**
 * 切换语言
 */
function switchLanguage() {
  const newLang = locale.value === 'zh' ? 'en' : 'zh'
  locale.value = newLang
  i18n.global.locale.value = newLang
  settingsStore.setLocale(newLang)
}

onMounted(() => {
  generateQr()
})

onUnmounted(() => {
  stopPolling()
})
</script>

<template>
  <main class="login-page" role="main" :aria-label="t('login_title')">
    <!-- 背景装饰元素 -->
    <div class="bg-decorations" aria-hidden="true">
      <div class="bg-circle bg-circle-1"></div>
      <div class="bg-circle bg-circle-2"></div>
      <div class="bg-circle bg-circle-3"></div>
      <div class="bg-glow"></div>
    </div>

    <div class="login-container">
      <!-- 装饰插图：打开的圣经 + 光芒 -->
      <div class="login-illustration" aria-hidden="true">
        <svg viewBox="0 0 100 90" width="100" height="90">
          <!-- 光芒 -->
          <line x1="50" y1="10" x2="50" y2="0" stroke="rgba(255,255,255,0.3)" stroke-width="1.5" stroke-linecap="round"/>
          <line x1="35" y1="14" x2="28" y2="4" stroke="rgba(255,255,255,0.2)" stroke-width="1.5" stroke-linecap="round"/>
          <line x1="65" y1="14" x2="72" y2="4" stroke="rgba(255,255,255,0.2)" stroke-width="1.5" stroke-linecap="round"/>
          <line x1="22" y1="24" x2="14" y2="18" stroke="rgba(255,255,255,0.15)" stroke-width="1.5" stroke-linecap="round"/>
          <line x1="78" y1="24" x2="86" y2="18" stroke="rgba(255,255,255,0.15)" stroke-width="1.5" stroke-linecap="round"/>
          <!-- 打开的书 -->
          <path d="M18 65 L18 28 Q34 22 50 28 Q66 22 82 28 L82 65 Q66 59 50 65 Q34 59 18 65 Z" fill="rgba(255,255,255,0.08)" stroke="rgba(255,255,255,0.7)" stroke-width="2" stroke-linejoin="round"/>
          <line x1="50" y1="28" x2="50" y2="65" stroke="rgba(255,255,255,0.5)" stroke-width="1.5"/>
          <!-- 书页上的文字线条 -->
          <line x1="26" y1="38" x2="44" y2="36" stroke="rgba(255,255,255,0.25)" stroke-width="1" stroke-linecap="round"/>
          <line x1="27" y1="44" x2="43" y2="42" stroke="rgba(255,255,255,0.2)" stroke-width="1" stroke-linecap="round"/>
          <line x1="28" y1="50" x2="42" y2="48" stroke="rgba(255,255,255,0.15)" stroke-width="1" stroke-linecap="round"/>
          <line x1="56" y1="36" x2="74" y2="38" stroke="rgba(255,255,255,0.25)" stroke-width="1" stroke-linecap="round"/>
          <line x1="57" y1="42" x2="73" y2="44" stroke="rgba(255,255,255,0.2)" stroke-width="1" stroke-linecap="round"/>
          <line x1="58" y1="48" x2="72" y2="50" stroke="rgba(255,255,255,0.15)" stroke-width="1" stroke-linecap="round"/>
          <!-- 十字架 -->
          <line x1="50" y1="15" x2="50" y2="25" stroke="rgba(255,255,255,0.6)" stroke-width="2" stroke-linecap="round"/>
          <line x1="46" y1="19" x2="54" y2="19" stroke="rgba(255,255,255,0.6)" stroke-width="2" stroke-linecap="round"/>
        </svg>
      </div>

      <!-- 标题 -->
      <h1 class="login-title">{{ t('login_title') }}</h1>
      <p class="login-subtitle">{{ t('login_subtitle') }}</p>

      <!-- 二维码区域 -->
      <div class="qr-wrapper" :class="{ 'qr-scanned-border': status === 'scanned' }" :aria-label="t('login_subtitle')">
        <!-- 加载中 -->
        <div v-if="status === 'loading'" class="qr-status">
          <van-loading size="48px" />
          <p>{{ t('qr_loading') }}</p>
        </div>

        <!-- 二维码就绪 -->
        <img
          v-else-if="status === 'ready'"
          :src="qrImage"
          :alt="t('login_subtitle')"
          class="qr-image"
        />

        <!-- 已扫码 -->
        <div v-else-if="status === 'scanned'" class="qr-status qr-scanned">
          <van-icon name="passed" size="48px" color="var(--app-accent)" />
          <p>{{ t('qr_scanned') }}</p>
        </div>

        <!-- 已过期 -->
        <div
          v-else-if="status === 'expired'"
          class="qr-status qr-expired"
          role="button"
          tabindex="0"
          :aria-label="t('qr_refresh')"
          @click="generateQr"
          @keydown.enter="generateQr"
        >
          <van-icon name="replay" size="48px" />
          <p>{{ t('qr_expired') }}</p>
          <p class="refresh-hint">{{ t('qr_refresh') }}</p>
        </div>
      </div>
    </div>

    <!-- 底部按钮区域 -->
    <div class="bottom-actions">
      <!-- 开发测试按钮（正式上线后移除） -->
      <van-button
        v-if="status === 'ready'"
        round
        size="small"
        class="login-action-btn"
        icon="play-circle-o"
        @click="devLogin"
      >
        {{ t('dev_skip_login') }}
      </van-button>

      <!-- 语言切换 -->
      <van-button
        round
        size="small"
        class="login-action-btn"
        icon="exchange"
        @click="switchLanguage"
        :aria-label="t('switch_lang')"
      >
        {{ t('switch_lang') }} ({{ locale === 'zh' ? 'English' : '中文' }})
      </van-button>
    </div>

    <!-- 状态通知（屏幕阅读器） -->
    <div aria-live="polite" class="sr-only">
      {{ status === 'scanned' ? t('qr_scanned') : '' }}
    </div>
  </main>
</template>

<style scoped>
.login-page {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-direction: column;
  position: relative;
  overflow: hidden;
  /* 更丰富的多层渐变背景 */
  background:
    radial-gradient(ellipse at 20% 50%, rgba(99, 115, 209, 0.4) 0%, transparent 50%),
    radial-gradient(ellipse at 80% 20%, rgba(139, 92, 246, 0.3) 0%, transparent 50%),
    radial-gradient(ellipse at 50% 100%, rgba(59, 46, 134, 0.5) 0%, transparent 50%),
    linear-gradient(160deg, #4A5AB0 0%, #3B2E86 40%, #2D1B6E 100%);
}

/* 背景装饰圆形 */
.bg-decorations {
  position: absolute;
  inset: 0;
  pointer-events: none;
  overflow: hidden;
}

.bg-circle {
  position: absolute;
  border-radius: 50%;
  opacity: 0.07;
  background: #fff;
}

.bg-circle-1 {
  width: 300px;
  height: 300px;
  top: -80px;
  right: -60px;
  animation: float-slow 8s ease-in-out infinite;
}

.bg-circle-2 {
  width: 200px;
  height: 200px;
  bottom: -40px;
  left: -50px;
  animation: float-slow 10s ease-in-out infinite reverse;
}

.bg-circle-3 {
  width: 120px;
  height: 120px;
  top: 40%;
  left: 70%;
  opacity: 0.04;
  animation: float-slow 6s ease-in-out infinite;
}

/* 中央微光效果 */
.bg-glow {
  position: absolute;
  width: 400px;
  height: 400px;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -60%);
  border-radius: 50%;
  background: radial-gradient(circle, rgba(160, 174, 255, 0.12) 0%, transparent 70%);
}

@keyframes float-slow {
  0%, 100% { transform: translateY(0) scale(1); }
  50% { transform: translateY(-15px) scale(1.03); }
}

.login-container {
  text-align: center;
  padding: 40px 24px;
  position: relative;
  z-index: 1;
}

.login-title {
  font-size: 26px;
  font-weight: 700;
  color: #fff;
  margin-bottom: 8px;
  letter-spacing: 0.5px;
  text-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
}

.login-subtitle {
  font-size: 14px;
  color: rgba(255, 255, 255, 0.75);
  margin-bottom: 36px;
}

.login-illustration {
  margin-bottom: 24px;
  animation: fadeInDown 0.8s ease forwards;
}

@keyframes fadeInDown {
  from { opacity: 0; transform: translateY(-16px); }
  to { opacity: 1; transform: translateY(0); }
}

.qr-wrapper {
  width: 280px;
  height: 280px;
  margin: 0 auto;
  background: var(--app-card-bg);
  border-radius: 20px;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 16px 48px rgba(0, 0, 0, 0.25), 0 0 0 1px rgba(255, 255, 255, 0.08);
  transition: border-color 0.3s ease, box-shadow 0.3s ease;
  border: 2px solid transparent;
  animation: fadeInUp 0.6s 0.2s ease both;
}

@keyframes fadeInUp {
  from { opacity: 0; transform: translateY(16px); }
  to { opacity: 1; transform: translateY(0); }
}

.qr-wrapper.qr-scanned-border {
  border-color: var(--app-accent);
  box-shadow: 0 16px 48px rgba(76, 175, 125, 0.2), 0 0 0 1px rgba(76, 175, 125, 0.3);
}

.qr-image {
  width: 256px;
  height: 256px;
  border-radius: 10px;
}

.qr-status {
  text-align: center;
  color: var(--app-text-secondary);
}

.qr-status p {
  margin-top: 12px;
  font-size: 14px;
}

.qr-scanned {
  color: var(--app-accent);
}

.qr-expired {
  cursor: pointer;
  color: var(--app-text-tertiary);
}

.refresh-hint {
  color: #A0AEFF;
  font-size: 12px !important;
}

.bottom-actions {
  margin-top: 32px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  position: relative;
  z-index: 1;
  animation: fadeInUp 0.6s 0.4s ease both;
}

/* 登录页按钮：毛玻璃效果 */
.login-action-btn {
  background: rgba(255, 255, 255, 0.1) !important;
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
  color: #fff !important;
  border: 1px solid rgba(255, 255, 255, 0.25) !important;
  transition: background 0.2s, border-color 0.2s;
}

.login-action-btn:active {
  background: rgba(255, 255, 255, 0.2) !important;
  border-color: rgba(255, 255, 255, 0.4) !important;
}

.login-action-btn :deep(.van-icon) {
  color: #fff !important;
}
</style>
