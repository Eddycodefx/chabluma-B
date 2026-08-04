<script setup>
import { ref } from 'vue'
import ModalCard from './ModalCard.vue'

const emit = defineEmits(['close', 'create'])

const label = ref('')
const shortName = ref('')
const maxScore = ref(100)

function submit() {
  const trimmedLabel = label.value.trim()
  const trimmedShortName = shortName.value.trim()
  if (!trimmedLabel || !trimmedShortName || !maxScore.value) return
  emit('create', {
    label: trimmedLabel,
    shortName: trimmedShortName,
    maxScore: Math.min(Math.max(Number(maxScore.value), 1), 100)
  })
}
</script>

<template>
  <ModalCard title="New assessment for this form" @close="emit('close')">
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
      <label for="assessment-short-name">Short assessment name</label>
      <input
        id="assessment-short-name"
        v-model="shortName"
        type="text"
        placeholder="e.g. TTW-01"
        @keyup.enter="submit"
      />
    </div>
    <p class="hint">Use a short code like TTW-01. It will appear in the marks table and the full name will stay below it.</p>
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
    <button class="btn-primary" :disabled="!label.trim() || !shortName.trim() || !maxScore" @click="submit">
      Add column
    </button>
  </ModalCard>
</template>
