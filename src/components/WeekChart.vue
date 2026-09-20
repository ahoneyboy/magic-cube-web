<script setup>
/**
 * WeekChart.vue —— 近 7 天柱状图（时长，超阈值红标；家长报告复用）
 */
import { computed } from 'vue';
import { use } from 'echarts/core';
import { CanvasRenderer } from 'echarts/renderers';
import { BarChart } from 'echarts/charts';
import { GridComponent, MarkLineComponent } from 'echarts/components';
import VChart from 'vue-echarts';

use([CanvasRenderer, BarChart, GridComponent, MarkLineComponent]);

const props = defineProps({
  /** [{ date, minutes, solves, weekday?, isToday? }] */
  days: { type: Array, default: () => [] },
  /** 每日时长提醒阈值（分钟），超限红标 */
  limitMin: { type: Number, default: 30 },
  /** y 轴含义标签 */
  unit: { type: String, default: '分钟' }
});

const option = computed(() => {
  const days = props.days || [];
  const labels = days.map((d) => d.weekday || d.date.slice(5).replace('-', '/'));
  const values = days.map((d) => Math.round(d.minutes));
  const maxVal = Math.max(props.limitMin + 10, ...values, 10);
  return {
    grid: { left: 40, right: 12, top: 18, bottom: 24 },
    tooltip: {
      trigger: 'axis',
      formatter: (params) => {
        const p = params[0];
        const d = days[p.dataIndex];
        return `${d.date}<br/>${p.value} ${props.unit} · ${d.solves || 0} 次复原`;
      }
    },
    xAxis: {
      type: 'category',
      data: labels,
      axisLine: { lineStyle: { color: 'rgba(61,58,55,0.15)' } },
      axisTick: { show: false },
      axisLabel: {
        color: '#8A94A6',
        fontSize: 10,
        formatter: (label, i) => (days[i] && days[i].isToday ? '今天' : label)
      }
    },
    yAxis: {
      type: 'value',
      max: maxVal,
      axisLabel: { color: '#8A94A6', fontSize: 10 },
      splitLine: { lineStyle: { color: 'rgba(61,58,55,0.07)' } }
    },
    series: [
      {
        type: 'bar',
        data: values.map((v) => ({
          value: v,
          itemStyle: {
            color: v > props.limitMin ? '#FF8787' : '#A5D8FF',
            borderRadius: [4, 4, 0, 0]
          }
        })),
        barWidth: '46%',
        markLine: {
          silent: true,
          symbol: 'none',
          data: [{ yAxis: props.limitMin }],
          lineStyle: { color: 'rgba(224,49,49,0.5)', type: 'dashed' },
          label: { formatter: props.limitMin + ' ' + props.unit, fontSize: 10, color: '#E03131', position: 'insideEndTop' }
        }
      }
    ]
  };
});
</script>

<template>
  <div class="h-52 w-full">
    <VChart :option="option" autoresize />
  </div>
</template>
