<script setup>
/**
 * RecordChart.vue —— 成绩趋势图（ECharts 折线：网格 + 渐变面积 + 均值参考线 + PB 标记，≤20 点）
 */
import { computed } from 'vue';
import { use } from 'echarts/core';
import { CanvasRenderer } from 'echarts/renderers';
import { LineChart } from 'echarts/charts';
import { GridComponent, MarkLineComponent } from 'echarts/components';
import VChart from 'vue-echarts';
import * as wca from '../engine/wcaRules.js';

use([CanvasRenderer, LineChart, GridComponent, MarkLineComponent]);

const props = defineProps({
  /** 有效成绩（毫秒，时间顺序） */
  times: { type: Array, default: () => [] }
});

const option = computed(() => {
  const times = props.times || [];
  if (times.length < 2) {
    return {
      textStyle: { color: '#8A94A6', fontSize: 12 },
      graphic: []
    };
  }
  const labels = times.map((_, i) => '#' + (i + 1));
  const avg = times.reduce((a, b) => a + b, 0) / times.length;
  const pb = Math.min(...times);
  return {
    grid: { left: 56, right: 16, top: 18, bottom: 24 },
    tooltip: {
      trigger: 'axis',
      formatter: (params) => {
        const p = params[0];
        return `${p.name}<br/>${wca.formatMs(p.value)}${p.value === pb ? ' · PB 🏆' : ''}`;
      }
    },
    xAxis: {
      type: 'category',
      data: labels,
      axisLine: { lineStyle: { color: 'rgba(61,58,55,0.15)' } },
      axisTick: { show: false },
      axisLabel: { color: '#8A94A6', fontSize: 10 }
    },
    yAxis: {
      type: 'value',
      axisLabel: {
        color: '#8A94A6',
        fontSize: 10,
        formatter: (v) => wca.formatMs(v)
      },
      splitLine: { lineStyle: { color: 'rgba(61,58,55,0.07)' } },
      scale: true
    },
    series: [
      {
        type: 'line',
        data: times,
        smooth: true,
        symbol: 'circle',
        symbolSize: 6,
        lineStyle: { color: '#FF8A3D', width: 2 },
        itemStyle: {
          color: (p) => (p.value === pb ? '#37B24D' : '#FF8A3D'),
          borderColor: '#fff',
          borderWidth: 1
        },
        areaStyle: {
          color: {
            type: 'linear', x: 0, y: 0, x2: 0, y2: 1,
            colorStops: [
              { offset: 0, color: 'rgba(255,138,61,0.28)' },
              { offset: 1, color: 'rgba(255,138,61,0.02)' }
            ]
          }
        },
        markPoint: {
          data: [{ coord: [times.indexOf(pb), pb], value: 'PB' }],
          symbolSize: 0.1,
          label: {
            show: true,
            formatter: 'PB ' + wca.formatMs(pb),
            color: '#2B8A3E',
            fontSize: 10,
            fontWeight: 'bold',
            position: 'top'
          },
          itemStyle: { color: 'transparent' }
        },
        markLine: {
          silent: true,
          symbol: 'none',
          data: [{ yAxis: avg }],
          lineStyle: { color: 'rgba(25,113,194,0.55)', type: 'dashed' },
          label: {
            formatter: '均 ' + wca.formatMs(avg),
            color: 'rgba(25,113,194,0.85)',
            fontSize: 10,
            position: 'insideStartTop'
          }
        }
      }
    ]
  };
});
</script>

<template>
  <div class="h-56 w-full md:h-64">
    <VChart v-if="times.length >= 2" :option="option" autoresize />
    <div v-else class="flex h-full items-center justify-center text-xs text-faint">
      {{ times.length === 1 ? '再测一次就有曲线啦 🎈' : '还没有成绩，去玩一局吧 🎲' }}
    </div>
  </div>
</template>
