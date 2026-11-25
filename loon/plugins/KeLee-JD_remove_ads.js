/*
脚本引用https://raw.githubusercontent.com/RuCu6/QuanX/main/Scripts/jingdong.js
*/
// 2024-01-23 09:50

// 京东 15.9.50+ 开屏响应可为 Base64 JSON，URL 也可能没有方法名。
// 只对已知开屏方法或同时有 images 和 showTimesDaily 的无方法名响应动手。
(() => {
const url = $request.url;
const body = $response.body;
const namedSplash = /[?&]functionId=start(?:up)?(?:&|$)/.test(url);
const probeSplash = typeof $argument === "string" && $argument === "encoded-splash";
if (typeof body !== "string" || !body || (probeSplash && (body.length > 524288 || $response.status !== 200))) return $done({});
let obj;
let encoded = false;
try {
  obj = probeSplash ? decodeSplash(body) : JSON.parse(body);
  encoded = probeSplash;
} catch (_) {
  if (!namedSplash || probeSplash) return $done({});
  try {
    obj = decodeSplash(body);
    encoded = true;
  } catch (_) {
    return $done({});
  }
}
if (!obj || typeof obj !== "object" || Array.isArray(obj)) return $done({});
if (namedSplash || probeSplash) {
  const images = Array.isArray(obj.images);
  const times = Number.isFinite(obj.showTimesDaily);
  if ((!namedSplash && (!encoded || !images || !times)) || (!(images && obj.images.length) && !(times && obj.showTimesDaily !== 0))) {
    return $done({});
  }
  if (images) obj.images = [];
  if (times) obj.showTimesDaily = 0;
  const json = JSON.stringify(obj);
  return $done({ body: encoded ? encodeSplash(json) : json });
}

if (url.includes("functionId=deliverLayer") || url.includes("functionId=orderTrackBusiness")) {
  // 物流页面
  if (obj?.bannerInfo) {
    // 收货时寄快递享八折 享受条件苛刻 故移除
    delete obj.bannerInfo;
  }
  if (obj?.floors?.length > 0) {
    // 运费八折
    obj.floors = obj.floors.filter((i) => !["banner", "jdDeliveryBanner"]?.includes(i?.mId));
  }
} else if (url.includes("functionId=getTabHomeInfo")) {
  // 新品页面
  if (obj?.result?.iconInfo) {
    // 新品页 悬浮动图
    delete obj.result.iconInfo;
  }
  if (obj?.result?.roofTop) {
    // 新品页 下拉二楼
    delete obj.result.roofTop;
  }
} else if (url.includes("functionId=myOrderInfo")) {
  // 订单页面
  if (obj?.floors?.length > 0) {
    let newFloors = [];
    for (let floor of obj.floors) {
      if (["bannerFloor", "bpDynamicFloor", "plusFloor"]?.includes(floor?.mId)) {
        // bannerFloor满意度评分 bpDynamicFloor专属权益 plusFloor开通会员
        continue;
      } else {
        if (floor?.mId === "virtualServiceCenter") {
          // 服务中心
          if (floor?.data?.virtualServiceCenters?.length > 0) {
            let newItems = [];
            for (let item of floor.data.virtualServiceCenters) {
              if (item?.serviceList?.length > 0) {
                let newCards = [];
                for (let card of item.serviceList) {
                  if (card?.serviceTitle === "精选特惠") {
                    continue;
                  }
                  newCards.push(card);
                }
                item.serviceList = newCards;
              }
              newItems.push(item);
            }
            floor.data.virtualServiceCenters = newItems;
          }
        }
        if (floor?.mId === "customerServiceFloor") {
          // 客户服务
          if (floor?.data?.moreText) {
            // 点此获得更多服务
            delete floor.data.moreIcon;
            delete floor.data.moreIcon_dark;
            floor.data.moreText = " ";
          }
        }
        newFloors.push(floor);
      }
    }
    obj.floors = newFloors;
  }
} else if (url.includes("functionId=personinfoBusiness")) {
  // 个人页面
  if (obj?.floors?.length > 0) {
    let newFloors = [];
    for (let floor of obj.floors) {
      const items = [
        "bigSaleFloor", // 双十一
        "buyOften", // 常买常逛
        // "iconToolFloor", // 底部工具栏
        // "keyToolsFloor", // 浏览记录
        "newAttentionCard", // 关注的频道
        "newBigSaleFloor", // 双十一
        "newStyleAttentionCard", // 新版关注的频道
        // "newWalletIdFloor", // 我的钱包
        "newsFloor", // 京东快讯
        "noticeFloor", // 顶部横幅
        // "orderIdFloor", // 我的订单
        "recommendfloor" // 我的推荐
      ];
      if (items?.includes(floor?.mId)) {
        continue;
      } else {
        if (floor?.mId === "basefloorinfo") {
          // 弹窗
          if (floor?.data?.commonPopup) {
            delete floor.data.commonPopup;
          }
          // 弹窗
          if (floor?.data?.commonPopup_dynamic) {
            delete floor.data.commonPopup_dynamic;
          }
          // 底部会员续费横幅
          if (floor?.data?.commonTips?.length > 0) {
            floor.data.commonTips = [];
          }
          // 弹窗
          if (floor?.data?.commonWindows?.length > 0) {
            floor.data.commonWindows = [];
          }
          // 右下角动图
          if (floor?.data?.floatLayer) {
            delete floor.data.floatLayer;
          }
        } else if (floor?.mId === "iconToolFloor") {
          // 底部工具栏
          if (floor?.data?.nodes?.length > 0) {
            const sortLists = [
              "applezhushou", // apple助手 1-1-1
              "lingjindouxin", // 签到领豆 1-1-2
              "dongdongnongchangxin", // 京东农场 1-1-3
              "chongwangwang", // 宠汪汪 1-1-4
              "kehufuwu", // 客户服务 1-2-1
              "xianzhiguanjia", // 闲置换钱 1-2-2
              "wenyisheng", // 问医生 1-2-3
              "jijianfuwu", // 寄件服务 1-2-5
              "zhuanzuanhongbao", // 天天赚红包 2-2-1
              "huanletaojin" // 欢乐淘金 2-2-2
            ];
            let node = floor.data.nodes;
            if (node?.[0]?.length > 0) {
              // 第一组十个
              node[0] = node[0]
                .filter((i) => sortLists?.includes(i?.functionId))
                .sort((a, b) => sortLists.indexOf(a?.functionId) - sortLists.indexOf(b?.functionId));
            }
            if (node?.[1]?.length > 0) {
              // 第二组四个
              node[1] = node[1]
                .filter((i) => sortLists?.includes(i?.functionId))
                .sort((a, b) => sortLists.indexOf(a?.functionId) - sortLists.indexOf(b?.functionId));
            }
          }
        } else if (floor?.mId === "orderIdFloor") {
          if (floor?.data?.commentRemindInfo?.infos?.length > 0) {
            // 发布评价的提醒
            floor.data.commentRemindInfo.infos = [];
          }
        } else if (floor?.mId === "userinfo") {
          // 个人页 顶部背景图
          // if (floor?.data?.bgImgInfo?.bgImg) {
          //   delete floor.data.bgImgInfo.bgImg;
          // }
          // 开通plus会员卡片
          if (floor?.data?.newPlusBlackCard) {
            delete floor.data.newPlusBlackCard;
          }
        }
        newFloors.push(floor);
      }
    }
    obj.floors = newFloors;
  }
  // 本地补充：同一接口的新结构，只清营销楼层和推广浮层，保留订单、钱包、客服与通知。
  if (Array.isArray(obj?.others?.floors)) {
    const marketingFloors = ["bigSaleFloor", "newBigSaleFloor", "recommendfloor"];
    obj.others.floors = obj.others.floors.filter((floor) => !marketingFloors.includes(floor?.mId));
    for (const floor of obj.others.floors) {
      if (floor?.mId === "basefloorinfo" && floor?.data && typeof floor.data === "object") {
        delete floor.data.commonPopup;
        delete floor.data.commonPopup_dynamic;
        delete floor.data.commonWindows;
        delete floor.data.floatLayer;
      } else if (floor?.mId === "userinfo" && floor?.data && typeof floor.data === "object") {
        delete floor.data.newPlusBlackCard;
      }
    }
  }
} else if (url.includes("functionId=welcomeHome")) {
  // 首页配置
  if (obj?.floorList?.length > 0) {
    const delItems = [
      "bottomXview", // 底部悬浮通栏推广
      "float", // 悬浮推广小圆图
      "photoCeiling", // 顶部通栏动图推广
      // "recommend", // 为你推荐
      "ruleFloat", // 资质与规则
      "searchIcon", // 右上角消费券
      "topRotate", // 左上角logo
      "tabBarAtmosphere" // 底部悬浮通栏推广
    ];
    // 首页 图层列表
    obj.floorList = obj.floorList.filter((i) => !delItems?.includes(i?.type));
  }
  // 首页 顶部背景图
  // if (obj?.topBgImgBig) {
  //   delete obj.topBgImgBig;
  // }
  // 首页 下拉二楼
  if (obj?.webViewFloorList?.length > 0) {
    obj.webViewFloorList = [];
  }
}

$done({ body: JSON.stringify(obj) });
})();

