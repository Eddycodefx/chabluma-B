<script setup>
import { ref, computed, watch, onMounted } from 'vue'
import * as XLSX from 'xlsx'
import {
  getStudents, addStudent, deleteStudent,
  getAssessments, addAssessment, deleteAssessment,
  getGradesForSubject, setGrade, importStudents
} from '../db.js'
import AddStudentModal from './AddStudentModal.vue'
import AddAssessmentModal from './AddAssessmentModal.vue'

const props = defineProps({
  subject: { type: Object, required: true },
  canManageStudents: { type: Boolean, default: false }
})
const emit = defineEmits(['changed'])

const students = ref([])
const assessments = ref([])
const grades = ref([])
const showAddStudent = ref(false)
const showAddAssessment = ref(false)
const importMessage = ref('')
const importing = ref(false)
const studentSearch = ref('')
const pageSize = 10
const currentPage = ref(1)

const filteredStudents = computed(() => {
  const query = studentSearch.value.trim().toLowerCase()
  if (!query) return students.value
  return students.value.filter(student => [
    student.name,
    student.admissionNumber,
    student.rollNumber,
    student.sex
  ].some(value => String(value || '').toLowerCase().includes(query)))
})
const totalPages = computed(() => Math.max(1, Math.ceil(filteredStudents.value.length / pageSize)))
const pageStart = computed(() => (currentPage.value - 1) * pageSize)
const pageEnd = computed(() => Math.min(pageStart.value + pageSize, filteredStudents.value.length))
const sortedStudents = computed(() => {
  return [...filteredStudents.value].sort((a, b) => {
    const averageA = average(a.id)
    const averageB = average(b.id)
    if (averageA === null && averageB === null) return a.name.localeCompare(b.name)
    if (averageA === null) return 1
    if (averageB === null) return -1
    if (averageB !== averageA) return averageB - averageA
    return a.name.localeCompare(b.name)
  })
})
const paginatedStudents = computed(() => sortedStudents.value.slice(pageStart.value, pageEnd.value))
const visiblePageNumbers = computed(() => {
  const total = totalPages.value
  const current = currentPage.value
  const start = Math.max(1, Math.min(current - 2, total - 4))
  const end = Math.min(total, start + 4)
  return Array.from({ length: end - start + 1 }, (_, index) => start + index)
})

async function loadAll() {
  const [s, a, g] = await Promise.all([
    getStudents(props.subject.id),
    getAssessments(props.subject.id),
    getGradesForSubject(props.subject.id)
  ])
  students.value = s
  assessments.value = a
  grades.value = g
}

onMounted(loadAll)
watch(() => props.subject.id, () => {
  currentPage.value = 1
  studentSearch.value = ''
  loadAll()
})
watch(() => filteredStudents.value.length, () => {
  if (currentPage.value > totalPages.value) currentPage.value = totalPages.value
})
watch(studentSearch, () => {
  currentPage.value = 1
})

function goToPage(page) {
  currentPage.value = Math.min(Math.max(page, 1), totalPages.value)
}

function scoreFor(studentId, assessmentId) {
  const g = grades.value.find(x => x.studentId === studentId && x.assessmentId === assessmentId)
  return g ? g.score : null
}

async function onScoreChange(studentId, assessmentId, raw) {
  const assessment = assessments.value.find(item => item.id === assessmentId)
  const maxScore = Math.min(Number(assessment?.maxScore) || 100, 100)
  const numericValue = Number(raw)
  const value = raw === '' || Number.isNaN(numericValue) ? null : Math.min(Math.max(numericValue, 0), maxScore)
  await setGrade({ studentId, assessmentId, subjectId: props.subject.id, score: value })
  grades.value = await getGradesForSubject(props.subject.id)
  emit('changed')
}

function average(studentId) {
  const entries = assessments.value
    .map(a => ({ a, score: scoreFor(studentId, a.id) }))
    .filter(e => e.score !== null && e.score !== undefined)
  if (!entries.length) return null
  const pct = entries.reduce((sum, e) => {
    const maxScore = Math.max(Math.min(Number(e.a.maxScore) || 100, 100), 1)
    const score = Math.min(Number(e.score) || 0, maxScore)
    return sum + (score / maxScore) * 100
  }, 0) / entries.length
  return Math.round(pct * 10) / 10
}

