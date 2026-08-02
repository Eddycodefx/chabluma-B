<script setup>
defineProps({ title: String })
const emit = defineEmits(['close'])
</script>

<template>
  <div class="overlay" @click.self="emit('close')">
    <div class="card" role="dialog" aria-modal="true">
      <div class="card-head">
        <h2>{{ title }}</h2>
        <button class="close-btn" aria-label="Close" @click="emit('close')">&times;</button>
      </div>
      <div class="card-body">
        <slot />
      </div>
    </div>
  </div>
</template>

<style scoped>
.overlay {
  position: fixed;
  inset: 0;
  background: rgba(38, 50, 70, 0.44);
  display: flex;
  align-items: flex-end;
  justify-content: center;
  padding: 14px;
  z-index: 50;
}

.card {
  background: var(--surface-strong);
  color: var(--ink);
  border: 1px solid rgba(255, 255, 255, 0.74);
  border-radius: 24px 24px 18px 18px;
  width: 100%;
  max-width: 400px;
  box-shadow: var(--shadow);
}

.card-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 18px 18px 0;
}

.card-head h2 {
  font-family: var(--font-display);
  font-size: 1.28rem;
  font-weight: 800;
  color: var(--brand-blue);
  margin: 0;
}

.close-btn {
  background: rgba(75, 96, 127, 0.08);
  border: none;
  border-radius: 999px;
  font-size: 1.25rem;
  height: 36px;
  line-height: 1;
  color: var(--muted);
  padding: 0;
  width: 36px;
}
.close-btn:hover { color: var(--mark); }

.card-body {
  padding: 16px 18px calc(18px + env(safe-area-inset-bottom));
}

@media (min-width: 620px) {
  .overlay {
    align-items: center;
    padding: 20px;
  }

  .card {
    border-radius: 20px;
  }

  .card-head {
    padding: 20px 22px 0;
  }

  .card-body {
    padding: 16px 22px 22px;
  }
}
</style>
