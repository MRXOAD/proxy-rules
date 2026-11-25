// 按图片尺寸拦截广告图：长边 ≥ MIN_EDGE 的图换成 1×1 透明 PNG，小图原样放行。
// 整屏竖图（开屏，高 > 宽且高 ≥ SPLASH_MIN_HEIGHT）改为返回 404：换透明图时 App 仍当素材可用，照样显示空白开屏和「跳过」
// （2026-09-24 使用者实测农行）；下载失败则直接不进开屏。横幅、卡片仍用透明图，避免首页出现占位框。
// 用于广告图与功能图标混放在同一目录、文件名又是随机编号的银行 CDN。
// 使用方：浦大喜奔、工行、中信银行、动卡空间、广发（发现精彩）、农行、平安口袋银行。2026-09-24 由 BankAds-bigimg.js 改名。
// argument：min=<像素> 改阈值；mode=log 只把每张图的尺寸与地址写进日志、不拦截（新银行先用它定阈值）；
// mode=splash 只拦开屏比例的竖图（高 ≥ SPLASH_MIN_HEIGHT 且高宽比在 SPLASH_RATIO 之间）回 404，其余一律放行，
// ratio=<高宽比下限> 仅调整 splash 模式；默认 1.5，中信使用 2，上限固定 2.3。notify=<名称> 见下方 report()。
// splash_range / ad_ranges 按明确尺寸与比例区间拦截；min_jpeg_bytes=<字节> 拦超过阈值的 JPEG 大图回 204（平安口袋银行）。
// 更瘦长的竖图（活动长海报）放行并记 BANK_IMG；用于开屏尺寸随机型变、按阈值又会误伤横幅卡片的 App（浦大喜奔）。
// 2026-09-24 农行 midc.cdn-static.abchina.com.cn/distributecenterimg 两轮实测：功能图标长边 40–129，
// 智能客服卡通头像 252×158；历史开屏广告为 1125×2082。阈值曾误伤其他页图片，农行使用 splash_range + 窄比例 ad_ranges，另外按路径拦已确认广告。
const ARGS = typeof $argument === "string" ? $argument : "";
const LOG_ONLY = /(^|&)mode=log(&|$)/.test(ARGS);
const EXACT_ARG = ARGS.match(/(?:^|&)exact=([^&]*)/);
const RANGE_ARG = ARGS.match(/(?:^|&)splash_range=([^&]*)/);
const AD_RANGES_ARG = ARGS.match(/(?:^|&)ad_ranges=([^&]*)/);
const MIN_JPEG_BYTES_ARG = ARGS.match(/(?:^|&)min_jpeg_bytes=([^&]*)/);
const MIN_EDGE = Number((ARGS.match(/(?:^|&)min=(\d+)/) || [])[1]) || 150;
const SPLASH_MIN_HEIGHT = 1000;
const SPLASH_ONLY = /(^|&)mode=splash(&|$)/.test(ARGS);
// 浦大喜奔 1125×1931 约 1.72、17 Pro Max 全屏 1320×2868 约 2.17、农行 1125×2082 约 1.85。
const SPLASH_RATIO = [Number((ARGS.match(/(?:^|&)ratio=(\d+(?:\.\d+)?)(?:&|$)/) || [])[1]) || 1.5, 2.3];
const PIXEL = new Uint8Array([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
  0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01, 0x08, 0x06, 0x00, 0x00, 0x00, 0x1f, 0x15, 0xc4,
  0x89, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x44, 0x41, 0x54, 0x78, 0x9c, 0x63, 0x00, 0x01, 0x00, 0x00,
  0x05, 0x00, 0x01, 0x0d, 0x0a, 0x2d, 0xb4, 0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4e, 0x44, 0xae,
  0x42, 0x60, 0x82,
]);

function be16(b, i) { return (b[i] << 8) | b[i + 1]; }
function be32(b, i) { return ((b[i] << 24) | (b[i + 1] << 16) | (b[i + 2] << 8) | b[i + 3]) >>> 0; }
function le16(b, i) { return b[i] | (b[i + 1] << 8); }
function le24(b, i) { return b[i] | (b[i + 1] << 8) | (b[i + 2] << 16); }

