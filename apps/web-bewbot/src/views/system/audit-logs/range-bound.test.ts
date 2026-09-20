import dayjs from 'dayjs';
import { describe, expect, it } from 'vitest';

import { rangeBound } from './range-bound';

describe('rangeBound', () => {
  it('起点取当天 00:00:00', () => {
    expect(rangeBound(dayjs('2026-09-20T14:30:00'), 'start')).toBe(
      '2026-09-20T00:00:00',
    );
  });

  it('终点取当天 23:59:59', () => {
    expect(rangeBound(dayjs('2026-09-20T09:00:00'), 'end')).toBe(
      '2026-09-20T23:59:59',
    );
  });

  // 这条是核心：日期选择器给出的值带什么时间部分，都不该影响结果。
  // 原来的实现是 `d.format('YYYY-MM-DDTHH:mm:ss')`——时间部分原样透传，于是
  // 「查到今天为止」漏掉今天的一段，漏多少还取决于你几点钟选的。
  it('选择器给的时间部分不影响结果', () => {
    const moments = [
      '2026-09-20T00:00:00',
      '2026-09-20T09:15:33',
      '2026-09-20T14:30:00',
      '2026-09-20T23:59:59',
    ];
    for (const m of moments) {
      expect(rangeBound(dayjs(m), 'start')).toBe('2026-09-20T00:00:00');
      expect(rangeBound(dayjs(m), 'end')).toBe('2026-09-20T23:59:59');
    }
  });

  it('终点那天的记录会被包含进来（`<=` 的边界）', () => {
    // 后端是 `created_at <= end`，所以终点必须是当天最后一秒而不是 00:00:00，
    // 否则选「1 号到 20 号」会把 20 号那一整天漏掉。
    const end = rangeBound(dayjs('2026-09-20T08:00:00'), 'end');
    expect(dayjs('2026-09-20T23:59:59').isBefore(dayjs(end))).toBe(false);
    expect(dayjs('2026-09-20T23:59:59').isSame(dayjs(end))).toBe(true);
  });

  it('未选择时返回 undefined（后端按「不筛」处理）', () => {
    expect(rangeBound(undefined, 'start')).toBeUndefined();
    expect(rangeBound(null, 'end')).toBeUndefined();
  });

  it('跨月/跨年也对', () => {
    expect(rangeBound(dayjs('2026-12-31T22:00:00'), 'start')).toBe(
      '2026-12-31T00:00:00',
    );
    expect(rangeBound(dayjs('2027-01-01T01:00:00'), 'end')).toBe(
      '2027-01-01T23:59:59',
    );
  });
});