function gradeFor(pct) {
  if (pct === null || pct === undefined || Number.isNaN(pct)) return '—'
  if (pct >= 75) return 'A'
  if (pct >= 65) return 'B'
  if (pct >= 45) return 'C'
  if (pct >= 30) return 'D'
  return 'F'
}

function gradeClassFor(pct) {
  const grade = gradeFor(pct)
  return grade === '—' ? 'grade-none' : `grade-${grade.toLowerCase()}`
}

function gradePercent(studentId, assessment) {
  const score = scoreFor(studentId, assessment.id)
  if (score === null || score === undefined) return null
  const maxScore = Math.max(Math.min(Number(assessment.maxScore) || 100, 100), 1)
  return Math.round((Math.min(Number(score) || 0, maxScore) / maxScore) * 1000) / 10
}

async function handleAddStudent(payload) {
  if (!props.canManageStudents) return
  await addStudent({ subjectId: props.subject.id, ...payload })
  students.value = await getStudents(props.subject.id)
  showAddStudent.value = false
  emit('changed')
}

function normalizeHeader(value) {
  return String(value || '').trim().toLowerCase().replace(/[^a-z0-9]/g, '')
}

function parseCsv(text) {
  const rows = []
  let row = []
  let cell = ''
  let quoted = false
  const delimiter = text.includes('\t') && !text.includes(',') ? '\t' : ','

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i]
    const next = text[i + 1]
    if (char === '"' && quoted && next === '"') {
      cell += '"'
      i += 1
    } else if (char === '"') {
      quoted = !quoted
    } else if (char === delimiter && !quoted) {
      row.push(cell)
      cell = ''
    } else if ((char === '\n' || char === '\r') && !quoted) {
      if (char === '\r' && next === '\n') i += 1
      row.push(cell)
      if (row.some(value => String(value).trim())) rows.push(row)
      row = []
      cell = ''
    } else {
      cell += char
    }
  }

  row.push(cell)
  if (row.some(value => String(value).trim())) rows.push(row)
  return rows
}

function rowsFromTable(tableRows) {
  if (tableRows.length < 2) return []
  const admissionHeaders = [
    'admissionnumber', 'admissionno', 'admission', 'admno', 'adm', 'admissionnum', 'registrationnumber',
    'registrationno', 'regno', 'studentnumber', 'studentno'
  ]
  const nameHeaders = [
    'studentfullname', 'fullname', 'studentname', 'name', 'names', 'fullnameofstudent', 'nameofstudent',
    'pupilname', 'learnername'
  ]
  const sexHeaders = ['sex', 'gender', 'maleorfemale']
  let headerRowIndex = -1
  let admissionIndex = -1
  let nameIndex = -1
  let sexIndex = -1

  for (let i = 0; i < Math.min(tableRows.length, 20); i += 1) {
    const headers = tableRows[i].map(normalizeHeader)
    const foundAdmission = headers.findIndex(h => admissionHeaders.includes(h))
    const foundName = headers.findIndex(h => nameHeaders.includes(h))
    const foundSex = headers.findIndex(h => sexHeaders.includes(h))
    if (foundAdmission !== -1 && foundName !== -1 && foundSex !== -1) {
      headerRowIndex = i
      admissionIndex = foundAdmission
      nameIndex = foundName
      sexIndex = foundSex
      break
    }
  }

  if (admissionIndex === -1 || nameIndex === -1 || sexIndex === -1) {
    throw new Error('File must have columns for admission number, student fullname, and sex.')
  }

  return tableRows.slice(headerRowIndex + 1).map(row => ({
    admissionNumber: row[admissionIndex],
    name: row[nameIndex],
    sex: row[sexIndex]
  })).filter(row => row.admissionNumber || row.name || row.sex)
}

async function tableRowsFromFile(file) {
  const extension = file.name.split('.').pop()?.toLowerCase()
  if (extension === 'xlsx' || extension === 'xls') {
    const data = await file.arrayBuffer()
    const workbook = XLSX.read(data)
    const firstSheet = workbook.Sheets[workbook.SheetNames[0]]
    return XLSX.utils.sheet_to_json(firstSheet, { header: 1, defval: '' })
  }

  return parseCsv(await file.text())
}

