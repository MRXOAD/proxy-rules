// 中国移动 App 页面净化（自写，2026-10-03）。使用方：ChinaMobileAds.plugin。
// client.app.coc.10086.cn 的 biz-orange 原生接口响应是 base64(AES-128-CBC) 密文，响应头 x-pen: 14，另带
// r-token = md5(请求头 x-nonce + "+" + 响应体) 的签名，Loon 的 response.json.jq 碰不到明文，只能解密后改。
// 本脚本只做：解密 → 按下面的清单删广告楼层 → 加密 → 重算 r-token。不联网，不动清单之外的任何字段。
//
// 先验证后改写：x-pen 不是 14、没有 $crypto.aes（Loon Build < 988）、缺 x-nonce 或 r-token、原响应的 r-token
// 对不上上面的公式、解密不出 JSON，任何一条不成立都原样放行，在脚本日志记一行原因，并最多每 3 天弹一次通知
// （旧的混淆脚本失效时毫无迹象，这里要让失效看得见）。协议与清单参考 ccyykk666/Loon-Plugin 与 sooyaaabo 的
// 可读脚本（2026-09、2026-10 版，二者密钥与签名算法一致），没有本机真实流量核对过，所以才有这层验证。
// 密钥与 IV 是 App 内置的静态常量（上述公开脚本里同样写明），不是使用者的凭据。
//
// 清单参考两份有继承关系的社区脚本；不把它们视作独立证据。用途不明的「我的」页楼层保留：
// - 首页楼层 DN/homePage/getTopAreaList：HOME_AD_AREAS 里的楼层与瀑布流楼层；整页被删空时标记 lastPage，
//   免得 App 一直翻页。不强行截断首页（两份来源在第 1 页就标记 lastPage，这里不照搬）。
// - 首页聚合 DN/multipleInterfaces/aggregationData：下拉二楼 topPullSecond、弹窗 popUpList 里 isAdvert 为 1 的项、
//   悬浮位 suspensionAdver 的 5 个列表清空。余额不足提示位 notSufficientFundsAdver 不动。
// - 「我的」页 DN/myPageNew/getMyPageNew：MINE_AD_AREAS（签到浮窗、营销区域）。
//   我的设备、云盘、彩铃、家庭、生活服务、AI 助理等功能区块不动。
// 页面缺内容时单独关掉 ChinaMobileAds.plugin；日志行格式：ChinaMobileAds <接口> <结果> <明细>。
(function () {
  "use strict";

  var TAG = "ChinaMobileAds";
  var KEY = "RYV0hCV1lV25KYVJ";
  var IV = "VjFSQ1ZtVkQxRTlQ";
  var X_PEN = "14";
  var WARN_KEY = "ChinaMobileAds.warned";
  var WARN_INTERVAL_MS = 3 * 24 * 3600 * 1000;

  var ENDPOINTS = [
    { name: "home", pattern: /\/biz-orange\/DN\/homePage\/getTopAreaList(?:\?|$)/, filter: filterHome },
    { name: "aggregation", pattern: /\/biz-orange\/DN\/multipleInterfaces\/aggregationData(?:\?|$)/, filter: filterAggregation },
    { name: "mine", pattern: /\/biz-orange\/DN\/myPageNew\/getMyPageNew(?:\?|$)/, filter: filterMine }
  ];
  var HOME_AD_AREAS = toSet([
    "20260508002", "20241010002", "20250609002", "20250929002",
    "20241115002", "20241213006", "20241115004", "20241119002"
  ]);
  var MINE_AD_AREAS = toSet([
    "20230721008", // 签到浮窗
    "20230721012" // 营销区域
  ]);
  var SUSPENSION_LISTS = ["pageList", "suspensionList", "liveSuspensionList", "lingXiPageList", "floatingWindow"];
  // 这些结果说明接口格式与本脚本的假设不符，规则实际没生效，要通知。
  var MISMATCH = /^(?:no-crypto|xpen-|no-nonce|no-rtoken|sign-mismatch|decrypt-fail|unsafe-number|error)/;

  function toSet(list) {
    var set = {};
    for (var i = 0; i < list.length; i++) set[list[i]] = true;
    return set;
  }

  function has(object, key) {
    return Object.prototype.hasOwnProperty.call(object, key);
  }

  function header(headers, wanted) {
    if (!headers) return "";
    for (var name in headers) {
      if (has(headers, name) && name.toLowerCase() === wanted) {
        return headers[name] === undefined || headers[name] === null ? "" : String(headers[name]);
      }
    }
    return "";
  }

  // ---- 编码：UTF-8、Base64、MD5（Loon 脚本环境没有 atob / TextEncoder / 摘要 API） ----

  function utf8Bytes(text) {
    var binary = unescape(encodeURIComponent(text));
    var bytes = new Uint8Array(binary.length);
    for (var i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return bytes;
  }

  function utf8Text(bytes) {
    var binary = "";
    for (var i = 0; i < bytes.length; i += 8192) {
      binary += String.fromCharCode.apply(null, bytes.subarray(i, i + 8192));
    }
    return decodeURIComponent(escape(binary));
  }

  var BASE64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

  function base64Decode(text) {
    var length = text.length;
    if (!length || length % 4 !== 0) throw new Error("base64 length");
    var padding = text.charAt(length - 1) === "=" ? (text.charAt(length - 2) === "=" ? 2 : 1) : 0;
    var bytes = new Uint8Array((length / 4) * 3 - padding);
    var at = 0;
    for (var i = 0; i < length; i += 4) {
      var value = 0;
      for (var j = 0; j < 4; j++) {
        var char = text.charAt(i + j);
        var index = char === "=" && i + j >= length - padding ? 0 : BASE64.indexOf(char);
        if (index < 0) throw new Error("base64 char");
        value = value * 64 + index;
      }
      if (at < bytes.length) bytes[at++] = (value >>> 16) & 255;
      if (at < bytes.length) bytes[at++] = (value >>> 8) & 255;
      if (at < bytes.length) bytes[at++] = value & 255;
    }
    return bytes;
  }

  function base64Encode(bytes) {
    var parts = [];
    for (var i = 0; i < bytes.length; i += 3) {
      var rest = bytes.length - i;
      var value = (bytes[i] << 16) | ((rest > 1 ? bytes[i + 1] : 0) << 8) | (rest > 2 ? bytes[i + 2] : 0);
      parts.push(
        BASE64.charAt((value >>> 18) & 63) +
        BASE64.charAt((value >>> 12) & 63) +
        (rest > 1 ? BASE64.charAt((value >>> 6) & 63) : "=") +
        (rest > 2 ? BASE64.charAt(value & 63) : "=")
      );
    }
    return parts.join("");
  }

  var MD5_SHIFTS = [7, 12, 17, 22, 5, 9, 14, 20, 4, 11, 16, 23, 6, 10, 15, 21];

  function md5(text) {
    var input = utf8Bytes(text);
    var padded = new Uint8Array((((input.length + 8) >>> 6) + 1) * 64);
    padded.set(input);
    padded[input.length] = 128;
    var bits = input.length * 8;
    for (var n = 0; n < 4; n++) {
      padded[padded.length - 8 + n] = (bits >>> (8 * n)) & 255;
      padded[padded.length - 4 + n] = (Math.floor(bits / 4294967296) >>> (8 * n)) & 255;
    }
    var state = [1732584193, 4023233417, 2562383102, 271733878];
    for (var offset = 0; offset < padded.length; offset += 64) {
      var words = [];
      for (var w = 0; w < 16; w++) {
        var p = offset + w * 4;
        words[w] = (padded[p] | (padded[p + 1] << 8) | (padded[p + 2] << 16) | (padded[p + 3] << 24)) >>> 0;
      }
      var a = state[0], b = state[1], c = state[2], d = state[3];
      for (var i = 0; i < 64; i++) {
        var round = i >>> 4;
        var f, g;
        if (round === 0) { f = (b & c) | (~b & d); g = i; }
        else if (round === 1) { f = (d & b) | (~d & c); g = (5 * i + 1) % 16; }
        else if (round === 2) { f = b ^ c ^ d; g = (3 * i + 5) % 16; }
        else { f = c ^ (b | ~d); g = (7 * i) % 16; }
        var constant = Math.floor(Math.abs(Math.sin(i + 1)) * 4294967296);
        var sum = (a + (f >>> 0) + constant + words[g]) >>> 0;
        var shift = MD5_SHIFTS[round * 4 + (i % 4)];
        a = d;
        d = c;
        c = b;
        b = (b + ((sum << shift) | (sum >>> (32 - shift)))) >>> 0;
      }
      state[0] = (state[0] + a) >>> 0;
      state[1] = (state[1] + b) >>> 0;
      state[2] = (state[2] + c) >>> 0;
      state[3] = (state[3] + d) >>> 0;
    }
    var hex = "";
    for (var s = 0; s < 4; s++) {
      for (var k = 0; k < 4; k++) hex += ("0" + ((state[s] >>> (8 * k)) & 255).toString(16)).slice(-2);
    }
    return hex;
  }

  // ---- 加解密与签名 ----

  function aesOptions() {
    return { mode: "cbc", key: utf8Bytes(KEY), iv: utf8Bytes(IV), padding: "pkcs7" };
  }

  function decryptJson(body) {
    return JSON.parse(utf8Text($crypto.aes.decrypt(base64Decode(body), aesOptions())), function (key, value) {
      // JSON 往返会舍入超出安全范围的整数；遇到这类业务字段时保留原密文。
      if (typeof value === "number" && (!isFinite(value) || (Math.floor(value) === value && Math.abs(value) > 9007199254740991))) {
        throw new Error("unsafe-number");
      }
      return value;
    });
  }

  function encryptJson(payload) {
    return base64Encode($crypto.aes.encrypt(utf8Bytes(JSON.stringify(payload)), aesOptions()).ciphertext);
  }

  function sign(nonce, body) {
    return md5(nonce + "+" + body);
  }

  // ---- 各接口的删除清单：返回 { hit: [删掉的], seen: [本次看到的全部 areaId] }，hit 为空表示没改 ----

  function areaId(area) {
    return String(area && area.areaId);
  }

  function isWaterfall(area) {
    if (!area) return false;
    if (String(area.waterfall) === "1") return true;
    if (Array.isArray(area.additionInfo)) {
      for (var i = 0; i < area.additionInfo.length; i++) {
        var item = area.additionInfo[i];
        if (item && String(item.name).toLowerCase() === "waterfall" && String(item.value) === "1") return true;
      }
    }
    return !!(area.additionInfoMap && String(area.additionInfoMap.waterfall) === "1");
  }

  function dropAreas(body, shouldDrop) {
    var result = { hit: [], seen: [] };
    if (!Array.isArray(body.areaList)) return result;
    var kept = [];
    for (var i = 0; i < body.areaList.length; i++) {
      var area = body.areaList[i];
      var label = shouldDrop(area);
      result.seen.push(areaId(area));
      if (label) result.hit.push(label);
      else kept.push(area);
    }
    if (result.hit.length) body.areaList = kept;
    return result;
  }

  function filterHome(body) {
    var result = dropAreas(body, function (area) {
      if (HOME_AD_AREAS[areaId(area)]) return areaId(area);
      return isWaterfall(area) ? areaId(area) + "(waterfall)" : "";
    });
    if (result.hit.length && body.areaList.length === 0 && body.lastPage !== true) body.lastPage = true;
    return result;
  }

  function filterMine(body) {
    return dropAreas(body, function (area) {
      return MINE_AD_AREAS[areaId(area)] ? areaId(area) : "";
    });
  }

  function filterAggregation(body) {
    var result = { hit: [], seen: [] };
    if (has(body, "topPullSecond")) {
      delete body.topPullSecond;
      result.hit.push("topPullSecond");
    }
    if (Array.isArray(body.popUpList)) {
      var kept = body.popUpList.filter(function (item) {
        return String(item && item.isAdvert) !== "1";
      });
      if (kept.length !== body.popUpList.length) {
        result.hit.push("popUpList*" + (body.popUpList.length - kept.length));
        body.popUpList = kept;
      }
    }
    var suspension = body.suspensionAdver;
    if (suspension && typeof suspension === "object") {
      for (var i = 0; i < SUSPENSION_LISTS.length; i++) {
        var name = SUSPENSION_LISTS[i];
        if (Array.isArray(suspension[name]) && suspension[name].length) {
          suspension[name] = [];
          result.hit.push("suspensionAdver." + name);
        }
      }
    }
    return result;
  }

  // ---- 主流程：每次执行只调用一次 $done ----

  function main() {
    var url = typeof $request === "object" && $request ? String($request.url || "") : "";
    var endpoint = null;
    for (var i = 0; i < ENDPOINTS.length; i++) {
      if (ENDPOINTS[i].pattern.test(url)) endpoint = ENDPOINTS[i];
    }
    if (!endpoint) return { name: "-", code: "skip-url" };
    var out = { name: endpoint.name };

    if (typeof $response !== "object" || !$response || Number($response.status) !== 200) {
      out.code = "skip-status";
      return out;
    }
    if (typeof $response.body !== "string" || !$response.body) {
      out.code = "skip-empty";
      return out;
    }
    if (typeof $crypto !== "object" || !$crypto || !$crypto.aes) {
      out.code = "no-crypto";
      return out;
    }
    var xPen = header($response.headers, "x-pen");
    if (xPen !== X_PEN) {
      out.code = "xpen-" + (xPen || "none").slice(0, 8);
      return out;
    }
    var nonce = header($request.headers, "x-nonce");
    var token = header($response.headers, "r-token");
    if (!nonce) {
      out.code = "no-nonce";
      return out;
    }
    if (!token) {
      out.code = "no-rtoken";
      return out;
    }
    // 签名按原始响应体逐字核对；两份来源都先按 Content-Length 截断响应体，这里把截断后的也当候选。
    var candidates = [$response.body];
    var declared = parseInt(header($response.headers, "content-length"), 10);
    if (declared > 0 && declared < $response.body.length) candidates.push($response.body.slice(0, declared));
    var body = "";
    for (var c = 0; c < candidates.length && !body; c++) {
      if (sign(nonce, candidates[c]) === token.toLowerCase()) body = candidates[c];
    }
    if (!body) {
      out.code = "sign-mismatch";
      return out;
    }

    var payload;
    try {
      payload = decryptJson(body.replace(/\s+/g, ""));
    } catch (error) {
      out.code = error && error.message === "unsafe-number" ? "unsafe-number" : "decrypt-fail";
      return out;
    }
    if (!payload || typeof payload !== "object" || !payload.rspBody || typeof payload.rspBody !== "object") {
      out.code = "no-rspbody";
      return out;
    }
    if (payload.retCode !== "000000") {
      out.code = "skip-business-error";
      return out;
    }

    var result = endpoint.filter(payload.rspBody);
    out.detail = (result.hit.length ? "removed=" + result.hit.join(",") : "") +
      (result.seen.length ? " seen=" + result.seen.join(",") : "");
    if (!result.hit.length) {
      out.code = "unchanged";
      return out;
    }

    var newBody = encryptJson(payload);
    var headers = {};
    var original = $response.headers || {};
    for (var name in original) {
      if (!has(original, name)) continue;
      var lower = name.toLowerCase();
      if (lower === "content-length") continue;
      headers[name] = lower === "r-token" ? sign(nonce, newBody) : original[name];
    }
    out.code = "changed";
    out.result = { body: newBody, headers: headers };
    return out;
  }

  function warnOnce(code) {
    try {
      var now = Date.now();
      var last = Number($persistentStore.read(WARN_KEY)) || 0;
      if (now - last < WARN_INTERVAL_MS) return;
      $persistentStore.write(String(now), WARN_KEY);
      $notification.post(
        "中国移动去广告未生效",
        "接口格式与规则不符：" + code,
        "本次响应已保留原样。把这条提示告诉维护者；不想再看到就关掉「中国移动去广告（自维护）」插件。"
      );
    } catch (error) {
      // 通知只是提示，失败不影响放行
    }
  }

  var outcome;
  try {
    outcome = main();
  } catch (error) {
    outcome = { name: "-", code: "error-" + String((error && error.message) || error).slice(0, 60) };
  }
  if (outcome.code !== "skip-url") {
    console.log(TAG + " " + outcome.name + " " + outcome.code + (outcome.detail ? " " + outcome.detail.replace(/^ /, "") : ""));
  }
  if (MISMATCH.test(outcome.code)) warnOnce(outcome.code);
  $done(outcome.result || {});
})();
