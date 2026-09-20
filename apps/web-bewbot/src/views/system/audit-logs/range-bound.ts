import type { Dayjs } from 'dayjs';

/**
 * 日期范围筛选的边界串：RangePicker 只选到「天」，所以两端都按**整天**理解——
 * 起点取当天 `00:00:00`，终点取当天 `23:59:59`。
 *
 * **不取整就是个 bug**：日期选择器只表达「哪一天」，它给出的值里那部分时间是视窗
 * 基准日继承下来的（antd 内部走 `getNow()` 或当前值，见 vc-picker 的 PickerPanel），
 * 既不是 `00:00` 也不是 `23:59`。原样发给后端，而后端用的是 `created_at <= end`
 * ——于是「查到今天为止」会把今天那一段记录漏掉，漏多少还取决于你**几点钟**选的：
 * 同一个查询，上午选和下午选结果不一样。这是最难受的一种 bug：它不是「一直错」，
 * 是「有时错」，所以没人会去查。
 *
 * 返回的串**不带偏移**，按约定表示北京时间，与显示侧的 `formatTime` 是同一套语义
 * （后端 `_parse_dt` 就是这么理解的）。这样不会出现「看到的是北京、筛的是浏览器
 * 本地」那种错位。
 */
export function rangeBound(
  d: Dayjs | null | undefined,
  edge: 'end' | 'start',
): string | undefined {
  if (!d) {
    return undefined;
  }
  const aligned = edge === 'start' ? d.startOf('day') : d.endOf('day');
  return aligned.format('YYYY-MM-DDTHH:mm:ss');
}
