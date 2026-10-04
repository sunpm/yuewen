<script setup lang="ts">
import MonthDetail from '@client/components/MonthDetail.vue'
import ReportInsights from '@client/components/ReportInsights.vue'
import ConnectionNotice from '@client/components/ConnectionNotice.vue'
import { duration, mergeBookDetail } from '@shared/report'
import type { Book } from '@shared/report'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { useReadingReport } from '@client/useReadingReport'
import { useReportViewState } from '@client/useReportViewState'
const route = useRoute(),
  router = useRouter()
const isDemo = computed(() => route.path === '/demo')
const view = computed(() =>
  isDemo.value ? String(route.query.view ?? 'overview') : route.path.slice(1),
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
} = useReadingReport(isDemo)
const search = ref(''),
  category = ref('全部'),
  noteType = ref('全部'),
  sort = ref('recent'),
  list = ref(false),
  month = ref('')
const selected = ref<Book | null>(null),
  detailsOpen = ref(false),
  exportOpen = ref(false),
  progressOpen = ref(false),
  exportDetails = ref(false),
  exporting = ref(false),
  feedback = ref('')
const sections = ['时间', '偏好', '书架', '笔记'] as const
const reportSection = ref<(typeof sections)[number]>('时间')
const books = computed(() =>
  (report.value?.books ?? [])
    .filter(
      (b) =>
        (!search.value || `${b.title}${b.author}`.includes(search.value)) &&
        (category.value === '全部' || b.category === category.value),
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
      (category.value === '全部' || n.bookId === category.value) &&
      (noteType.value === '全部' || n.type === noteType.value) &&
      (!month.value || n.date?.startsWith(month.value)),
  ),
)
const noteBooks = computed(() =>
  [
    ...new Map([
      ...(report.value?.books ?? []).map((b) => [b.id, b.title] as const),
      ...(report.value?.notes ?? []).map((n) => [n.bookId, n.title] as const),
    ]),
  ].map(([id, title]) => ({ id, title })),
)
const noteLimit = ref(24)
const visibleNotes = computed(() => notes.value.slice(0, noteLimit.value))
const routeFor = (name: string) =>
  isDemo.value
    ? {
        path: '/demo',
        query: {
          ...route.query,
          view: name,
          book: name === 'notes' ? route.query.book : undefined,
          month: name === 'notes' ? route.query.month : undefined,
        },
      }
    : {
        path: `/${name}`,
        query: {
          ...route.query,
          book: name === 'notes' ? route.query.book : undefined,
          month: name === 'notes' ? route.query.month : undefined,
        },
      }
