<script setup>
import { ref, onMounted } from 'vue'
import {
  getTeachers,
  getClasses,
  addClass,
  deleteClass,
  getAllClassSubjects,
  addClassSubject,
  deleteClassSubject
} from '../db.js'

const emit = defineEmits(['changed'])

const COLORS = ['#f3701e', '#4b607f', '#2f8f6b', '#b74735', '#7a5c9e', '#c08a2c']
const FORMS = [1, 2, 3, 4]
const STREAMS = ['A', 'B', 'C']

const teachers = ref([])
const classes = ref([])
const classSubjects = ref([])
const form = ref(1)
const stream = ref('A')
const classId = ref('')
const subjectName = ref('')
const teacherId = ref('')
const color = ref(COLORS[0])
const message = ref('')

async function loadAdminData() {
  const [teacherRows, classRows, subjectRows] = await Promise.all([
    getTeachers(),
    getClasses(),
    getAllClassSubjects()
  ])
  teachers.value = teacherRows.filter(teacher => teacher.role === 'teacher' || teacher.role === 'admin')
  classes.value = classRows
  classSubjects.value = subjectRows
  if (!classId.value && classes.value.length) classId.value = classes.value[0].id
}

onMounted(loadAdminData)

async function handleAddClass() {
  await addClass({ form: Number(form.value), stream: stream.value })
  message.value = `Form ${form.value}${stream.value} is ready.`
  await loadAdminData()
  emit('changed')
}

async function handleDeleteClass(row) {
  if (!confirm(`Delete Form ${row.form}${row.stream}? This deletes its roster, subjects, assessments, and grades.`)) return
  await deleteClass(row.id)
  message.value = `Deleted Form ${row.form}${row.stream}.`
  classId.value = ''
  await loadAdminData()
  emit('changed')
}

async function handleAddSubject() {
  if (!classId.value || !subjectName.value.trim()) return
  await addClassSubject({
    classId: classId.value,
    subjectName: subjectName.value.trim(),
    teacherId: teacherId.value || null,
    color: color.value
  })
  message.value = 'Class subject saved.'
  subjectName.value = ''
  await loadAdminData()
  emit('changed')
}

async function handleDeleteSubject(row) {
  if (!confirm(`Remove ${row.subjectName} from Form ${row.form}${row.stream}?`)) return
  await deleteClassSubject(row.id)
  message.value = 'Class subject removed.'
  await loadAdminData()
  emit('changed')
}
</script>

<template>
  <section class="admin-panel">
    <div class="admin-head">
      <div>
        <p class="admin-kicker">Admin</p>
        <h2>School setup</h2>
      </div>
      <span>{{ classes.length }} classes</span>
    </div>

    <p v-if="message" class="admin-message">{{ message }}</p>

    <div class="admin-block">
      <h3>Classes</h3>
      <div class="inline-grid">
        <select v-model="form">
          <option v-for="f in FORMS" :key="f" :value="f">Form {{ f }}</option>
        </select>
        <select v-model="stream">
          <option v-for="s in STREAMS" :key="s" :value="s">Stream {{ s }}</option>
        </select>
        <button class="btn-primary" @click="handleAddClass">Save</button>
      </div>
      <div class="pill-list">
        <button
          v-for="row in classes"
          :key="row.id"
          class="class-pill"
          @click="classId = row.id"
        >
          Form {{ row.form }}{{ row.stream }}
          <span @click.stop="handleDeleteClass(row)">×</span>
        </button>
      </div>
    </div>

    <div class="admin-block">
      <h3>Assign subject</h3>
      <div class="field">
        <label for="admin-class">Class</label>
        <select id="admin-class" v-model="classId">
          <option value="" disabled>Select class</option>
          <option v-for="row in classes" :key="row.id" :value="row.id">
            Form {{ row.form }}{{ row.stream }}
          </option>
        </select>
      </div>
      <div class="field">
        <label for="admin-subject">Subject</label>
        <input id="admin-subject" v-model="subjectName" type="text" placeholder="e.g. Mathematics" />
      </div>
      <div class="field">
        <label for="admin-teacher">Teacher</label>
        <select id="admin-teacher" v-model="teacherId">
          <option value="">Unassigned</option>
          <option v-for="teacher in teachers" :key="teacher.userId" :value="teacher.userId">
            {{ teacher.name }} · {{ teacher.role }}
          </option>
        </select>
      </div>
      <div class="color-swatches compact-swatches">
        <button
          v-for="c in COLORS"
          :key="c"
          class="color-swatch"
          :class="{ selected: color === c }"
          :style="{ background: c }"
          @click="color = c"
        />
      </div>
      <button class="btn-primary" :disabled="!classId || !subjectName.trim()" @click="handleAddSubject">
        Save subject
      </button>
    </div>

    <div class="admin-block">
      <h3>Class subjects</h3>
      <div v-if="!classSubjects.length" class="empty-admin">No class subjects yet.</div>
      <div v-else class="subject-list">
        <div v-for="row in classSubjects" :key="row.id" class="subject-row">
          <span :style="{ background: row.color }"></span>
          <div>
            <strong>{{ row.subjectName }}</strong>
            <small>Form {{ row.form }}{{ row.stream }} · {{ row.teacherName }}</small>
          </div>
          <button @click="handleDeleteSubject(row)">×</button>
        </div>
      </div>
    </div>
  </section>
