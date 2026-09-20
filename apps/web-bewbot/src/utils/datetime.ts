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
