<script setup>
import { ref, computed } from 'vue'
import ModalCard from './ModalCard.vue'

const emit = defineEmits(['close', 'create'])

const admissionNumber = ref('')
const name = ref('')
const sex = ref('M')

const canSubmit = computed(() => admissionNumber.value.trim() && name.value.trim() && sex.value)

function submit() {
  if (!canSubmit.value) return
  emit('create', {
    admissionNumber: admissionNumber.value.trim(),
    name: name.value.trim(),
    sex: sex.value
  })
}
</script>

<template>
  <ModalCard title="Add student" @close="emit('close')">
    <div class="field">
      <label for="admission-number">Admission number</label>
      <input
        id="admission-number"
        v-model="admissionNumber"
        type="text"
        placeholder="e.g. WHS/0012"
        autofocus
        @keyup.enter="submit"
      />
    </div>
    <div class="field">
      <label for="student-name">Student full name</label>
      <input
        id="student-name"
        v-model="name"
        type="text"
        placeholder="Full name"
        @keyup.enter="submit"
      />
    </div>
    <div class="field">
      <label for="student-sex">Sex</label>
      <select id="student-sex" v-model="sex">
        <option value="M">M - Male</option>
        <option value="F">F - Female</option>
      </select>
    </div>
    <button class="btn-primary" :disabled="!canSubmit" @click="submit">
      Add student
    </button>
  </ModalCard>
</template>
