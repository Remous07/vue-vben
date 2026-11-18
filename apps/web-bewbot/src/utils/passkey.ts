import { browserSupportsWebAuthn } from '@simplewebauthn/browser';

/**
 * 当前浏览器能不能用通行密钥。
 *
 * 需要安全上下文（HTTPS 或 localhost）且浏览器实现了 WebAuthn；不满足时按钮不该
 * 出现——点下去只会抛一个用户看不懂的异常。
 */
export function passkeySupported(): boolean {
  try {
    return browserSupportsWebAuthn();
  } catch {
    return false;
  }
}

/**
 * 浏览器侧（不是后端）的失败文案。
 *
 * 这些错误由 WebAuthn API 直接抛出，请求拦截器看不到，必须自己翻译成人话：
 * - 用户在系统弹窗里取消 / 超时 → NotAllowedError / AbortError
 * - 这枚凭据已经注册过 → InvalidStateError
 * - 浏览器或设备不支持 → NotSupportedError
 * - 非安全上下文 → SecurityError
 *
 * 后端返回的错误没有 ``name``，交给拦截器按 detail 弹，这里返回 ``null``。
 */
export function describePasskeyError(error: unknown): null | string {
  const name = (error as { name?: string })?.name;
  switch (name) {
    case 'AbortError':
    case 'NotAllowedError': {
      return '已取消或超时，请重试';
    }
    case 'InvalidStateError': {
      return '这枚通行密钥已经注册过了';
    }
    case 'NotSupportedError': {
      return '当前浏览器或设备不支持通行密钥';
    }
    case 'SecurityError': {
      return '通行密钥需要 HTTPS 环境';
    }
    default: {
      return null;
    }
  }
}
