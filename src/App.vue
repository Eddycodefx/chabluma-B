<script setup>
import { ref, computed, onMounted, nextTick } from 'vue'
import * as XLSX from 'xlsx'
import {
  getTeacherProfile,
  saveTeacherProfile,
  getAssignments,
  getAssignmentStats,
  deleteAssignment,
  getSession,
  onAuthStateChange,
  signInWithPassword,
  signUpWithPassword,
  signOut,
  getStudents,
  getAssessments,
  getGradesForSubject
} from './db.js'
import { Swiper, SwiperSlide } from 'swiper/vue'
import { A11y, Pagination } from 'swiper/modules'
import 'swiper/css'
import 'swiper/css/pagination'
import MarkSheet from './components/MarkSheet.vue'
import AdminPanel from './components/AdminPanel.vue'
import ResultsModal from './components/ResultsModal.vue'
import schoolLogo from './asset/images/logo.png'
import heroBack from './asset/images/hero-back.jpg'

const teacher = ref(null)
const assignments = ref([])
const assignmentStats = ref({})
const selectedId = ref(null)
const teacherName = ref('')
const teacherPhone = ref('')
const session = ref(null)
const authMode = ref('sign-in')
const email = ref('')
const password = ref('')
const authError = ref('')
const authBusy = ref(false)
const loading = ref(true)
const loadError = ref('')
const showResultsModal = ref(false)
const resultsReport = ref([])
const resultsMeta = ref(null)
const resultsBusy = ref(false)
const swiperReady = ref(false)

const selectedAssignment = computed(() => {
  const currentSelectedId = selectedId.value
  if (currentSelectedId === null || currentSelectedId === undefined) return null
  return assignments.value.find(assignment => String(assignment.id) === String(currentSelectedId)) || null
})
const selectedForm = computed(() => selectedAssignment.value?.form ?? null)
const hasTeacherProfile = computed(() => teacher.value && teacher.value.name)
const isSignedIn = computed(() => Boolean(session.value?.user))
const isAdmin = computed(() => teacher.value?.role === 'admin')
const swiperModules = [A11y, Pagination]
const heroStyle = computed(() => ({ '--hero-back': `url(${heroBack})` }))
const assignmentCards = computed(() => assignments.value.map(assignment => ({
  ...assignment,
  stats: assignmentStats.value[assignment.id] || {
    studentCount: 0,
    assessmentCount: 0,
    completedAssessments: 0,
    classAverage: null
  }
})))
const classTabs = computed(() => {
  const grouped = new Map()
  for (const card of assignmentCards.value) {
    const form = card.form
    if (!grouped.has(form)) {
      grouped.set(form, {
        form,
        streams: new Set(),
        subjects: new Set(),
        studentCount: 0,
        averages: []
      })
    }
    const group = grouped.get(form)
    group.streams.add(card.stream)
    group.subjects.add(card.subjectName)
    group.studentCount += card.stats.studentCount
    if (card.stats.classAverage !== null) group.averages.push(card.stats.classAverage)
  }

  return Array.from(grouped.values())
    .sort((a, b) => Number(a.form) - Number(b.form))
    .map(group => ({
      form: group.form,
      streams: Array.from(group.streams).sort(),
      subjectCount: group.subjects.size,
      studentCount: group.studentCount,
      average: group.averages.length
        ? Math.round((group.averages.reduce((sum, value) => sum + value, 0) / group.averages.length) * 10) / 10
        : null
    }))
})
const visibleAssignmentCards = computed(() => selectedForm.value
  ? assignmentCards.value.filter(card => card.form === selectedForm.value)
  : assignmentCards.value
)
const selectedClassSummary = computed(() => classTabs.value.find(tab => tab.form === selectedForm.value) || null)

async function loadTeacher() {
  teacher.value = await getTeacherProfile()
  teacherName.value = teacher.value?.name || ''
  teacherPhone.value = teacher.value?.phone || ''
}

async function loadAssignments() {
  assignments.value = await getAssignments()
  if (!selectedId.value && assignments.value.length) {
    selectedId.value = assignments.value[0].id
  }
  if (selectedId.value && !assignments.value.some(assignment => String(assignment.id) === String(selectedId.value))) {
    selectedId.value = assignments.value.length ? assignments.value[0].id : null
  }
  assignmentStats.value = assignments.value.length
    ? await getAssignmentStats(assignments.value.map(assignment => assignment.id))
    : {}
}

