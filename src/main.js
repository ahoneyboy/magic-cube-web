import { createApp } from 'vue';
import { createPinia } from 'pinia';
import App from './App.vue';
import { router } from './router/index.js';
import './style.css';
import { useSettingsStore } from './stores/settings.js';
import { useRecordsStore } from './stores/records.js';
import { useLessonsStore } from './stores/lessons.js';
import { useGameStore } from './stores/game.js';
import { useUiStore } from './stores/ui.js';

const app = createApp(App);
const pinia = createPinia();
app.use(pinia);

async function boot() {
  // 数据层先于路由挂载：所有页面可以直接读 store
  await Promise.all([
    useSettingsStore().init(),
    useRecordsStore().init(),
    useLessonsStore().init(),
    useGameStore().init()
  ]);
  const ui = useUiStore();
  ui.startPlaytimeHeartbeat();
  app.use(router);
  app.mount('#app');
}

boot();
