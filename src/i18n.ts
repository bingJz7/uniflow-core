/**
 * UniFlow Core — i18n. Hand-rolled dictionary: two languages don't justify a framework.
 */

export type Lang = 'en' | 'zh-CN';

type Dict = Record<string, string>;

const en: Dict = {
  appName: 'UniFlow',
  tagline: 'Your deadlines, all in one place. No AI. No account. Free.',
  // onboarding
  onboardingTitle: 'Welcome to UniFlow',
  onboardingStep1: 'Export or find your school calendar as an ICS file (every major LMS supports this).',
  onboardingStep2: 'Drop the file below. It is parsed on your device — nothing is uploaded.',
  onboardingStep3: 'Pick your timezone. See your deadlines immediately.',
  dropHere: 'Drop your .ics file here, or click to choose a file',
  tryDemo: 'No ICS file? Try the demo calendar',
  // tabs
  today: 'Today',
  upcoming: 'Upcoming',
  all: 'All Events',
  overdue: 'Overdue',
  changes: 'Changes',
  settings: 'Settings',
  // views
  emptyToday: 'Nothing scheduled today.',
  emptyUpcoming: 'Nothing in the next 7 days.',
  emptyAll: 'No events. Import an ICS file to get started.',
  emptyOverdue: 'Nothing overdue. Nice. 🎉',
  emptyChanges: 'No changes detected yet. Changes appear when you re-import an updated calendar.',
  importMore: 'Import another calendar',
  // event item
  due: 'Due',
  starts: 'Starts',
  allDay: 'All day',
  remaining: 'remaining',
  category: 'Category',
  status: 'Status',
  cat_assignment: 'Assignment',
  cat_quiz: 'Quiz',
  cat_exam: 'Exam',
  cat_class: 'Class',
  cat_other: 'Other',
  st_not_started: 'Not started',
  st_in_progress: 'In progress',
  st_completed: 'Completed',
  // priorities
  pr_overdue: 'OVERDUE',
  pr_urgent: 'URGENT',
  pr_high: 'HIGH',
  pr_upcoming: 'Due soon',
  pr_later: 'Later',
  // changes view
  ch_added: 'New event',
  ch_removed: 'Removed from feed',
  ch_time_changed: 'Time changed',
  ch_title_changed: 'Title changed',
  // settings
  timezoneLabel: 'Your timezone',
  languageLabel: 'Language',
  digestHourLabel: 'Digest hour (0–23)',
  urgentHoursLabel: 'Urgent if within (hours)',
  highHoursLabel: 'High priority if within (hours)',
  soonDaysLabel: 'Upcoming window (days)',
  exportData: 'Export my data (JSON)',
  clearData: 'Clear all my data',
  clearConfirm1: 'This permanently deletes all UniFlow data on this device. Continue?',
  clearConfirm2: 'Are you REALLY sure? This cannot be undone.',
  cleared: 'All data cleared.',
  // import feedback
  importSuccess: 'Imported {n} events from "{name}".',
  importWarnings: 'Import finished with warnings:',
  importFailed: 'Import failed: {msg}',
  sourceRemoved: 'Calendar removed.',
  // digest
  digestTitle: 'Daily digest',
  generateDigest: 'Generate today’s digest',
  copyDigest: 'Copy',
  copied: 'Copied!',
  digestNote: 'Deterministic rule-based summary. No AI involved.',
  // sync status
  lastSynced: 'Last synced',
  stale: 'Data is stale (last sync failed)',
  never: 'never',
  // misc
  warnings: 'Warnings',
  close: 'Close',
  confirmedDeadlinesNote: 'Deadlines shown are based on your calendar file, not verified against your LMS.',
  unconfirmedFlag: '⚠️ Kept visible at your request — this event is no longer in the source calendar feed (source unconfirmed).',
  emptyImportConfirm: 'This calendar is valid but contains no events. Import it anyway?',
  emptyReimportConfirm: 'The new version of "{name}" is valid but contains NO events. Your current {n} event(s) will be kept as vanished snapshots awaiting your confirmation — nothing will be deleted. Continue?',
  emptyReimportDone: 'Imported an empty calendar for "{name}". Your previous events are kept as vanished snapshots in Changes — nothing was deleted.',
  importEmptyTitle: 'Empty calendar',

  // vanished events (P0-02)
  vanishedHeading: 'Vanished from your calendar file — needs your confirmation',
  vanishedNote: 'These events disappeared the last time you imported this calendar. That does not necessarily mean the school cancelled them. Your category and status are preserved. Choose what to do:',
  vanishedWhen: 'vanished',
  actMarkCancelled: 'Mark cancelled',
  actArchive: 'Archive',
  actKeepVisible: 'Keep visible',
  archivedNote: '{n} resolved item(s) archived. Nothing was deleted.',
  // honest-copy guardrails (Phase 3)
  noAutoSyncNote: 'ℹ️ This version has no automatic sync and cannot send phone notifications. Re-import your updated ICS file to refresh your data — the in-app daily digest is generated on demand.',
};