async function loadAll() {
  loadError.value = ''
  if (!isSignedIn.value) {
    teacher.value = null
    assignments.value = []
    selectedId.value = null
    return
  }
  try {
    await Promise.all([loadTeacher(), loadAssignments()])
  } catch (error) {
    loadError.value = error.message || 'Could not load Supabase data.'
  }
}

onMounted(async () => {
  session.value = await getSession()
  await loadAll()
  loading.value = false
  await nextTick()
  swiperReady.value = true
  onAuthStateChange(async nextSession => {
    session.value = nextSession
    await loadAll()
    await nextTick()
    swiperReady.value = true
  })
})

async function handleAuth() {
  if (!email.value.trim() || !password.value) return
  authBusy.value = true
  authError.value = ''
  try {
    const payload = { email: email.value.trim(), password: password.value }
    if (authMode.value === 'sign-up') {
      await signUpWithPassword(payload)
    } else {
      await signInWithPassword(payload)
    }
    session.value = await getSession()
    await loadAll()
  } catch (error) {
    authError.value = error.message || 'Authentication failed.'
  } finally {
    authBusy.value = false
  }
}

async function handleSignOut() {
  await signOut()
  session.value = null
  teacher.value = null
  assignments.value = []
  selectedId.value = null
}

async function handleSaveTeacher() {
  if (!teacherName.value.trim()) return
  teacher.value = await saveTeacherProfile({
    name: teacherName.value.trim(),
    phone: teacherPhone.value.trim()
  })
}

async function handleDeleteAssignment(assignment) {
  if (!isAdmin.value) return
  const label = `${assignment.subjectName} - Form ${assignment.form}${assignment.stream}`
  if (!confirm(`Delete "${label}"? This removes all its students and grades permanently.`)) return
  await deleteAssignment(assignment.id)
  await loadAssignments()
  if (selectedId.value === assignment.id) {
    selectedId.value = assignments.value.length ? assignments.value[0].id : null
  }
}

async function refreshSelectedSubject() {
  await loadAssignments()
}

function selectForm(form) {
  const normalizedForm = String(form)
  const nextAssignment = assignments.value.find(assignment => String(assignment.form) === normalizedForm)
  if (nextAssignment) selectedId.value = nextAssignment.id
}

async function generateResults(payload) {
  if (!selectedAssignment.value || !payload?.form) return

  const scopeAssignments = assignments.value.filter(assignment => {
    if (assignment.form !== payload.form) return false
    if (payload.scope === 'stream') return assignment.stream === payload.stream
    return true
  })

  const filteredByAssignment = payload.assignmentMode === 'selected'
    ? scopeAssignments.filter(assignment => assignment.id === payload.assignmentId)
    : scopeAssignments

  if (!filteredByAssignment.length) {
    resultsReport.value = []
    resultsMeta.value = null
    return
  }

  resultsBusy.value = true
  try {
    const studentMap = new Map()
    const assessmentColumns = []
    const seenAssessmentColumns = new Set()

    for (const assignment of filteredByAssignment) {
      const [students, assessments, grades] = await Promise.all([
        getStudents(assignment.id),
        getAssessments(assignment.id),
        getGradesForSubject(assignment.id)
      ])

      const gradeIndex = new Map(grades.map(grade => [`${grade.studentId}:${grade.assessmentId}`, grade]))

      for (const student of students) {
        const entry = studentMap.get(student.id) || {
          studentId: student.id,
          admissionNumber: student.admissionNumber,
          name: student.name,
          classLabel: `Form ${assignment.form}${assignment.stream}`,
          stream: assignment.stream,
          totalPct: 0,
          count: 0,
          assessmentMarks: {}
        }

        let assignmentTotal = 0
        let assignmentCount = 0

        for (const assessment of assessments) {
          const grade = gradeIndex.get(`${student.id}:${assessment.id}`)
          if (grade === undefined || grade.score === null || grade.score === undefined) continue
          const maxScore = Math.max(Number(assessment.maxScore) || 100, 1)
          const pct = Math.min(Math.max((Number(grade.score) / maxScore) * 100, 0), 100)
          const label = assessment.shortName || assessment.label || 'Assessment'
          assignmentTotal += pct
          assignmentCount += 1

          if (!seenAssessmentColumns.has(label)) {
            seenAssessmentColumns.add(label)
            assessmentColumns.push(label)
          }

          entry.assessmentMarks[label] = `${Number(pct.toFixed(1))}%`
        }

        if (assignmentCount) {
          entry.totalPct += assignmentTotal / assignmentCount
          entry.count += 1
        }

        studentMap.set(student.id, entry)
      }
    }

    const rows = Array.from(studentMap.values())
      .filter(entry => entry.count > 0)
      .map(entry => ({
        ...entry,
        average: Number(((entry.totalPct / entry.count) || 0).toFixed(1))
      }))
      .sort((a, b) => b.average - a.average || a.name.localeCompare(b.name))
      .map((entry, index) => ({
        ...entry,
        rank: index + 1
      }))

    resultsReport.value = rows
    resultsMeta.value = {
      title: payload.scope === 'stream'
        ? `Form ${payload.form}${payload.stream} results`
        : `Form ${payload.form} results`,
      assignmentLabel: payload.assignmentMode === 'selected'
        ? filteredByAssignment[0]?.subjectName || 'Selected assignment'
        : 'All assignments',
      scopeLabel: payload.scope === 'stream' ? `Stream ${payload.stream}` : 'All streams',
      assessmentColumns
    }
  } finally {
    resultsBusy.value = false
  }
}

