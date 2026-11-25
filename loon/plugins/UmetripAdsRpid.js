// 航旅纵横广告编号过滤，适用于 Loon Response Script。
// 参考 ddgksf2013 的 hanglvzongheng.js V1.0.2（2022-10-26）：
// https://raw.githubusercontent.com/ddgksf2013/Scripts/master/hanglvzongheng.js
// URL rpid 兼容参考 xingjiu29/Umetrip 的 umetrip.js；保留已核定广告编号。
// 只读取 rpid；不读取、解码或改写请求及响应正文。
const headers = $request.headers || {};
const key = Object.keys(headers).find((name) => name.toLowerCase() === "rpid");
const value = key === undefined ? undefined : headers[key];
let rpid = typeof value === "string" ? value.trim() : "";
if (!rpid) {
  const match = /[?&]rpid=([^&#]*)(?:[&#]|$)/i.exec(String($request.url || ""));
  if (match) {
    // 非法 URL 编码不作为广告编号，保留正常响应。
    try { rpid = decodeURIComponent(match[1]).trim(); }
    catch { rpid = ""; }
  }
}
const isAd = /^(10000012|1000019)$/.test(rpid);
$done(isAd ? { status: 404 } : {});
