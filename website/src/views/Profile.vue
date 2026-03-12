<script setup>
/**
 * 个人信息页面
 * 显示当前登录用户的基本信息
 */
import { ref, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { useUserStore } from '@/stores/user'

const { t } = useI18n()

const userStore = useUserStore()

/** 用户信息 */
const userInfo = ref({
  username: '',
  role: '',
  nickname: '',
  bio: '',
  contact: ''
})

/** 修改密码对话框 */
const showPasswordDialog = ref(false)
const passwordForm = ref({
  oldPassword: '',
  newPassword: '',
  confirmPassword: ''
})

onMounted(() => {
  /** 从 store 加载用户信息 */
  const info = userStore.userInfo
  if (info) {
    userInfo.value = { ...info }
  }
})
</script>

<template>
  <div class="profile-page">
    <div class="profile-card">
      <div class="info-table">
        <!-- 头像 -->
        <div class="info-row">
          <span class="info-label">{{ t('profile_avatar') }}</span>
          <div class="avatar-placeholder">
            <el-icon :size="40" color="#ccc"><User /></el-icon>
          </div>
        </div>

        <div class="info-row">
          <span class="info-label">{{ t('profile_username') }}</span>
          <span class="info-value">{{ userInfo.username || '-' }}</span>
        </div>

        <div class="info-row">
          <span class="info-label">{{ t('profile_role') }}</span>
          <span class="info-value">{{ userInfo.role || '-' }}</span>
        </div>

        <div class="info-row">
          <span class="info-label">{{ t('profile_nickname') }}</span>
          <span class="info-value">{{ userInfo.nickname || '-' }}</span>
        </div>

        <div class="info-row">
          <span class="info-label">{{ t('profile_bio') }}</span>
          <span class="info-value">{{ userInfo.bio || '' }}</span>
        </div>

        <div class="info-row">
          <span class="info-label">{{ t('profile_contact') }}</span>
          <span class="info-value">{{ userInfo.contact || '-' }}</span>
        </div>

        <div class="info-row">
          <span class="info-label">{{ t('profile_password') }}</span>
          <el-link type="primary" @click="showPasswordDialog = true">{{ t('profile_change_password') }}</el-link>
        </div>
      </div>
    </div>

    <!-- 修改密码对话框 -->
    <el-dialog v-model="showPasswordDialog" :title="t('profile_change_password')" width="400px">
      <el-form :model="passwordForm" label-width="100px">
        <el-form-item :label="t('profile_old_password')">
          <el-input v-model="passwordForm.oldPassword" type="password" show-password />
        </el-form-item>
        <el-form-item :label="t('profile_new_password')">
          <el-input v-model="passwordForm.newPassword" type="password" show-password />
        </el-form-item>
        <el-form-item :label="t('profile_confirm_password')">
          <el-input v-model="passwordForm.confirmPassword" type="password" show-password />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showPasswordDialog = false">{{ t('cancel') }}</el-button>
        <el-button type="primary">{{ t('confirm') }}</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped>
.profile-page {
  max-width: 600px;
}

.profile-card {
  background: #fff;
  border-radius: 8px;
  padding: 32px;
}

.info-table {
  display: flex;
  flex-direction: column;
  gap: 24px;
}

.info-row {
  display: flex;
  align-items: center;
  gap: 24px;
}

.info-label {
  width: 80px;
  font-size: 14px;
  color: #999;
  flex-shrink: 0;
  text-align: right;
}

.info-value {
  font-size: 14px;
  color: #333;
  font-weight: 500;
}

.avatar-placeholder {
  width: 80px;
  height: 80px;
  background: #f5f5f5;
  border-radius: 4px;
  display: flex;
  align-items: center;
  justify-content: center;
}
</style>