function exportResultsExcel() {
  if (!resultsReport.value.length) return

  const assessmentColumns = resultsMeta.value?.assessmentColumns || []
  const rows = resultsReport.value.map(item => {
    const row = {
      Rank: item.rank,
      Admission: item.admissionNumber || '—',
      Student: item.name,
      Class: item.classLabel
    }

    assessmentColumns.forEach(column => {
      row[column] = item.assessmentMarks?.[column] || '—'
    })

    if (assessmentColumns.length > 1) {
      row.Average = `${item.average}%`
    }

    return row
  })

  const worksheet = XLSX.utils.json_to_sheet(rows)
  const workbook = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Results')
  XLSX.writeFile(workbook, `${(resultsMeta.value?.title || 'results').replace(/\s+/g, '-').toLowerCase()}.xlsx`)
}

function exportResultsPdf() {
  if (!resultsReport.value.length) return

  const assessmentColumns = resultsMeta.value?.assessmentColumns || []
  const rows = resultsReport.value.map(item => {
    const cells = [
      `<td>${item.rank}</td>`,
      `<td>${item.admissionNumber || '—'}</td>`,
      `<td>${item.name}</td>`,
      `<td>${item.classLabel}</td>`
    ]

    assessmentColumns.forEach(column => {
      cells.push(`<td>${item.assessmentMarks?.[column] || '—'}</td>`)
    })

    if (assessmentColumns.length > 1) {
      cells.push(`<td>${item.average}%</td>`)
    }

    return `<tr>${cells.join('')}</tr>`
  }).join('')

  const subjectName = selectedAssignment.value?.subjectName || resultsMeta.value?.assignmentLabel || 'Report'
  const teacherName = selectedAssignment.value?.teacherName || teacher.value?.name || '—'
  const schoolName = 'WENDA HIGH SCHOOL'
  const html = `<!doctype html>
    <html>
      <head>
        <title>${resultsMeta.value?.title || 'Results'}</title>
        <style>
          :root { color-scheme: light; }
          body { font-family: Arial, sans-serif; margin: 0; padding: 24px; color: #1f2937; background: #fff; }
          .header { display: flex; align-items: center; justify-content: space-between; gap: 16px; margin-bottom: 16px; border-bottom: 2px solid #4b607f; padding-bottom: 12px; }
          .brand { display: flex; align-items: center; gap: 12px; }
          .brand img { width: 64px; height: 64px; object-fit: contain; }
          .brand h1 { margin: 0; font-size: 1.35rem; color: #4b607f; }
          .meta { font-size: 0.95rem; line-height: 1.5; text-align: right; }
          .meta strong { display: block; margin-bottom: 4px; }
          .report-title { margin: 0 0 8px; font-size: 1.25rem; color: #1f2937; }
          .summary { display: flex; flex-wrap: wrap; gap: 12px; margin-bottom: 16px; color: #4b607f; font-size: 0.95rem; }
          .summary span { background: #f5f7fb; padding: 6px 10px; border-radius: 999px; }
          .print-btn { display: inline-block; margin-bottom: 14px; padding: 8px 12px; border: 0; border-radius: 8px; background: #4b607f; color: white; cursor: pointer; font-weight: 700; }
          table { width: 100%; border-collapse: collapse; font-size: 0.9rem; }
          th, td { border: 1px solid #d1d5db; padding: 6px 8px; text-align: left; vertical-align: top; white-space: nowrap; }
          th { background: #f3f4f6; }
          tr:nth-child(even) td { background: #fafafa; }
          @media print { .print-btn { display: none; } }
        </style>
      </head>
      <body>
        <button class="print-btn" onclick="window.print()">Print / Save as PDF</button>
        <div class="header">
          <div class="brand">
            <img src="${schoolLogo}" alt="Wenda High School logo" />
            <div>
              <h1>${schoolName}</h1>
              <div>Academic results report</div>
            </div>
          </div>
          <div class="meta">
            <strong>${subjectName}</strong>
            <span>Teacher: ${teacherName}</span>
          </div>
        </div>
        <h2 class="report-title">${resultsMeta.value?.title || 'Results'}</h2>
        <div class="summary">
          <span>${resultsMeta.value?.scopeLabel || ''}</span>
          <span>${resultsMeta.value?.assignmentLabel || ''}</span>
        </div>
        <table>
          <thead>
            <tr>
              <th>Rank</th>
              <th>Admission</th>
              <th>Student</th>
              <th>Class</th>
              ${assessmentColumns.map(column => `<th>${column}</th>`).join('')}
              ${assessmentColumns.length > 1 ? '<th>Average</th>' : ''}
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </body>
    </html>`

  const printWindow = window.open('', '_blank', 'width=1000,height=800')
  if (!printWindow) return

  printWindow.document.write(html)
  printWindow.document.close()
  printWindow.focus()
  setTimeout(() => printWindow.print(), 300)
}
</script>

