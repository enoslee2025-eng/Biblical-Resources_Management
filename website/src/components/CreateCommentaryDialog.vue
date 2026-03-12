<script setup>
/**
 * 新增注释对话框
 * 创建注释资源的表单弹窗，包含基本信息填写
 * 参考后台管理的弹窗样式
 */
import { ref, reactive } from 'vue'
import { useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { ElMessage } from 'element-plus'
import { createResource } from '@/api/resource'

const { t } = useI18n()
const router = useRouter()

const emit = defineEmits(['success'])

/** 对话框是否可见 */
const visible = ref(false)

/** 是否正在提交 */
const submitting = ref(false)

/** 表单数据 */
const form = reactive({
  id: '',
  title: '',
  abbr: '',
  iso: '',
  sort: 0,
  hasIntro: false,
  summary: '',
  copyright: ''
})

/** 语言选项 */
const languageOptions = [
  { value: 'zh', label: '简体中文' },
  { value: 'zh-TW', label: '繁体中文' },
  { value: 'en', label: '英语' },
  { value: 'ja', label: '日语' },
  { value: 'ko', label: '韩语' },
  { value: 'th', label: '泰语' },
  { value: 'el', label: '希腊语' },
  { value: 'he', label: '希伯来语' },
  { value: 'my', label: '缅甸语' },
  { value: 'de', label: '德语' },
  { value: 'fr', label: '法语' },
  { value: 'es', label: '西班牙语' },
  { value: 'pt', label: '葡萄牙语' },
  { value: 'ru', label: '俄语' },
  { value: 'ar', label: '阿拉伯语' }
]

/** 表单引用 */
const formRef = ref(null)

/** 表单校验规则 */
const rules = {
  title: [{ required: true, message: t('create_commentary_title_required'), trigger: 'blur' }],
  abbr: [{ required: true, message: t('create_commentary_abbr_required'), trigger: 'blur' }],
  iso: [{ required: true, message: t('create_commentary_lang_required'), trigger: 'change' }]
}

/** 打开对话框 */
function open() {
  /* 重置表单 */
  form.id = ''
  form.title = ''
  form.abbr = ''
  form.iso = ''
  form.sort = 0
  form.hasIntro = false
  form.summary = ''
  form.copyright = ''
  visible.value = true
}

/** 提交表单 */
async function handleSubmit() {
  if (!formRef.value) return
  try {
    await formRef.value.validate()
  } catch {
    return
  }

  submitting.value = true
  try {
    const metaJson = JSON.stringify({
      title: form.title,
      abbr: form.abbr,
      iso: form.iso,
      sort: form.sort,
      hasIntro: form.hasIntro,
      summary: form.summary,
      copyright: form.copyright
    })

    const payload = {
      type: 'commentary',
      title: form.title,
      metaJson
    }

    /* 如果填了 id，带上 */
    if (form.id) {
      payload.id = form.id
    }

    const res = await createResource(payload)
    const newId = res.data?.id

    ElMessage.success(t('create_commentary_success'))
    visible.value = false
    emit('success')

    /* 跳转到详情页 */
    if (newId) {
      router.push(`/commentary/detail/${newId}`)
    }
  } catch (e) {
    console.error('创建注释失败:', e)
    ElMessage.error(t('create_commentary_failed') + (e.response?.data?.message || ''))
  } finally {
    submitting.value = false
  }
}

defineExpose({ open })
</script>

<template>
  <el-dialog
    v-model="visible"
    :title="t('create_commentary_dialog_title')"
    width="600px"
    :close-on-click-modal="false"
    destroy-on-close
  >
    <el-form
      ref="formRef"
      :model="form"
      :rules="rules"
      label-width="100px"
      label-position="right"
      class="create-form"
    >
      <!-- 资源 ID（可选） -->
      <el-form-item label="id">
        <el-input v-model="form.id" :placeholder="t('create_commentary_id_ph')" />
      </el-form-item>

      <!-- 译本名称 -->
      <el-form-item :label="t('create_commentary_name')" prop="title">
        <el-input v-model="form.title" :placeholder="t('create_commentary_name_ph')" />
      </el-form-item>

      <!-- 名称简写 -->
      <el-form-item :label="t('create_commentary_abbr')" prop="abbr">
        <el-input v-model="form.abbr" :placeholder="t('create_commentary_abbr_ph')" />
      </el-form-item>

      <!-- 语言 -->
      <el-form-item :label="t('create_commentary_lang')" prop="iso">
        <el-select v-model="form.iso" :placeholder="t('create_commentary_lang_ph')" style="width: 200px;" filterable>
          <el-option
            v-for="opt in languageOptions"
            :key="opt.value"
            :label="opt.label"
            :value="opt.value"
          />
        </el-select>
      </el-form-item>

      <!-- 排序 -->
      <el-form-item :label="t('create_commentary_sort')">
        <el-input-number v-model="form.sort" :min="0" :max="9999" />
      </el-form-item>

      <!-- 是否有简介 -->
      <el-form-item :label="t('create_commentary_has_intro')">
        <el-radio-group v-model="form.hasIntro">
          <el-radio :value="false">{{ t('create_commentary_no_intro') }}</el-radio>
          <el-radio :value="true">{{ t('create_commentary_yes_intro') }}</el-radio>
        </el-radio-group>
      </el-form-item>

      <!-- 简介 -->
      <el-form-item :label="t('create_commentary_summary')">
        <el-input v-model="form.summary" type="textarea" :rows="3" :placeholder="t('create_commentary_summary_ph')" />
      </el-form-item>

      <!-- 版权信息 -->
      <el-form-item :label="t('create_commentary_copyright')">
        <el-input v-model="form.copyright" type="textarea" :rows="2" :placeholder="t('create_commentary_copyright_ph')" />
      </el-form-item>
    </el-form>

    <template #footer>
      <div class="dialog-footer">
        <el-button @click="visible = false">{{ t('cancel') }}</el-button>
        <el-button type="primary" :loading="submitting" @click="handleSubmit">{{ t('create_commentary_submit') }}</el-button>
      </div>
    </template>
  </el-dialog>
</template>

<style scoped>
.create-form {
  padding: 10px 20px 0;
}

.dialog-footer {
  display: flex;
  justify-content: center;
  gap: 16px;
}
</style>
