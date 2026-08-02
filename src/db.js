import { supabase } from './supabase.js'

async function currentUserId() {
  const { data, error } = await supabase.auth.getUser()
  if (error) throw error
  if (!data.user) throw new Error('You must sign in first.')
  return data.user.id
}

function throwIfError(error) {
  if (error) throw error
}

function profileFromRow(row) {
  return {
    id: row.id,
    userId: row.user_id,
    schoolName: row.school_name,
    name: row.full_name,
    phone: row.phone || '',
    role: row.role || 'teacher',
    updatedAt: row.updated_at ? new Date(row.updated_at).getTime() : null
  }
}

function classFromRow(row) {
  return {
    id: row.id,
    form: row.form,
    stream: row.stream,
    createdAt: new Date(row.created_at).getTime()
  }
}

function classSubjectFromRow(row, teacher = null) {
  const schoolClass = row.school_classes || row.school_class || {}
  return {
    id: row.id,
    classId: row.class_id,
    subjectName: row.subject_name,
    teacherId: row.teacher_id,
    teacherName: teacher?.name || 'Unassigned',
    form: schoolClass.form,
    stream: schoolClass.stream,
    color: row.color,
    createdAt: new Date(row.created_at).getTime()
  }
}

function studentFromRow(row, classSubjectId = null) {
  return {
    id: row.id,
    subjectId: classSubjectId,
    classId: row.class_id,
    name: row.full_name,
    admissionNumber: row.admission_number,
    sex: row.sex,
    createdAt: new Date(row.created_at).getTime()
  }
}

function assessmentFromRow(row) {
  return {
    id: row.id,
    subjectId: row.class_subject_id,
    label: row.label,
    maxScore: row.max_score,
    order: row.sort_order,
    createdAt: new Date(row.created_at).getTime()
  }
}

function gradeFromRow(row) {
  return {
    id: row.id,
    studentId: row.student_id,
    assessmentId: row.assessment_id,
    subjectId: row.class_subject_id,
    score: row.score
  }
}

async function getClassSubject(classSubjectId) {
  const { data, error } = await supabase
    .from('class_subjects')
    .select('id, class_id')
    .eq('id', classSubjectId)
    .single()
  throwIfError(error)
  return data
}

async function getProfilesByUserIds(userIds) {
  const ids = [...new Set(userIds.filter(Boolean))]
  if (!ids.length) return new Map()
  const { data, error } = await supabase
    .from('teacher_profiles')
    .select('*')
    .in('user_id', ids)
  throwIfError(error)
  return new Map(data.map(row => [row.user_id, profileFromRow(row)]))
}

// ---------- Auth ----------
export function onAuthStateChange(callback) {
  return supabase.auth.onAuthStateChange((_event, session) => callback(session))
}

export async function getSession() {
  const { data, error } = await supabase.auth.getSession()
  throwIfError(error)
  return data.session
}

export async function signInWithPassword({ email, password }) {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password })
  throwIfError(error)
  return data
}

export async function signUpWithPassword({ email, password }) {
  const { data, error } = await supabase.auth.signUp({ email, password })
  throwIfError(error)
  return data
}

export async function signOut() {
  const { error } = await supabase.auth.signOut()
  throwIfError(error)
}

// ---------- Teacher profile ----------
export async function getTeacherProfile() {
  const userId = await currentUserId()
  const { data, error } = await supabase
    .from('teacher_profiles')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle()
  throwIfError(error)
  return data ? profileFromRow(data) : null
}

export async function saveTeacherProfile(profile) {
  const userId = await currentUserId()
  const existing = await getTeacherProfile()
  if (existing) {
    const { data, error } = await supabase
      .from('teacher_profiles')
      .update({
        full_name: profile.name,
        phone: profile.phone || '',
        updated_at: new Date().toISOString()
      })
      .eq('user_id', userId)
      .select('*')
      .single()
    throwIfError(error)
    return profileFromRow(data)
  }

  const { data, error } = await supabase
    .from('teacher_profiles')
    .insert({
      user_id: userId,
      school_name: 'Wenda High School',
      full_name: profile.name,
      phone: profile.phone || '',
      role: 'teacher'
    })
    .select('*')
    .single()
  throwIfError(error)
  return profileFromRow(data)
}

// ---------- Admin ----------
export async function getTeachers() {
  const { data, error } = await supabase
    .from('teacher_profiles')
    .select('*')
    .order('full_name', { ascending: true })
  throwIfError(error)
  return data.map(profileFromRow)
}