async function handleImport(event) {
  if (!props.canManageStudents) return
  const file = event.target.files?.[0]
  if (!file) return
  importing.value = true
  importMessage.value = ''

  try {
    const parsedRows = rowsFromTable(await tableRowsFromFile(file))
    if (!parsedRows.length) throw new Error('No student rows found below the column headers.')
    const result = await importStudents(props.subject.id, parsedRows)
    students.value = await getStudents(props.subject.id)
    importMessage.value = `Imported ${result.added} new student${result.added === 1 ? '' : 's'}, updated ${result.updated}, skipped ${result.skipped}.`
    emit('changed')
  } catch (error) {
    importMessage.value = error.message || 'Could not import this file.'
  } finally {
    importing.value = false
    event.target.value = ''
  }
}

function downloadTemplate() {
  const rows = [
    ['admission number', 'student fullname', 'sex'],
    ['WHS/001', 'Jane Student', 'F'],
    ['WHS/002', 'John Student', 'M']
  ]
  const csv = rows.map(row => row.map(value => `"${String(value).replaceAll('"', '""')}"`).join(',')).join('\n')
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `form-${props.subject.form}${props.subject.stream}-student-template.csv`
  link.click()
  URL.revokeObjectURL(url)
}

async function handleAddAssessment(payload) {
  await addAssessment({
    subjectId: props.subject.id,
    label: payload.label,
    maxScore: Math.min(Math.max(Number(payload.maxScore) || 100, 1), 100)
  })
  assessments.value = await getAssessments(props.subject.id)
  showAddAssessment.value = false
  emit('changed')
}

async function removeStudent(student) {
  if (!props.canManageStudents) return
  if (!confirm(`Remove ${student.name} from Form ${props.subject.form}${props.subject.stream}? This deletes their grades too.`)) return
  await deleteStudent(student.id)
  students.value = await getStudents(props.subject.id)
  grades.value = await getGradesForSubject(props.subject.id)
  emit('changed')
}

async function removeAssessment(assessment) {
  if (!confirm(`Delete the "${assessment.label}" column? This removes every student's mark for it.`)) return
  await deleteAssessment(assessment.id)
  assessments.value = await getAssessments(props.subject.id)
  grades.value = await getGradesForSubject(props.subject.id)
  emit('changed')
}

const gradeColor = (pct) => {
  if (pct === null) return 'var(--muted)'
  if (pct >= 75) return 'var(--good)'
  if (pct >= 50) return 'var(--accent-dim)'
  return 'var(--mark)'
}
</script>

