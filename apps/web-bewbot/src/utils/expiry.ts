import type { VNode } from 'vue';

import { h } from 'vue';

import { Tag } from 'ant-design-vue';

import { formatBeijingDateTime } from './datetime';

/**
 * 「过期时间」列在**已经过期之后**显示什么：红标签 + 过期的那一刻。
 *
 * 原来这里只有一枚「已过期」标签。倒计时一归零，那一刻的信息就从列表里消失了，
 * 想核对「这个码什么时候失效的」只能去翻审计日志。过期是常态而不是异常——临时码
 * 本来就有期限，过期后的行更该把时间留在原处。
 *
 * 两个列表（账号页的识别码、系统页的邀请码）共用这一份渲染，免得各写一份以后走样。
 */
export function expiredAtCell(expiresAt: null | string | undefined): VNode {
  return h('div', { style: 'display:flex;align-items:center;gap:6px' }, [
    h(Tag, { color: 'red', style: 'margin:0;flex-shrink:0' }, () => '已过期'),
    h(
      'span',
      {
        style:
          'font-size:12px;white-space:nowrap;color:hsl(var(--muted-foreground) / 80%)',
      },
      formatBeijingDateTime(expiresAt),
    ),
  ]);
}