<template>
  <div class="app-shell" :class="{ 'has-bottom-nav': hasTeacherProfile && classTabs.length }">
    <header class="app-header" :class="{ 'teacher-hero': hasTeacherProfile }" :style="heroStyle">
      <div class="hero-content">
        <div class="school-brand-row">
          <img class="school-logo" :src="schoolLogo" alt="Wenda High School logo" />
          <p class="school-name">Wenda High School</p>
        </div>
        <p v-if="hasTeacherProfile" class="welcome-line">Welcome back {{ teacher.name }}</p>
      </div>
     
      <div v-if="hasTeacherProfile" class="assignment-carousel">
        <Swiper
          v-if="swiperReady && visibleAssignmentCards.length"
          :key="selectedForm + '-' + visibleAssignmentCards.length"
          :modules="swiperModules"
          :slides-per-view="1.08"
          :space-between="14"
          :pagination="{ clickable: true }"
          :breakpoints="{
            680: { slidesPerView: 2.05, spaceBetween: 16 },
            1024: { slidesPerView: 3, spaceBetween: 18 }
          }"
          class="assignment-swiper"
        >
          <SwiperSlide v-for="card in visibleAssignmentCards" :key="card.id">
            <button
              class="assignment-card"
              :class="{ selected: card.id === selectedId }"
              :style="{ '--subject-color': card.color }"
              @click="selectedId = card.id"
            >
              <span class="card-class">Form {{ card.form }}{{ card.stream }}</span>
              <strong>{{ card.subjectName }}</strong>
              <span class="teacher-name">{{ card.teacherName }}</span>
              <span class="card-rule"></span>
              <span class="card-metrics">
                <span>
                  <small>Students</small>
                  {{ card.stats.studentCount }}
                </span>
                <span>
                  <small>Assessments</small>
                  {{ card.stats.completedAssessments }}/{{ card.stats.assessmentCount }}
                </span>
                <span>
                  <small>Average</small>
                  {{ card.stats.classAverage === null ? '--' : card.stats.classAverage + '%' }}
                </span>
              </span>
            </button>
          </SwiperSlide>
        </Swiper>
      </div>
    </header>

    <main v-if="loading" class="setup-panel">
      <section class="setup-card">
        <p class="setup-kicker">Loading</p>
        <h2>Opening register</h2>
      </section>
    </main>

    <main v-else-if="loadError" class="setup-panel">
      <section class="setup-card">
        <p class="setup-kicker">Supabase setup</p>
        <h2>Database not ready</h2>
        <p class="setup-copy">{{ loadError }}</p>
        <p class="setup-copy">Run supabase/schema.sql in this project's Supabase SQL editor, then refresh. It recreates this app's tables.</p>
        <button class="btn-primary" @click="loadAll">Try again</button>
        <button class="auth-switch" @click="handleSignOut">Sign out</button>
      </section>
    </main>

    <main v-else-if="!isSignedIn" class="setup-panel">
      <section class="setup-card">
        <p class="setup-kicker">Supabase Auth</p>
        <h2>{{ authMode === 'sign-in' ? 'Sign in' : 'Create account' }}</h2>
        <p class="setup-copy">Use the account for this Wenda High School register.</p>
        <div class="field">
          <label for="auth-email">Email</label>
          <input
            id="auth-email"
            v-model="email"
            type="email"
            placeholder="teacher@example.com"
            autocomplete="email"
            autofocus
            @keyup.enter="handleAuth"
          />
        </div>
        <div class="field">
          <label for="auth-password">Password</label>
          <input
            id="auth-password"
            v-model="password"
            type="password"
            placeholder="Password"
            autocomplete="current-password"
            @keyup.enter="handleAuth"
          />
        </div>
        <p v-if="authError" class="auth-error">{{ authError }}</p>
        <button class="btn-primary" :disabled="authBusy || !email.trim() || !password" @click="handleAuth">
          {{ authBusy ? 'Please wait...' : authMode === 'sign-in' ? 'Sign in' : 'Create account' }}
        </button>
        <button class="auth-switch" @click="authMode = authMode === 'sign-in' ? 'sign-up' : 'sign-in'">
          {{ authMode === 'sign-in' ? 'Create new teacher account' : 'I already have an account' }}
        </button>
      </section>
    </main>

    <main v-else-if="!hasTeacherProfile" class="setup-panel">
      <section class="setup-card">
        <p class="setup-kicker">First setup</p>
        <h2>Teacher profile</h2>
        <p class="setup-copy">Stored on this phone for fast daily entry.</p>
        <div class="field">
          <label for="teacher-name">Teacher name</label>
          <input
            id="teacher-name"
            v-model="teacherName"
            type="text"
            placeholder="Full name"
            autofocus
            @keyup.enter="handleSaveTeacher"
          />
        </div>
        <div class="field">
          <label for="teacher-phone">Phone (optional)</label>
          <input
            id="teacher-phone"
            v-model="teacherPhone"
            type="tel"
            placeholder="Phone number"
            @keyup.enter="handleSaveTeacher"
          />
        </div>
        <button class="btn-primary" :disabled="!teacherName.trim()" @click="handleSaveTeacher">
          Continue
        </button>
        <button class="auth-switch" @click="handleSignOut">Sign out</button>
      </section>
    </main>

    <template v-else>
      <main class="main-panel">
        <AdminPanel v-if="isAdmin" @changed="loadAssignments" />
        <section v-if="selectedClassSummary" class="class-context">
          <div>
            <p class="context-kicker">Selected class</p>
            <h2>Form {{ selectedClassSummary.form }}</h2>
          </div>
          <div class="context-metrics">
            <span>
              <small>Streams</small>
              {{ selectedClassSummary.streams.join(', ') }}
            </span>
            <span>
              <small>Subjects</small>
              {{ selectedClassSummary.subjectCount }}
            </span>
            <span>
              <small>Students</small>
              {{ selectedClassSummary.studentCount }}
            </span>
            <span>
              <small>Average</small>
              {{ selectedClassSummary.average === null ? '--' : selectedClassSummary.average + '%' }}
            </span>
          </div>
        </section>
        <MarkSheet
          v-if="selectedAssignment"
          :subject="selectedAssignment"
          :can-manage-students="isAdmin"
          :can-manage-assessments="Boolean(teacher)"
          @changed="refreshSelectedSubject"
        />

        <ResultsModal
          v-if="showResultsModal"
          :selected-form="selectedAssignment?.form || null"
          :assignments="assignments"
          :selected-stream="selectedAssignment?.stream || ''"
          :report="resultsReport"
          :meta="resultsMeta"
          @close="showResultsModal = false"
          @generate="generateResults"
          @export-excel="exportResultsExcel"
          @export-pdf="exportResultsPdf"
        />
        <!-- <div v-else class="no-subjects">
          <h2>{{ isAdmin ? 'Set up class subjects' : 'No assigned subjects' }}</h2>
          <p v-if="isAdmin">
            Create classes and assign subjects to teachers.
          </p>
          <p v-else>
            {{ teacher ? 'This account is not returning any class subjects yet. Make sure the subject is assigned to this teacher in Supabase and the class_subjects policies are active.' : 'Ask an admin to assign a class subject to your account.' }}
          </p>
        </div> -->
      </main>

      <nav v-if="classTabs.length" class="bottom-class-nav" aria-label="Assigned class navigation">
        <button
          v-for="tab in classTabs"
          :key="tab.form"
          class="class-nav-item"
          :class="{ active: tab.form === selectedForm }"
          :aria-current="tab.form === selectedForm ? 'page' : undefined"
          @click="selectForm(tab.form)"
        >
          <span>Form {{ tab.form }}</span>
          <small>{{ tab.streams.join(', ') || 'No stream' }}</small>
        </button>
        <button class="class-nav-item results-nav-item" @click="showResultsModal = true">
          <span>Results</span>
          <small>Create report</small>
        </button>
      </nav>
    </template>
  </div>