function clearFilters() {
  search.value = ''
  category.value = '全部'
  noteType.value = '全部'
  month.value = ''
  void router.replace({ query: { ...route.query, book: undefined, month: undefined } })
}
async function openSelectedNotes() {
  const id = selected.value?.id
  detailsOpen.value = false
  await router.push({
    path: isDemo.value ? '/demo' : '/notes',
    query: {
      ...route.query,
      ...(isDemo.value ? { view: 'notes' } : {}),
      book: id,
      month: undefined,
    },
  })
}
const rangeChanged = () => {
  month.value = ''
}
watch(
  () => [route.path, view.value, route.query.book, route.query.month, source.value, range.value],
  () => {
    search.value = ''
    category.value = typeof route.query.book === 'string' ? route.query.book : '全部'
    month.value = typeof route.query.month === 'string' ? route.query.month : ''
    noteType.value = '全部'
    noteLimit.value = 24
  },
  { immediate: true },
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
watch(
  [search, category, noteType, month],
  () => {
    noteLimit.value = 24
  },
  { flush: 'sync' },
)
useReportViewState(
  { search, category, noteType, month, sort, list, reportSection, noteLimit },
  busy,
)
async function openBook(book: Book) {
  selected.value = book
  detailsOpen.value = true
  feedback.value = ''
  if (!isSample.value && book.kind === 'book') {
    feedback.value = '正在加载书籍详情…'
    try {
      const detail = await bookDetail(book.id)
      if (selected.value?.id === book.id && detailsOpen.value) {
        selected.value = mergeBookDetail(book, detail)
        feedback.value = ''
      }
    } catch (e) {
      if (selected.value?.id === book.id && detailsOpen.value)
        feedback.value = e instanceof Error ? e.message : '详情加载失败。'
    }
  }
}
async function copy(text: string) {
  try {
    await navigator.clipboard.writeText(text)
    feedback.value = '已复制到剪贴板。'
  } catch {
    feedback.value = '复制未成功，请选中文字后复制。'
  }
}
async function exportReport(type: 'html' | 'json') {
  const snapshot = report.value,
    origin = source.value
  if (!report.value || (!isSample.value && (busy.value || !task.value?.notesComplete))) {
    feedback.value = '笔记仍在加载，请读取完成后下载。'
    return
  }
  exporting.value = true
  feedback.value = ''
  try {
    const exporter = await import('@client/export')
    const text =
      type === 'html'
        ? await exporter.makeHtml(snapshot!, exportDetails.value)
        : JSON.stringify(exporter.exportData(snapshot!, exportDetails.value), null, 2)
    if (report.value !== snapshot || source.value !== origin)
      throw new Error('报告范围或来源已变化')
    exporter.download(text, type, isSample.value)
    feedback.value = '报告已生成，可以在下载中查看。'
  } catch {
    feedback.value = '报告生成失败，请重试。'
  } finally {
    exporting.value = false
  }
}
function selectMonth(label: string) {
  if (/^\d{4}-\d{2}$/.test(label)) {
    void router.push({
      path: isDemo.value ? '/demo' : '/notes',
      query: {
        ...route.query,
        ...(isDemo.value ? { view: 'notes' } : {}),
        book: undefined,
        month: label,
      },
    })
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
  <div class="report-shell wrap" @click="touch()" @keydown="touch()">
    <div class="report-topline">
      <span class="eyebrow">
        {{ sourceLabel }}
      </span>
      <RouterLink
        v-if="isDemo"
        :to="{
          path: '/settings',
          query: {
            next: router.resolve({
              path: `/${view}`,
              query: { ...route.query, view: undefined, source: undefined },
            }).fullPath,
          },
        }"
        class="text-link"
      >
        连接我的微信读书 ↗
      </RouterLink>
      <RouterLink v-else :to="routeFor('settings')" class="text-link">连接设置 ↗</RouterLink>
    </div>
    <ConnectionNotice v-if="!isDemo" />
    <div class="report-heading">
      <div>
        <h1>
          {{
            view === 'shelf'
              ? '书页之间，另一个世界。'
              : view === 'notes'
                ? '有些文字，值得再读。'
                : view === 'report'
                  ? '沿着阅读，慢慢看见自己。'
                  : '把日常，读成自己的风景。'
          }}
        </h1>
        <p>
          {{
            isSample
              ? '公开书目与模拟阅读记录，文字仅为演示文本。'
              : '那些安静投入的时间，都在这里留下痕迹。'
          }}
        </p>
      </div>
      <Button variant="outline" :disabled="!report" @click="exportOpen = true">
        下载{{ isSample ? '示例' : '' }}报告 ↓
      </Button>
    </div>
    <div v-if="isDemo" class="source-controls">
      <span>{{ sourceLabel }}</span>
      <Button v-if="canUseDevelopment" variant="ghost" @click="switchSample">
        {{ isSample ? '使用开发数据' : '切换模拟示例' }}
      </Button>
    </div>
    <div class="report-toolbar">
      <nav aria-label="阅读档案导航">
        <RouterLink
          v-for="(label, name) in {
            overview: '阅读概览',
            report: '深度报告',
            shelf: '我的书架',
            notes: '划线与想法',
          }"
          :key="name"
          :to="routeFor(name)"
          :class="{ active: view === name }"
        >
          {{ label }}
        </RouterLink>
      </nav>
      <div class="report-controls">
        <label class="range-control">
          <span class="sr-only">统计范围</span>
          <Select v-model="range" @update:model-value="rangeChanged">
            <SelectTrigger aria-label="统计范围"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="recent">最近 24 个月</SelectItem>
              <SelectItem value="weekly">本周</SelectItem>
              <SelectItem value="monthly">本月</SelectItem>
              <SelectItem v-for="year in years" :key="year" :value="String(year)">
                {{ year }} 年
              </SelectItem>
              <SelectItem value="overall">全部历史</SelectItem>
            </SelectContent>
          </Select>
        </label>
        <div class="report-status" aria-live="polite">
          <span>{{ displayRange.start || '起始日期未知' }} — {{ displayRange.end }}</span>
          <span>
            {{ sourceLabel }} · {{ collectionStatus }}
            <button v-if="!isSample" class="text-link" @click="progressOpen = true">
              采集详情
            </button>
          </span>
        </div>
      </div>
    </div>
    <div v-if="conflict" class="notice" role="alert">
      <p>{{ error }}</p>
      <Button :disabled="busy" @click="confirmReplacement">替换并生成</Button>
      <Button variant="outline" :disabled="busy" @click="dismissConflict">取消</Button>
    </div>
    <div v-else-if="error" class="notice" role="alert">
      {{ error }}
      <RouterLink
        v-if="['account', 'guest'].includes(source) && errorCode.startsWith('WEREAD_KEY')"
        :to="{
          path: '/settings',
          query: { connection: route.query.connection, range: route.query.range },
        }"
        class="text-link"
      >
        配置微信读书 →
      </RouterLink>
      <Button v-else variant="ghost" @click="collect(range)">
        {{
          errorCode === 'REPORT_REPLACED' || errorCode === 'REPORT_CANCELLED' ? '重新生成' : '重试'
        }}
      </Button>
    </div>
    <template v-if="report">
      <ReportInsights
        v-if="report.insights && ['overview', 'report'].includes(view)"
        :insights="report.insights"
      />
      <template v-if="view === 'overview'">
        <section class="stat-strip" aria-label="阅读核心指标">
          <article>
            <span>留给阅读的时间</span>
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
            <p>阅读与收听总时长</p>
          </article>
          <article>
            <span>与书相伴的日子</span>
            <strong>
              {{ report.summary.readDays ?? '—' }}
              <small>天</small>
            </strong>
            <p>每日阅读满 1 分钟</p>
          </article>
          <article>
            <span>书架里的世界</span>
            <strong>
              {{ report.summary.shelfCount ?? '—' }}
              <small>项</small>
            </strong>
            <p>当前书架 · 包含有声内容</p>
          </article>
          <article>
            <span>留下的文字</span>
            <strong>
              {{ report.summary.noteCount ?? '—' }}
              <small>条</small>
            </strong>
            <p>累计笔记 · 含划线、想法、书签</p>
          </article>
        </section>
        <div class="overview-grid">
          <ReportModule
            :module="report.modules[1]"
            :generated-at="report.meta.generatedAt"
            @select="selectMonth"
          />
          <aside class="portrait-card">
            <p class="eyebrow">阅读画像</p>
            <h2>
              一点一滴，
              <br />
              读出自己的节奏。
            </h2>
            <p>{{ report.portrait.text }}</p>
            <details>
              <summary>这份画像从何而来？ ＋</summary>
              <ul>
                <li v-for="item in report.portrait.evidence" :key="item">{{ item }}</li>
              </ul>
            </details>
          </aside>
        </div>
        <div class="section-heading">
          <div>
            <h2>最近，读到这里。</h2>
          </div>
          <RouterLink :to="routeFor('shelf')" class="text-link">翻阅整个书架 →</RouterLink>
        </div>
        <div class="book-grid overview-books">
          <button
            v-for="(book, index) in [...report.books]
              .sort((a, b) => (b.updatedAt ?? '').localeCompare(a.updatedAt ?? ''))
              .slice(0, 6)"
            :key="book.id"
            class="book-item"
            @click="openBook(book)"
          >
            <BookCover :book="book" :index="index" />
            <h3>{{ book.title }}</h3>
            <p>{{ book.author }}</p>
            <span v-if="book.imported" class="imported-badge">导入书籍</span>
            <span class="book-status">
              {{
                book.progress != null
                  ? `已读 ${book.progress}%`
                  : book.finished
                    ? '已读完'
                    : '查看详情'
              }}
            </span>
          </button>
        </div>
        <section v-if="report.portrait.quote" class="quote-banner">
          <span class="quote-mark" aria-hidden="true">“</span>
          <p class="eyebrow">曾经打动你的，或许今天仍然</p>
          <blockquote>
            <span v-if="report.portrait.quote.demoText" class="demo-text-label">演示文本 ·</span>
            <span :class="{ 'highlight-text': report.portrait.quote.type === 'highlight' }">
              {{ report.portrait.quote.text }}
            </span>
          </blockquote>
          <span>
            {{
              [
                `《${report.portrait.quote.title}》`,
                report.portrait.quote.chapter,
                report.portrait.quote.date,
              ]
                .filter(Boolean)
                .join(' · ')
            }}
          </span>
          <RouterLink :to="routeFor('notes')" class="text-link">再遇那些句子 →</RouterLink>
        </section>
      </template>
      <template v-else-if="view === 'report'">
        <div class="report-section-tabs" role="group" aria-label="报告章节">
          <button
            v-for="section in sections"
            :key="section"
            :class="{ active: reportSection === section }"
            @click="reportSection = section"
          >
            {{ section }}
            <small>{{ report.modules.filter((m) => m.section === section).length }}</small>
          </button>
        </div>
        <p class="chapter-intro">
          {{
            reportSection === '时间'
              ? '从零散的片刻，到持续的积累。'
              : reportSection === '偏好'
                ? '哪些主题，成为了你思想的常客？'
                : reportSection === '书架'
                  ? '此刻，你的书架是什么模样？'
                  : '把曾经停留的地方，重新读一遍。'
          }}
        </p>
        <div class="module-grid">
          <ReportModule
            v-for="module in report.modules.filter((m) => m.section === reportSection)"
            :key="module.id"
            :module="module"
            :generated-at="report.meta.generatedAt"
            @select="selectMonth"
          />
        </div>
        <section
          v-if="reportSection === '笔记' && report.portrait.selections.length"
          class="selection-section"
        >
          <h2>划线精选</h2>
          <p>最多 20 条，保留出处与日期。</p>
          <blockquote v-for="note in report.portrait.selections" :key="note.id">
            <span v-if="note.demoText" class="demo-text-label">演示文本 ·</span>
            <span :class="{ 'highlight-text': note.type === 'highlight' }">{{ note.text }}</span>
            <small>
              {{ [`《${note.title}》`, note.chapter, note.date].filter(Boolean).join(' · ') }}
            </small>
          </blockquote>
        </section>
      </template>
      <template v-else-if="view === 'shelf'">
        <div class="filter-bar">
          <label class="search-field">
            <span aria-hidden="true">⌕</span>
            <input v-model="search" aria-label="搜索书名或作者" placeholder="搜索书名或作者" />
          </label>
          <label>
            <span class="sr-only">书架分类</span>
            <Select v-model="category">
              <SelectTrigger aria-label="书架分类"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="全部">全部</SelectItem>
                <SelectItem
                  v-for="item in [...new Set(report.books.map((b) => b.category))]"
                  :key="item"
                  :value="item"
                >
                  {{ item }}
                </SelectItem>
              </SelectContent>
            </Select>
          </label>
          <label>
            <span class="sr-only">书架排序</span>
            <Select v-model="sort">
              <SelectTrigger aria-label="书架排序"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="recent">最近阅读</SelectItem>
                <SelectItem value="title">书名顺序</SelectItem>
                <SelectItem value="progress">阅读进度</SelectItem>
              </SelectContent>
            </Select>
          </label>
          <button class="view-toggle" @click="list = !list">
            {{ list ? '封面视图' : '列表视图' }}
          </button>
        </div>
        <p class="result-count">当前书架 · {{ books.length }} 个条目</p>
        <div class="book-grid" :class="{ 'book-list': list }">
          <button
            v-for="(book, index) in books"
            :key="book.id"
            class="book-item"
            @click="openBook(book)"
          >
            <BookCover :book="book" :index="index" />
            <div>
              <h3>{{ book.title }}</h3>
              <p>{{ book.author }}</p>
              <span v-if="book.imported" class="imported-badge">导入书籍</span>
              <span class="book-status">
                {{
                  book.kind === 'audio'
                    ? '有声书'
                    : book.kind === 'article'
                      ? '文章收藏入口'
                      : book.imported
                        ? ''
                        : book.category
                }}
                <span v-if="!book.imported">·</span>
                {{
                  book.progress != null
                    ? `已读 ${book.progress}%`
                    : book.finished
                      ? '已读完'
                      : '进度未获取'
                }}
              </span>
            </div>
          </button>
        </div>
        <div v-if="!books.length" class="empty-state">
          <h2>还没有找到这本书</h2>
          <p>换一个书名、作者或分类试试。</p>
          <Button variant="outline" @click="clearFilters">清除筛选</Button>
        </div>
      </template>
      <template v-else-if="view === 'notes'">
        <div class="filter-bar">
          <label class="search-field">
            <span aria-hidden="true">⌕</span>
            <input v-model="search" aria-label="搜索划线与想法" placeholder="搜索文字，寻找共鸣" />
          </label>
          <label>
            <span class="sr-only">笔记来源书籍</span>
            <Select v-model="category">
              <SelectTrigger aria-label="笔记来源书籍"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="全部">全部书籍</SelectItem>
                <SelectItem v-for="book in noteBooks" :key="book.id" :value="book.id">
                  {{ book.title }}
                </SelectItem>
              </SelectContent>
            </Select>
          </label>
          <label>
            <span class="sr-only">笔记类型</span>
            <Select v-model="noteType">
              <SelectTrigger aria-label="笔记类型"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="全部">全部</SelectItem>
                <SelectItem value="highlight">划线</SelectItem>
                <SelectItem value="thought">想法</SelectItem>
              </SelectContent>
            </Select>
          </label>
          <Button v-if="month" variant="ghost" @click="month = ''">{{ month }} ×</Button>
        </div>
        <p class="result-count">{{ notes.length }} 条区间内已读取内容 · 仅检索已采集文字</p>
        <MonthDetail v-if="month" :report="report" :month="month" />
        <div class="notes-grid">
          <article v-for="note in visibleNotes" :key="note.id" class="note-card">
            <header>
              <span>{{ note.type === 'highlight' ? '划线' : '想法' }}</span>
              <time>{{ note.date ?? '日期未知' }}</time>
            </header>
            <blockquote>
              <span v-if="note.demoText" class="demo-text-label">演示文本 ·</span>
              <span :class="{ 'highlight-text': note.type === 'highlight' }">{{ note.text }}</span>
            </blockquote>
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
              <div>
                <strong>{{ note.title }}</strong>
                <small v-if="note.chapter">{{ note.chapter }}</small>
              </div>
              <button :aria-label="`复制《${note.title}》的笔记`" @click="copy(note.text)">
                复制 ↗
              </button>
            </footer>
          </article>
        </div>
        <Button
          v-if="notes.length > noteLimit"
          variant="outline"
          class="load-more"
          @click="noteLimit += 24"
        >
          继续翻阅
        </Button>
        <div v-if="!notes.length" class="empty-state">
          <h2>这里还没有留下文字</h2>
          <p>当前范围或筛选条件下没有已读取的笔记。</p>
          <Button variant="outline" @click="clearFilters">清除筛选</Button>
        </div>
      </template>
      <details class="method-note">
        <summary>关于数据范围与阅读画像</summary>
        <p>
          时间采用
          Asia/Shanghai；书架始终是当前快照；累计笔记包括书签，正文只包括已读取的划线与个人想法。偏好榜单有展示阈值与排行截断，不将多期榜单相加。
        </p>
        <p v-for="issue in report.issues" :key="issue">{{ issue }}</p>
        <p>阅读画像由阅纹按指标归纳，用于阅读回顾。</p>
      </details>
    </template>
    <div v-else-if="!busy && !error" class="empty-state">
      <h2>准备好你的第一份阅读档案</h2>
      <p>连接微信读书后，就能看见阅读的轨迹。</p>
      <Button as-child>
        <RouterLink
          :to="{
            path: '/settings',
            query: { connection: route.query.connection, range: route.query.range },
          }"
        >
          连接微信读书 →
        </RouterLink>
      </Button>
    </div>
    <p v-if="feedback" class="feedback" role="status">{{ feedback }}</p>
  </div>
  <Dialog v-model:open="progressOpen">
    <DialogContent class="dialog-content" close-label="关闭采集详情">
      <DialogTitle>阅读数据采集</DialogTitle>
      <DialogDescription>
        保持页面打开可继续采集；离开后暂停，临时缓存有效期内可恢复。
      </DialogDescription>
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
      <Button v-if="busy" @click="cancel">停止采集</Button>
      <template v-else>
        <Button v-if="task?.retryAllowed !== false && !isSample" @click="retry">
          继续或重试剩余部分
        </Button>
        <Button variant="outline" @click="collect(range, true)">重新读取当前范围</Button>
      </template>
    </DialogContent>
  </Dialog>
  <Dialog v-model:open="detailsOpen">
    <DialogContent class="dialog-content book-dialog" close-label="关闭书籍详情">
      <template v-if="selected">
        <BookCover
          :book="selected"
          :index="report?.books.findIndex((b) => b.id === selected?.id)"
        />
        <div>
          <p class="eyebrow">
            {{
              isSample
                ? selected.imported
                  ? '原创导入示例 · 模拟阅读记录'
                  : '公开书目 · 模拟阅读记录'
                : '书籍详情'
            }}
          </p>
          <DialogTitle class="dialog-title">{{ selected.title }}</DialogTitle>
          <DialogDescription>
            {{
              [selected.author, !selected.imported && selected.category].filter(Boolean).join(' · ')
            }}
          </DialogDescription>
          <p v-if="feedback" role="status">{{ feedback }}</p>
          <span v-if="selected.imported" class="imported-badge">导入书籍</span>
          <p v-if="selected.publisher || !selected.imported">
            {{ selected.publisher || '出版社未提供' }}
          </p>
          <p v-if="selected.description || !selected.imported" class="book-description">
            {{ selected.description || '暂未取得这本书的简介。' }}
          </p>
          <dl class="book-facts">
            <div>
              <dt>阅读进度</dt>
              <dd>{{ selected.progress != null ? `${selected.progress}%` : '暂无数据' }}</dd>
            </div>
            <div>
              <dt>区间阅读</dt>
              <dd>{{ duration(selected.seconds) }}</dd>
            </div>
            <div>
              <dt>累计笔记</dt>
              <dd>{{ selected.noteCount ?? '暂无数据' }}</dd>
            </div>
          </dl>
          <Button variant="outline" @click="openSelectedNotes">翻看这本书的笔记 →</Button>
        </div>
      </template>
    </DialogContent>
  </Dialog>
  <Dialog v-model:open="exportOpen">
    <DialogContent class="dialog-content export-dialog" close-label="关闭下载选项">
      <DialogTitle class="dialog-title">把阅读，留在手边。</DialogTitle>
      <DialogDescription>
        下载文件保留统计范围、数据覆盖与来源说明。HTML 可以离线阅读和打印。
      </DialogDescription>
      <p v-if="report">
        {{ sourceLabel }} · {{ report.range.label }} · {{ report.range.start || '起始日期未知' }} —
        {{ report.range.end }}
      </p>
      <p>下载当前范围的整份已采集报告，月份、单书、分类和搜索筛选不改变下载范围。</p>
      <label class="check-row">
        <input v-model="exportDetails" type="checkbox" />
        加入全部已读取的划线与想法
      </label>
      <p class="muted">
        默认包含统计、书架和最多 20 条划线精选。{{
          isSample ? '文件将标记为模拟示例。' : '文件只下载到你的设备。'
        }}
      </p>
      <div class="dialog-actions">
        <Button
          :disabled="exporting || !report || busy || (!isSample && !task?.notesComplete)"
          @click="exportReport('html')"
        >
          {{ exporting ? '正在生成…' : '下载 HTML' }}
        </Button>
        <Button
          variant="outline"
          :disabled="exporting || !report || busy || (!isSample && !task?.notesComplete)"
          @click="exportReport('json')"
        >
          下载 JSON
        </Button>
      </div>
      <p v-if="feedback" role="status">{{ feedback }}</p>
    </DialogContent>
  </Dialog>
</template>