<template>
  <div class="sheet-wrap">
    <div class="sheet-header">
      <div>
        <p class="class-pill">Form {{ subject.form }}{{ subject.stream }}</p>
        <h1 :style="{ color: subject.color }">{{ subject.subjectName }}</h1>
        <p class="sub">
          {{ students.length }} student{{ students.length === 1 ? '' : 's' }} ·
          {{ assessments.length }} assessment{{ assessments.length === 1 ? '' : 's' }}
        </p>
      </div>
      <div class="actions">
        <label v-if="canManageStudents" class="btn-ghost import-btn">
          Import
          <input
            type="file"
            accept=".xlsx,.xls,.csv,text/csv"
            :disabled="importing"
            @change="handleImport"
          />
        </label>
        <button v-if="canManageStudents" class="btn-ghost" @click="downloadTemplate">Template</button>
        <button class="btn-ghost" @click="showAddAssessment = true">Assessment</button>
        <button v-if="canManageStudents" class="btn-primary compact" @click="showAddStudent = true">Student</button>
      </div>
    </div>
    <p v-if="importMessage" class="import-message">{{ importMessage }}</p>

    <form v-if="students.length" class="student-search" role="search" @submit.prevent>
      <label for="student-search">Search student</label>
      <div class="search-control">
        <input
          id="student-search"
          v-model="studentSearch"
          type="search"
          placeholder="Name or admission number"
          autocomplete="off"
        />
        <button class="search-btn" type="submit">Search</button>
        <button
          v-if="studentSearch"
          class="clear-search"
          type="button"
          aria-label="Clear student search"
          @click="studentSearch = ''"
        >
          &times;
        </button>
      </div>
      <p v-if="studentSearch" class="search-count">
        {{ filteredStudents.length }} result{{ filteredStudents.length === 1 ? '' : 's' }}
      </p>
    </form>

    <div v-if="!students.length" class="empty">
      <p>No students enrolled in Form {{ subject.form }}{{ subject.stream }} for {{ subject.subjectName }} yet.</p>
      <button v-if="canManageStudents" class="btn-primary compact" @click="showAddStudent = true">Enroll your first student</button>
    </div>

    <div v-else-if="!filteredStudents.length" class="empty">
      <p>No student matches "{{ studentSearch }}".</p>
      <button class="btn-primary compact" @click="studentSearch = ''">Clear search</button>
    </div>

    <div v-else class="table-scroll-wrap">
      <div class="table-scroll" tabindex="0" aria-label="Scrollable student marks table">
      <table class="mark-table">
        <thead>
          <tr>
            <th class="col-admission">Admission</th>
            <th class="col-name">Student</th>
            <th class="col-sex">Sex</th>
            <th v-for="a in assessments" :key="a.id" class="col-assess">
              <div class="assess-head">
                <span class="assess-label">{{ a.label }}</span>
                <span class="assess-max">/ {{ a.maxScore }}</span>
                <button class="col-delete" title="Delete column" @click="removeAssessment(a)">&times;</button>
              </div>
            </th>
            <th class="col-avg">Average</th>
            <th class="col-actions"></th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="s in paginatedStudents" :key="s.id">
            <td class="col-admission">{{ s.admissionNumber ?? s.rollNumber ?? '—' }}</td>
            <td class="col-name">{{ s.name }}</td>
            <td class="col-sex">{{ s.sex ?? '—' }}</td>
            <td v-for="a in assessments" :key="a.id" class="col-assess">
              <div class="mark-entry">
                <input
                  type="number"
                  class="grade-input"
                  :min="0"
                  :max="Math.min(a.maxScore, 100)"
                  :value="scoreFor(s.id, a.id)"
                  placeholder="—"
                  @change="onScoreChange(s.id, a.id, $event.target.value)"
                />
                <span
                  class="grade-badge"
                  :class="gradeClassFor(gradePercent(s.id, a))"
                >
                  {{ gradeFor(gradePercent(s.id, a)) }}
                </span>
              </div>
            </td>
            <td class="col-avg">
              <span
                class="avg-mark"
                :style="{ color: gradeColor(average(s.id)), borderColor: gradeColor(average(s.id)) }"
              >
                {{ average(s.id) === null ? '—' : average(s.id) + '%' }}
                <strong v-if="average(s.id) !== null">{{ gradeFor(average(s.id)) }}</strong>
              </span>
            </td>
            <td class="col-actions">
              <button v-if="canManageStudents" class="row-delete" title="Remove student" @click="removeStudent(s)">&times;</button>
            </td>
          </tr>
        </tbody>
      </table>
      </div>
    </div>

    <div v-if="filteredStudents.length > pageSize" class="pagination-bar">
      <p class="pagination-summary">
        Showing {{ pageStart + 1 }}-{{ pageEnd }} of {{ filteredStudents.length }} students
      </p>
      <div class="pagination-controls" aria-label="Student table pagination">
        <button class="page-btn" :disabled="currentPage === 1" @click="goToPage(currentPage - 1)">
          Prev
        </button>
        <button
          v-for="page in visiblePageNumbers"
          :key="page"
          class="page-btn number"
          :class="{ active: page === currentPage }"
          :aria-current="page === currentPage ? 'page' : undefined"
          @click="goToPage(page)"
        >
          {{ page }}
        </button>
        <button class="page-btn" :disabled="currentPage === totalPages" @click="goToPage(currentPage + 1)">
          Next
        </button>
      </div>
    </div>

    <AddStudentModal v-if="showAddStudent" @close="showAddStudent = false" @create="handleAddStudent" />
    <AddAssessmentModal v-if="showAddAssessment" @close="showAddAssessment = false" @create="handleAddAssessment" />
  </div>