</template>

<style scoped>
.app-shell {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  margin: 0;
  max-width: none;
}

.app-shell.has-bottom-nav {
  padding-bottom: calc(88px + env(safe-area-inset-bottom));
}

.app-header {
  position: relative;
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 14px;
  padding: max(18px, env(safe-area-inset-top)) 16px 14px;
  overflow: hidden;
}

.teacher-hero {
  min-height: 60vh;
  padding: max(22px, env(safe-area-inset-top)) 16px 28px;
  flex-direction: column;
  justify-content: space-between;
}

.teacher-hero::before {
  content: "";
  position: absolute;
  inset: -18px;
  background-image: var(--hero-back);
  background-position: center;
  background-size: cover;
  filter: blur(.6px);
  transform: scale(1.04);
  z-index: 0;
}

.teacher-hero::after {
  content: "";
  position: absolute;
  inset: 0;
  background:
    linear-gradient(90deg, rgba(255, 250, 245, 0.92) 0%, rgba(255, 250, 245, 0.78) 46%, rgba(255, 250, 245, 0.46) 100%),
    linear-gradient(180deg, rgba(38, 50, 70, 0.08) 0%, rgba(38, 50, 70, 0.42) 100%);
  z-index: 1;
}

.hero-content,
.teacher-chip,
.assignment-carousel {
  position: relative;
  z-index: 2;
}

