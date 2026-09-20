/**
 * nickname.js —— 昵称本地净化（Web 移植，对照小程序 utils/contentSafe.js 的本地部分；
 * 微信云函数 msgSecCheck 为小程序专属，Web 无后端仅本地过滤）
 */

// 粗过滤：控制字符、常见广告联系方式模式
const BAD_PATTERN = /(加微信|加V|vx|qq群|代刷|刷单|红包|转账|http[s]?:\/\/|www\.)/i;

export function sanitizeNickname(input) {
  let s = String(input == null ? '' : input);
  s = s.replace(/[\u0000-\u001f\u007f]/g, '');
  s = s.replace(/\s+/g, ' ').trim();
  s = Array.from(s).slice(0, 12).join('');
  return s;
}

/**
 * 校验昵称
 * @returns {{ ok: boolean, value: string, message?: string }}
 */
export function checkNickname(input) {
  const value = sanitizeNickname(input);
  if (!value) {
    return { ok: false, value, message: '昵称不能为空哦' };
  }
  if (BAD_PATTERN.test(value)) {
    return { ok: false, value, message: '昵称里不能有广告或联系方式哦' };
  }
  return { ok: true, value };
}
