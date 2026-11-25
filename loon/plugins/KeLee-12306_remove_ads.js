/*
引用地址https://raw.githubusercontent.com/RuCu6/QuanX/main/Scripts/header.js
*/
// 2024-11-24 18:15

const url = $request.url;
const header = $request.headers;
const contype = header["content-type"];
const headopt = header["operation-type"] || header["Operation-Type"];

if (url.includes("/mobile.12306.cn/otsmobile/app/mgs/")) {
  // 12306页面内容
  // 2026-11-18 本地修改（2026-11-24 增强：兼容大小写请求头 + mPaaS 升级/聚合推广接口）。
  // Loon 官方语义（nsloon.bid/document/script）：
  //   $done()   不传参数 → 断开该请求，等于拦截
  //   $done({}) 空对象   → 请求原样继续，等于放行
  // 上游把 newHomePage.initData（首页初始化数据，注释写的「热门资讯」是错的）
  // 放进了拦截名单，首页拿不到首屏数据，表现就是封面卡住。仅拦截明确广告与更新提示接口，
  // 其余一律放行——漏拦的代价是看到广告，误拦的代价是整页或登录不可用。
  const block12306 = [
    "com.cars.otsmobile.integration.activityBanner", // 活动横幅
    "com.cars.otsmobile.memberInfo.getMemberQa", // 铁路会员 常见问题
    "com.cars.otsmobile.newHomePageBussData", // 商品信息流
    "com.cars.otsmobile.paySuccBuss.bussEntryShow", // 商业推广
    "alipay.client.updateVersion", // mPaaS 版本更新弹窗
    "alipay.client.getUnionResource" // mPaaS 聚合推广资源
  ];
  // operation-type 旧版本走请求头，新版本走 URL 查询参数，两处都读。
  const blockHit12306 = [headopt, (url.match(/[?&]operationType=([^&]+)/) || [])[1]].some((value) => {
    if (!value) return false;
    let opt = value;
    try {
      opt = decodeURIComponent(value);
    } catch (e) {
      opt = value;
    }
    return block12306.includes(opt.trim());
  });
  if (blockHit12306) {
    $done();
  } else {
    $done({});
  }
} else if (url.includes("/mobilepaas.abchina.com.cn:441/mgw")) {
  // 中国农业银行开屏广告
  const listbankabc = [
    "com.bankabc.recommendcenter.homepage.gethpadverinfo",
    "com.abchina.mbank.common.homepage.getStartParam"
  ];
  if (listbankabc?.includes(headopt)) {
    $done();
  } else {
    $done({});
  }
} else if (url.includes("/sec.sginput.qq.com/q")) {
  // 搜狗输入法候选词推广
  if (contype === "application/octet-stream") {
    $done();
  } else {
    $done({});
  }
} else {
  $done({});
}