// Loon 的脚本环境无需依赖 atob/btoa；只处理标准 Base64，按原编码回写。
function decodeSplash(body) {
  const input = body.trim();
  if (input.length > 524288 || input.length % 4 || !/^[A-Za-z0-9+/]+={0,2}$/.test(input)) return null;
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  let utf8 = "";
  const append = (byte) => "%" + byte.toString(16).padStart(2, "0");
  for (let i = 0; i < input.length; i += 4) {
    const a = alphabet.indexOf(input[i]), b = alphabet.indexOf(input[i + 1]);
    const c = alphabet.indexOf(input[i + 2]), d = alphabet.indexOf(input[i + 3]);
    utf8 += append((a << 2) | (b >> 4));
    if (c >= 0) utf8 += append(((b & 15) << 4) | (c >> 2));
    if (d >= 0) utf8 += append(((c & 3) << 6) | d);
  }
  return JSON.parse(decodeURIComponent(utf8));
}

function encodeSplash(json) {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  const bytes = encodeURIComponent(json).replace(/%([0-9A-F]{2})/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)));
  let out = "";
  for (let i = 0; i < bytes.length; i += 3) {
    const a = bytes.charCodeAt(i), b = bytes.charCodeAt(i + 1) || 0, c = bytes.charCodeAt(i + 2) || 0;
    out += alphabet[a >> 2] + alphabet[((a & 3) << 4) | (b >> 4)];
    out += i + 1 < bytes.length ? alphabet[((b & 15) << 2) | (c >> 6)] : "=";
    out += i + 2 < bytes.length ? alphabet[c & 63] : "=";
  }
  return out;
}
