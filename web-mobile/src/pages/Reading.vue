<script setup lang="ts">
import MonthDetail from '@client/components/MonthDetail.vue'
import ReportInsights from '@client/components/ReportInsights.vue'
import ConnectionNotice from '@client/components/ConnectionNotice.vue'
import { duration, mergeBookDetail } from '@shared/report'
import type { Book, RangeKey } from '@shared/report'
import { useReadingReport } from '@client/useReadingReport'
import { useReportViewState } from '@client/useReportViewState'
import { showToast } from 'vant'
import 'vant/es/toast/style'
const route = useRoute(),
  router = useRouter()
const demo = computed(() => route.path === '/demo')
const view = computed(() =>
  demo.value ? String(route.query.view ?? 'overview') : route.path.slice(1),
)
const {
  range,
  displayRange,
  collectionStatus,
  years,
  conflict,
  confirmReplacement,
  dismissConflict,
  task,
  report,
  busy,
  error,
  errorCode,
  collect,
  cancel,
  retry,
  touch,
  isSample,
  source,
  sourceLabel,
  bookDetail,
  switchSample,
  canUseDevelopment,
} = useReadingReport(demo)
const ranges = computed(() => [
  { name: '最近 24 个月', key: 'recent' },
  { name: '本周', key: 'weekly' },
  { name: '本月', key: 'monthly' },
  ...years.value.map((y) => ({ name: `${y} 年`, key: String(y) })),
  { name: '全部历史', key: 'overall' },
])
const rangeOpen = ref(false),
  exportOpen = ref(false),
  progressOpen = ref(false),
  exportNotes = ref(false),
  exporting = ref(false)
const section = ref('时间'),
  search = ref(''),
  category = ref('全部'),
  kind = ref('全部'),
  sort = ref('recent')
const noteBook = ref('全部'),
  noteType = ref('全部'),
  month = ref(''),
  noteLimit = ref(24)
const selected = ref<Book | null>(null),
  detailsOpen = ref(false),
  detailMessage = ref('')
