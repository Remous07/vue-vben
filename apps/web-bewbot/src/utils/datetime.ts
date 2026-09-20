import dayjs from 'dayjs';
import timezone from 'dayjs/plugin/timezone';
import utc from 'dayjs/plugin/utc';

dayjs.extend(utc);
dayjs.extend(timezone);

/**
 * 面板里的时间**一律按北京时间**显示，与浏览器所在时区无关。
 *
 * 两个理由，第二个才是硬的：
 *
 * 1. 全站的时间语义就是北京时间：后端的库列存朴素北京时间、定时清理按北京时间的
 *    「天」算、仪表盘那张「今日操作」统计卡也是。时间跟着浏览器走，就会和这几处
 *    对不上。
 * 2. 不显式指定的话，**正确性会依赖一条隐含的解析规则**。后端现在返回的是带
 *    ``+08:00`` 的串，任何语言读出来都是同一时刻；但显示端如果只写
 *    ``toLocaleString()``，那就取决于「这个串被解析成哪个时刻」——今天恰好对，
 *    是因为前端和后端对「裸串」的理解正好一样，而不是因为哪里写明了。
 *
 * 另外记一笔历史：后端**以前**发的是不带偏移的串（``2026-09-20T14:30:00``），
 * 那时这个函数怎么写都看不出来问题——JS 按本地时区解析、又按本地渲染，墙上时间
 * 原样往返，显示碰巧是对的。**但同一批数据拿去做比较就错了**：「这个邀请码过期了
 * 没」比的是「北京墙上时间」和「此刻」，实测纽约浏览器偏 12 小时，于是一个已经
 * 过期的码在界面上显示成有效。所以那次修复是后端补偏移 + 前端写明时区，两边一起。
 *
 * ── 有意保留：不兼容非东八区 ─────────────────────────
 *
 * 这个面板**只按东八区处理**，不刻意兼容其他时区。使用者是中文运营团队，且全站的
 * 时间语义（库列、定时清理、统计卡的「今日」）本来就是北京时间。
 *
 * 一个已知且有意的例外：编辑过期时间用的 antd ``DatePicker`` **只按浏览器时区
 * 渲染**。非东八区的用户打开编辑框时，选择器里的日期会和表格里显示的差一天（表格
 * 是北京时间）。要改就得把「北京墙上时间」伪装成本地时间喂给选择器，那种 hack 很
 * 容易再引入一个偏移——换来的却是给一个本来就不支持的场景做体验。所以留着。
 * **别把它当新 bug 再报一遍。**
 */
export const BEIJING_TZ = 'Asia/Shanghai';

/** 完整的日期时间，和原来 `toLocaleString('zh-CN')` 的输出完全一致。 */
export function formatBeijingDateTime(
  value: null | string | undefined,
): string {
  return value
    ? new Date(value).toLocaleString('zh-CN', { timeZone: BEIJING_TZ })
    : '-';
}

/** 紧凑的 `MM-DD HH:mm`（会话列表那种窄格子用）。 */
export function formatBeijingShort(value: null | string | undefined): string {
  return value ? dayjs(value).tz(BEIJING_TZ).format('MM-DD HH:mm') : '';
}

/**
 * 「今天」（北京时间）。给仪表盘那句问候用——它跟着浏览器走的话，非东八区的同事
 * 会在北京时间的清早看到前一天的日期，而旁边那张「今日操作」统计的却是北京的今天。
 */
export function beijingToday(): string {
  return new Date().toLocaleDateString('zh-CN', {
    day: 'numeric',
    month: 'long',
    timeZone: BEIJING_TZ,
    weekday: 'long',
    year: 'numeric',
  });
}

// ── 给非东八区的访问者：悬停看他/她那边的时刻 ──────────
//
// 表格里**永远**显示北京时间——审计得有个所有人一致的基准，否则「我看到 14:30
// 那条」在不同人嘴里指的不是同一行。但人在境外时要自己心算时差，也确实是负担。
//
// 所以不做「跟随浏览器」（那种做法会让同一行在不同人屏幕上显示两个数字），也不做
// 需要人去选的开关，而是在**已经显示北京时间的基础上**补一个悬停提示。默认情况下
// （访问者就在东八区）什么都不多出来。

/**
 * 访问者本地时区的渲染 + 时区简称，给悬停提示用。
 *
 * 例：``2026/9/20 02:30:00（GMT-4）``。时区简称走 ``Intl``，不写死。
 */
export function formatViewerLocal(value: null | string | undefined): string {
  if (!value) {
    return '';
  }
  const at = new Date(value);
  const local = at.toLocaleString('zh-CN'); // 不传 timeZone = 浏览器本地
  const zone = new Intl.DateTimeFormat('zh-CN', { timeZoneName: 'short' })
    .formatToParts(at)
    .find((part) => part.type === 'timeZoneName')?.value;
  return zone ? `${local}（${zone}）` : local;
}

/**
 * 访问者的**墙上时间**是不是就是北京时间（那就没必要弹悬停提示）。
 *
 * 比的是**偏移量**而不是时区名：偏移一样就说明显示的数字一样。新加坡、珀斯、
 * 伊尔库茨克都是 +08:00，和北京看到的完全相同——它们不需要这个提示。
 *
 * 用「此刻」的偏移来判断：北京没有夏令时，所以这个判断对北京时间永远准。别的时区
 * 在夏令时切换前后偏移会变，但那只影响「要不要弹提示」这个决定，提示里的内容是按
 * 每个时刻各自算的，不受影响。
 */
export function viewerUsesBeijingClock(): boolean {
  const BEIJING_OFFSET_MINUTES = 8 * 60;
  return -new Date().getTimezoneOffset() === BEIJING_OFFSET_MINUTES;
}
