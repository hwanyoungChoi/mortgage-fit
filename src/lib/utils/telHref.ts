const PHONE_PATTERN = /^[\d\s-]+$/;

/** 연락처가 숫자·하이픈·공백뿐이면 `tel:` 주소, 아니면 null(자유 문자열, A7) */
export function telHref(contact: string): string | null {
  const text = contact.trim();
  if (!PHONE_PATTERN.test(text) || !/\d/.test(text)) return null;
  return `tel:${text.replace(/[\s-]/g, "")}`;
}