.hero-content {
  max-width: 680px;
}

.school-brand-row {
  align-items: center;
  display: flex;
  gap: 14px;
  margin: 0 0 14px;
}

.school-logo {
  display: block;
  height: 64px;
  flex: 0 0 auto;
  margin: 0;
  object-fit: contain;
  width: 64px;
}

.welcome-line {
  color: var(--brand-orange);
  font-size: 0.95rem;
  font-weight: 800;
  margin: 0 0 8px;
}

.school-name {
  color: #4b607f;
  font-family: var(--font-mono);
  font-size: 1.60rem;
  font-weight: 800;
  letter-spacing: 0;
  margin: 0;
  text-transform: uppercase;
}

.app-header h1 {
  font-family: var(--font-display);
  font-size: clamp(1.60rem, 6vw, 2.25rem);
  font-weight: 800;
  margin: 0 0 8px;
  letter-spacing: 0;
  color: var(--brand-blue);
  line-height: 0.98;
}

.tagline {
  color: var(--ink);
  font-size: 1rem;
  font-weight: 700;
  margin: 0;
}

.teacher-chip {
  align-self: flex-end;
  background: rgba(255, 255, 255, 0.82);
  backdrop-filter: blur(14px);
  border: 1px solid rgba(75, 96, 127, 0.12);
  border-radius: 12px;
  color: var(--brand-blue);
  min-width: 128px;
  padding: 10px 12px;
  box-shadow: 0 12px 30px rgba(75, 96, 127, 0.14);
}

.teacher-label {
  display: block;
  color: var(--accent);
  font-family: var(--font-mono);
  font-size: 0.68rem;
  font-weight: 700;
  margin-bottom: 2px;
  text-transform: uppercase;
}