export async function getClasses() {
  const { data, error } = await supabase
    .from('school_classes')
    .select('*')
    .order('form', { ascending: true })
    .order('stream', { ascending: true })
  throwIfError(error)
  return data.map(classFromRow)
}

export async function addClass({ form, stream }) {
  const userId = await currentUserId()
  const { data, error } = await supabase
    .from('school_classes')
    .upsert({ form, stream, created_by: userId }, { onConflict: 'form,stream' })
    .select('*')
    .single()
  throwIfError(error)
  return classFromRow(data)
}

export async function deleteClass(classId) {
  const { error } = await supabase
    .from('school_classes')
    .delete()
    .eq('id', classId)
  throwIfError(error)
}

export async function getAllClassSubjects() {
  const { data, error } = await supabase
    .from('class_subjects')
    .select('*, school_classes(*)')
    .order('created_at', { ascending: true })
  throwIfError(error)
  const teachers = await getProfilesByUserIds(data.map(row => row.teacher_id))
  return data.map(row => classSubjectFromRow(row, teachers.get(row.teacher_id)))
}

export async function addClassSubject({ classId, subjectName, teacherId, color }) {
  const userId = await currentUserId()
  const { data, error } = await supabase
    .from('class_subjects')
    .upsert({
      class_id: classId,
      subject_name: subjectName,
      teacher_id: teacherId || null,
      color,
      created_by: userId
    }, { onConflict: 'class_id,subject_name' })
    .select('*, school_classes(*)')
    .single()
  throwIfError(error)
  const teachers = await getProfilesByUserIds([data.teacher_id])
  return classSubjectFromRow(data, teachers.get(data.teacher_id))
}

export async function deleteClassSubject(classSubjectId) {
  const { error } = await supabase
    .from('class_subjects')
    .delete()
    .eq('id', classSubjectId)
  throwIfError(error)
}

// ---------- Teacher assigned class subjects ----------
export async function getAssignments() {
  const { data, error } = await supabase
    .from('class_subjects')
    .select('*, school_classes(*)')
    .order('created_at', { ascending: true })
  throwIfError(error)
  const teachers = await getProfilesByUserIds(data.map(row => row.teacher_id))
  return data.map(row => classSubjectFromRow(row, teachers.get(row.teacher_id)))
}

export async function getAssignmentStats(classSubjectIds) {
  const stats = {}
  await Promise.all(classSubjectIds.map(async classSubjectId => {
    const [students, assessments, grades] = await Promise.all([
      getStudents(classSubjectId),
      getAssessments(classSubjectId),
      getGradesForSubject(classSubjectId)
    ])
    const scoreByAssessment = new Map(grades.map(grade => [grade.assessmentId, grade.score]))
    const assessmentById = new Map(assessments.map(assessment => [assessment.id, assessment]))
    const studentAverages = students.map(student => {
      const entries = grades
        .filter(grade => grade.studentId === student.id)
        .map(grade => {
          const assessment = assessmentById.get(grade.assessmentId)
          return assessment ? (grade.score / assessment.maxScore) * 100 : null
        })
        .filter(value => value !== null)
      if (!entries.length) return null
      return entries.reduce((sum, value) => sum + value, 0) / entries.length
    }).filter(value => value !== null)
    const completedAssessments = assessments.filter(assessment => scoreByAssessment.has(assessment.id)).length
    const classAverage = studentAverages.length
      ? Math.round((studentAverages.reduce((sum, value) => sum + value, 0) / studentAverages.length) * 10) / 10
      : null

    stats[classSubjectId] = {
      studentCount: students.length,
      assessmentCount: assessments.length,
      completedAssessments,
      classAverage
    }
  }))
  return stats
}

export async function addAssignment(payload) {
  return addClassSubject({
    classId: payload.classId,
    subjectName: payload.subjectName,
    teacherId: payload.teacherId,
    color: payload.color
  })
}

export async function deleteAssignment(assignmentId) {
  return deleteClassSubject(assignmentId)
}

// ---------- Students ----------
export async function getStudents(classSubjectId) {
  const classSubject = await getClassSubject(classSubjectId)
  const { data, error } = await supabase
    .from('students')
    .select('*')
    .eq('class_id', classSubject.class_id)
    .order('admission_number', { ascending: true })
    .order('created_at', { ascending: true })
  throwIfError(error)
  return data.map(row => studentFromRow(row, classSubjectId))
}

