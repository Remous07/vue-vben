import { useAccessStore } from '@vben/stores';

import { baseRequestClient, requestClient } from '#/api/request';

export namespace AuthApi {
  export interface LoginParams {
    password?: string;
    username?: string;
    turnstile_token?: string;
    /** 勾选「记住我」→ 后端用更长的闲置窗口 */
    remember_me?: boolean;
  }

  export interface LoginResult {
    accessToken: string;
  }

  export interface RegisterParams {
    email: string;
    invite_code: string;
    password: string;
    username: string;
  }

  export interface RegisterResult {
    message: string;
  }

  export interface RefreshTokenResult {
    data: string;
    status: number;
  }
}

/** 登录 */
export async function loginApi(data: AuthApi.LoginParams) {
  return requestClient.post<AuthApi.LoginResult>('/auth/login', data);
}

/** TOTP 二次验证登录 */
export async function loginTotpApi(tempToken: string, totpCode: string) {
  return requestClient.post<AuthApi.LoginResult>('/auth/login-totp', {
    temp_token: tempToken,
    totp_code: totpCode,
  });
}

/** TOTP 状态 */
export async function getTotpStatusApi() {
  return requestClient.get<{ enabled: boolean }>('/account/totp/status');
}

/** TOTP 设置 - 生成密钥 */
export async function totpSetupApi() {
  return requestClient.post<{ secret: string; uri: string }>(
    '/account/totp/setup',
  );
}

/** TOTP 启用 - 验证并开启 */
export async function totpEnableApi(code: string) {
  return requestClient.post('/account/totp/enable', { code });
}

/** TOTP 禁用 - 验证并关闭 */
export async function totpDisableApi(code: string) {
  return requestClient.post('/account/totp/disable', { code });
}

/** 修改邮箱 */
export async function changeEmailApi(
  currentPassword: string,
  newEmail: string,
  totpCode?: string,
) {
  return requestClient.post<{ pending_email: string }>(
    '/account/change-email',
    {
      current_password: currentPassword,
      new_email: newEmail,
      totp_code: totpCode,
    },
  );
}

/** 重发邮箱修改验证邮件 */
export async function resendEmailChangeApi() {
  return requestClient.post('/account/resend-email-change');
}

/** Telegram 绑定状态 */
export async function getTelegramBindStatusApi() {
  return requestClient.get<{
    is_bound: boolean;
    telegram_first_name: null | string;
    telegram_id: null | number;
    telegram_username: null | string;
  }>('/account/bind-telegram/status');
}

/** Telegram 绑定 - 生成绑定密钥 */
export async function setupTelegramBindApi() {
  return requestClient.post<{ key: string }>('/account/bind-telegram/setup');
}

/** Telegram 解绑 */
export async function unbindTelegramApi() {
  return requestClient.post('/account/bind-telegram/unbind');
}

/** 注销账号 */
export async function deleteAccountApi(password: string, totpCode?: string) {
  return requestClient.post('/account/delete', {
    password,
    totp_code: totpCode,
  });
}

/** 修改密码 */
export async function changePasswordApi(
  currentPassword: string,
  newPassword: string,
  totpCode?: string,
) {
  return requestClient.post('/account/change-password', {
    current_password: currentPassword,
    new_password: newPassword,
    totp_code: totpCode,
  });
}

/** 修改用户名 */
export async function changeUsernameApi(
  currentPassword: string,
  newUsername: string,
  totpCode?: string,
) {
  return requestClient.put('/account/username', {
    current_password: currentPassword,
    new_username: newUsername,
    totp_code: totpCode,
  });
}

/** 注册 */
export async function registerApi(data: AuthApi.RegisterParams) {
  return requestClient.post<AuthApi.RegisterResult>('/auth/register', data);
}

/** 刷新 token（滑动续期）— 返回新的 accessToken 字符串。
 *
 * 用 baseRequestClient 是为了避开 requestClient 的 401 刷新拦截器造成递归，
 * 但它是裸客户端：既不会自动带 Authorization，也没有响应拦截器（默认
 * responseReturn: 'raw'，返回原始 AxiosResponse），所以要手动附 token、
 * 并显式按 resp.data.data 取值（响应体为 { code, data: { accessToken }, message }）。
 */