.assignment-carousel {
  align-self: stretch;
  width: 100%;
}

.assignment-swiper {
  overflow: visible;
  padding: 4px 0 34px;
}

.assignment-swiper :deep(.swiper-pagination) {
  bottom: 0;
  text-align: left;
}

.assignment-swiper :deep(.swiper-pagination-bullet) {
  background: rgba(75, 96, 127, 0.7);
  height: 7px;
  opacity: 0.62;
  width: 22px;
  border-radius: 999px;
}

.assignment-swiper :deep(.swiper-pagination-bullet-active) {
  background: var(--brand-orange);
  opacity: 1;
}

.assignment-card {
  appearance: none;
  background: rgba(255, 255, 255, 0.9);
  border: 1px solid rgba(255, 255, 255, 0.82);
  border-left: 6px solid var(--subject-color, var(--brand-orange));
  border-radius: 8px;
  box-shadow: 0 20px 52px rgba(38, 50, 70, 0.22);
  color: var(--ink);
  display: grid;
  gap: 9px;
  min-height: 184px;
  padding: 17px;
  text-align: left;
  width: 100%;
  transition: border-color 0.16s ease, box-shadow 0.16s ease, transform 0.16s ease;
}

.assignment-card:hover,
.assignment-card.selected {
  border-color: rgba(75, 96, 127, 0.28);
  box-shadow: 0 24px 58px rgba(38, 50, 70, 0.3);
  transform: translateY(-2px);
}

.card-class {
  color: var(--brand-orange);
  font-family: var(--font-mono);
  font-size: 0.72rem;
  font-weight: 800;
  text-transform: uppercase;
}

.assignment-card strong {
  color: var(--brand-blue);
  font-size: 1.28rem;
  line-height: 1.08;
}

.teacher-name {
  color: var(--muted);
  font-size: 0.84rem;
  font-weight: 700;
}

.card-rule {
  background: rgba(75, 96, 127, 0.14);
  height: 1px;
  width: 100%;
}

.card-metrics {
  display: grid;
  gap: 8px;
  grid-template-columns: repeat(3, minmax(0, 1fr));
}

.card-metrics span {
  background: rgba(75, 96, 127, 0.07);
  border: 1px solid rgba(75, 96, 127, 0.08);
  border-radius: 8px;
  color: var(--brand-blue);
  display: flex;
  flex-direction: column;
  font-size: 1.05rem;
  font-weight: 800;
  min-height: 58px;
  justify-content: center;
  padding: 8px;
}

.card-metrics small {
  color: var(--muted);
  font-size: 0.66rem;
  font-weight: 800;
  margin-bottom: 4px;
  text-transform: uppercase;
}

.setup-panel,
.main-panel {
  flex: 1;
  margin: 0 auto;
  max-width: 1180px;
  padding: 18px 10px;
  width: 100%;
}

.class-context {
  align-items: center;
  background: rgba(255, 250, 245, 0.82);
  border: 1px solid rgba(75, 96, 127, 0.12);
  border-radius: 8px;
  display: grid;
  gap: 14px;
  margin: 0 0 14px;
  padding: 14px;
}

.context-kicker {
  color: var(--brand-orange);
  font-family: var(--font-mono);
  font-size: 0.7rem;
  font-weight: 800;
  margin: 0 0 4px;
  text-transform: uppercase;
}

.class-context h2 {
  color: var(--brand-blue);
  font-family: var(--font-display);
  font-size: 1.32rem;
  margin: 0;
}