export async function addStudent({ subjectId, name, admissionNumber, sex }) {
  const userId = await currentUserId()
  const classSubject = await getClassSubject(subjectId)
  const { data, error } = await supabase
    .from('students')
    .insert({
      class_id: classSubject.class_id,
      full_name: name,
      admission_number: admissionNumber || null,
      sex: sex || null,
      created_by: userId
    })
    .select('*')
    .single()
  throwIfError(error)
  return studentFromRow(data, subjectId)
}

export async function importStudents(classSubjectId, rows) {
  const userId = await currentUserId()
  const classSubject = await getClassSubject(classSubjectId)
  const normalized = []
  let skipped = 0

  for (const row of rows) {
    const admissionNumber = String(row.admissionNumber || '').trim()
    const name = String(row.name || '').trim()
    const rawSex = String(row.sex || '').trim().toUpperCase()
    const sex = rawSex === 'FEMALE' ? 'F' : rawSex === 'MALE' ? 'M' : rawSex
    if (!admissionNumber || !name || !['F', 'M'].includes(sex)) {
      skipped += 1
      continue
    }
    normalized.push({
      class_id: classSubject.class_id,
      admission_number: admissionNumber,
      full_name: name,
      sex,
      created_by: userId
    })
  }

  if (!normalized.length) return { added: 0, updated: 0, skipped }

  const { data: existing, error: existingError } = await supabase
    .from('students')
    .select('admission_number')
    .eq('class_id', classSubject.class_id)
    .in('admission_number', normalized.map(row => row.admission_number))
  throwIfError(existingError)

  const existingAdmissions = new Set(existing.map(row => String(row.admission_number).toLowerCase()))
  const { error } = await supabase
    .from('students')
    .upsert(normalized, { onConflict: 'class_id,admission_number' })
  throwIfError(error)

  const updated = normalized.filter(row => existingAdmissions.has(row.admission_number.toLowerCase())).length
  const added = normalized.length - updated
  return { added, updated, skipped }
}

export async function deleteStudent(studentId) {
  const { error } = await supabase
    .from('students')
    .delete()
    .eq('id', studentId)
  throwIfError(error)
}

// ---------- Assessments ----------
export async function getAssessments(classSubjectId) {
  const { data, error } = await supabase
    .from('assessments')
    .select('*')
    .eq('class_subject_id', classSubjectId)
    .order('sort_order', { ascending: true })
  throwIfError(error)
  return data.map(assessmentFromRow)
}

export async function addAssessment({ subjectId, label, maxScore }) {
  const userId = await currentUserId()
  const { count, error: countError } = await supabase
    .from('assessments')
    .select('*', { count: 'exact', head: true })
    .eq('class_subject_id', subjectId)
  throwIfError(countError)

  const { data, error } = await supabase
    .from('assessments')
    .insert({
      class_subject_id: subjectId,
      label,
      max_score: maxScore,
      sort_order: count || 0,
      created_by: userId
    })
    .select('*')
    .single()
  throwIfError(error)
  return assessmentFromRow(data)
}

export async function deleteAssessment(assessmentId) {
  const { error } = await supabase
    .from('assessments')
    .delete()
    .eq('id', assessmentId)
  throwIfError(error)
}

// ---------- Grades ----------
export async function getGradesForSubject(classSubjectId) {
  const { data, error } = await supabase
    .from('grades')
    .select('*')
    .eq('class_subject_id', classSubjectId)
  throwIfError(error)
  return data.map(gradeFromRow)
}

export async function setGrade({ studentId, assessmentId, subjectId, score }) {
  const userId = await currentUserId()
  const blank = score === null || score === '' || Number.isNaN(score)
  if (blank) {
    const { error } = await supabase
      .from('grades')
      .delete()
      .eq('student_id', studentId)
      .eq('assessment_id', assessmentId)
    throwIfError(error)
    return null
  }
  const cappedScore = Math.min(Math.max(Number(score), 0), 100)

  const { data, error } = await supabase
    .from('grades')
    .upsert({
      class_subject_id: subjectId,
      student_id: studentId,
      assessment_id: assessmentId,
      score: cappedScore,
      updated_by: userId,
      updated_at: new Date().toISOString()
    }, { onConflict: 'student_id,assessment_id' })
    .select('id')
    .single()
  throwIfError(error)
  return data.id
}