// 返回 [宽, 高]；认不出的格式返回 null（放行）。
function imageSize(b) {
  if (!b || b.length < 30) return null;
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return [be32(b, 16), be32(b, 20)];
  if (b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46) return [le16(b, 6), le16(b, 8)];
  if (b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 && b[8] === 0x57 && b[9] === 0x45) {
    const chunk = String.fromCharCode(b[12], b[13], b[14], b[15]);
    if (chunk === "VP8X") return [le24(b, 24) + 1, le24(b, 27) + 1];
    if (chunk === "VP8L") return [1 + (((b[22] & 0x3f) << 8) | b[21]), 1 + (((b[24] & 0x0f) << 10) | (b[23] << 2) | ((b[22] & 0xc0) >> 6))];
    if (chunk === "VP8 ") return [le16(b, 26) & 0x3fff, le16(b, 28) & 0x3fff];
    return null;
  }
  if (b[0] === 0xff && b[1] === 0xd8) {
    let i = 2;
    while (i + 9 < b.length) {
      if (b[i] !== 0xff) { i++; continue; }
      const marker = b[i + 1];
      if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
        return [be16(b, i + 7), be16(b, i + 5)];
      }
      if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) { i += 2; continue; }
      i += 2 + be16(b, i + 2);
    }
  }
  return null;
}

const body = $response.body;
const size = imageSize(body);

// notify=<名称>：诊断用，只在定位开屏素材期间打开，仅 splash 模式生效。竖图且高 ≥ NOTIFY_MIN_HEIGHT 时发一条本地通知，
// 写明尺寸、处理结果和地址末三段，点通知把完整地址复制到剪贴板；认不出格式的大文件也报一条（开屏可能是视频或新图片格式）。
// 每 10 分钟另报一次“诊断已开启”，用来确认手机拿到的是带诊断的新脚本。只写本机通知与本机存储，不联网。
// 报的每一条同时写一行 BANK_DIAG 到脚本日志：Loon 日志等级调到 Debug 后导出的日志里能看到，不必截图通知。
const NOTIFY = (ARGS.match(/(?:^|&)notify=([^&]+)/) || [])[1];
const NOTIFY_MIN_HEIGHT = 800;
function report(verdict) {
  if (!NOTIFY) return;
  const key = `BankImageSize.notify.${NOTIFY}`;
  if (Date.now() - Number($persistentStore.read(key) || 0) > 600000) {
    $persistentStore.write(String(Date.now()), key);
    $notification.post(`${NOTIFY} 开屏诊断已开启`, "", "之后每张较大的竖图会各报一条");
  }
  if (size ? size[1] > size[0] && size[1] >= NOTIFY_MIN_HEIGHT : body && body.length > 80000) {
    const url = $request.url.split("?")[0];
    const what = size ? `${size[0]}×${size[1]}` : `未识别格式 ${Math.round(body.length / 1024)}KB`;
    console.log(`BANK_DIAG ${NOTIFY} ${what} ${verdict} ${url}`);
    $notification.post(`${NOTIFY} ${what}`, verdict, url.split("/").slice(-3).join("/"), { clipboard: `${what} ${verdict} ${url}` });
  }
}
function parseRange(spec) {
  const m = /^([1-9]\d{0,4})x([1-9]\d{0,4}):(\d+(?:\.\d+)?)-(\d+(?:\.\d+)?)$/.exec(spec);
  if (!m) return null;
  const minW = Number(m[1]), minH = Number(m[2]), minR = Number(m[3]), maxR = Number(m[4]);
  if (!(minR > 0 && maxR >= minR)) return null;
  return { minW, minH, minR, maxR };
}
function matchRange(s, r) {
  if (!s || !r || !s[0]) return false;
  const ratio = s[1] / s[0];
  return s[0] >= r.minW && s[1] >= r.minH && ratio >= r.minR && ratio <= r.maxR;
}

function headerValue(headers, name) {
  if (!headers) return "";
  const target = name.toLowerCase();
  for (const k of Object.keys(headers)) {
    if (k.toLowerCase() === target) return String(headers[k] || "");
  }
  return "";
}
function isJpeg(b, headers) {
  if (!b || b.length < 2) return false;
  if (b[0] === 0xff && b[1] === 0xd8) return true;
  if (size) return false;
  return /^image\/jpe?g(?:;|$|\s)/i.test(headerValue(headers, "content-type"));
}