</template>

<style scoped>
.admin-panel {
  background: var(--surface);
  border: 1px solid rgba(255, 255, 255, 0.74);
  border-radius: 22px;
  box-shadow: var(--shadow);
  margin-bottom: 14px;
  padding: 16px 14px;
}

.admin-head {
  align-items: flex-start;
  display: flex;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 12px;
}

.admin-kicker {
  color: var(--brand-orange);
  font-family: var(--font-mono);
  font-size: 0.72rem;
  font-weight: 800;
  margin: 0 0 4px;
  text-transform: uppercase;
}

.admin-head h2,
.admin-block h3 {
  color: var(--brand-blue);
  margin: 0;
}

.admin-head h2 {
  font-size: 1.32rem;
}

.admin-head span {
  color: var(--muted);
  font-size: 0.82rem;
  font-weight: 700;
}

.admin-message {
  background: rgba(47, 143, 107, 0.1);
  border: 1px solid rgba(47, 143, 107, 0.18);
  border-radius: 12px;
  color: var(--good);
  font-size: 0.84rem;
  margin: 0 0 12px;
  padding: 9px 10px;
}

.admin-block {
  border-top: 1px solid rgba(75, 96, 127, 0.12);
  padding-top: 14px;
  margin-top: 14px;
}

.admin-block h3 {
  font-size: 0.96rem;
  margin-bottom: 10px;
}

.inline-grid {
  display: grid;
  gap: 8px;
  grid-template-columns: 1fr 1fr auto;
}

.inline-grid select,
.field select,
.field input {
  min-width: 0;
}

.pill-list {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 10px;
}

.class-pill {
  align-items: center;
  background: #fff;
  border: 1px solid rgba(75, 96, 127, 0.14);
  border-radius: 999px;
  color: var(--brand-blue);
  display: inline-flex;
  font-weight: 800;
  gap: 8px;
  padding: 8px 10px;
}

.class-pill span,
.subject-row button {
  color: var(--danger);
  font-weight: 800;
}

.compact-swatches {
  margin: 0 0 14px;
}

.subject-list {
  display: grid;
  gap: 8px;
}

.subject-row {
  align-items: center;
  background: rgba(255, 255, 255, 0.62);
  border: 1px solid rgba(75, 96, 127, 0.12);
  border-radius: 14px;
  display: grid;
  gap: 10px;
  grid-template-columns: auto 1fr auto;
  padding: 10px;
}

.subject-row > span {
  border-radius: 999px;
  height: 34px;
  width: 6px;
}

.subject-row strong,
.subject-row small {
  display: block;
}

.subject-row small {
  color: var(--muted);
  font-size: 0.78rem;
  margin-top: 2px;
}

.subject-row button {
  background: transparent;
  border: none;
  font-size: 1.2rem;
}

.empty-admin {
  color: var(--muted);
  font-size: 0.88rem;
}
</style>
