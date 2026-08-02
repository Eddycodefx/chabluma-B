<script setup>
defineProps({
  subjects: { type: Array, required: true },
  selectedId: { type: [String, Number], default: null },
  canAdd: { type: Boolean, default: true },
  canDelete: { type: Boolean, default: true }
})
const emit = defineEmits(['select', 'add', 'delete'])
</script>

<template>
  <div class="tabs-row">
    <button
      v-for="s in subjects"
      :key="s.id"
      class="tab"
      :class="{ active: s.id === selectedId }"
      :style="{ '--tab-color': s.color }"
      @click="emit('select', s.id)"
    >
      <span class="tab-name">
        {{ s.subjectName }}
        <small>Form {{ s.form }}{{ s.stream }}</small>
      </span>
      <span
        class="tab-close"
        v-if="canDelete"
        title="Delete subject"
        @click.stop="emit('delete', s)"
      >×</span>
    </button>
    <button v-if="canAdd" class="tab tab-add" @click="emit('add')">
      <span class="plus">+</span> Add class
    </button>
  </div>
</template>

<style scoped>
.tabs-row {
  display: flex;
  align-items: stretch;
  gap: 10px;
  padding: 2px 10px 12px;
  overflow-x: auto;
  scroll-padding-inline: 10px;
  scrollbar-width: thin;
}

.tab {
  position: relative;
  display: flex;
  align-items: center;
  gap: 8px;
  border: 1px solid rgba(75, 96, 127, 0.14);
  background: rgba(255, 255, 255, 0.54);
  color: var(--brand-blue);
  font-family: var(--font-body);
  font-size: 0.88rem;
  font-weight: 700;
  padding: 10px 12px;
  border-radius: 16px;
  white-space: nowrap;
  min-height: 56px;
  opacity: 1;
  transition: transform 0.15s ease, background 0.15s ease, border-color 0.15s ease;
  border-left: 5px solid var(--tab-color, var(--accent));
  box-shadow: 0 10px 24px rgba(75, 96, 127, 0.08);
}

.tab:hover {
  transform: translateY(-1px);
}

.tab.active {
  background: var(--brand-blue);
  color: var(--ink);
  color: var(--chalk);
  border-color: var(--brand-blue);
  box-shadow: 0 14px 30px rgba(75, 96, 127, 0.24);
}

.tab-close {
  align-items: center;
  background: rgba(255, 255, 255, 0.42);
  border-radius: 999px;
  display: inline-flex;
  height: 24px;
  justify-content: center;
  opacity: 0.8;
  width: 24px;
  font-size: 1.05rem;
  line-height: 1;
  padding: 0;
  color: currentColor;
}

.tab-name {
  display: inline-flex;
  flex-direction: column;
  gap: 2px;
  text-align: left;
}

.tab-name small {
  color: currentColor;
  font-family: var(--font-mono);
  font-size: 0.7rem;
  font-weight: 600;
  opacity: 0.76;
}

.tab-close:hover {
  opacity: 1 !important;
  background: rgba(243, 112, 30, 0.18);
}

.tab-add {
  background: var(--brand-orange);
  border-color: var(--brand-orange);
  border-left-color: var(--brand-orange);
  color: var(--chalk);
  font-weight: 800;
}

.tab-add:hover {
  background: var(--accent-dim);
}

.plus {
  color: currentColor;
  font-weight: 700;
}

@media (min-width: 760px) {
  .tabs-row {
    padding: 4px 24px 14px;
  }
}
</style>