export async function refreshTokenApi(): Promise<string> {
  const accessStore = useAccessStore();
  const token = accessStore.accessToken;
  // 泛型即返回类型（裸客户端的 request() 直接 `return response as T`），
  // 故按 AxiosResponse 形状声明，与 getRegistrationStatusApi 的写法一致。
  const resp = await baseRequestClient.post<{
    data: { data: { accessToken: string } };
  }>('/auth/refresh', undefined, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  return resp?.data?.data?.accessToken ?? '';
}

/** 退出登录 — use requestClient so the JWT is sent and the audit records the actor.
 * username：token 过期自动登出时 Authorization 已缺失，前端从 userStore 兜底传用户名 */
export async function logoutApi(username?: string) {
  return requestClient.post('/auth/logout', undefined, {
    params: { username },
  });
}

/** 获取用户权限码 */
export async function getAccessCodesApi() {
  return requestClient.get<string[]>('/auth/codes');
}

/** 忘记密码 — 发送重置邮件 */
export async function forgotPasswordApi(data: {
  email: string;
  turnstile_token?: string;
}) {
  return requestClient.post('/auth/forgot-password', data);
}

/** 重发验证邮件 */
export async function resendVerificationApi(data: {
  email: string;
  turnstile_token?: string;
}) {
  return requestClient.post('/auth/resend-verification', data);
}

/** 重置密码 */
export async function resetPasswordApi(data: {
  new_password: string;
  token: string;
}) {
  return requestClient.post('/auth/reset-password', data);
}

/** 获取对话识别码 */
export async function getConversationCodeApi() {
  return requestClient.get<{ code: string }>('/account/conversation-code');
}

/** 设置对话识别码（主码） */
export async function setConversationCodeApi(code: string) {
  return requestClient.post<{ code: string }>('/account/conversation-code', {
    code,
  });
}

/** 获取临时识别码列表 */
export async function getConversationCodesApi() {
  return requestClient.get<ConversationCodeItem[]>(
    '/account/conversation-codes',
  );
}

/** 生成临时识别码 */
export async function createConversationCodeApi(payload: {
  code?: string;
  expires_at?: string;
  expires_days?: number;
  max_uses?: number;
  remark?: string;
}) {
  return requestClient.post<ConversationCodeItem>(
    '/account/conversation-codes',
    payload,
  );
}

/** 编辑临时识别码 */
export async function editConversationCodeApi(
  id: number,
  payload: {
    code?: string;
    expires_at?: string;
    max_uses: number;
    remark?: string;
  },
) {
  return requestClient.put(`/account/conversation-codes/${id}`, payload);
}

/** 重新激活临时识别码 */
export async function reactivateConversationCodeApi(id: number) {
  return requestClient.put(`/account/conversation-codes/${id}/reactivate`);
}

/** 撤销临时识别码 */
export async function revokeConversationCodeApi(id: number) {
  return requestClient.delete(`/account/conversation-codes/${id}`);
}

/** 永久删除临时识别码 */
export async function permanentlyDeleteConversationCodeApi(id: number) {
  return requestClient.delete(`/account/conversation-codes/${id}/permanent`);
}

/** 轮换默认识别码 */
export async function rotateConversationCodeApi() {
  return requestClient.post<{ code: string }>(
    '/account/conversation-code/rotate',
  );
}

/** 拉黑访客 */
export async function blockVisitorApi(tgUserId: number) {
  return requestClient.post('/blocked-visitors', { tg_user_id: tgUserId });
}

/** 取消拉黑访客 */
export async function unblockVisitorApi(tgUserId: number) {
  return requestClient.delete(`/blocked-visitors/${tgUserId}`);
}

/** 检查是否已拉黑 */
export async function getBlockedVisitorsApi() {
  return requestClient.get<
    {
      created_at: null | string;
      first_name: null | string;
      id: number;
      tg_user_id: number;
      username: null | string;
    }[]
  >('/blocked-visitors');
}

export interface CodeUserItem {
  tg_user_id: number;
  first_name: null | string;
  username: null | string;
  is_blocked: boolean;
  is_premium: boolean;
  last_active_at: null | string;
  message_count: number;
}

/** 获取使用某识别码的用户列表 */
export async function getCodeUsersApi(code: string) {
  return requestClient.get<CodeUserItem[]>(
    `/account/conversation-codes/${code}/users`,
  );
}

export interface ConversationCodeItem {
  active_session_count: number;
  id: number;
  code: string;
  max_uses: number;
  used_count: number;
  is_active: boolean;
  is_default: boolean;
  remark: null | string;
  expires_at: null | string;
  created_at: null | string;
}

/** 获取注册状态（公开接口，无需登录） */
export function getRegistrationStatusApi() {
  return baseRequestClient.get<{
    data: {
      code: number;
      data: {
        open_registration: boolean;
        require_invite_code: boolean;
      };
    };
  }>('/auth/registration-status');
}