// 特定尺寸/比例/体积模式优先于纯 mode=log；参数错误、非完整响应与未知素材均放行。
// 同时传 mode=log 时，未命中的图片仍输出 BANK_IMG 供 Debug 日志定位漏网素材。
if (EXACT_ARG || RANGE_ARG || AD_RANGES_ARG || MIN_JPEG_BYTES_ARG) {
  const target = EXACT_ARG && /^([1-9]\d{0,4})x([1-9]\d{0,4})$/.exec(EXACT_ARG[1]);
  // splash_range=最小宽x最小高:最小高宽比-最大高宽比；ad_ranges 支持逗号分隔的多组窄比例区间（浮窗/弹窗回 204）。
  const range = RANGE_ARG && parseRange(RANGE_ARG[1]);
  const adRanges = AD_RANGES_ARG ? AD_RANGES_ARG[1].split(",").map(parseRange).filter(Boolean) : [];
  const minJpegBytes = MIN_JPEG_BYTES_ARG && /^[1-9]\d*$/.test(MIN_JPEG_BYTES_ARG[1]) ? Number(MIN_JPEG_BYTES_ARG[1]) : 0;
  const exact = target && size && size[0] === Number(target[1]) && size[1] === Number(target[2]);
  const portrait = range && size && size[1] > size[0] && matchRange(size, range);
  const adMatch = adRanges.length > 0 && adRanges.some(r => matchRange(size, r));
  const bigJpeg = minJpegBytes > 0 && body && body.length > minJpegBytes && isJpeg(body, $response.headers);
  if ($response.status === 200 && (exact || portrait)) {
    console.log("BANK_BIGIMG 开屏 404 " + size[0] + "x" + size[1] + " " + $request.url.split("?")[0]);
    $done({ status: 404, headers: { "Content-Type": "text/plain" }, body: "" });
  } else if ($response.status === 200 && (adMatch || bigJpeg)) {
    const detail = size ? `${size[0]}x${size[1]}` : `${Math.round(body.length / 1024)}KB`;
    const suffix = bigJpeg ? ` (${Math.round(body.length / 1024)}KB)` : "";
    console.log(`BANK_BIGIMG 广告 204 ${detail}${suffix} ${$request.url.split("?")[0]}`);
    $done({ status: 204, headers: {}, body: "" });
  } else {
    if (LOG_ONLY && size) {
      const kb = MIN_JPEG_BYTES_ARG && body ? ` ${Math.round(body.length / 1024)}KB` : "";
      console.log(`BANK_IMG ${size[0]}x${size[1]}${kb} ${$request.url.split("?")[0]}`);
    }
    $done({});
  }
} else if (LOG_ONLY) {
  if (size) console.log(`BANK_IMG ${size[0]}x${size[1]} ${$request.url.split("?")[0]}`);
  $done({});
} else if (SPLASH_ONLY) {
  const ratio = size ? size[1] / size[0] : 0;
  if (size && size[1] >= SPLASH_MIN_HEIGHT && ratio >= SPLASH_RATIO[0] && ratio <= SPLASH_RATIO[1]) {
    console.log(`BANK_BIGIMG 开屏 404 ${size[0]}x${size[1]} ${$request.url.split("?")[0]}`);
    report("已拦（回 404）");
    $done({ status: 404, headers: { "Content-Type": "text/plain" }, body: "" });
  } else {
    if (size && size[1] > size[0] && size[1] >= SPLASH_MIN_HEIGHT) console.log(`BANK_IMG ${size[0]}x${size[1]} ${$request.url.split("?")[0]}`);
    report("放行");
    $done({});
  }
} else if (size && size[1] > size[0] && size[1] >= SPLASH_MIN_HEIGHT) {
  console.log(`BANK_BIGIMG 开屏 404 ${size[0]}x${size[1]} ${$request.url.split("?")[0]}`);
  $done({ status: 404, headers: { "Content-Type": "text/plain" }, body: "" });
} else if (size && Math.max(size[0], size[1]) >= MIN_EDGE) {
  const headers = {};
  for (const k of Object.keys($response.headers || {})) {
    const lk = k.toLowerCase();
    if (lk !== "content-length" && lk !== "content-type" && lk !== "content-encoding") headers[k] = $response.headers[k];
  }
  headers["Content-Type"] = "image/png";
  console.log(`BANK_BIGIMG 拦截 ${size[0]}x${size[1]} ${$request.url.split("?")[0]}`);
  $done({ headers, body: PIXEL });
} else {
  $done({});
}
