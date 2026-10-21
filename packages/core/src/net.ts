/** IPv4 주소가 루프백/사설/링크로컬/예약 대역인지 판별한다. */
function isPrivateIPv4(ip: string): boolean {
  const p = ip.split(".").map(Number);
  if (p.length !== 4 || p.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return false;
  const [a, b] = p as [number, number, number, number];
  return (
    a === 0 || a === 10 || a === 127 ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 100 && b >= 64 && b <= 127) || // CGNAT
    a >= 224 // multicast/reserved
  );
}

/** IP 리터럴(v4/v6)이 공개 인터넷 주소가 아닌지 판별한다. */
export function isPrivateAddress(ip: string): boolean {
  const addr = ip.toLowerCase().replace(/^\[|\]$/g, "");
  if (!addr.includes(":")) return isPrivateIPv4(addr);
  if (addr === "::" || addr === "::1") return true;
  const mapped = /^::ffff:(.+)$/.exec(addr)?.[1];
  if (mapped) {
    if (mapped.includes(".")) return isPrivateIPv4(mapped);
    const [hi, lo] = mapped.split(":").map((h) => parseInt(h, 16));
    if (hi !== undefined && lo !== undefined) return isPrivateIPv4(`${hi >> 8}.${hi & 255}.${lo >> 8}.${lo & 255}`);
  }
  return /^f[cd]/.test(addr) || /^fe[89ab]/.test(addr); // ULA fc00::/7, link-local fe80::/10
}

const IP_LITERAL = /^[\d.]+$|:/;

/** 호스트 이름이 로컬 전용이거나 IP 리터럴이 사설 대역이면 true. DNS 조회는 하지 않는다. */
export function isPrivateHostname(hostname: string): boolean {
  const h = hostname.toLowerCase().replace(/\.$/, "");
  if (h === "localhost" || h.endsWith(".localhost") || h.endsWith(".local") || h.endsWith(".internal")) return true;
  return IP_LITERAL.test(h) ? isPrivateAddress(h) : false;
}
