import { requestClient } from '#/api/request';

export interface AuditOperationItem {
  id: number;
  admin_username: null | string;
  action: string;
  action_label: string;
  detail: null | string;
  ip: null | string;
  country: null | string;
  user_agent: null | string;
  ua_browser: null | string;
  ua_os: null | string;
  ua_device: null | string;
  source: null | string;
  created_at: null | string;
}

export interface RuntimeLogItem {
  id: number;
  level: string;
  logger: string;
  message: string;
  created_at: null | string;
}

export interface AuditListResponse<T> {
  items: T[];
  total: number;
}

export interface RuntimeLogPage {
  items: RuntimeLogItem[];
  /** 游标：下一页从 id < next_cursor 取；null 表示没有更多 */
  next_cursor: null | number;
}

export interface RetentionConfig {
  audit_days: number;
  log_days: number;
}

export interface AuditStats {
  operation_total: number;
  operation_today: number;
  log_total: number;
  log_error: number;
}

/** 日志审计统计（顶部卡片） */
export function getAuditStatsApi() {
  return requestClient.get<AuditStats>('/audit/stats');
}

/** 操作记录列表 */
export function getAuditOperationsApi(params: {
  action?: string;
  admin_username?: string;
  end?: string;
  limit?: number;
  offset?: number;
  start?: string;
  ua_device?: string;
}) {
  return requestClient.get<AuditListResponse<AuditOperationItem>>(
    '/audit/operations',
    { params },
  );
}

/** 运行日志列表（keyset 游标分页） */
export function getRuntimeLogsApi(params: {
  before_id?: number;
  end?: string;
  level?: string;
  limit?: number;
  start?: string;
}) {
  return requestClient.get<RuntimeLogPage>('/audit/runtime-logs', { params });
}

/** 获取日志保留天数 */
export function getAuditRetentionApi() {
  return requestClient.get<RetentionConfig>('/audit/retention');
}

/** 设置日志保留天数 */
export function setAuditRetentionApi(payload: RetentionConfig) {
  return requestClient.put('/audit/retention', payload);
}

/** 一键清空操作记录（返回删了多少条，用于提示） */
export function clearAuditOperationsApi() {
  return requestClient.delete<{ deleted: number }>('/audit/operations');
}

/** 一键清空运行日志（返回删了多少条，用于提示） */
export function clearRuntimeLogsApi() {
  return requestClient.delete<{ deleted: number }>('/audit/runtime-logs');
}