const zh: Dict = {
  appName: 'UniFlow',
  tagline: '所有截止时间，一目了然。无 AI。无账号。免费。',
  onboardingTitle: '欢迎使用 UniFlow',
  onboardingStep1: '从学校系统导出或找到 ICS 日历文件（主流教学系统都支持）。',
  onboardingStep2: '把文件拖到下面。解析在你的设备上完成——不会上传任何数据。',
  onboardingStep3: '选择你所在的时区，立刻看到课程与截止时间。',
  dropHere: '把 .ics 文件拖到这里，或点击选择文件',
  tryDemo: '没有 ICS 文件？试试演示日历',
  today: '今天',
  upcoming: '未来 7 天',
  all: '全部事件',
  overdue: '已逾期',
  changes: '变化记录',
  settings: '设置',
  emptyToday: '今天没有安排。',
  emptyUpcoming: '未来 7 天没有事项。',
  emptyAll: '还没有事件。导入 ICS 文件开始使用。',
  emptyOverdue: '没有逾期事项，很棒 🎉',
  emptyChanges: '暂未检测到变化。重新导入更新后的日历后会在这里显示。',
  importMore: '导入另一个日历',
  due: '截止',
  starts: '开始',
  allDay: '全天',
  remaining: '剩余',
  category: '类别',
  status: '状态',
  cat_assignment: '作业',
  cat_quiz: '测验',
  cat_exam: '考试',
  cat_class: '课程',
  cat_other: '其他',
  st_not_started: '未开始',
  st_in_progress: '进行中',
  st_completed: '已完成',
  pr_overdue: '已逾期',
  pr_urgent: '紧急',
  pr_high: '高优先级',
  pr_upcoming: '即将到期',
  pr_later: '较远',
  ch_added: '新增事件',
  ch_removed: '从日历源中消失',
  ch_time_changed: '时间变更',
  ch_title_changed: '标题变更',
  timezoneLabel: '你的时区',
  languageLabel: '语言',
  digestHourLabel: '摘要生成时间（0–23 点）',
  urgentHoursLabel: '多少小时内算紧急（小时）',
  highHoursLabel: '多少小时内算高优先级（小时）',
  soonDaysLabel: '未来几天窗口（天）',
  exportData: '导出我的数据（JSON）',
  clearData: '清除我在本设备的全部数据',
  clearConfirm1: '这将永久删除本设备上的所有 UniFlow 数据。继续吗？',
  clearConfirm2: '真的要继续吗？此操作无法撤销。',
  cleared: '数据已清除。',
  importSuccess: '已从“{name}”导入 {n} 个事件。',
  importWarnings: '导入完成，但有提示：',
  importFailed: '导入失败：{msg}',
  sourceRemoved: '日历已移除。',
  digestTitle: '每日摘要',
  generateDigest: '生成今日摘要',
  copyDigest: '复制',
  copied: '已复制！',
  digestNote: '基于确定性规则的摘要，不使用任何 AI。',
  lastSynced: '上次同步',
  stale: '数据已过期（上次同步失败）',
  never: '从未',
  warnings: '提示',
  close: '关闭',
  confirmedDeadlinesNote: '显示的截止时间来自你导入的日历文件，未经学校系统核实。',
  unconfirmedFlag: '⚠️ 应你的要求保留显示——此事件已不在来源日历中（来源未确认）。',
  emptyImportConfirm: '这个日历有效但不含任何事件。仍要导入吗？',
  emptyReimportConfirm: '"{name}" 的新版本有效但不含任何事件。你现有的 {n} 个事件将保留为待确认的"已消失"快照——不会删除任何数据。继续吗？',
  emptyReimportDone: '"{name}" 已导入为空日历。你之前的所有事件都保留在"变更"页的待确认列表中——没有删除任何数据。',
  importEmptyTitle: '空日历',

  vanishedHeading: '事件已从你的日历文件中消失——需要你确认',
  vanishedNote: '以下事件在你上次导入该日历时消失了。这不一定代表学校正式取消。你的分类和状态已保留。请选择处理方式：',
  vanishedWhen: '消失于',
  actMarkCancelled: '标记为已取消',
  actArchive: '归档',
  actKeepVisible: '继续显示',
  archivedNote: '已归档 {n} 条已处理记录。没有任何数据被删除。',
  noAutoSyncNote: 'ℹ️ 本版本尚无自动同步，也无法发送手机通知。请重新导入更新后的 ICS 文件来刷新数据；应用内每日摘要按需生成。',
};

const dicts: Record<Lang, Dict> = { en, 'zh-CN': zh };

export function t(lang: Lang, key: string, params?: Record<string, string | number>): string {
  let s = dicts[lang][key] ?? dicts.en[key] ?? key;
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      s = s.replace(new RegExp(`\\{${k}\\}`, 'g'), String(v));
    }
  }
  return s;
}
