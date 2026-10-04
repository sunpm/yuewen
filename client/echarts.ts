import { use } from 'echarts/core'
import {
  BarChart,
  LineChart,
  PieChart,
  RadarChart,
  TreemapChart,
  HeatmapChart,
  ScatterChart,
} from 'echarts/charts'
import {
  GridComponent,
  TooltipComponent,
  LegendComponent,
  RadarComponent,
  VisualMapComponent,
  AriaComponent,
  CalendarComponent,
  TitleComponent,
} from 'echarts/components'
import { SVGRenderer } from 'echarts/renderers'
use([
  BarChart,
  LineChart,
  PieChart,
  RadarChart,
  TreemapChart,
  HeatmapChart,
  ScatterChart,
  GridComponent,
  TooltipComponent,
  LegendComponent,
  RadarComponent,
  VisualMapComponent,
  AriaComponent,
  CalendarComponent,
  TitleComponent,
  SVGRenderer,
])
export { init } from 'echarts/core'
