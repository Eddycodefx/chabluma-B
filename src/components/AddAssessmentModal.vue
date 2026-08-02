<script setup>
import { ref } from 'vue'
import ModalCard from './ModalCard.vue'

const emit = defineEmits(['close', 'create'])

const label = ref('')
const maxScore = ref(100)

function submit() {
  if (!label.value.trim() || !maxScore.value) return
  emit('create', {
    label: label.value.trim(),
    maxScore: Math.min(Math.max(Number(maxScore.value), 1), 100)
  })
}
</script>

<template>
  <ModalCard title="New assessment column" @close="emit('close')">
    <div class="field">
      <label for="assessment-label">Assessment name</label>
      <input
        id="assessment-label"
        v-model="label"
        type="text"
        placeholder="e.g. CAT 1, Midterm, Final Exam"
        autofocus
        @keyup.enter="submit"
      />
    </div>
    <div class="field">
      <label for="max-score">Out of</label>
      <input
        id="max-score"
        v-model="maxScore"
        type="number"
        min="1"
        max="100"
        placeholder="100"
        @keyup.enter="submit"
      />
    </div>
    <button class="btn-primary" :disabled="!label.trim() || !maxScore" @click="submit">
      Add column
    </button>
  </ModalCard>
</template>