</template>

<style scoped>
.sheet-wrap {
  background: var(--surface);
  backdrop-filter: blur(18px);
  color: var(--ink);
  border: 1px solid rgba(255, 255, 255, 0.74);
  border-radius: 22px;
  box-shadow: var(--shadow);
  padding: 16px 0 18px;
  min-height: 100%;
  overflow: hidden;
}

.sheet-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  margin-bottom: 14px;
  flex-wrap: wrap;
  gap: 14px;
  padding: 0 14px;
}

.sheet-header h1 {
  font-family: var(--font-display);
  font-size: 1.52rem;
  font-weight: 800;
  letter-spacing: 0;
  margin: 0 0 5px;
}

.class-pill {
  background: rgba(243, 112, 30, 0.12);
  border: 1px solid rgba(243, 112, 30, 0.18);
  border-radius: 999px;
  color: var(--brand-orange);
  display: inline-flex;
  font-family: var(--font-mono);
  font-size: 0.72rem;
  font-weight: 800;
  margin: 0 0 8px;
  padding: 5px 9px;
  text-transform: uppercase;
}

.sub {
  color: var(--muted);
  font-size: 0.85rem;
  margin: 0;
}

.actions {
  display: grid;
  gap: 8px;
  grid-template-columns: repeat(2, minmax(108px, 1fr));
  width: 100%;
}

.import-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
}

.import-btn input {
  display: none;
}

.import-message {
  background: rgba(75, 96, 127, 0.08);
  border: 1px solid rgba(75, 96, 127, 0.1);
  border-radius: 12px;
  color: var(--brand-blue);
  font-size: 0.84rem;
  margin: 0 14px 14px;
  padding: 9px 10px;
}

.btn-primary.compact {
  width: 100%;
  padding: 10px 13px;
}

.empty {
  background: rgba(255, 255, 255, 0.54);
  border: 1px dashed rgba(75, 96, 127, 0.24);
  border-radius: 18px;
  margin: 0 14px;
  padding: 36px 18px;
  text-align: center;
  color: var(--muted);
}
.empty p { margin-bottom: 16px; }
.empty .btn-primary { width: auto; display: inline-block; padding: 10px 18px; }

.student-search {
  display: grid;
  gap: 8px;
  margin: 0 14px 14px;
}

.student-search label {
  color: var(--muted);
  font-family: var(--font-mono);
  font-size: 0.72rem;
  font-weight: 800;
  text-transform: uppercase;
}

.search-control {
  display: grid;
  gap: 8px;
  grid-template-columns: minmax(0, 1fr) auto;
  position: relative;
}

.search-control input {
  background: #fff;
  border: 1px solid rgba(75, 96, 127, 0.16);
  border-radius: 12px;
  color: var(--ink);
  font-family: var(--font-body);
  font-size: 0.95rem;
  min-height: 44px;
  min-width: 0;
  padding: 10px 38px 10px 12px;
  width: 100%;
}

.search-control input:focus {
  border-color: var(--mark);
  box-shadow: 0 0 0 3px rgba(243, 112, 30, 0.12);
  outline: none;
}

.search-btn,
.clear-search {
  align-items: center;
  display: inline-flex;
  justify-content: center;
}

.search-btn {
  background: var(--brand-blue);
  border: none;
  border-radius: 12px;
  color: #fff;
  font-size: 0.86rem;
  font-weight: 800;
  min-height: 44px;
  padding: 10px 13px;
}

.clear-search {
  background: transparent;
  border: none;
  color: var(--muted);
  font-size: 1.1rem;
  min-height: 32px;
  padding: 4px 10px;
  position: absolute;
  right: 74px;
  top: 6px;
}

.search-count {
  color: var(--muted);
  font-size: 0.82rem;
  margin: 0;
}

.table-scroll-wrap {
  margin: 0 8px;
  position: relative;
}

.table-scroll-wrap::before,
.table-scroll-wrap::after {
  content: "";
  pointer-events: none;
  position: absolute;
  top: 0;
  bottom: 4px;
  width: 18px;
  z-index: 8;
}

