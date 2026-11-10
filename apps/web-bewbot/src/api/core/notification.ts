import { requestClient } from '#/api/request';

/** 告警是过去发生的事（读过即消失）；待办是此刻成立的条件（忽略有冷却）。 */
export type NotificationKind = 'alert' | 'todo';

export interface PanelNotification {
  /** 通知的身份——通知是派生视图，没有自增 id，key 就是它的 id。 */
  key: string;
  kind: NotificationKind;
  title: string;
  message: string;
  /** 带 +08:00 偏移的 ISO 时间串。 */
  date: null | string;
  /** 内部路由路径，例如 `/system/audit-logs`。 */
  link: null | string;
  query: null | Record<string, string>;
}

export interface NotificationListResponse {
  items: PanelNotification[];
  /** 铃铛红点只看它：告警未读数。待办长期存在，计入会让红点常亮。 */
  unread_alerts: number;
}

export function getNotificationsApi() {
  return requestClient.get<NotificationListResponse>('/notifications');
}

export function setNotificationStateApi(
  key: string,
  state: 'dismissed' | 'read',
) {
  return requestClient.post('/notifications/state', { key, state });
}

export function clearNotificationsApi() {
  return requestClient.post<{ cleared: number }>('/notifications/clear');
}
