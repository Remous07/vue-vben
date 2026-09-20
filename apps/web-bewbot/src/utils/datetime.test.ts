import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  beijingToday,
  formatBeijingDateTime,
  formatBeijingShort,
} from './datetime';

// 这些用例**在哪个时区跑都必须过**——那正是被测的东西。
//
// 用 TZ 环境变量把进程时区改掉，逐个时区各跑一遍（`describe.each` 让失败的用例名
// 带上时区，比在断言里塞消息清楚）。不在多个时区上跑的话，在 CI（多为 UTC）上得出
// 的结论和北京同事机器上的行为并不是一回事——而这类 bug 恰恰只在前者可复现。
//
// 注意：TZ 不生效时这些用例会**全部通过**（各时区结果一样），一片绿但什么也没验。
// 所以这套用例是反问过的：把实现里的 `{ timeZone: BEIJING_TZ }` 去掉再跑，必须挂
// ——实测「完整时间按北京时间显示」在纽约/伦敦/UTC+14 上都会失败。
const TIMEZONES = [
  'UTC',
  'Asia/Shanghai',
  'America/New_York',
  'Europe/London',
  'Pacific/Kiritimati', // UTC+14，离北京最远的跨日情形
];

const originalTz = process.env.TZ;

beforeEach(() => {
  process.env.TZ = originalTz;
});

afterEach(() => {
  process.env.TZ = originalTz;
});

describe.each(TIMEZONES)('在 %s 时区', (tz) => {
  beforeEach(() => {
    process.env.TZ = tz;
  });

  it('完整时间按北京时间显示', () => {
    // 后端的 14:30（+08:00）就是北京时间 14:30，谁的机器上都该显示这个
    expect(formatBeijingDateTime('2026-09-20T14:30:00+08:00')).toBe(
      '2026/9/20 14:30:00',
    );
  });

  it('紧凑格式按北京时间显示', () => {
    // 06:30Z = 北京 14:30 = 纽约 02:30（EDT）
    expect(formatBeijingShort('2026-09-20T06:30:00Z')).toBe('09-20 14:30');
  });

  it('跨日的那几小时也不会串到别的日期', () => {
    // 北京 00:30 时 UTC 还是前一天 16:30、纽约是前一天 12:30
    expect(formatBeijingShort('2026-09-20T00:30:00+08:00')).toBe('09-20 00:30');
  });

  it('「今天」按北京时间的今天算', () => {
    const expected = new Date().toLocaleDateString('zh-CN', {
      day: 'numeric',
      month: 'long',
      timeZone: 'Asia/Shanghai',
      weekday: 'long',
      year: 'numeric',
    });
    expect(beijingToday()).toBe(expected);
  });
});

describe('空值', () => {
  it('返回占位符而不是 "Invalid Date"', () => {
    expect(formatBeijingDateTime(undefined)).toBe('-');
    expect(formatBeijingDateTime(null)).toBe('-');
    // 模板里直接插值用，空串比 "-" 干净
    expect(formatBeijingShort(undefined)).toBe('');
  });
});
