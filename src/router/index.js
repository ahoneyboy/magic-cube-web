import { createRouter, createWebHashHistory } from 'vue-router';

const routes = [
  { path: '/', name: 'home', component: () => import('../views/HomeView.vue'), meta: { tab: true } },
  { path: '/play', name: 'play', component: () => import('../views/PlayView.vue') },
  { path: '/timer', name: 'timer', component: () => import('../views/TimerView.vue') },
  { path: '/wca', name: 'wca', component: () => import('../views/WcaView.vue') },
  { path: '/scan', name: 'scan', component: () => import('../views/ScanView.vue') },
  { path: '/stats', name: 'stats', component: () => import('../views/StatsView.vue') },
  { path: '/learn', name: 'learn', component: () => import('../views/LearnView.vue'), meta: { tab: true } },
  { path: '/lesson/:id', name: 'lesson', component: () => import('../views/LessonView.vue') },
  { path: '/formula', name: 'formula', component: () => import('../views/FormulaView.vue') },
  { path: '/zbll', name: 'zbll', component: () => import('../views/ZbllView.vue') },
  { path: '/mine', name: 'mine', component: () => import('../views/MineView.vue'), meta: { tab: true } },
  { path: '/parent', name: 'parent', component: () => import('../views/ParentView.vue') }
];

export const router = createRouter({
  history: createWebHashHistory(),
  routes,
  scrollBehavior() {
    return { top: 0 };
  }
});
