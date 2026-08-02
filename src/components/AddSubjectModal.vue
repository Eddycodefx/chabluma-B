<script setup>
import { ref, computed } from 'vue'
import ModalCard from './ModalCard.vue'

const emit = defineEmits(['close', 'create'])

const COLORS = ['#f3701e', '#4b607f', '#2f8f6b', '#b74735', '#7a5c9e', '#c08a2c']
const FORMS = [1, 2, 3, 4]
const STREAMS = ['A', 'B', 'C']

const subjectName = ref('')
const form = ref(1)
const stream = ref('A')
const color = ref(COLORS[0])

const canSubmit = computed(() => subjectName.value.trim() && form.value && stream.value)

function submit() {
  if (!canSubmit.value) return
  emit('create', {
    subjectName: subjectName.value.trim(),
    form: Number(form.value),
    stream: stream.value,
    color: color.value
  })
}
</script>

<template>
  <ModalCard title="Add class subject" @close="emit('close')">
    <div class="field">
      <label for="subject-name">Subject taught</label>
      <input
        id="subject-name"
        v-model="subjectName"
        type="text"
        placeholder="e.g. Mathematics, Physics"
        autofocus
        @keyup.enter="submit"
      />
    </div>
    <div class="form-grid">
      <div class="field">
        <label for="form-level">Form</label>
        <select id="form-level" v-model="form">
          <option v-for="f in FORMS" :key="f" :value="f">Form {{ f }}</option>
        </select>
      </div>
      <div class="field">
        <label for="stream">Stream</label>
        <select id="stream" v-model="stream">
          <option v-for="s in STREAMS" :key="s" :value="s">{{ s }}</option>
        </select>
      </div>
    </div>
    <div class="field">
      <label>Tab color</label>
      <div class="color-swatches">
        <button
          v-for="c in COLORS"
          :key="c"
          class="color-swatch"
          :class="{ selected: color === c }"
          :style="{ background: c }"
          :aria-label="'Choose color ' + c"
          @click="color = c"
        />
      </div>
    </div>
    <button class="btn-primary" :disabled="!canSubmit" @click="submit">
      Add class
    </button>
  </ModalCard>
</template>

<style scoped>
.form-grid {
  display: grid;
  gap: 12px;
  grid-template-columns: 1fr 1fr;
}
</style>