.table-scroll-wrap::before {
  left: 0;
  background: linear-gradient(90deg, rgba(232, 216, 201, 0.72), rgba(232, 216, 201, 0));
}

.table-scroll-wrap::after {
  right: 0;
  background: linear-gradient(270deg, rgba(232, 216, 201, 0.72), rgba(232, 216, 201, 0));
}

.table-scroll {
  max-height: min(62vh, 520px);
  overflow: auto;
  padding: 0 0 4px;
  scrollbar-width: thin;
  -webkit-overflow-scrolling: touch;
  scroll-snap-type: both proximity;
}

.mark-table {
  min-width: 560px;
  width: max-content;
  border-collapse: collapse;
  font-size: 0.82rem;
}

.mark-table thead th {
  text-align: left;
  font-family: var(--font-mono);
  font-size: 0.72rem;
  letter-spacing: 0;
  text-transform: uppercase;
  color: var(--muted);
  padding: 9px 7px;
  border-bottom: 1px solid rgba(75, 96, 127, 0.18);
  white-space: nowrap;
  background: rgba(255, 250, 245, 0.94);
  position: sticky;
  top: 0;
  z-index: 5;
}

.mark-table tbody td {
  padding: 9px 7px;
  border-bottom: 1px solid rgba(75, 96, 127, 0.1);
  font-family: var(--font-body);
  background: rgba(255, 255, 255, 0.38);
  scroll-snap-align: start;
}

.mark-table tbody tr:hover {
  background: rgba(243, 112, 30, 0.06);
}

.col-admission {
  color: var(--muted);
  font-family: var(--font-mono);
  left: 0;
  min-width: 82px;
  max-width: 92px;
  position: sticky;
  z-index: 2;
  white-space: normal;
  overflow-wrap: anywhere;
}
.col-name {
  font-weight: 700;
  left: 82px;
  max-width: 128px;
  min-width: 128px;
  position: sticky;
  z-index: 2;
  overflow-wrap: anywhere;
}
.col-sex { width: 54px; text-align: center; font-family: var(--font-mono); color: var(--muted); }
.col-assess { min-width: 82px; text-align: center; }

tbody .col-name {
  white-space: normal;
}

thead .col-admission,
thead .col-name,
tbody .col-admission,
tbody .col-name {
  background: #fffaf5;
}

thead .col-admission,
thead .col-name {
  z-index: 7;
}

thead .col-name,
tbody .col-name {
  box-shadow: 8px 0 12px rgba(38, 50, 70, 0.08);
}

.assess-head {
  display: flex;
  align-items: baseline;
  gap: 4px;
  justify-content: center;
}
.assess-max { color: var(--muted); font-weight: 400; text-transform: none; }
.col-delete {
  background: none;
  border: none;
  color: var(--danger);
  font-size: 0.95rem;
  line-height: 1;
  opacity: 0;
  padding: 0 2px;
}
th:hover .col-delete { opacity: 0.6; }
.col-delete:hover { color: var(--mark) !important; opacity: 1 !important; }

.mark-entry {
  align-items: center;
  display: inline-flex;
  gap: 6px;
  justify-content: center;
}

.grade-input {
  width: 52px;
  min-height: 40px;
  text-align: center;
  font-family: var(--font-mono);
  font-size: 0.95rem;
  font-weight: 600;
  color: var(--brand-blue);
  background: #fff;
  border: 1px solid rgba(75, 96, 127, 0.14);
  border-radius: 12px;
  padding: 7px 2px;
  -moz-appearance: textfield;
}

.grade-badge {
  align-items: center;
  background: rgba(111, 116, 128, 0.1);
  border: 1px solid rgba(111, 116, 128, 0.14);
  border-radius: 999px;
  color: var(--muted);
  display: inline-flex;
  font-family: var(--font-mono);
  font-size: 0.72rem;
  font-weight: 800;
  justify-content: center;
  min-height: 26px;
  min-width: 28px;
  padding: 3px 7px;
}

.grade-a {
  background: rgba(47, 143, 107, 0.12);
  border-color: rgba(47, 143, 107, 0.22);
  color: var(--good);
}

