<script setup>
import { computed, ref, watch } from 'vue'
import ModalCard from './ModalCard.vue'

const props = defineProps({
  selectedForm: { type: [Number, String, null], default: null },
  assignments: { type: Array, default: () => [] },
  selectedStream: { type: String, default: '' },
  report: { type: Array, default: () => [] },
  meta: { type: Object, default: null },
  onExportExcel: { type: Function, default: null },
  onExportPdf: { type: Function, default: null }
})

const emit = defineEmits(['close', 'generate', 'export-excel', 'export-pdf'])

const scope = ref('all')
const stream = ref(props.selectedStream || 'A')
const assignmentMode = ref('all')
const assignmentId = ref(null)
const exportError = ref('')
const exportBusy = ref('')

const availableStreams = computed(() => {
  const streams = new Set(props.assignments.filter(item => item.form === props.selectedForm).map(item => item.stream))
  return Array.from(streams).sort()
})

const availableAssignments = computed(() => {
  return props.assignments.filter(item => item.form === props.selectedForm && (scope.value === 'all' || item.stream === stream.value))
})

watch(() => props.selectedStream, value => {
  if (value) stream.value = value
})

watch(() => props.selectedForm, () => {
  if (props.selectedForm === null) return
  const firstStream = availableStreams.value[0] || 'A'
  stream.value = props.selectedStream || firstStream
  if (!availableAssignments.value.some(item => item.id === assignmentId.value)) {
    assignmentId.value = availableAssignments.value[0]?.id || null
  }
})

watch(availableAssignments, value => {
  if (!value.length) {
    assignmentId.value = null
    return
  }
  if (!value.some(item => item.id === assignmentId.value)) {
    assignmentId.value = value[0].id
  }
})

function submit() {
  emit('generate', {
    form: Number(props.selectedForm),
    scope: scope.value,
    stream: scope.value === 'all' ? null : stream.value,
    assignmentMode: assignmentMode.value,
    assignmentId: assignmentMode.value === 'selected' ? assignmentId.value : null
  })
}

async function runExport(type) {
  exportError.value = ''
  exportBusy.value = type

  try {
    const handler = type === 'excel' ? props.onExportExcel : props.onExportPdf
    if (handler) {
      await handler()
    } else {
      emit(type === 'excel' ? 'export-excel' : 'export-pdf')
    }
  } catch (error) {
    console.error(error)
    exportError.value = error?.message || `Could not export ${type.toUpperCase()}`
  } finally {
    exportBusy.value = ''
  }
}
</script>

<template>
  <ModalCard title="Create results report" @close="emit('close')">
    <div class="results-form">
      <div class="field">
        <label for="result-scope">Results scope</label>
        <select id="result-scope" v-model="scope">
          <option value="all">All streams in Form {{ selectedForm }}</option>
          <option value="stream">One stream only</option>
        </select>
      </div>

      <div v-if="scope === 'stream'" class="field">
        <label for="result-stream">Stream</label>
        <select id="result-stream" v-model="stream">
          <option v-for="item in availableStreams" :key="item" :value="item">Stream {{ item }}</option>
        </select>
      </div>

      <div class="field">
        <label for="result-assignment-mode">Assignments</label>
        <select id="result-assignment-mode" v-model="assignmentMode">
          <option value="all">All assignments</option>
          <option value="selected">One assignment</option>
        </select>
      </div>

      <div v-if="assignmentMode === 'selected'" class="field">
        <label for="result-assignment">Select assignment</label>
        <select id="result-assignment" v-model="assignmentId">
          <option v-for="item in availableAssignments" :key="item.id" :value="item.id">
            {{ item.subjectName }} · Form {{ item.form }}{{ item.stream }}
          </option>
        </select>
      </div>

      <button type="button" class="btn-primary" :disabled="!selectedForm || !availableAssignments.length" @click="submit">
        Generate results
      </button>
    </div>

    <div v-if="report.length" class="result-preview">
      <div class="preview-head">
        <div>
          <p class="preview-kicker">Preview</p>
          <h3>{{ meta?.title || 'Results preview' }}</h3>
        </div>
        <div class="preview-actions">
          <button type="button" class="btn-ghost compact" :disabled="Boolean(exportBusy)" @click="runExport('excel')">
            {{ exportBusy === 'excel' ? 'Exporting...' : 'Excel' }}
          </button>
          <button type="button" class="btn-ghost compact" :disabled="Boolean(exportBusy)" @click="runExport('pdf')">
            {{ exportBusy === 'pdf' ? 'Exporting...' : 'PDF' }}
          </button>
        </div>
      </div>
      <p v-if="exportError" class="export-error">{{ exportError }}</p>

      <div class="preview-list">
        <div v-for="row in report.slice(0, 8)" :key="row.studentId" class="preview-row">
          <div>
            <strong>#{{ row.rank }} {{ row.name }}</strong>
            <p>{{ row.admissionNumber }} · {{ row.classLabel }}</p>
          </div>
          <span>{{ row.average }}%</span>
        </div>
      </div>
    </div>
  </ModalCard>
</template>

<style scoped>
.results-form {
  display: grid;
  gap: 10px;
}

.field {
  display: grid;
  gap: 6px;
}

.field label {
  color: var(--muted);
  font-size: 0.78rem;
  font-weight: 800;
  text-transform: uppercase;
}

.field select {
  background: #fff;
  border: 1px solid rgba(75, 96, 127, 0.16);
  border-radius: 12px;
  color: var(--ink);
  min-height: 42px;
  padding: 0 10px;
}

.result-preview {
  border-top: 1px solid rgba(75, 96, 127, 0.14);
  display: grid;
  gap: 10px;
  margin-top: 14px;
  padding-top: 12px;
}

.preview-head {
  align-items: center;
  display: flex;
  justify-content: space-between;
  gap: 8px;
}

.preview-kicker {
  color: var(--brand-orange);
  font-size: 0.7rem;
  font-weight: 800;
  letter-spacing: 0.12em;
  margin: 0 0 2px;
  text-transform: uppercase;
}

.preview-head h3 {
  font-size: 1rem;
  margin: 0;
}

.preview-actions {
  display: flex;
  gap: 6px;
}

.export-error {
  background: rgba(183, 71, 53, 0.1);
  border: 1px solid rgba(183, 71, 53, 0.18);
  border-radius: 10px;
  color: var(--danger);
  font-size: 0.82rem;
  margin: 0;
  padding: 8px 10px;
}

.preview-list {
  display: grid;
  gap: 8px;
}

.preview-row {
  align-items: center;
  background: rgba(255, 250, 245, 0.84);
  border: 1px solid rgba(75, 96, 127, 0.12);
  border-radius: 12px;
  display: flex;
  justify-content: space-between;
  gap: 8px;
  padding: 8px 10px;
}

.preview-row strong {
  display: block;
}

.preview-row p {
  color: var(--muted);
  font-size: 0.8rem;
  margin: 2px 0 0;
}

.preview-row span {
  color: var(--brand-blue);
  font-family: var(--font-mono);
  font-size: 0.86rem;
  font-weight: 800;
  white-space: nowrap;
}

.btn-primary,
.btn-ghost {
  border-radius: 12px;
  font-weight: 700;
}

.btn-ghost.compact {
  padding: 8px 10px;
}
</style>