const title = computed(
  () =>
    ({
      overview: '我的阅读档案',
      report: '沿着阅读，看见自己',
      shelf: '书架里的小世界',
      notes: '有些文字，值得再读',
    })[view.value] ?? '我的阅读档案',
)
const destination = (name: string, filters: Record<string, string> = {}) => ({
  path: demo.value ? '/demo' : `/${name}`,
  query: {
    ...route.query,
    book: undefined,
    month: undefined,
    ...(demo.value ? { view: name } : {}),
    ...filters,
  },
})
const books = computed(() =>
  (report.value?.books ?? [])
    .filter(
      (b) =>
        (!search.value || `${b.title}${b.author}`.includes(search.value)) &&
        (category.value === '全部' || b.category === category.value) &&
        (kind.value === '全部' || b.kind === kind.value),
    )
    .sort((a, b) =>
      sort.value === 'title'
        ? a.title.localeCompare(b.title, 'zh-CN')
        : sort.value === 'progress'
          ? (b.progress ?? -1) - (a.progress ?? -1)
          : (b.updatedAt ?? '').localeCompare(a.updatedAt ?? ''),
    ),
)
const notes = computed(() =>
  (report.value?.notes ?? []).filter(
    (n) =>
      (!search.value || `${n.text}${n.title}${n.abstract ?? ''}`.includes(search.value)) &&
      (noteBook.value === '全部' || n.bookId === noteBook.value) &&
      (noteType.value === '全部' || n.type === noteType.value) &&
      (!month.value || n.date?.startsWith(month.value)),
  ),
)
const bookCategories = computed(() => [
  { text: '全部分类', value: '全部' },
  ...[...new Set(report.value?.books.map((b) => b.category))].map((c) => ({ text: c, value: c })),
])
const noteBooks = computed(() => [
  { text: '全部书籍', value: '全部' },
  ...[
    ...new Map([
      ...(report.value?.books ?? []).map((b) => [b.id, b.title] as const),
      ...(report.value?.notes ?? []).map((n) => [n.bookId, n.title] as const),
    ]).entries(),
  ].map(([value, text]) => ({ text, value })),
])
const bookKinds = [
  { text: '全部内容', value: '全部' },
  { text: '电子书', value: 'book' },
  { text: '有声', value: 'audio' },
  { text: '文章', value: 'article' },
]
const sortOptions = [
  { text: '最近活动', value: 'recent' },
  { text: '书名排序', value: 'title' },
  { text: '阅读进度', value: 'progress' },
]
const noteTypes = [
  { text: '全部类型', value: '全部' },
  { text: '划线', value: 'highlight' },
  { text: '想法', value: 'thought' },
]
watch(
  () => [
    route.path,
    route.query.view,
    route.query.book,
    route.query.month,
    source.value,
    range.value,
  ],
  () => {
    search.value = ''
    category.value = '全部'
    kind.value = '全部'
    noteType.value = '全部'
    noteLimit.value = 24
    noteBook.value = typeof route.query.book === 'string' ? route.query.book : '全部'
    month.value = typeof route.query.month === 'string' ? route.query.month : ''
  },
  { immediate: true },
)
watch(
  [search, noteBook, noteType, month],
  () => {
    noteLimit.value = 24
  },
  { flush: 'sync' },
)
useReportViewState(
  { search, category, kind, sort, noteBook, noteType, month, section, noteLimit },
  busy,
)
watch(errorCode, (code) => {
  if (['AUTH_REQUIRED', 'GUEST_EXPIRED', 'WEREAD_KEY_REQUIRED'].includes(code))
    void router.replace({
      path: '/settings',
      query: {
        connection: route.query.connection,
        range: route.query.range,
        next: route.fullPath,
        expired: code,
      },
    })
})
function chooseRange(action: { key: string }) {
  range.value = action.key as RangeKey
  rangeOpen.value = false
  month.value = ''
}
function clearFilters() {
  search.value = ''
  category.value = '全部'
  kind.value = '全部'
  noteBook.value = '全部'
  noteType.value = '全部'
  month.value = ''
  void router.replace({ query: { ...route.query, book: undefined, month: undefined } })
}
async function openBook(book: Book) {
  selected.value = book
  detailsOpen.value = true
  detailMessage.value = ''
  if (!isSample.value && book.kind === 'book') {
    detailMessage.value = '正在加载书籍详情…'
    try {
      const detail = await bookDetail(book.id)
      if (selected.value?.id === book.id && detailsOpen.value) {
        selected.value = mergeBookDetail(book, detail)
        detailMessage.value = ''
      }
    } catch (e) {
      if (selected.value?.id === book.id && detailsOpen.value)
        detailMessage.value = e instanceof Error ? e.message : '详情暂时无法加载。'
    }
  }
}
async function openSelectedNotes() {
  const id = selected.value?.id
  detailsOpen.value = false
  await router.push(destination('notes', id ? { book: id } : {}))
}
function selectMonth(label: string) {
  if (/^\d{4}-\d{2}$/.test(label)) void router.push(destination('notes', { month: label }))
}
async function copy(text: string) {
  try {
    await navigator.clipboard.writeText(text)
    showToast('已复制到剪贴板')
  } catch {
    showToast('请长按文字选择并复制')
  }
}
async function download(type: 'html' | 'json') {
  const snapshot = report.value,
    origin = source.value
  if (!report.value || (!isSample.value && (busy.value || !task.value?.notesComplete))) {
    showToast('笔记仍在读取，请稍后下载')
    return
  }
  exporting.value = true
  try {
    const exporter = await import('@client/export')
    const text =
      type === 'html'
        ? await exporter.makeHtml(snapshot!, exportNotes.value)
        : JSON.stringify(exporter.exportData(snapshot!, exportNotes.value), null, 2)
    if (report.value !== snapshot || source.value !== origin)
      throw new Error('报告范围或来源已变化')
    exporter.download(text, type, isSample.value)
    showToast('报告已生成，请查看浏览器下载')
  } catch {
    showToast('生成失败，请重试')
  } finally {
    exporting.value = false
  }
}
watch([source, range], () => {
  detailsOpen.value = false
  selected.value = null
  exportOpen.value = false
  progressOpen.value = false
})
</script>
<template>
  <div class="mobile-reading" @click="touch()" @keydown="touch()">
    <div class="mobile-page reading-heading">
      <div class="heading-meta">
        <span class="eyebrow">
          {{ sourceLabel }}
        </span>
        <RouterLink
          v-if="demo"
          :to="{
            path: '/settings',
            query: {
              next: router.resolve({
                path: `/${view}`,
                query: { ...route.query, view: undefined, source: undefined },
              }).fullPath,
            },
          }"
        >
          连接我的
          <van-icon name="arrow" />
        </RouterLink>
      </div>
      <ConnectionNotice v-if="!demo" />
      <h1>{{ title }}</h1>
      <van-button v-if="demo && canUseDevelopment" size="small" plain @click="switchSample">
        {{ isSample ? '使用开发数据' : '切换模拟示例' }}
      </van-button>
      <div class="reading-actions">
        <van-button size="small" round plain aria-label="统计范围" @click="rangeOpen = true">
          {{ ranges.find((item) => item.key === range)?.name }}
          <van-icon name="arrow-down" />
        </van-button>
        <van-button
          size="small"
          round
          plain
          icon="down"
          :disabled="!report"
          @click="exportOpen = true"
        >
          下载{{ isSample ? '示例' : '' }}报告
        </van-button>
      </div>
      <p class="range-caption" aria-live="polite">
        {{ displayRange.start || '起始日期未知' }} — {{ displayRange.end }}
        <span>· {{ collectionStatus }}</span>
        <button v-if="!isSample" class="text-button" @click="progressOpen = true">采集详情</button>
      </p>
    </div>
    <div v-if="conflict" class="status-card" role="alert">
      <p>{{ error }}</p>
      <van-button :disabled="busy" size="small" type="primary" @click="confirmReplacement">
        替换并生成
      </van-button>
      <van-button :disabled="busy" size="small" @click="dismissConflict">取消</van-button>
    </div>
    <div v-else-if="error" class="status-card" role="alert">
      <p>{{ error }}</p>
      <van-button
        v-if="['account', 'guest'].includes(source) && errorCode.startsWith('WEREAD_KEY')"
        size="small"
        :to="{
          path: '/settings',
          query: { connection: route.query.connection, range: route.query.range },
        }"
      >
        配置微信读书
      </van-button>
      <van-button v-else size="small" @click="collect(range)">
        {{
          errorCode === 'REPORT_REPLACED' || errorCode === 'REPORT_CANCELLED' ? '重新生成' : '重试'
        }}
      </van-button>
    </div>
    <template v-if="report">
      <ReportInsights
        v-if="report.insights && ['overview', 'report'].includes(view)"
        :insights="report.insights"
      />
      <template v-if="view === 'overview'">
        <section class="mobile-stats" aria-label="阅读核心指标">
          <div>
            <span>阅读与收听</span>
            <strong>
              {{
                report.summary.seconds == null
                  ? '—'
                  : (report.summary.seconds / 3600).toLocaleString('zh-CN', {
                      maximumFractionDigits: 1,
                    })
              }}
              <small>小时</small>
            </strong>
          </div>
          <div>
            <span>与书相伴</span>
            <strong>
              {{ report.summary.readDays ?? '—' }}
              <small>天</small>
            </strong>
          </div>
          <div>
            <span>当前书架</span>
            <strong>
              {{ report.summary.shelfCount ?? '—' }}
              <small>项</small>
            </strong>
          </div>
          <div>
            <span>累计笔记</span>
            <strong>
              {{ report.summary.noteCount ?? '—' }}
              <small>条</small>
            </strong>
          </div>
        </section>
        <section class="mobile-portrait">
          <p class="eyebrow">每一页，都算数</p>
          <h2>{{ report.portrait.title }}</h2>
          <p>{{ report.portrait.text }}</p>
          <small>由阅纹根据已读取指标归纳</small>
          <RouterLink :to="destination('report')">
            翻开深度报告 · 27 个维度
            <van-icon name="arrow" />
          </RouterLink>
        </section>
        <MobileReportModule
          v-if="report.modules[1]"
          :module="report.modules[1]"
          :generated-at="report.meta.generatedAt"
          @select="selectMonth"
        />
        <section v-if="report.portrait.quote" class="mobile-quote">
          <p class="eyebrow">曾让你停下的一句</p>
          <blockquote>
            <span v-if="report.portrait.quote.demoText" class="demo-text-label">演示文本 ·</span>
            <span :class="{ 'highlight-text': report.portrait.quote.type === 'highlight' }">
              {{ report.portrait.quote.text }}
            </span>
          </blockquote>
          <p>
            {{
              [`《${report.portrait.quote.title}》`, report.portrait.quote.chapter]
                .filter(Boolean)
                .join(' · ')
            }}
          </p>
        </section>
        <van-cell
          title="书架里的世界"
          :value="`${report.books.length} 项`"
          is-link
          :to="destination('shelf')"
        />
        <div class="mobile-book-strip">
          <button
            v-for="(book, index) in report.books.slice(0, 5)"
            :key="book.id"
            @click="openBook(book)"
          >
            <MobileBookCover :book="book" :index="index" />
            <span>{{ book.title }}</span>
            <small v-if="book.imported" class="imported-badge">导入书籍</small>
          </button>
        </div>
        <van-cell title="重读划线与想法" is-link :to="destination('notes')" />
      </template>
      <template v-else-if="view === 'report'">
        <van-tabs v-model:active="section" sticky offset-top="60" aria-label="报告章节">
          <van-tab
            v-for="name in ['时间', '偏好', '书架', '笔记']"
            :key="name"
            :title="name"
            :name="name"
          >
            <MobileReportModule
              v-for="module in report.modules.filter((m) => m.section === name)"
              :key="module.id"
              :module="module"
              :generated-at="report.meta.generatedAt"
              @select="selectMonth"
            />
          </van-tab>
        </van-tabs>
        <section v-if="section === '笔记' && report.portrait.selections.length" class="mobile-page">
          <h2>划线精选</h2>
          <article v-for="note in report.portrait.selections" :key="note.id" class="mobile-note">
            <p>
              <span v-if="note.demoText" class="demo-text-label">演示文本 ·</span>
              <span :class="{ 'highlight-text': note.type === 'highlight' }">{{ note.text }}</span>
            </p>
            <footer>
              {{ [`《${note.title}》`, note.chapter, note.date].filter(Boolean).join(' · ') }}
            </footer>
          </article>
        </section>
      </template>
      <template v-else-if="view === 'shelf'">
        <van-search
          v-model="search"
          aria-label="搜索书名或作者"
          placeholder="搜索书名或作者"
          shape="round"
        />
        <van-dropdown-menu>
          <van-dropdown-item v-model="category" :options="bookCategories" />
          <van-dropdown-item v-model="kind" :options="bookKinds" />
          <van-dropdown-item v-model="sort" :options="sortOptions" />
        </van-dropdown-menu>
        <p class="result-caption">当前书架 · 找到 {{ books.length }} 项</p>
        <div class="mobile-books">
          <button
            v-for="(book, index) in books"
            :key="book.id"
            class="mobile-book"
            @click="openBook(book)"
          >
            <MobileBookCover :book="book" :index="index" />
            <strong>{{ book.title }}</strong>
            <span>{{ book.author }}</span>
            <span v-if="book.imported" class="imported-badge">导入书籍</span>
            <small>
              {{
                book.progress == null
                  ? book.kind === 'audio'
                    ? '有声内容'
                    : book.kind === 'article'
                      ? '文章收藏'
                      : '阅读进度未知'
                  : `已读 ${book.progress}%`
              }}
            </small>
          </button>
        </div>
        <van-empty v-if="!books.length" description="还没找到这本书">
          <van-button round size="small" @click="clearFilters">清除筛选</van-button>
        </van-empty>
      </template>
      <template v-else-if="view === 'notes'">
        <van-search
          v-model="search"
          aria-label="搜索划线与想法"
          placeholder="搜索划线与想法"
          shape="round"
        />
        <van-dropdown-menu>
          <van-dropdown-item v-model="noteBook" :options="noteBooks" />
          <van-dropdown-item v-model="noteType" :options="noteTypes" />
        </van-dropdown-menu>
        <p class="result-caption">
          {{ month ? `${month} · ` : '' }}区间内已读取 {{ notes.length }} 条
          <button
            v-if="notes.length && (noteBook !== '全部' || month)"
            class="text-button"
            @click="clearFilters"
          >
            清除筛选
          </button>
        </p>
        <MonthDetail v-if="month" :report="report" :month="month" />
        <div class="mobile-notes">
          <article v-for="note in notes.slice(0, noteLimit)" :key="note.id" class="mobile-note">
            <header>
              <span>{{ note.type === 'thought' ? '想法' : '划线' }}</span>
              <button
                class="icon-button"
                :aria-label="`复制《${note.title}》的笔记`"
                @click="copy(note.text)"
              >
                <van-icon name="description-o" />
              </button>
            </header>
            <p>
              <span v-if="note.demoText" class="demo-text-label">演示文本 ·</span>
              <span :class="{ 'highlight-text': note.type === 'highlight' }">{{ note.text }}</span>
            </p>
            <div v-if="note.abstract" class="note-abstract">
              <p class="abstract-label">
                对应原文
                <span v-if="note.demoText">· 演示文本</span>
              </p>
              <p>
                <span class="highlight-text">{{ note.abstract }}</span>
              </p>
            </div>
            <footer>
              《{{ note.title }}》
              <br />
              {{ [note.chapter, note.date ?? '日期未知'].filter(Boolean).join(' · ') }}
            </footer>
          </article>
        </div>
        <van-empty v-if="!notes.length" description="这里还没有留下文字">
          <van-button round size="small" @click="clearFilters">清除筛选</van-button>
        </van-empty>
        <div v-if="notes.length > noteLimit" class="form-actions">
          <van-button block round @click="noteLimit += 24">再读 24 条</van-button>
        </div>
      </template>
      <p class="reading-footnote">
        时间按 Asia/Shanghai；书架为当前快照。累计笔记含书签，正文只展示已读取的划线与个人想法。
      </p>
      <div v-if="!isSample && !busy" class="form-actions">
        <van-button round block plain @click="progressOpen = true">采集详情与刷新</van-button>
      </div>
    </template>
    <van-popup
      v-model:show="progressOpen"
      position="bottom"
      round
      safe-area-inset-bottom
      class="mobile-sheet"
      aria-label="采集详情"
      @keydown.esc="progressOpen = false"
    >
      <button
        class="sheet-close icon-button"
        aria-label="关闭采集详情"
        @click="progressOpen = false"
      >
        <van-icon name="cross" />
      </button>
      <h2>阅读数据采集</h2>
      <p role="status">
        {{ collectionStatus }}
        <span v-if="busy && task && ['queued', 'running'].includes(task.status)">
          · {{ task.stage }}
        </span>
      </p>
      <p v-if="report">
        笔记已读取 {{ report.coverage.loaded }} / {{ report.coverage.expected ?? '未知' }} 本，失败
        {{ report.coverage.failed }} 本。
      </p>
      <p v-for="issue in report?.issues" :key="issue">{{ issue }}</p>
      <van-button v-if="busy" round block @click="cancel">停止采集</van-button>
      <template v-else>
        <van-button v-if="task?.retryAllowed !== false && !isSample" round block @click="retry">
          继续或重试剩余部分
        </van-button>
        <van-button round block plain @click="collect(range, true)">重新读取当前范围</van-button>
      </template>
    </van-popup>
    <van-action-sheet
      v-model:show="rangeOpen"
      :actions="ranges"
      title="选择统计范围"
      cancel-text="取消"
      close-on-click-action
      @select="chooseRange"
    />
    <van-popup
      v-model:show="detailsOpen"
      position="bottom"
      round
      safe-area-inset-bottom
      class="mobile-sheet"
      aria-label="书籍详情"
      @keydown.esc="detailsOpen = false"
    >
      <button
        class="sheet-close icon-button"
        aria-label="关闭书籍详情"
        @click="detailsOpen = false"
      >
        <van-icon name="cross" aria-hidden="true" />
      </button>
      <template v-if="selected">
        <p class="eyebrow">
          {{
            isSample
              ? selected.imported
                ? '原创导入示例 · 模拟阅读记录'
                : '公开书目 · 模拟阅读记录'
              : '书籍详情'
          }}
        </p>
        <MobileBookCover :book="selected" class="detail-cover" />
        <h2>{{ selected.title }}</h2>
        <p>
          {{
            [selected.author, !selected.imported && selected.category].filter(Boolean).join(' · ')
          }}
        </p>
        <span v-if="selected.imported" class="imported-badge">导入书籍</span>
        <p v-if="selected.publisher || !selected.imported">
          {{ selected.publisher || '出版社未提供' }}
        </p>
        <p v-if="detailMessage" role="alert">{{ detailMessage }}</p>
        <p v-if="selected.description || !selected.imported" class="book-description">
          {{ selected.description ?? '这本书暂时没有简介。' }}
        </p>
        <div class="module-key-values">
          <div>
            <span>阅读进度</span>
            <strong>{{ selected.progress == null ? '未知' : `${selected.progress}%` }}</strong>
          </div>
          <div>
            <span>累计笔记</span>
            <strong>{{ selected.noteCount ?? '未知' }} 条</strong>
          </div>
          <div>
            <span>阅读时长</span>
            <strong>{{ duration(selected.seconds) }}</strong>
          </div>
        </div>
        <van-button round block type="primary" @click="openSelectedNotes">
          翻看这本书的笔记
        </van-button>
      </template>
    </van-popup>
    <van-popup
      v-model:show="exportOpen"
      position="bottom"
      round
      safe-area-inset-bottom
      class="mobile-sheet"
      aria-label="下载阅读报告"
      @keydown.esc="exportOpen = false"
    >
      <button class="sheet-close icon-button" aria-label="关闭下载面板" @click="exportOpen = false">
        <van-icon name="cross" aria-hidden="true" />
      </button>
      <h2>把阅读，带在身边。</h2>
      <p>
        {{ isSample ? '下载文件会标记为模拟示例。' : '文件只下载到你的设备。' }}HTML
        可离线打开，包含图表与数据表。
      </p>
      <p v-if="report">
        {{ sourceLabel }} · {{ report.range.label }} · {{ report.range.start || '起始日期未知' }} —
        {{ report.range.end }}
      </p>
      <p>下载当前范围的整份已采集报告，月份、单书、分类和搜索筛选不改变下载范围。</p>
      <van-cell title="附上全部已读取笔记" label="默认只附最多 20 条划线精选">
        <template #right-icon>
          <van-switch v-model="exportNotes" size="22" aria-label="附上全部已读取笔记" />
        </template>
      </van-cell>
      <div class="form-actions">
        <van-button
          round
          block
          type="primary"
          :loading="exporting"
          :disabled="!report || busy || (!isSample && !task?.notesComplete)"
          @click="download('html')"
        >
          下载 HTML
        </van-button>
        <van-button
          round
          block
          :loading="exporting"
          :disabled="!report || busy || (!isSample && !task?.notesComplete)"
          @click="download('json')"
        >
          下载 JSON
        </van-button>
      </div>
      <p class="field-hint">下载后可在浏览器的「下载」中找到；部分手机浏览器会先打开文件预览。</p>
    </van-popup>
  </div>
</template>