.grade-b {
  background: rgba(75, 96, 127, 0.12);
  border-color: rgba(75, 96, 127, 0.18);
  color: var(--brand-blue);
}

.grade-c {
  background: rgba(201, 86, 18, 0.1);
  border-color: rgba(201, 86, 18, 0.18);
  color: var(--accent-dim);
}

.grade-d,
.grade-f {
  background: rgba(183, 71, 53, 0.1);
  border-color: rgba(183, 71, 53, 0.18);
  color: var(--danger);
}

.grade-none {
  background: rgba(111, 116, 128, 0.1);
  border-color: rgba(111, 116, 128, 0.14);
  color: var(--muted);
}

.grade-input:hover,
.grade-input:focus {
  border-color: var(--mark);
  box-shadow: 0 0 0 3px rgba(243, 112, 30, 0.12);
}
.grade-input::-webkit-outer-spin-button,
.grade-input::-webkit-inner-spin-button {
  -webkit-appearance: none;
  margin: 0;
}

.col-avg { text-align: center; width: 90px; }
.avg-mark {
  align-items: center;
  display: inline-flex;
  gap: 6px;
  justify-content: center;
  font-family: var(--font-mono);
  font-weight: 600;
  border: 1.5px solid;
  border-radius: 999px;
  padding: 5px 10px;
  min-width: 58px;
}

.avg-mark strong {
  font-size: 0.76rem;
}

.col-actions { width: 36px; text-align: center; }
.row-delete {
  background: none;
  border: none;
  color: var(--danger);
  font-size: 1.05rem;
  opacity: 0.7;
  padding: 2px 6px;
}
tr:hover .row-delete { opacity: 0.5; }
.row-delete:hover { color: var(--mark) !important; opacity: 1 !important; }

.pagination-bar {
  align-items: center;
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  justify-content: space-between;
  padding: 14px 14px 0;
}

.pagination-summary {
  color: var(--muted);
  font-size: 0.82rem;
  margin: 0;
}

.pagination-controls {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.page-btn {
  align-items: center;
  background: rgba(255, 255, 255, 0.7);
  border: 1px solid rgba(75, 96, 127, 0.16);
  border-radius: 10px;
  color: var(--brand-blue);
  display: inline-flex;
  font-size: 0.82rem;
  font-weight: 700;
  justify-content: center;
  min-height: 36px;
  min-width: 42px;
  padding: 8px 10px;
}

.page-btn.number {
  min-width: 36px;
}

.page-btn.active {
  background: var(--brand-orange);
  border-color: var(--brand-orange);
  color: var(--chalk);
}

.page-btn:disabled {
  cursor: not-allowed;
  opacity: 0.45;
}

@media (min-width: 760px) {
  .sheet-wrap {
    padding: 24px 0 28px;
  }

  .sheet-header {
    padding: 0 24px;
  }

  .sheet-header h1 {
    font-size: 2.1rem;
  }

  .actions {
    display: flex;
    justify-content: flex-end;
    width: auto;
  }

  .btn-primary.compact {
    width: auto;
  }

  .import-message {
    margin-inline: 24px;
  }

  .empty {
    margin-inline: 24px;
  }

  .student-search {
    align-items: end;
    grid-template-columns: minmax(160px, 1fr) minmax(0, 2fr) auto;
    margin-inline: 24px;
  }

  .search-count {
    padding-bottom: 12px;
    white-space: nowrap;
  }

  .table-scroll-wrap {
    margin: 0;
  }

  .table-scroll {
    max-height: min(68vh, 620px);
    margin: 0;
  }

  .mark-table {
    min-width: 100%;
    width: 100%;
    font-size: 0.88rem;
  }

  .mark-table thead th,
  .mark-table tbody td {
    padding: 10px 9px;
  }

  .col-admission {
    max-width: none;
    min-width: 96px;
    white-space: nowrap;
  }

  .col-name {
    left: 96px;
    max-width: 164px;
    min-width: 164px;
  }

  .col-assess {
    min-width: 100px;
  }

  .grade-input {
    width: 58px;
  }

  .pagination-bar {
    padding: 16px 24px 0;
  }
}
</style>