.context-metrics {
  display: grid;
  gap: 8px;
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

.context-metrics span {
  background: rgba(75, 96, 127, 0.07);
  border: 1px solid rgba(75, 96, 127, 0.08);
  border-radius: 8px;
  color: var(--brand-blue);
  display: grid;
  font-size: 0.95rem;
  font-weight: 800;
  min-height: 56px;
  padding: 8px 10px;
}

.context-metrics small {
  color: var(--muted);
  font-size: 0.66rem;
  font-weight: 800;
  margin-bottom: 4px;
  text-transform: uppercase;
}

.setup-panel {
  display: grid;
  place-items: start center;
}

.setup-card,
.no-subjects {
  background: var(--surface);
  backdrop-filter: blur(18px);
  color: var(--ink);
  border: 1px solid rgba(255, 255, 255, 0.74);
  border-radius: 20px;
  box-shadow: var(--shadow);
  padding: 24px 18px;
  max-width: 460px;
  width: 100%;
}

.setup-kicker {
  color: var(--accent-dim);
  font-family: var(--font-mono);
  font-size: 0.72rem;
  font-weight: 600;
  letter-spacing: 0;
  margin: 0 0 6px;
  text-transform: uppercase;
}

.setup-card h2,
.no-subjects h2 {
  font-family: var(--font-display);
  font-size: 1.45rem;
  color: var(--brand-blue);
  margin: 0 0 10px;
}

.setup-copy,
.no-subjects p {
  color: var(--muted);
  font-size: 0.9rem;
  margin: 0 0 20px;
}

.auth-error {
  background: rgba(183, 71, 53, 0.1);
  border: 1px solid rgba(183, 71, 53, 0.16);
  border-radius: 12px;
  color: var(--danger);
  font-size: 0.86rem;
  margin: 0 0 14px;
  padding: 10px 11px;
}

.auth-switch {
  background: transparent;
  border: none;
  color: var(--brand-blue);
  display: block;
  font-size: 0.9rem;
  font-weight: 700;
  margin: 14px auto 0;
  padding: 8px;
}

.no-subjects {
  margin: 0 auto;
  padding: 44px 22px;
  text-align: center;
}

.no-subjects .btn-primary {
  width: auto;
  display: inline-block;
  padding: 10px 20px;
}

.bottom-class-nav {
  align-items: center;
  background: rgba(255, 250, 245, 0.95);
  backdrop-filter: blur(18px);
  border-top: 1px solid rgba(75, 96, 127, 0.16);
  bottom: 0;
  box-shadow: 0 -14px 38px rgba(38, 50, 70, 0.16);
  display: flex;
  gap: 8px;
  left: 0;
  overflow-x: auto;
  padding: 10px 10px calc(10px + env(safe-area-inset-bottom));
  position: fixed;
  right: 0;
  scrollbar-width: thin;
  z-index: 30;
}

.class-nav-item {
  appearance: none;
  background: rgba(255, 255, 255, 0.76);
  border: 1px solid rgba(75, 96, 127, 0.14);
  border-radius: 8px;
  color: var(--brand-blue);
  display: grid;
  flex: 1 0 96px;
  gap: 3px;
  min-height: 58px;
  min-width: 96px;
  padding: 8px 10px;
  text-align: center;
}

.class-nav-item span {
  font-size: 0.9rem;
  font-weight: 900;
}

.class-nav-item small {
  color: var(--muted);
  font-family: var(--font-mono);
  font-size: 0.68rem;
  font-weight: 800;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.class-nav-item.active {
  background: var(--brand-orange);
  border-color: var(--brand-orange);
  color: var(--chalk);
}

.class-nav-item.active small {
  color: rgba(255, 250, 245, 0.86);
}

.results-nav-item {
  background: rgba(47, 143, 107, 0.12);
  border-color: rgba(47, 143, 107, 0.24);
  color: var(--good);
}

@media (max-width: 620px) {
  .app-header {
    flex-direction: column;
  }

  .teacher-hero {
    min-height: 60vh;
  }

  .teacher-chip {
    width: 100%;
  }

  .card-metrics {
    grid-template-columns: 1fr;
  }

  .assignment-card {
    min-height: 248px;
  }
}

@media (min-width: 760px) {
  .app-shell.has-bottom-nav {
    padding-bottom: calc(96px + env(safe-area-inset-bottom));
  }

  .app-header {
    padding: 30px 24px 22px;
  }

  .teacher-hero {
    padding: 34px 24px 34px;
  }

  .setup-panel,
  .main-panel {
    padding: 24px 24px 34px;
  }

  .setup-card,
  .no-subjects {
    padding: 36px 32px;
  }

  .class-context {
    grid-template-columns: minmax(140px, 0.7fr) 2fr;
    padding: 16px 18px;
  }

  .context-metrics {
    grid-template-columns: repeat(4, minmax(0, 1fr));
  }

  .bottom-class-nav {
    justify-content: center;
    padding-inline: 24px;
  }

  .class-nav-item {
    flex: 0 1 140px;
  }
}
</style>
