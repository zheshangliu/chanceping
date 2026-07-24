import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { execFile, spawn } from "node:child_process";
import { promisify } from "node:util";

export const PUBLIC_WELFARE_RADAR_ID = "public_welfare_opportunities";
export const PUBLIC_WELFARE_RADAR_NAME = "企业福利商机雷达";
export const WELFARE_SOURCE_CODE = "OFF-SZ-004";
export const WELFARE_SOURCE_NAME = "光明区政府/群团工作部公告";
export const WELFARE_SOURCE_URL = "https://www.szgm.gov.cn/xxgk/xqgwhxxgkml/gzgg/";

// Keep the radar focused on employee-benefit demand while covering the common
// procurement vocabulary used by government, unions, and enterprise portals.
// This is deliberately a context matcher; procurement/action terms are still
// required before an item can become an opportunity card.
const WELFARE_CONTEXT = /(慰问|员工福利|职工福利|职工之家|消费帮扶|送清凉|防暑降温|疗休养|农副产品|节日(?:慰问|福利)?|礼品|月饼|关爱职工|职工关爱|福利品|生日(?:礼|蛋糕|券|福利)?|体检|健康管理|心理服务|职工餐厅|职工食堂|工会|职工服务|职工活动|职工培训|员工关怀|员工体检|福利采购)/;
const WELFARE_ACTION = /(采购|招标|磋商|询价|遴选|供应商|征集|招募|合作|项目|服务商|入围|采购意向)/;
const NON_OPPORTUNITY_DISCOVERY = /(政策|办法|指引|解读|管理规定|工作通知|资格审查)/;
const NON_WELFARE_PROJECT = /(城市体检|房屋体检|工程建设|医疗器械|设备采购|人工智能推广|信息化建设|系统开发)/;
const execFileAsync = promisify(execFile);

export interface WelfareSourceConfig {
  code: string;
  name: string;
  url: string;
  allowedHost: string;
  region: string;
  maxDetails: number;
  enabled: boolean;
  /** One official column can expose several public list pages. */
  indexUrls?: string[];
  /** Some official partnership pages are the detail page and the source itself. */
  directDetail?: boolean;
  /** A small number of official portals publish their public notice list as JSON. */
  publicApi?: "szggzy-government-procurement" | "gzgpc-procurement-signals";
  rollout?: "public" | "shadow";
  opportunityRole?: "procurement" | "demand_signal" | "channel_partnership";
  opportunityType?: WelfareOpportunityType;
  shadowAccess?: "direct" | "restricted";
  extraAllowedHosts?: string[];
  /** Reviewed source-specific adapter contract. It may remain shadow until live evidence passes. */
  adapter?: WelfareAdapterKind;
  /** Admit procurement-looking list links for detail-page welfare discovery. */
  candidateDiscovery?: boolean;
}

export type WelfareAdapterKind =
  | "html-notice-board"
  | "ccgp-contracts"
  | "ggzy-data-service"
  | "central-procurement"
  | "customs-procurement"
  | "pbc-procurement"
  | "tax-procurement"
  | "military-procurement"
  | "gd-government-procurement"
  | "gd-ggzy-spa"
  | "gzmall-procurement"
  | "gzexgrp-procurement"
  | "city-ggzy-spa"
  | "org-notice-board";

export const WELFARE_SOURCES: WelfareSourceConfig[] = [
  { code: "OFF-SZ-004", name: "光明区政府/群团工作部公告", url: "https://www.szgm.gov.cn/xxgk/xqgwhxxgkml/gzgg/", allowedHost: "www.szgm.gov.cn", region: "深圳光明", maxDetails: 12, enabled: true },
  { code: "OFF-SZ-005", name: "龙华区群团工作部/总工会通知公告", url: "https://www.szlhq.gov.cn/bmxxgk/qtgzb/dtxx_124446/tzgg_125586/", allowedHost: "www.szlhq.gov.cn", region: "深圳龙华", maxDetails: 12, enabled: true },
  { code: "OFF-SZ-003", name: "福田区总工会通知公告", url: "https://www.szft.gov.cn/bmxx_qt/qzgh/tzgg/", allowedHost: "www.szft.gov.cn", region: "深圳福田", maxDetails: 12, enabled: true },
  { code: "OFF-N-001", name: "中国政府采购网｜采购公告", url: "https://www.ccgp.gov.cn/cggg/dfgg/gkzb/index.htm", allowedHost: "www.ccgp.gov.cn", region: "全国", maxDetails: 12, enabled: true, rollout: "public", opportunityRole: "procurement", adapter: "html-notice-board", candidateDiscovery: true, indexUrls: ["https://www.ccgp.gov.cn/cggg/dfgg/gkzb/index.htm", "https://www.ccgp.gov.cn/cggg/dfgg/jzxcs/index.htm", "https://www.ccgp.gov.cn/cggg/dfgg/xjgg/index.htm"] },
  { code: "OFF-N-004", name: "全国公共资源交易平台｜交易公开", url: "https://www.ggzy.gov.cn/", allowedHost: "www.ggzy.gov.cn", region: "全国", maxDetails: 12, enabled: true, rollout: "public", opportunityRole: "procurement", adapter: "html-notice-board", candidateDiscovery: true },
  { code: "OFF-GD-004", name: "广东省总工会｜通知公告", url: "https://www.gdftu.org.cn/", allowedHost: "www.gdftu.org.cn", region: "广东", maxDetails: 12, enabled: true, rollout: "public", opportunityRole: "channel_partnership", opportunityType: "CHANNEL_PARTNERSHIP" },
  { code: "WEL-001", name: "关爱通｜供应商招募", url: "https://www.guanaitong.com/vendor/index.html", allowedHost: "www.guanaitong.com", region: "全国", maxDetails: 1, enabled: true, rollout: "public", opportunityRole: "channel_partnership", opportunityType: "SUPPLIER_RECRUITMENT", directDetail: true },
  { code: "OFF-SZ-002", name: "深圳公共资源交易中心｜政府采购公告", url: "https://www.szggzy.com/jygg/list.html?id=zfcg", allowedHost: "www.szggzy.com", region: "深圳", maxDetails: 12, enabled: true, rollout: "public", opportunityRole: "procurement", adapter: "city-ggzy-spa", publicApi: "szggzy-government-procurement" },
  { code: "ORG-001", name: "中山大学政府采购与招投标管理中心｜采购公告", url: "https://bidding.sysu.edu.cn/gg/cg", allowedHost: "bidding.sysu.edu.cn", region: "广州", maxDetails: 12, enabled: true, rollout: "public", opportunityRole: "procurement" },
  { code: "ORG-002", name: "华南理工大学招标中心｜采购公告", url: "https://www2.scut.edu.cn/zhaobiao/", allowedHost: "www2.scut.edu.cn", region: "广州", maxDetails: 12, enabled: true, rollout: "public", opportunityRole: "procurement" },
  { code: "OFF-GZ-001", name: "广州市政府采购中心｜意向及供应商征集", url: "https://www.guangzhougpc.cn/", allowedHost: "www.guangzhougpc.cn", region: "广州", maxDetails: 12, enabled: true, rollout: "public", opportunityRole: "demand_signal", publicApi: "gzgpc-procurement-signals" },
];

// Candidates are collected and evidenced in an isolated shadow store first.
// They must pass the three-day run gate before they can move into WELFARE_SOURCES.
export const WELFARE_SHADOW_SOURCES: WelfareSourceConfig[] = [
  // This public search page uses an access challenge. It is intentionally
  // monitored as a restricted POC and is never automated around the challenge.
  { code: "OFF-N-002", name: "中国政府采购网｜政府采购意向", url: "https://cgyx.ccgp.gov.cn/cgyx/pub/pubSearch", allowedHost: "cgyx.ccgp.gov.cn", region: "全国", maxDetails: 12, enabled: true, rollout: "shadow", opportunityRole: "demand_signal", shadowAccess: "restricted" },
  { code: "OFF-GD-002", name: "广东省招标投标监管网", url: "https://zbtb.gd.gov.cn/", allowedHost: "zbtb.gd.gov.cn", region: "广东", maxDetails: 12, enabled: true, rollout: "shadow", opportunityRole: "procurement", adapter: "gd-government-procurement" },
  // The official portal issues a SessionVerify JavaScript redirect. Keep this
  // as a transparent restricted POC; do not automate around that mechanism.
  { code: "OFF-ZJ-001", name: "湛江市总工会通知公告", url: "https://www.zjghw.org/tggs/", allowedHost: "www.zjghw.org", region: "广东湛江", maxDetails: 12, enabled: true, rollout: "shadow", opportunityRole: "demand_signal", shadowAccess: "restricted" },
  // Batch 2 is intentionally an access-and-evidence POC only. These entries
  // never flow through the public collector until they clear the three-day
  // gate and receive a source-specific parser and evidence contract.
  { code: "OFF-N-003", name: "中国政府采购网｜政府采购合同公告", url: "https://www.ccgp.gov.cn/cggg/zygg/htgg/", allowedHost: "www.ccgp.gov.cn", region: "全国", maxDetails: 12, enabled: true, rollout: "shadow", opportunityRole: "demand_signal", adapter: "ccgp-contracts" },
  { code: "OFF-N-005", name: "全国公共资源交易平台｜数据服务", url: "https://data.ggzy.gov.cn/", allowedHost: "data.ggzy.gov.cn", region: "全国", maxDetails: 12, enabled: true, rollout: "shadow", opportunityRole: "demand_signal", adapter: "ggzy-data-service" },
  { code: "OFF-N-006", name: "中国招标投标公共服务平台", url: "https://www.cebpubservice.com/", allowedHost: "www.cebpubservice.com", region: "全国", maxDetails: 12, enabled: true, rollout: "shadow", opportunityRole: "procurement" },
  { code: "OFF-N-007", name: "中央国家机关政府采购中心", url: "https://www.zycg.gov.cn/", allowedHost: "www.zycg.gov.cn", region: "全国", maxDetails: 12, enabled: true, rollout: "shadow", opportunityRole: "procurement", adapter: "central-procurement" },
  { code: "OFF-N-008", name: "海关总署采购中心", url: "https://hgcg.customs.gov.cn/", allowedHost: "hgcg.customs.gov.cn", region: "全国", maxDetails: 12, enabled: true, rollout: "shadow", opportunityRole: "procurement", adapter: "customs-procurement" },
  { code: "OFF-N-009", name: "中国人民银行集中采购中心", url: "https://jzcg.pbc.gov.cn/", allowedHost: "jzcg.pbc.gov.cn", region: "全国", maxDetails: 12, enabled: true, rollout: "shadow", opportunityRole: "procurement", adapter: "pbc-procurement" },
  { code: "OFF-N-010", name: "国家税务总局集中采购中心", url: "https://swcg.chinatax.gov.cn/", allowedHost: "swcg.chinatax.gov.cn", region: "全国", maxDetails: 12, enabled: true, rollout: "shadow", opportunityRole: "procurement", adapter: "tax-procurement" },
  { code: "OFF-N-011", name: "军队采购网", url: "https://www.plap.mil.cn/", allowedHost: "www.plap.mil.cn", region: "全国", maxDetails: 12, enabled: true, rollout: "shadow", opportunityRole: "procurement", adapter: "military-procurement" },
  { code: "OFF-GD-001", name: "广东政府采购智慧云平台", url: "https://gdgpo.czt.gd.gov.cn/", allowedHost: "gdgpo.czt.gd.gov.cn", region: "广东", maxDetails: 12, enabled: true, rollout: "shadow", opportunityRole: "procurement", adapter: "gd-government-procurement" },
  { code: "OFF-GD-003", name: "广东省公共资源交易平台", url: "https://ygp.gdzwfw.gov.cn/ggzy-portal/index.html", allowedHost: "ygp.gdzwfw.gov.cn", region: "广东", maxDetails: 12, enabled: true, rollout: "shadow", opportunityRole: "procurement", adapter: "gd-ggzy-spa" },
  { code: "OFF-GZ-002", name: "广州市政府采购平台/电子卖场", url: "https://www.gzmall.cn/", allowedHost: "www.gzmall.cn", region: "广州", maxDetails: 12, enabled: true, rollout: "shadow", opportunityRole: "procurement", adapter: "gzmall-procurement" },
  { code: "OFF-GZ-003", name: "广州交易集团/广州公共资源交易中心", url: "https://www.gzexgrp.com/", allowedHost: "www.gzexgrp.com", region: "广州", maxDetails: 12, enabled: true, rollout: "shadow", opportunityRole: "procurement", adapter: "gzexgrp-procurement" },
  { code: "OFF-FS-001", name: "佛山市公共资源交易平台", url: "https://jy.ggzy.foshan.gov.cn/TPBidder", allowedHost: "jy.ggzy.foshan.gov.cn", region: "佛山", maxDetails: 12, enabled: true, rollout: "shadow", opportunityRole: "procurement", adapter: "city-ggzy-spa" },
  { code: "OFF-DG-001", name: "东莞公共资源交易入口", url: "https://ygp.gdzwfw.gov.cn/ggzy-portal/index.html#/441900/index", allowedHost: "ygp.gdzwfw.gov.cn", region: "东莞", maxDetails: 12, enabled: true, rollout: "shadow", opportunityRole: "procurement", adapter: "city-ggzy-spa" },
  { code: "OFF-ZH-001", name: "珠海市公共资源交易中心", url: "https://ggzy.zhuhai.gov.cn/", allowedHost: "ggzy.zhuhai.gov.cn", region: "珠海", maxDetails: 12, enabled: true, rollout: "shadow", opportunityRole: "procurement", adapter: "city-ggzy-spa" },
  { code: "OFF-ZS-001", name: "中山市公共资源交易平台", url: "https://www.zsjypt.cn/", allowedHost: "www.zsjypt.cn", region: "中山", maxDetails: 12, enabled: true, rollout: "shadow", opportunityRole: "procurement", adapter: "city-ggzy-spa" },
  { code: "OFF-HZ-001", name: "惠州市公共资源交易入口", url: "https://ygp.gdzwfw.gov.cn/ggzy-portal/index.html", allowedHost: "ygp.gdzwfw.gov.cn", region: "惠州", maxDetails: 12, enabled: true, rollout: "shadow", opportunityRole: "procurement", adapter: "city-ggzy-spa" },
  { code: "ORG-003", name: "深圳开放大学采购公告", url: "https://www.szou.edu.cn/", allowedHost: "www.szou.edu.cn", region: "深圳", maxDetails: 12, enabled: true, rollout: "shadow", opportunityRole: "procurement", adapter: "org-notice-board" },
  { code: "ORG-004", name: "深圳湾实验室采购信息", url: "https://www.szbl.ac.cn/", allowedHost: "www.szbl.ac.cn", extraAllowedHosts: ["zfcg.szggzy.com"], region: "深圳", maxDetails: 12, enabled: true, rollout: "shadow", opportunityRole: "procurement", adapter: "org-notice-board", indexUrls: ["https://www.szbl.ac.cn/cgxx/cgyxgk.htm", "https://www.szbl.ac.cn/cgxx/zbxx.htm"] },
  { code: "ORG-005", name: "深圳市卫生健康系统单位采购栏目", url: "https://wjw.sz.gov.cn/", allowedHost: "wjw.sz.gov.cn", region: "深圳", maxDetails: 12, enabled: true, rollout: "shadow", opportunityRole: "procurement", adapter: "org-notice-board", indexUrls: ["https://wjw.sz.gov.cn/zfcg/index.html"] },
  // Expansion POC: official enterprise and central procurement portals. These
  // remain shadow-only until a source-specific public list/detail contract is
  // proven with field-level evidence.
  { code: "HUB-N-001", name: "中国政府采购网｜地方分网与中央部门目录", url: "https://www.ccgp.gov.cn/", allowedHost: "www.ccgp.gov.cn", region: "全国", maxDetails: 12, enabled: true, rollout: "shadow", opportunityRole: "demand_signal", adapter: "html-notice-board" },
  { code: "OFF-SZ-001", name: "深圳市政府采购监管网", url: "https://zfcg.sz.gov.cn/", allowedHost: "zfcg.sz.gov.cn", region: "深圳", maxDetails: 12, enabled: true, rollout: "shadow", opportunityRole: "procurement", adapter: "html-notice-board" },
  { code: "ENT-001", name: "南方电网供应链统一服务平台", url: "https://www.bidding.csg.cn/", allowedHost: "www.bidding.csg.cn", region: "全国", maxDetails: 12, enabled: true, rollout: "shadow", opportunityRole: "procurement", adapter: "html-notice-board" },
  { code: "ENT-002", name: "南方电网电子采购交易平台", url: "https://ecsg.com.cn/", allowedHost: "ecsg.com.cn", region: "全国", maxDetails: 12, enabled: true, rollout: "shadow", opportunityRole: "procurement", adapter: "html-notice-board" },
  { code: "ENT-003", name: "中国移动电子采购与招投标系统", url: "https://es.b2b.10086.cn/newbid/", allowedHost: "es.b2b.10086.cn", region: "全国", maxDetails: 12, enabled: true, rollout: "shadow", opportunityRole: "procurement", adapter: "html-notice-board", shadowAccess: "restricted" },
  { code: "ENT-004", name: "中国联通合作方门户", url: "https://www.cuecp.cn/", allowedHost: "www.cuecp.cn", region: "全国", maxDetails: 12, enabled: true, rollout: "shadow", opportunityRole: "channel_partnership", adapter: "org-notice-board" },
  { code: "ENT-005", name: "中国联通采购与招标网", url: "https://www.chinaunicombidding.cn/", allowedHost: "www.chinaunicombidding.cn", region: "全国", maxDetails: 12, enabled: true, rollout: "shadow", opportunityRole: "procurement", adapter: "html-notice-board" },
  { code: "ENT-006", name: "中国电信阳光采购网", url: "https://caigou.chinatelecom.com.cn/", allowedHost: "caigou.chinatelecom.com.cn", region: "全国", maxDetails: 12, enabled: true, rollout: "shadow", opportunityRole: "procurement", adapter: "html-notice-board" },
  { code: "ENT-007", name: "国家电网新一代电子商务平台 ECP2.0", url: "https://ecp.sgcc.com.cn/ecp2.0/portal/", allowedHost: "ecp.sgcc.com.cn", region: "全国", maxDetails: 12, enabled: true, rollout: "shadow", opportunityRole: "procurement", adapter: "html-notice-board" },
  { code: "ENT-008", name: "中国石油招标投标网", url: "https://www.cnpcbidding.com/", allowedHost: "www.cnpcbidding.com", region: "全国", maxDetails: 12, enabled: true, rollout: "shadow", opportunityRole: "procurement", adapter: "html-notice-board" },
  { code: "ENT-009", name: "中国石化物资电子招标投标交易平台", url: "https://bidding.epec.com/", allowedHost: "bidding.epec.com", region: "全国", maxDetails: 12, enabled: true, rollout: "shadow", opportunityRole: "procurement", adapter: "html-notice-board" },
  { code: "ENT-010", name: "中国石化建设工程电子招标投标交易平台", url: "https://ebidding.sinopec.com/", allowedHost: "ebidding.sinopec.com", region: "全国", maxDetails: 12, enabled: true, rollout: "shadow", opportunityRole: "procurement", adapter: "html-notice-board" },
  { code: "ENT-011", name: "中国海油采办业务管理与交易系统", url: "https://buy.cnooc.com.cn/", allowedHost: "buy.cnooc.com.cn", region: "全国", maxDetails: 12, enabled: true, rollout: "shadow", opportunityRole: "procurement", adapter: "html-notice-board", shadowAccess: "restricted" },
  { code: "ENT-012", name: "金融集中采购网", url: "https://www.cfcpn.com/", allowedHost: "www.cfcpn.com", region: "全国", maxDetails: 12, enabled: true, rollout: "shadow", opportunityRole: "demand_signal", adapter: "html-notice-board", shadowAccess: "restricted" },
  { code: "ENT-013", name: "招商银行采购平台", url: "https://xcg-nginx.paas.cmbchina.com/portal/page/platEnter.html", allowedHost: "xcg-nginx.paas.cmbchina.com", region: "全国", maxDetails: 12, enabled: true, rollout: "shadow", opportunityRole: "procurement", adapter: "html-notice-board" },
  { code: "ENT-014", name: "中国银行中银智采入口", url: "https://www.boc.cn/", allowedHost: "www.boc.cn", region: "全国", maxDetails: 12, enabled: true, rollout: "shadow", opportunityRole: "procurement", adapter: "org-notice-board" },
  { code: "ENT-015", name: "中信集团采购共享平台", url: "https://ebid.cfhc.citic/", allowedHost: "ebid.cfhc.citic", region: "全国", maxDetails: 12, enabled: true, rollout: "shadow", opportunityRole: "procurement", adapter: "html-notice-board", shadowAccess: "restricted" },
  // Discovery, recall, data-service, and welfare-channel candidates. These
  // are isolated from public cards and require provenance/authorization review.
  { code: "SIG-001", name: "中华全国总工会", url: "https://www.acftu.org/", allowedHost: "www.acftu.org", region: "全国", maxDetails: 12, enabled: true, rollout: "shadow", opportunityRole: "demand_signal", adapter: "org-notice-board", shadowAccess: "restricted" },
  { code: "SIG-002", name: "中国工会新闻网", url: "https://acftu.people.com.cn/", allowedHost: "acftu.people.com.cn", region: "全国", maxDetails: 12, enabled: true, rollout: "shadow", opportunityRole: "demand_signal", adapter: "org-notice-board", shadowAccess: "restricted" },
  { code: "SIG-003", name: "目标单位官网通知公告/采购信息/工会动态栏目池", url: "registry://target-organizations", allowedHost: "manual", region: "广东", maxDetails: 12, enabled: true, rollout: "shadow", opportunityRole: "demand_signal", shadowAccess: "restricted" },
  { code: "SIG-004", name: "微信公众号/粤工惠等工会私域信号池", url: "manual://wechat-official-accounts", allowedHost: "manual", region: "广东", maxDetails: 12, enabled: true, rollout: "shadow", opportunityRole: "demand_signal", shadowAccess: "restricted" },
  { code: "SIG-005", name: "搜索引擎站点定向发现", url: "search://site-queries", allowedHost: "manual", region: "全国", maxDetails: 12, enabled: true, rollout: "shadow", opportunityRole: "demand_signal", shadowAccess: "restricted" },
  { code: "AGG-001", name: "百度寻标宝", url: "https://xunbiaobao.baidu.com/", allowedHost: "xunbiaobao.baidu.com", region: "全国", maxDetails: 12, enabled: true, rollout: "shadow", opportunityRole: "demand_signal", adapter: "html-notice-board" },
  { code: "AGG-002", name: "剑鱼标讯", url: "https://www.jianyu360.cn/", allowedHost: "www.jianyu360.cn", region: "全国", maxDetails: 12, enabled: true, rollout: "shadow", opportunityRole: "demand_signal", adapter: "html-notice-board" },
  { code: "AGG-003", name: "乙方宝", url: "https://www.yfbzb.com/", allowedHost: "www.yfbzb.com", region: "全国", maxDetails: 12, enabled: true, rollout: "shadow", opportunityRole: "demand_signal", adapter: "html-notice-board" },
  { code: "AGG-004", name: "标标达/招标雷达", url: "https://bidradar.com.cn/", allowedHost: "bidradar.com.cn", region: "全国", maxDetails: 12, enabled: true, rollout: "shadow", opportunityRole: "demand_signal", adapter: "html-notice-board" },
  { code: "AGG-005", name: "千里马招标网/OKCIS", url: "https://www.okcis.cn/", allowedHost: "www.okcis.cn", region: "全国", maxDetails: 12, enabled: true, rollout: "shadow", opportunityRole: "demand_signal", adapter: "html-notice-board" },
  { code: "AGG-006", name: "中国采购与招标网/采招网", url: "https://www.zhaobiao.cn/", allowedHost: "www.zhaobiao.cn", region: "全国", maxDetails: 12, enabled: true, rollout: "shadow", opportunityRole: "demand_signal", adapter: "html-notice-board", shadowAccess: "restricted" },
  { code: "AGG-007", name: "中国招标投标网", url: "https://www.cecbid.org.cn/", allowedHost: "www.cecbid.org.cn", region: "全国", maxDetails: 12, enabled: true, rollout: "shadow", opportunityRole: "demand_signal", adapter: "html-notice-board" },
  { code: "DATA-001", name: "CnOpenData政府采购/区域招投标数据产品", url: "https://www.cnopendata.com/", allowedHost: "www.cnopendata.com", region: "全国", maxDetails: 12, enabled: true, rollout: "shadow", opportunityRole: "demand_signal", adapter: "html-notice-board", shadowAccess: "restricted" },
  { code: "WEL-002", name: "中智关爱通官网", url: "https://www.guanaitong.com/", allowedHost: "www.guanaitong.com", region: "全国", maxDetails: 12, enabled: true, rollout: "shadow", opportunityRole: "channel_partnership", opportunityType: "SUPPLIER_RECRUITMENT", adapter: "org-notice-board" },
  { code: "WEL-003", name: "京东锦礼/福礼平台", url: "https://jdjl.jd.com/", allowedHost: "jdjl.jd.com", region: "全国", maxDetails: 12, enabled: true, rollout: "shadow", opportunityRole: "channel_partnership", opportunityType: "SUPPLIER_RECRUITMENT", adapter: "org-notice-board" },
  { code: "WEL-004", name: "CDP弹性福利", url: "https://www.cdpgroupltd.com/flexible-benefits", allowedHost: "www.cdpgroupltd.com", region: "全国", maxDetails: 12, enabled: true, rollout: "shadow", opportunityRole: "channel_partnership", opportunityType: "SUPPLIER_RECRUITMENT", adapter: "org-notice-board" },
  { code: "WEL-005", name: "东方福利网", url: "https://www.dongfangfuli.com/", allowedHost: "www.dongfangfuli.com", region: "全国", maxDetails: 12, enabled: true, rollout: "shadow", opportunityRole: "channel_partnership", opportunityType: "SUPPLIER_RECRUITMENT", adapter: "org-notice-board" },
  { code: "WEL-006", name: "上海外服商业福利", url: "https://www.fsg.com.cn/Product_CnB_Benefits.html", allowedHost: "www.fsg.com.cn", region: "全国", maxDetails: 12, enabled: true, rollout: "shadow", opportunityRole: "channel_partnership", opportunityType: "SUPPLIER_RECRUITMENT", adapter: "org-notice-board" },
  { code: "WEL-007", name: "招商银行薪福通福利服务", url: "https://xft.cmbchina.com/index/subproduct/subproduct6.html", allowedHost: "xft.cmbchina.com", region: "全国", maxDetails: 12, enabled: true, rollout: "shadow", opportunityRole: "channel_partnership", opportunityType: "SUPPLIER_RECRUITMENT", adapter: "org-notice-board" },
  { code: "HUB-003", name: "TrendRadar社区数据源收集Issue/讨论", url: "https://github.com/sansan0/TrendRadar/issues", allowedHost: "github.com", region: "全国", maxDetails: 12, enabled: true, rollout: "shadow", opportunityRole: "demand_signal", shadowAccess: "restricted" },
];

// These 20 direct-access sources completed the three-day shadow gate and are
// now enabled for public collection. Their original registry entries remain
// in the shadow catalogue so the historical POC evidence is not discarded.
const PROMOTED_SOURCE_CODES = new Set([
  "OFF-N-003", "OFF-N-005", "OFF-N-007", "OFF-N-008", "OFF-N-009", "OFF-N-010", "OFF-N-011",
  "OFF-GD-001", "OFF-GD-002", "OFF-GD-003", "OFF-GZ-002", "OFF-GZ-003", "OFF-FS-001", "OFF-DG-001",
  "OFF-ZH-001", "OFF-ZS-001", "OFF-HZ-001", "ORG-003", "ORG-004", "ORG-005",
]);
WELFARE_SOURCES.push(...WELFARE_SHADOW_SOURCES.filter((source) => PROMOTED_SOURCE_CODES.has(source.code)).map((source) => ({
  ...source,
  rollout: "public" as const,
  shadowAccess: undefined,
  enabled: true,
})));

function sourceByCode(code: string): WelfareSourceConfig {
  const source = [...WELFARE_SOURCES, ...WELFARE_SHADOW_SOURCES].find((item) => item.code === code);
  if (!source) throw new Error(`Unknown welfare source: ${code}`);
  return source;
}

function isAllowedWelfareHost(hostname: string): boolean {
  return [...WELFARE_SOURCES, ...WELFARE_SHADOW_SOURCES].some((source) => source.allowedHost === hostname || source.extraAllowedHosts?.includes(hostname));
}

export type WelfareLifecycle = "current" | "historical";
export type WelfareOpportunityType = "OPEN_PROCUREMENT" | "PROCUREMENT_INTENT" | "SUPPLIER_RECRUITMENT" | "FRAMEWORK_AGREEMENT" | "CHANNEL_PARTNERSHIP";
export type WelfareVerificationState = "CANDIDATE" | "FIELD_VERIFIED" | "STATUS_VERIFIED" | "FULLY_VERIFIED";
export type WelfareFieldState = "verified" | "not_published" | "parse_failed" | "unknown";

export interface WelfareEvidenceField {
  field: "buyer" | "budget" | "deadline" | "status" | "contactName" | "contactPhone" | "contactAddress";
  state: WelfareFieldState;
  excerpt?: string;
}

export interface WelfareOpportunityRecord {
  id: string;
  title: string;
  sourceCode: string;
  sourceName: string;
  officialUrl: string;
  publishedAt: string;
  retrievedAt: string;
  rawSha256: string;
  dataMode: "recorded" | "live";
  opportunityType: WelfareOpportunityType;
  lifecycleStatus: WelfareLifecycle;
  currentStage: "OPEN" | "CORRECTED" | "CLOSED_PENDING_RESULT" | "AWARDED" | "CONTRACTED" | "TERMINATED" | "UNKNOWN";
  verificationState: WelfareVerificationState;
  buyer: string;
  contactName: string;
  contactPhone: string;
  contactAddress: string;
  region: string;
  budgetDisplay: string;
  deadline: string;
  deadlineDisplay: string;
  welfareScenes: string[];
  productScopes: string[];
  reason: string;
  nextAction: string;
  riskNote: string;
  evidenceFields: WelfareEvidenceField[];
  /** Sales-facing triage fields derived from public evidence; not a procurement guarantee. */
  salesScore?: number;
  salesPriority?: "HIGH" | "MEDIUM" | "LOW";
  salesAction?: string;
  followUpStatus?: "待联系" | "待核验" | "不建议跟进" | "已结束";
  followUpNextAction?: string;
  supplierMatches?: string[];
}

/** A discoverable lead that is not yet safe to present as a verified opportunity. */
export interface WelfareCandidateRecord {
  id: string;
  title: string;
  sourceCode: string;
  sourceName: string;
  officialUrl: string;
  publishedAt: string;
  retrievedAt: string;
  rawSha256?: string;
  region: string;
  verificationState: "CANDIDATE" | "PARTIAL";
  reason: string;
  nextAction: string;
}

export interface WelfareFeedOptions {
  status?: WelfareLifecycle | "all";
  type?: string;
  scene?: string;
  region?: string;
  deadlineWindow?: string;
  page?: number;
  pageSize?: number;
  now?: string | Date;
  sort?: "deadline" | "sales";
  supplierFit?: string;
}

export interface WelfareFeed {
  items: WelfareOpportunityRecord[];
  stats: {
    totalCount: number;
    currentCount: number;
    historicalCount: number;
    filteredCount: number;
    verifiedCount: number;
    knownDeadlineCount: number;
    knownBudgetCount: number;
    page: number;
    pageSize: number;
    totalPages: number;
    lastUpdatedAt: string | null;
    typeFacets: Array<{ id: string; label: string; count: number }>;
    sceneFacets: Array<{ id: string; label: string; count: number }>;
    regionFacets: Array<{ id: string; label: string; count: number }>;
    supplierFitFacets: Array<{ id: string; label: string; count: number }>;
  };
  sources: Array<{ code: string; name: string; url: string; status: "active" | "degraded" | "empty"; lastUpdatedAt: string | null }>;
}

export interface WelfareRunSummary {
  ranAt: string;
  sources: Array<Pick<WelfareSourceCollectionResult, "sourceCode" | "sourceName" | "retrievedAt" | "status" | "discoveredCount" | "publishedCount" | "totalCount">>;
  totals: { added: number; updated: number; historical: number; filtered: number; total: number };
}

const TYPE_LABELS: Record<string, string> = {
  OPEN_PROCUREMENT: "公开采购",
  PROCUREMENT_INTENT: "采购意向",
  SUPPLIER_RECRUITMENT: "供应商征集",
  FRAMEWORK_AGREEMENT: "框架协议",
  CHANNEL_PARTNERSHIP: "渠道合作",
};

function cleanText(value: string): string {
  return value
    .replace(/<script\b[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;|&#160;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeUrl(value: string, base: string): string | null {
  try {
    const url = new URL(value, base);
    if (!/^https?:$/.test(url.protocol)) return null;
    url.hash = "";
    return url.toString();
  } catch {
    return null;
  }
}

function stableId(url: string): string {
  return `welfare_${crypto.createHash("sha256").update(url).digest("hex").slice(0, 16)}`;
}

function fieldState(fields: WelfareEvidenceField[], field: WelfareEvidenceField["field"]): WelfareFieldState {
  return fields.find((item) => item.field === field)?.state ?? "unknown";
}

function deadlineWindow(deadline: string, now: Date): string {
  if (!/^\d{4}-\d{2}-\d{2}/.test(deadline)) return "unknown";
  const days = Math.ceil((new Date(deadline).getTime() - now.getTime()) / 86_400_000);
  if (days <= 7) return "7d";
  if (days <= 30) return "30d";
  return "later";
}

function compactWelfareField(value: string, labels: string[]): string {
  const indexes = labels.map((label) => value.indexOf(label)).filter((index) => index > 0);
  return indexes.length ? value.slice(0, Math.min(...indexes)).trim() : value;
}

function normalizeWelfareRecordForDisplay(record: WelfareOpportunityRecord): WelfareOpportunityRecord {
  const buyer = compactWelfareField(record.buyer, ["公告时间", "发布时间", "获取采购文件时间", "响应文件递交地点", "项目概况", "采购内容", "代理机构名称", "行政区域"]);
  const contactAddress = compactWelfareField(record.contactAddress, ["采购单位联系方式", "代理机构名称", "代理机构地址", "项目概况", "附件"])
    .replace(/^采购单位地址[：:]?\s*/, "").trim();
  const evidenceFields = record.evidenceFields.map((field) => {
    if (!field.excerpt) return field;
    const labels = field.field === "buyer" ? ["公告时间", "发布时间", "获取采购文件时间", "响应文件递交地点", "项目概况", "代理机构名称"] : field.field === "contactAddress" ? ["采购单位联系方式", "代理机构名称", "代理机构地址", "项目概况", "附件"] : [];
    return labels.length ? { ...field, excerpt: compactWelfareField(field.excerpt, labels) } : field;
  });
  const daysToDeadline = /^\d{4}-\d{2}-\d{2}/.test(record.deadline) ? Math.ceil((new Date(record.deadline).getTime() - Date.now()) / 86_400_000) : null;
  let salesScore = 25;
  if (record.lifecycleStatus === "current") salesScore += 20;
  if (record.opportunityType === "OPEN_PROCUREMENT") salesScore += 20;
  if (["SUPPLIER_RECRUITMENT", "CHANNEL_PARTNERSHIP"].includes(record.opportunityType)) salesScore += 14;
  if (fieldState(evidenceFields, "contactPhone") === "verified") salesScore += 15;
  if (fieldState(evidenceFields, "deadline") === "verified") salesScore += 10;
  if (fieldState(evidenceFields, "budget") === "verified") salesScore += 8;
  if (daysToDeadline !== null && daysToDeadline >= 0 && daysToDeadline <= 14) salesScore += 10;
  const salesPriority = salesScore >= 78 ? "HIGH" : salesScore >= 55 ? "MEDIUM" : "LOW";
  const salesAction = record.lifecycleStatus !== "current" ? "作为历史情报，不建议直接投入跟进。" : salesPriority === "HIGH" ? "优先核对资格要求与截止时间，尽快联系采购方或准备报价。" : record.opportunityType === "SUPPLIER_RECRUITMENT" || record.opportunityType === "CHANNEL_PARTNERSHIP" ? "核对合作准入和供应商材料，准备渠道联系。" : "打开官方原文，补齐预算、联系人和资格要求后再决定跟进。";
  const supplierMatches = Array.from(new Set([
    ...(record.welfareScenes.some((scene) => /慰问|消费帮扶|礼品|节日/.test(scene)) ? ["福利礼品与食品"] : []),
    ...(record.welfareScenes.some((scene) => /体检|健康|心理/.test(scene)) ? ["体检健康服务"] : []),
    ...(record.welfareScenes.some((scene) => /疗休养|旅游/.test(scene)) ? ["疗休养与团建服务"] : []),
    ...(record.welfareScenes.some((scene) => /餐饮|食堂/.test(scene)) ? ["团餐与职工餐饮"] : []),
    ...(record.opportunityType === "SUPPLIER_RECRUITMENT" || record.opportunityType === "CHANNEL_PARTNERSHIP" ? ["企业福利平台与渠道"] : []),
  ]));
  const followUpStatus = record.lifecycleStatus !== "current" ? "已结束" : fieldState(evidenceFields, "contactPhone") === "verified" ? "待联系" : "待核验";
  const followUpNextAction = followUpStatus === "待联系" ? "核对官方原文后记录首次联系结果。" : followUpStatus === "待核验" ? "补齐采购单位、联系人和资格要求，再决定是否联系。" : "保留为历史情报，关注后续同类项目。";
  return { ...record, buyer, contactAddress, evidenceFields, salesScore, salesPriority, salesAction, followUpStatus, followUpNextAction, supplierMatches };
}

function buildFacets(records: WelfareOpportunityRecord[], values: (record: WelfareOpportunityRecord) => string[], labels?: Record<string, string>) {
  const counts = new Map<string, number>();
  for (const record of records) for (const value of values(record)) counts.set(value, (counts.get(value) ?? 0) + 1);
  return Array.from(counts.entries()).map(([id, count]) => ({ id, label: labels?.[id] ?? id, count })).sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
}

export function buildWelfareFeed(records: WelfareOpportunityRecord[], options: WelfareFeedOptions = {}): WelfareFeed {
  const now = options.now instanceof Date ? options.now : new Date(options.now ?? Date.now());
  const status = options.status ?? "current";
  const allRecords = records.map((record) => {
    record = normalizeWelfareRecordForDisplay(record);
    if (record.lifecycleStatus === "current" && /^\d{4}-\d{2}-\d{2}/.test(record.deadline) && new Date(record.deadline).getTime() < now.getTime()) {
      return { ...record, lifecycleStatus: "historical" as const };
    }
    return record;
  });
  const currentCount = allRecords.filter((item) => item.lifecycleStatus === "current").length;
  const historicalCount = allRecords.length - currentCount;
  let filtered = allRecords.filter((item) => status === "all" || item.lifecycleStatus === status);
  if (options.type && options.type !== "all") filtered = filtered.filter((item) => item.opportunityType === options.type);
  if (options.scene && options.scene !== "all") filtered = filtered.filter((item) => item.welfareScenes.includes(options.scene!));
  if (options.region && options.region !== "all") filtered = filtered.filter((item) => item.region === options.region);
  if (options.deadlineWindow && options.deadlineWindow !== "all") filtered = filtered.filter((item) => deadlineWindow(item.deadline, now) === options.deadlineWindow);
  if (options.supplierFit && options.supplierFit !== "all") filtered = filtered.filter((item) => item.supplierMatches?.includes(options.supplierFit!));
  if (options.sort === "sales") filtered.sort((a, b) => (b.salesScore ?? 0) - (a.salesScore ?? 0) || (a.deadline || "9999").localeCompare(b.deadline || "9999"));
  else filtered.sort((a, b) => (a.deadline || "9999").localeCompare(b.deadline || "9999") || b.publishedAt.localeCompare(a.publishedAt));
  const pageSize = Math.max(1, Math.min(options.pageSize ?? 24, 60));
  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const page = Math.max(1, Math.min(options.page ?? 1, totalPages));
  const offset = (page - 1) * pageSize;
  return {
    items: filtered.slice(offset, offset + pageSize),
    stats: {
      totalCount: allRecords.length,
      currentCount,
      historicalCount,
      filteredCount: filtered.length,
      verifiedCount: allRecords.filter((item) => ["STATUS_VERIFIED", "FULLY_VERIFIED"].includes(item.verificationState)).length,
      knownDeadlineCount: allRecords.filter((item) => fieldState(item.evidenceFields, "deadline") === "verified").length,
      knownBudgetCount: allRecords.filter((item) => fieldState(item.evidenceFields, "budget") === "verified").length,
      page,
      pageSize,
      totalPages,
      lastUpdatedAt: allRecords.length > 0 ? allRecords.map((item) => item.retrievedAt).sort()[allRecords.length - 1] : null,
      typeFacets: buildFacets(allRecords, (item) => [item.opportunityType], TYPE_LABELS),
      sceneFacets: buildFacets(allRecords, (item) => item.welfareScenes),
      regionFacets: buildFacets(allRecords, (item) => [item.region]),
      supplierFitFacets: buildFacets(allRecords, (item) => item.supplierMatches ?? []),
    },
    sources: WELFARE_SOURCES.filter((source) => source.enabled).map((source) => {
      const summary = loadWelfareRunSummary()?.sources.find((item) => item.sourceCode === source.code);
      return {
        code: source.code,
        name: source.name,
        url: source.url,
        status: summary?.status === "failed" || summary?.status === "partial" ? "degraded" as const : summary?.status === "empty" ? "empty" as const : "active" as const,
        lastUpdatedAt: summary?.retrievedAt ?? null,
      };
    }),
  };
}

export function loadRecordedWelfareOpportunities(): WelfareOpportunityRecord[] {
  const file = path.resolve(process.cwd(), "src/demo/welfare-opportunities.recorded.json");
  return JSON.parse(fs.readFileSync(file, "utf8")) as WelfareOpportunityRecord[];
}

export function loadPersistedWelfareOpportunities(filePath = process.env.CHANCEPING_WELFARE_STORE_PATH ?? "data/welfare-opportunities.json"): WelfareOpportunityRecord[] {
  const absolute = path.resolve(process.cwd(), filePath);
  if (!fs.existsSync(absolute)) return [];
  const parsed = JSON.parse(fs.readFileSync(absolute, "utf8")) as { records?: WelfareOpportunityRecord[] } | WelfareOpportunityRecord[];
  return Array.isArray(parsed) ? parsed : parsed.records ?? [];
}

export function savePersistedWelfareOpportunities(records: WelfareOpportunityRecord[], filePath = process.env.CHANCEPING_WELFARE_STORE_PATH ?? "data/welfare-opportunities.json"): void {
  const absolute = path.resolve(process.cwd(), filePath);
  fs.mkdirSync(path.dirname(absolute), { recursive: true });
  const temporary = `${absolute}.tmp`;
  fs.writeFileSync(temporary, JSON.stringify({ version: "1.0", updatedAt: new Date().toISOString(), records }, null, 2));
  fs.renameSync(temporary, absolute);
}

export function loadPersistedWelfareCandidates(filePath = process.env.CHANCEPING_WELFARE_CANDIDATE_PATH ?? "data/welfare-candidates.json"): WelfareCandidateRecord[] {
  const absolute = path.resolve(process.cwd(), filePath);
  if (!fs.existsSync(absolute)) return [];
  try {
    const parsed = JSON.parse(fs.readFileSync(absolute, "utf8")) as { records?: WelfareCandidateRecord[] } | WelfareCandidateRecord[];
    return Array.isArray(parsed) ? parsed : parsed.records ?? [];
  } catch { return []; }
}

export function savePersistedWelfareCandidates(records: WelfareCandidateRecord[], filePath = process.env.CHANCEPING_WELFARE_CANDIDATE_PATH ?? "data/welfare-candidates.json"): void {
  const absolute = path.resolve(process.cwd(), filePath);
  fs.mkdirSync(path.dirname(absolute), { recursive: true });
  const temporary = `${absolute}.tmp`;
  fs.writeFileSync(temporary, JSON.stringify({ version: "1.0", updatedAt: new Date().toISOString(), records }, null, 2));
  fs.renameSync(temporary, absolute);
}

function mergeWelfareCandidates(existing: WelfareCandidateRecord[], incoming: WelfareCandidateRecord[], refreshedSourceCodes: Set<string> = new Set()): WelfareCandidateRecord[] {
  const byId = new Map(existing.filter((record) => !refreshedSourceCodes.has(record.sourceCode)).map((record) => [record.id, record]));
  for (const record of incoming) byId.set(record.id, record);
  return Array.from(byId.values()).sort((a, b) => b.retrievedAt.localeCompare(a.retrievedAt));
}

export function loadWelfareRunSummary(filePath = process.env.CHANCEPING_WELFARE_RUN_SUMMARY_PATH ?? "data/welfare-run-summary.json"): WelfareRunSummary | null {
  const absolute = path.resolve(process.cwd(), filePath);
  if (!fs.existsSync(absolute)) return null;
  try { return JSON.parse(fs.readFileSync(absolute, "utf8")) as WelfareRunSummary; } catch { return null; }
}

export function saveWelfareRunSummary(summary: WelfareRunSummary, filePath = process.env.CHANCEPING_WELFARE_RUN_SUMMARY_PATH ?? "data/welfare-run-summary.json"): void {
  const absolute = path.resolve(process.cwd(), filePath);
  fs.mkdirSync(path.dirname(absolute), { recursive: true });
  const temporary = `${absolute}.tmp`;
  fs.writeFileSync(temporary, JSON.stringify(summary, null, 2));
  fs.renameSync(temporary, absolute);
}

export function mergeWelfareRecords(existing: WelfareOpportunityRecord[], incoming: WelfareOpportunityRecord[]): WelfareOpportunityRecord[] {
  const byId = new Map(existing.map((record) => [record.id, record]));
  for (const record of incoming) byId.set(record.id, { ...byId.get(record.id), ...record });
  return Array.from(byId.values());
}

export function extractWelfareIndexLinks(html: string, source = sourceByCode(WELFARE_SOURCE_CODE)): Array<{ title: string; url: string; publishedAt: string }> {
  const welfareContext = WELFARE_CONTEXT;
  const opportunityAction = /(采购|招标|磋商|询价|遴选|供应商|征集|项目)/;
  // Large procurement portals list generic project names and expose the
  // welfare context only on the detail page. Reviewed adapters may therefore
  // admit action-looking list links, while parseWelfareDetail remains the
  // final welfare/action gate before a card is created.
  const relaxedPortal = Boolean(source.adapter);
  const patterns = [
    /<li>[\s\S]*?<span>(\d{4}-\d{2}-\d{2})<\/span>[\s\S]*?<a\b[^>]*href=["']([^"']+)["'][^>]*title=["']([^"']+)["'][^>]*>/gi,
    /<li>[\s\S]*?<a\b[^>]*href=["']([^"']+)["'][^>]*title=["']([^"']+)["'][^>]*>[\s\S]*?<i>(\d{4}-\d{2}-\d{2})<\/i>[\s\S]*?<\/a>[\s\S]*?<\/li>/gi,
    /<li>[\s\S]*?<a\b[^>]*href=["']([^"']+)["'][^>]*title=["']([^"']+)["'][^>]*>[\s\S]*?<\/a>[\s\S]*?<span>(\d{4}-\d{2}-\d{2})<\/span>[\s\S]*?<\/li>/gi,
  ];
  const discovered = new Map<string, { title: string; url: string; publishedAt: string }>();
  for (const pattern of patterns) {
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(html)) !== null) {
      const isDateFirst = /^\d{4}-\d{2}-\d{2}$/.test(match[1]);
      const publishedAt = isDateFirst ? match[1] : match[3];
      const href = isDateFirst ? match[2] : match[1];
      const title = cleanText(isDateFirst ? match[3] : match[2]);
      if (NON_OPPORTUNITY_DISCOVERY.test(title)) continue;
      const url = normalizeUrl(href, source.url);
      const hasWelfareContext = welfareContext.test(title);
      const hasOpportunityAction = opportunityAction.test(title);
      const candidateAction = source.candidateDiscovery && hasOpportunityAction && !NON_OPPORTUNITY_DISCOVERY.test(title);
      if (!url || (!relaxedPortal && !hasWelfareContext && !candidateAction) || !hasOpportunityAction) continue;
      if (/(结果|中标|成交|终止|废标)/.test(title)) continue;
      discovered.set(url, { title, url, publishedAt });
    }
  }
  const officialListItem = /<li\b[^>]*>[\s\S]{0,1800}?<a\b[^>]*href=["']([^"']+)["'][^>]*?(?:title=["']([^"']+)["'])?[^>]*>([\s\S]*?)<\/a>[\s\S]{0,900}?(?:发布时间[：:]?\s*<em>)?(\d{4}-\d{2}-\d{2})(?:\s+\d{1,2}:\d{2})?/gi;
  let itemMatch: RegExpExecArray | null;
  while ((itemMatch = officialListItem.exec(html)) !== null) {
    const url = normalizeUrl(itemMatch[1], source.url);
    const title = cleanText(itemMatch[2] || itemMatch[3]);
    if (NON_OPPORTUNITY_DISCOVERY.test(title)) continue;
    const candidateAction = Boolean(source.candidateDiscovery && opportunityAction.test(title) && !NON_OPPORTUNITY_DISCOVERY.test(title));
    if (!url || (!relaxedPortal && !welfareContext.test(title) && !candidateAction) || !opportunityAction.test(title) || /(结果|中标|成交|终止|废标)/.test(title)) continue;
    discovered.set(url, { title, url, publishedAt: itemMatch[4] });
  }
  const dateBeforeListItem = /<li\b[^>]*>[\s\S]{0,600}?<span[^>]*>\s*\[?(\d{4}-\d{2}-\d{2})\]?\s*<\/span>[\s\S]{0,600}?<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  while ((itemMatch = dateBeforeListItem.exec(html)) !== null) {
    const url = normalizeUrl(itemMatch[2], source.url);
    const title = cleanText(itemMatch[3]);
    if (NON_OPPORTUNITY_DISCOVERY.test(title)) continue;
    if (!url || (!relaxedPortal && !welfareContext.test(title)) || !opportunityAction.test(title) || /(结果|中标|成交|终止|废标)/.test(title)) continue;
    discovered.set(url, { title, url, publishedAt: itemMatch[1] });
  }
  // Drupal procurement columns used by universities can omit the date from
  // list cards. Limit this fallback to the reviewed SYSU procurement column;
  // the detail page supplies its own deadline evidence before a card is shown.
  if (source.code === "ORG-001") {
    const drupalListItem = /<li\b[^>]*class=["'][^"']*list-item[^"']*["'][^>]*>[\s\S]{0,1200}?<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
    while ((itemMatch = drupalListItem.exec(html)) !== null) {
      const url = normalizeUrl(itemMatch[1], source.url);
      const title = cleanText(itemMatch[2]);
      if (!url || (!relaxedPortal && !welfareContext.test(title)) || !opportunityAction.test(title) || /(结果|中标|成交|终止|废标)/.test(title)) continue;
      discovered.set(url, { title, url, publishedAt: "" });
    }
  }
  // Reader-compatible Markdown fallback, used only when the SWAS TLS stack
  // cannot retrieve the same official public page directly.
  const markdownLink = /\[([^\]]+)\]\((https?:\/\/[^\s)]+)(?:\s+"[^"]*")?\)/g;
  let markdownMatch: RegExpExecArray | null;
  while ((markdownMatch = markdownLink.exec(html)) !== null) {
    const title = cleanText(markdownMatch[1]);
    if (NON_OPPORTUNITY_DISCOVERY.test(title)) continue;
    const url = normalizeUrl(markdownMatch[2], source.url);
    const publishedAt = html.slice(Math.max(0, markdownMatch.index - 24), markdownMatch.index).match(/(\d{4}-\d{2}-\d{2})\s*$/)?.[1] ?? "";
    const hasWelfareContext = welfareContext.test(title);
    const hasOpportunityAction = opportunityAction.test(title);
    const candidateAction = Boolean(source.candidateDiscovery && hasOpportunityAction && !NON_OPPORTUNITY_DISCOVERY.test(title));
    if (!url || (!relaxedPortal && !hasWelfareContext && !candidateAction) || !hasOpportunityAction || /(结果|中标|成交|终止|废标)/.test(title)) continue;
    discovered.set(url, { title, url, publishedAt });
  }
  if (relaxedPortal) {
    const relaxedLinks: Array<{ title: string; url: string; publishedAt: string; priority: number }> = [];
    const anchorPattern = /<a\b[^>]*href=["']([^"']+)["'][^>]*?(?:title=["']([^"']+)["'])?[^>]*>([\s\S]*?)<\/a>/gi;
    let anchor: RegExpExecArray | null;
    while ((anchor = anchorPattern.exec(html)) !== null) {
      const url = normalizeUrl(anchor[1], source.url);
      const title = cleanText(anchor[2] || anchor[3]);
      if (!url || url === source.url || new URL(url).hostname !== source.allowedHost || title.length < 6 || NON_OPPORTUNITY_DISCOVERY.test(title) || /^(首页|登录|注册|更多|关闭|下一页|上一页|返回)$/.test(title) || /(?:javascript:|mailto:)/i.test(anchor[1])) continue;
      relaxedLinks.push({ title, url, publishedAt: "", priority: opportunityAction.test(title) ? 0 : 1 });
    }
    for (const link of relaxedLinks.sort((a, b) => a.priority - b.priority)) {
      if (!discovered.has(link.url)) discovered.set(link.url, { title: link.title, url: link.url, publishedAt: link.publishedAt });
    }
  }
  // Shenzhen Bay Lab embeds its procurement list in an inline JSON array
  // instead of anchor tags. Preserve those official detail paths and dates.
  if (source.code === "ORG-004") {
    const jsonItem = /"showTitle":"([^"]+)"[\s\S]{0,500}?"showDate":"(\d{4}-\d{2}-\d{2})"[\s\S]{0,500}?"url":\{"asString":"([^"]+)"\}/g;
    let item: RegExpExecArray | null;
    while ((item = jsonItem.exec(html)) !== null) {
      const url = normalizeUrl(item[3], source.url);
      const title = cleanText(item[1]);
      if (!url || !title || /(结果|中标|成交|终止|废标)/.test(title)) continue;
      discovered.set(url, { title, url, publishedAt: item[2] });
    }
  }
  return Array.from(discovered.values());
}

function extractMeta(html: string, name: string): string {
  const match = html.match(new RegExp(`<meta\\s+name=["']${name}["']\\s+content=["']([^"']*)["']`, "i"));
  return cleanText(match?.[1] ?? "");
}

function extractReaderTitle(content: string): string {
  const match = content.match(/(?:^|\n)Title:\s*(.+?)(?:\r?\n|$)/i);
  return cleanText(match?.[1] ?? "");
}

function excerpt(text: string, pattern: RegExp): string | undefined {
  const match = text.match(pattern);
  return match?.[0]?.slice(0, 180);
}

function publishedContactName(value: string | undefined): string | undefined {
  const name = value?.replace(/^(?:项目联系人|联系人(?:及电话)?)[：:]?\s*/, "").trim();
  // Do not turn template phrases such as “联系人及联系方式” into a public person.
  if (!name || /^(及|和|、|信息|联系方式|详见|见附件)/.test(name)) return undefined;
  return name;
}

export function parseWelfareDetail(input: { html: string; url: string; sourceCode?: WelfareSourceConfig["code"]; publishedAtHint?: string; retrievedAt?: string }): WelfareOpportunityRecord | null {
  const source = sourceByCode(input.sourceCode ?? WELFARE_SOURCE_CODE);
  const title = extractMeta(input.html, "ArticleTitle") || cleanText(input.html.match(/<title>([\s\S]*?)<\/title>/i)?.[1] ?? "") || extractReaderTitle(input.html);
  const text = cleanText(input.html);
  const welfareContext = WELFARE_CONTEXT;
  const opportunityAction = /(采购|招标|磋商|询价|遴选|供应商|征集|招募|合作|项目)/;
  const contextText = source.adapter ? `${title} ${text}` : title;
  if (!title || NON_OPPORTUNITY_DISCOVERY.test(title) || NON_WELFARE_PROJECT.test(title) || !welfareContext.test(contextText) || !opportunityAction.test(contextText)) return null;
  // Government portals often omit punctuation between labeled fields. Stop
  // at the next known label so a buyer never becomes the whole announcement.
  const buyerExcerpt = excerpt(text, /(?:采购人名称|采购单位|采购人)[：:]?\s*[^。；]*?(?=\s*(?:联系地址|采购单位地址|联系人|项目联系人|联系电话|采购单位联系方式|地址|公告时间|发布时间|发布日期|项目概况|采购内容|响应文件|采购文件|项目编号|采购方式|地点)[：:]?|[。；]|$)/);
  const contactNameExcerpt = excerpt(text, /(?:项目联系人|联系人(?:及电话)?)[：:]?\s*[^。；\s]+/);
  const contactPhoneExcerpt = excerpt(text, /(?:联系电话|项目联系电话|项目联系人电话|联系人及电话|采购单位联系方式)[：:]?\s*(?:[^。；\s：:]+[、，,]?){0,3}[：:]?\s*(?:\+?86[-\s]?)?(?:0\d{2,3}[-\s]?\d{7,8}|1[3-9]\d{9})/);
  const contactAddressExcerpt = excerpt(text, /(?:联系地址|采购单位地址)[：:]?\s*[^。；]+?(?=\s*(?:联系人|项目联系人|联系电话|项目联系电话|采购单位联系方式|代理机构|项目概况|项目名称|采购内容|公告时间|发布时间)[：:]?|[。；]|$)/);
  const deadlineExcerpt = excerpt(text, /(?:(?:投标|报名|响应|递交|提交)[^。；]{0,32}(?:截至|截止)[^。；]{0,40}|(?:投标|报名|响应|递交|提交)[^。；]{0,32}截止时间\s*\d{4}-\d{1,2}-\d{1,2})/);
  const budgetExcerpt = excerpt(text, /(?:预算金额|采购预算|最高限价|预估(?:年度)?采购总金额)[：:]?\s*(?:人民币)?\s*[\d,.]+\s*(?:万元|元)/);
  if (source.adapter && !opportunityAction.test(title) && !/(采购人|采购单位|预算金额|采购预算|最高限价|截止|联系人|联系电话|报名|响应文件)/.test(text)) return null;
  const deadlineMatch = deadlineExcerpt?.match(/(?:(\d{4})年)?(\d{1,2})月(\d{1,2})日(?:\s*(\d{1,2})时(?:(\d{1,2})分)?)?|(\d{4})-(\d{1,2})-(\d{1,2})/);
  const publishedAt = input.publishedAtHint || extractMeta(input.html, "PubDate") || "";
  const year = Number(deadlineMatch?.[1] || deadlineMatch?.[6] || publishedAt.slice(0, 4) || new Date().getFullYear());
  const deadlineMonth = deadlineMatch?.[2] || deadlineMatch?.[7];
  const deadlineDay = deadlineMatch?.[3] || deadlineMatch?.[8];
  const deadline = deadlineMatch && deadlineMonth && deadlineDay ? `${year}-${String(deadlineMonth).padStart(2, "0")}-${String(deadlineDay).padStart(2, "0")}T${String(deadlineMatch[4] ?? "23").padStart(2, "0")}:${String(deadlineMatch[5] ?? "59").padStart(2, "0")}:00+08:00` : "";
  const isClosed = /(结果公告|中标公告|成交公告|终止公告|废标公告)/.test(title);
  const isCorrection = /(变更公告|更正公告)/.test(title);
  const deadlineExpired = Boolean(deadline) && Date.parse(deadline) < new Date(input.retrievedAt ?? Date.now()).getTime();
  const evidenceFields: WelfareEvidenceField[] = [
    { field: "buyer", state: buyerExcerpt ? "verified" : "unknown", excerpt: buyerExcerpt },
    { field: "budget", state: budgetExcerpt ? "verified" : "not_published", excerpt: budgetExcerpt },
    { field: "deadline", state: deadlineExcerpt && deadline ? "verified" : "unknown", excerpt: deadlineExcerpt },
    { field: "status", state: "verified", excerpt: isClosed ? "标题显示项目已结束" : isCorrection ? "标题显示采购更正/变更" : "标题显示公开采购或征集" },
    { field: "contactName", state: publishedContactName(contactNameExcerpt) ? "verified" : "not_published", excerpt: publishedContactName(contactNameExcerpt) ? contactNameExcerpt : undefined },
    { field: "contactPhone", state: contactPhoneExcerpt ? "verified" : "not_published", excerpt: contactPhoneExcerpt },
    { field: "contactAddress", state: contactAddressExcerpt ? "verified" : "not_published", excerpt: contactAddressExcerpt },
  ];
  const rawSha256 = crypto.createHash("sha256").update(input.html).digest("hex");
  return {
    id: stableId(input.url),
    title,
    sourceCode: source.code,
    sourceName: source.name,
    officialUrl: input.url,
    publishedAt: publishedAt ? `${publishedAt.slice(0, 10)}T00:00:00+08:00` : input.retrievedAt ?? new Date().toISOString(),
    retrievedAt: input.retrievedAt ?? new Date().toISOString(),
    rawSha256,
    dataMode: "live",
    opportunityType: source.opportunityType ?? "OPEN_PROCUREMENT",
    lifecycleStatus: isClosed || deadlineExpired || (!deadline && publishedAt && Date.parse(publishedAt) < (new Date(input.retrievedAt ?? Date.now()).getTime() - 45 * 86_400_000)) ? "historical" : "current",
    currentStage: isClosed ? "CLOSED_PENDING_RESULT" : isCorrection ? "CORRECTED" : "OPEN",
    verificationState: buyerExcerpt && deadlineExcerpt ? "STATUS_VERIFIED" : "FIELD_VERIFIED",
    buyer: buyerExcerpt?.replace(/^(?:采购人名称|采购单位|采购人)[：:]?\s*/, "") ?? "待核验",
    contactName: publishedContactName(contactNameExcerpt) ?? "未公开",
    contactPhone: contactPhoneExcerpt?.replace(/^(?:联系电话|项目联系电话|项目联系人电话|联系人及电话|采购单位联系方式)[：:]?\s*/, "") ?? "未公开",
    contactAddress: contactAddressExcerpt?.replace(/^(?:联系地址|采购单位地址)[：:]?\s*/, "") ?? "未公开",
    region: source.region,
    budgetDisplay: budgetExcerpt?.replace(/^(?:预算金额|采购预算|最高限价|预估(?:年度)?采购总金额)[：:]?\s*/, "") ?? "未公开",
    deadline,
    deadlineDisplay: deadlineExcerpt ?? "待核验",
    welfareScenes: [/(消费帮扶)/.test(title) ? "消费帮扶" : /(慰问)/.test(title) ? "职工慰问" : "企业福利采购"],
    productScopes: [/(农副产品|食品|慰问物资)/.test(text) ? "食品生鲜/慰问物资" : "综合福利"],
    reason: source.opportunityType === "CHANNEL_PARTNERSHIP" ? `来自${source.name}官方公告栏目，涉及企业福利渠道或项目合作。` : source.opportunityType === "SUPPLIER_RECRUITMENT" ? `来自${source.name}官方供应商招募页面，涉及员工福利商品或服务合作。` : `来自${source.name}官方公告栏目，涉及企业福利、职工慰问或消费帮扶采购。`,
    nextAction: "打开官方原文，核对采购文件、资格要求、附件和递交方式。",
    riskNote: "公开页面仅整理官方公告；预算、截止和资格要求以官方原文及后续更正为准。",
    evidenceFields,
  };
}

function candidateFromLink(source: WelfareSourceConfig, link: { title: string; url: string; publishedAt: string }, retrievedAt: string, reason: string): WelfareCandidateRecord {
  return {
    id: stableId(`candidate:${link.url}`),
    title: link.title || "未命名福利相关公告",
    sourceCode: source.code,
    sourceName: source.name,
    officialUrl: link.url,
    publishedAt: link.publishedAt ? `${link.publishedAt.slice(0, 10)}T00:00:00+08:00` : retrievedAt,
    retrievedAt,
    region: source.region,
    verificationState: "CANDIDATE",
    reason,
    nextAction: "回溯官方详情，核对采购方、截止时间、项目状态和资格要求。",
  };
}

export interface WelfareSourceCollectionResult {
  sourceCode: WelfareSourceConfig["code"];
  sourceName: string;
  retrievedAt: string;
  status: "succeeded" | "partial" | "failed" | "empty";
  discoveredCount: number;
  publishedCount: number;
  totalCount: number;
  errors: Array<{ url: string; error: string }>;
}

interface WelfareSourceCollectionData { result: WelfareSourceCollectionResult; records: WelfareOpportunityRecord[]; candidates?: WelfareCandidateRecord[]; }

interface SzGgzyNotice {
  title?: string;
  noticeTitle?: string;
  linkTo?: string;
  releaseTime?: string;
  publishTime?: string;
  projectCode?: string;
  projectName?: string;
  purchaseCom?: string;
  purchaseMan?: string;
  noticeCloseTime?: string;
}

function szGgzyNoticeHtml(notice: SzGgzyNotice): string {
  const title = notice.noticeTitle || notice.title || notice.projectName || "";
  const values = [
    notice.purchaseCom ? `采购人：${notice.purchaseCom}` : "",
    notice.purchaseMan ? `联系人：${notice.purchaseMan}` : "",
    notice.projectCode ? `项目编号：${notice.projectCode}` : "",
    notice.noticeCloseTime ? `提交截止：${notice.noticeCloseTime}` : "",
  ].filter(Boolean).join("；");
  return `<html><head><title>${title}</title><meta name="PubDate" content="${notice.releaseTime || notice.publishTime || ""}"></head><body>${values}</body></html>`;
}

async function collectSzGgzyGovernmentProcurement(source: WelfareSourceConfig, options: { fetchHtml?: (url: string) => Promise<string>; evidenceDir: string; maxDetails?: number; now: Date; retrievedAt: string }): Promise<WelfareSourceCollectionData> {
  const endpoint = "https://www.szggzy.com/cms/api/v1/trade/content/page";
  const payload = {
    modelId: 1378,
    channelId: 2850,
    parentBusinessType: "政府采购",
    fields: [{ fieldName: "jygg_gglxmc_rank1", fieldValue: "采购公告" }],
    title: null,
    releaseTimeBegin: null,
    releaseTimeEnd: null,
    page: 0,
    size: Math.max(1, Math.min(options.maxDetails ?? source.maxDetails, 30)),
    siteId: 1,
  };
  try {
    // Tests inject the same safe official-response fixture through fetchHtml.
    // Production uses the public documented list endpoint with its required POST body.
    const raw = options.fetchHtml
      ? await options.fetchHtml(endpoint)
      : await defaultWelfareFetchJson(endpoint, payload);
    fs.writeFileSync(path.join(options.evidenceDir, `index-${crypto.createHash("sha256").update(raw).digest("hex").slice(0, 16)}.json`), raw);
    const parsed = JSON.parse(raw) as { data?: { content?: SzGgzyNotice[] } };
    const notices = (parsed.data?.content ?? []).slice(0, payload.size);
    const records: WelfareOpportunityRecord[] = [];
    for (const notice of notices) {
      const title = notice.noticeTitle || notice.title || notice.projectName || "";
      const officialUrl = normalizeUrl(notice.linkTo ?? "", source.url);
      if (!officialUrl || !WELFARE_CONTEXT.test(title) || !WELFARE_ACTION.test(title) || /(结果|中标|成交|终止|废标)/.test(title)) continue;
      const html = szGgzyNoticeHtml(notice);
      const record = parseWelfareDetail({ html, url: officialUrl, sourceCode: source.code, publishedAtHint: notice.releaseTime || notice.publishTime || "", retrievedAt: options.retrievedAt });
      if (record) records.push(record);
    }
    return { result: { sourceCode: source.code, sourceName: source.name, retrievedAt: options.retrievedAt, status: records.length ? "succeeded" : "empty", discoveredCount: notices.length, publishedCount: records.length, totalCount: records.length, errors: [] }, records };
  } catch (error) {
    return { result: { sourceCode: source.code, sourceName: source.name, retrievedAt: options.retrievedAt, status: "failed", discoveredCount: 0, publishedCount: 0, totalCount: 0, errors: [{ url: endpoint, error: error instanceof Error ? error.message : String(error) }] }, records: [] };
  }
}

interface GzGpcArticle {
  id?: string;
  title?: string;
  description?: string;
  publishDate?: string;
}

function gzGpcArticleHtml(article: GzGpcArticle): string {
  return `<html><head><title>${article.title ?? ""}</title><meta name="PubDate" content="${article.publishDate ?? ""}"></head><body>${article.description ?? ""}</body></html>`;
}

async function collectGzGpcProcurementSignals(source: WelfareSourceConfig, options: { fetchHtml?: (url: string) => Promise<string>; evidenceDir: string; maxDetails?: number; now: Date; retrievedAt: string }): Promise<WelfareSourceCollectionData> {
  const channels: Array<{ alias: string; type: WelfareOpportunityType }> = [
    { alias: "purchase-intention", type: "PROCUREMENT_INTENT" },
    { alias: "demand-collection", type: "SUPPLIER_RECRUITMENT" },
  ];
  const errors: Array<{ url: string; error: string }> = [];
  const records: WelfareOpportunityRecord[] = [];
  let discoveredCount = 0;
  for (const channel of channels) {
    const endpoint = `https://www.guangzhougpc.cn/frontend/content/articles?channel=${channel.alias}&limit=${Math.max(1, Math.min(options.maxDetails ?? source.maxDetails, 30))}`;
    try {
      const raw = options.fetchHtml ? await options.fetchHtml(endpoint) : await defaultWelfareFetchHtml(endpoint);
      fs.writeFileSync(path.join(options.evidenceDir, `${channel.alias}-${crypto.createHash("sha256").update(raw).digest("hex").slice(0, 16)}.json`), raw);
      const parsed = JSON.parse(raw) as { content?: GzGpcArticle[] };
      const articles = parsed.content ?? [];
      discoveredCount += articles.length;
      for (const article of articles) {
        if (!article.id) continue;
        const officialUrl = `https://www.guangzhougpc.cn/article/${encodeURIComponent(article.id)}`;
        const record = parseWelfareDetail({ html: gzGpcArticleHtml(article), url: officialUrl, sourceCode: source.code, publishedAtHint: article.publishDate ?? "", retrievedAt: options.retrievedAt });
        if (record) records.push({ ...record, opportunityType: channel.type, reason: channel.type === "PROCUREMENT_INTENT" ? `来自${source.name}官方采购意向栏目，属于公开的前置需求信号。` : `来自${source.name}官方采购需求供应商征集栏目，属于公开供应商征集机会。` });
      }
    } catch (error) {
      errors.push({ url: endpoint, error: error instanceof Error ? error.message : String(error) });
    }
  }
  const status = errors.length === channels.length ? "failed" : errors.length ? "partial" : records.length ? "succeeded" : "empty";
  return { result: { sourceCode: source.code, sourceName: source.name, retrievedAt: options.retrievedAt, status, discoveredCount, publishedCount: records.length, totalCount: records.length, errors }, records };
}

async function collectWelfareSourceData(sourceCode: WelfareSourceConfig["code"], options: { fetchHtml?: (url: string) => Promise<string>; evidenceDir?: string; maxDetails?: number; now?: Date } = {}): Promise<WelfareSourceCollectionData> {
  const source = sourceByCode(sourceCode);
  const fetchHtml = options.fetchHtml ?? defaultWelfareFetchHtml;
  const now = options.now ?? new Date();
  const retrievedAt = now.toISOString();
  const evidenceDir = path.resolve(process.cwd(), options.evidenceDir ?? `data/welfare-evidence/${source.code}`);
  fs.mkdirSync(evidenceDir, { recursive: true });
  if (source.publicApi === "szggzy-government-procurement") return collectSzGgzyGovernmentProcurement(source, { fetchHtml: options.fetchHtml, evidenceDir, maxDetails: options.maxDetails, now, retrievedAt });
  if (source.publicApi === "gzgpc-procurement-signals") return collectGzGpcProcurementSignals(source, { fetchHtml: options.fetchHtml, evidenceDir, maxDetails: options.maxDetails, now, retrievedAt });
  // Every reviewed shadow source goes through this explicit adapter contract.
  // The adapter remains deliberately conservative: it only follows official
  // same-host links and uses the shared welfare/action gate plus field-level
  // evidence parser. A source-specific adapter can therefore be promoted by
  // changing rollout after its live evidence review without changing the
  // public feed contract.
  if (source.adapter) {
    fs.writeFileSync(path.join(evidenceDir, "adapter.json"), JSON.stringify({ sourceCode: source.code, adapter: source.adapter, allowedHost: source.allowedHost, collectedAt: retrievedAt }, null, 2));
  }
  const indexUrls = source.indexUrls?.length ? source.indexUrls : [source.url];
  const indexErrors: Array<{ url: string; error: string }> = [];
  const indexLinks = new Map<string, { title: string; url: string; publishedAt: string }>();
  const indexResults = await Promise.all(indexUrls.map(async (indexUrl) => {
    try {
      const indexHtml = await fetchHtml(indexUrl);
      fs.writeFileSync(path.join(evidenceDir, `index-${crypto.createHash("sha256").update(indexHtml).digest("hex").slice(0, 16)}.html`), indexHtml);
      return { indexUrl, links: extractWelfareIndexLinks(indexHtml, { ...source, url: indexUrl }) };
    } catch (error) {
      return { indexUrl, error: error instanceof Error ? error.message : String(error), links: [] };
    }
  }));
  for (const result of indexResults) {
    if (result.error) indexErrors.push({ url: result.indexUrl, error: result.error });
    for (const link of result.links) indexLinks.set(link.url, link);
  }
  if (indexErrors.length === indexUrls.length) {
    return { result: { sourceCode: source.code, sourceName: source.name, retrievedAt, status: "failed", discoveredCount: 0, publishedCount: 0, totalCount: 0, errors: indexErrors }, records: [] };
  }
  const links = (source.directDetail
    ? [{ title: source.name, url: source.url, publishedAt: "" }]
    : Array.from(indexLinks.values()).sort((a, b) => {
      const context = WELFARE_CONTEXT;
      return Number(!context.test(a.title)) - Number(!context.test(b.title));
    })
  ).slice(0, Math.max(1, Math.min(options.maxDetails ?? source.maxDetails, 30)));
  const records: WelfareOpportunityRecord[] = [];
  const candidates: WelfareCandidateRecord[] = [];
  const errors: Array<{ url: string; error: string }> = [...indexErrors];
  for (const link of links) {
    try {
      let effectiveUrl = link.url;
      if (source.adapter && effectiveUrl.startsWith("http://")) effectiveUrl = effectiveUrl.replace(/^http:\/\//i, "https://");
      let html = await fetchHtml(effectiveUrl);
      if (source.code === "OFF-N-004") {
        const nestedPath = html.match(/(?:firstLastUrl\s*=|showDetail\([^,]+,[^,]+,\s*)\s*['\"]([^'\"]+\/information\/deal\/html\/b\/[^'\"]+)['\"]/i)?.[1];
        if (nestedPath) {
          fs.writeFileSync(path.join(evidenceDir, `${crypto.createHash("sha256").update(html).digest("hex")}.html`), html);
          effectiveUrl = normalizeUrl(nestedPath, source.url) ?? effectiveUrl;
          html = await fetchHtml(effectiveUrl);
        }
      }
      if (source.code === "ORG-004") {
        const externalDetail = html.match(/https?:\/\/zfcg\.szggzy\.com:8081\/[^\s"'<>]+/i)?.[0];
        if (externalDetail) {
          fs.writeFileSync(path.join(evidenceDir, `${crypto.createHash("sha256").update(html).digest("hex")}.html`), html);
          effectiveUrl = externalDetail.replace(/[),.;]+$/, "").replace(/^http:\/\//i, "https://");
          html = await fetchHtml(effectiveUrl);
        }
      }
      const sha = crypto.createHash("sha256").update(html).digest("hex");
      fs.writeFileSync(path.join(evidenceDir, `${sha}.html`), html);
      const record = parseWelfareDetail({ html, url: effectiveUrl, sourceCode: source.code, publishedAtHint: link.publishedAt, retrievedAt });
      if (record) records.push(record);
      else {
        const detailText = cleanText(html.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, " "));
        const hasWelfareContext = WELFARE_CONTEXT.test(link.title) || WELFARE_CONTEXT.test(detailText);
        const hasAction = WELFARE_ACTION.test(link.title) || WELFARE_ACTION.test(detailText);
        if (hasWelfareContext && hasAction) candidates.push(candidateFromLink(source, { ...link, url: effectiveUrl }, retrievedAt, "详情页出现福利语境与采购行动信号，但字段不足以形成正式机会卡。"));
      }
    } catch (error) {
      errors.push({ url: link.url, error: error instanceof Error ? error.message : String(error) });
    }
  }
  return { result: { sourceCode: source.code, sourceName: source.name, retrievedAt, status: errors.length > 0 ? "partial" : records.length > 0 ? "succeeded" : "empty", discoveredCount: links.length, publishedCount: records.length, totalCount: records.length, errors }, records, candidates };
}

export async function collectWelfareSource(sourceCode: WelfareSourceConfig["code"], options: { fetchHtml?: (url: string) => Promise<string>; evidenceDir?: string; maxDetails?: number; now?: Date; persist?: boolean } = {}): Promise<WelfareSourceCollectionResult> {
  const data = await collectWelfareSourceData(sourceCode, options);
  const merged = mergeWelfareRecords(loadPersistedWelfareOpportunities(), data.records);
  if (options.persist !== false) savePersistedWelfareOpportunities(merged);
  return { ...data.result, totalCount: merged.length };
}

/** Review-only collection surface; never persists records or changes rollout. */
export async function collectWelfareSourceForReview(sourceCode: WelfareSourceConfig["code"], options: { fetchHtml?: (url: string) => Promise<string>; evidenceDir?: string; maxDetails?: number; now?: Date } = {}): Promise<WelfareSourceCollectionData> {
  return collectWelfareSourceData(sourceCode, options);
}

export async function collectOffSz004(options: { fetchHtml?: (url: string) => Promise<string>; evidenceDir?: string; maxDetails?: number; now?: Date } = {}) {
  return collectWelfareSource("OFF-SZ-004", options);
}

export async function collectAllWelfareSources(options: { fetchHtml?: (url: string) => Promise<string>; now?: Date; maxDetails?: number; evidenceDir?: string } = {}) {
  const collected: WelfareSourceCollectionData[] = [];
  const sources = WELFARE_SOURCES.filter((item) => item.enabled);
  // Keep public traffic bounded while avoiding a serial 31-source refresh that
  // can exceed the systemd window when one government host has slow TLS.
  for (let offset = 0; offset < sources.length; offset += 4) {
    const batch = sources.slice(offset, offset + 4);
    const results = await Promise.all(batch.map((source) => collectWelfareSourceData(source.code, {
      ...options,
      evidenceDir: options.evidenceDir ? path.join(options.evidenceDir, source.code) : undefined,
    })));
    collected.push(...results);
  }
  const previous = loadPersistedWelfareOpportunities();
  const incoming = collected.flatMap((item) => item.records);
  const previousById = new Map(previous.map((record) => [record.id, record]));
  const added = incoming.filter((record) => !previousById.has(record.id)).length;
  const updated = incoming.filter((record) => {
    const prior = previousById.get(record.id);
    return Boolean(prior && prior.rawSha256 !== record.rawSha256);
  }).length;
  // Merge only after every configured source has finished. A failed or empty source
  // therefore leaves its last successful public cards intact.
  const merged = mergeWelfareRecords(previous, incoming);
  savePersistedWelfareOpportunities(merged);
  const refreshedCandidateSources = new Set(collected.filter((item) => item.result.status !== "failed").map((item) => item.result.sourceCode));
  savePersistedWelfareCandidates(mergeWelfareCandidates(loadPersistedWelfareCandidates(), collected.flatMap((item) => item.candidates ?? []), refreshedCandidateSources));
  const results = collected.map((item) => ({ ...item.result, totalCount: merged.filter((record) => record.sourceCode === item.result.sourceCode).length }));
  const summary: WelfareRunSummary = {
    ranAt: (options.now ?? new Date()).toISOString(),
    sources: results.map(({ errors: _errors, ...publicResult }) => publicResult),
    totals: { added, updated, historical: merged.filter((record) => record.lifecycleStatus === "historical").length, filtered: collected.reduce((sum, item) => sum + item.result.discoveredCount - item.result.publishedCount, 0), total: merged.length },
  };
  saveWelfareRunSummary(summary);
  return { ranAt: summary.ranAt, sources: results, totalCount: merged.length, summary };
}

export interface WelfareShadowSourceResult {
  sourceCode: string;
  sourceName: string;
  retrievedAt: string;
  status: "succeeded" | "failed" | "empty" | "restricted";
  bytes: number;
  rawSha256?: string;
  error?: string;
}

export interface WelfareShadowRunSummary {
  ranAt: string;
  sources: WelfareShadowSourceResult[];
}

function isAccessChallenge(html: string): boolean {
  return /(?:验证码|安全验证|访问验证|captcha|recaptcha|verify\s+(?:you|yourself)|security\s+check)/i.test(html);
}

// Shadow runs intentionally fetch only the public index page. They establish
// deployment-network access and retain raw evidence before an adapter is
// allowed to create any public opportunity card.
export async function collectWelfareShadowSources(options: { fetchHtml?: (url: string) => Promise<string>; now?: Date; evidenceDir?: string; summaryPath?: string; historyPath?: string } = {}): Promise<WelfareShadowRunSummary> {
  const fetchHtml = options.fetchHtml ?? defaultWelfareFetchHtml;
  const retrievedAt = (options.now ?? new Date()).toISOString();
  const evidenceRoot = path.resolve(process.cwd(), options.evidenceDir ?? "data/welfare-shadow-evidence");
  const results: WelfareShadowSourceResult[] = [];
  for (const source of WELFARE_SHADOW_SOURCES.filter((item) => item.enabled)) {
    try {
      const html = await fetchHtml(source.url);
      const bytes = Buffer.byteLength(html);
      const rawSha256 = crypto.createHash("sha256").update(html).digest("hex");
      const directory = path.join(evidenceRoot, source.code);
      fs.mkdirSync(directory, { recursive: true });
      fs.writeFileSync(path.join(directory, `index-${rawSha256.slice(0, 16)}.html`), html);
      const restricted = source.shadowAccess === "restricted" || isAccessChallenge(html);
      results.push({ sourceCode: source.code, sourceName: source.name, retrievedAt, status: restricted ? "restricted" : bytes > 0 ? "succeeded" : "empty", bytes, rawSha256, error: restricted ? "ACCESS_RESTRICTED_NO_BYPASS" : undefined });
    } catch (error) {
      results.push({ sourceCode: source.code, sourceName: source.name, retrievedAt, status: "failed", bytes: 0, error: error instanceof Error ? error.message : String(error) });
    }
  }
  const summary = { ranAt: retrievedAt, sources: results };
  const summaryPath = path.resolve(process.cwd(), options.summaryPath ?? "data/welfare-shadow-run-summary.json");
  fs.mkdirSync(path.dirname(summaryPath), { recursive: true });
  fs.writeFileSync(summaryPath, JSON.stringify(summary, null, 2));
  const historyPath = path.resolve(process.cwd(), options.historyPath ?? "data/welfare-shadow-run-history.jsonl");
  fs.mkdirSync(path.dirname(historyPath), { recursive: true });
  fs.appendFileSync(historyPath, `${JSON.stringify(summary)}\n`);
  return summary;
}

async function defaultWelfareFetchHtml(url: string): Promise<string> {
  const parsed = new URL(url);
  if (parsed.protocol !== "https:" || !isAllowedWelfareHost(parsed.hostname)) throw new Error("WELFARE_SOURCE_NOT_ALLOWED");
  try {
    const response = await fetch(url, {
      signal: AbortSignal.timeout(20_000),
      headers: { "user-agent": "ChancePing-WelfareRadar/0.1 (+https://fuli.chanceping.com)", accept: "text/html,application/xhtml+xml" },
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return response.text();
  } catch (fetchError) {
    try {
      // Some government sites fail the OpenSSL 3 TLS 1.3 EC negotiation used on
      // SWAS. Keep HTTPS and certificate verification, but retry with TLS 1.2.
      const { stdout } = await execFileAsync("curl", ["-L", "--fail", "--silent", "--show-error", "--max-time", "20", "--tls-max", "1.2", "--http1.1", "-A", "ChancePing-WelfareRadar/0.1 (+https://fuli.chanceping.com)", url], { maxBuffer: 8 * 1024 * 1024 });
      return stdout;
    } catch (curlError) {
      const gnutlsHosts = new Set(["www.szgm.gov.cn", "www.szlhq.gov.cn", "www.szft.gov.cn"]);
      try {
        if (!gnutlsHosts.has(parsed.hostname)) throw new Error("gnutls fallback not required for this host");
        return await gnutlsFetchHtml(url);
      } catch (gnutlsError) {
        try {
          return await welfareReaderRelayFetchHtml(url);
        } catch (relayError) {
          const fetchMessage = fetchError instanceof Error ? fetchError.message : String(fetchError);
          const curlMessage = curlError instanceof Error ? curlError.message : String(curlError);
          const gnutlsMessage = gnutlsError instanceof Error ? gnutlsError.message : String(gnutlsError);
          const relayMessage = relayError instanceof Error ? relayError.message : String(relayError);
          throw new Error(`welfare source fetch failed: node=${fetchMessage}; curl=${curlMessage}; gnutls=${gnutlsMessage}; relay=${relayMessage}`);
        }
      }
    }
  }
}

async function defaultWelfareFetchJson(url: string, payload: unknown): Promise<string> {
  const parsed = new URL(url);
  if (parsed.protocol !== "https:" || !isAllowedWelfareHost(parsed.hostname)) throw new Error("WELFARE_SOURCE_NOT_ALLOWED");
  const response = await fetch(url, {
    method: "POST",
    signal: AbortSignal.timeout(20_000),
    headers: {
      "user-agent": "ChancePing-WelfareRadar/0.1 (+https://fuli.chanceping.com)",
      accept: "application/json",
      "content-type": "application/json",
    },
    body: JSON.stringify(payload),
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const body = await response.text();
  if (!body.trim()) throw new Error("empty JSON response");
  return body;
}

async function welfareReaderRelayFetchHtml(officialUrl: string): Promise<string> {
  // Explicitly a last-resort compatibility transport. It reads only public
  // official URLs; public cards and evidence retain the original official URL.
  const relayBase = process.env.CHANCEPING_WELFARE_RELAY_BASE_URL ?? "https://r.jina.ai/http://";
  if (!/^https:\/\/r\.jina\.ai\/http:\/\/$/.test(relayBase)) throw new Error("WELFARE_RELAY_BASE_URL_NOT_ALLOWED");
  const response = await fetch(`${relayBase}${officialUrl}`, {
    signal: AbortSignal.timeout(30_000),
    headers: { accept: "text/markdown,text/plain;q=0.9", "user-agent": "ChancePing-WelfareRadar/0.1" },
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const content = await response.text();
  if (!content.trim()) throw new Error("empty relay response");
  return content;
}

async function gnutlsFetchHtml(url: string, redirects = 0): Promise<string> {
  if (redirects > 4) throw new Error("too many HTTPS redirects");
  const parsed = new URL(url);
  if (parsed.protocol !== "https:" || !isAllowedWelfareHost(parsed.hostname)) throw new Error("WELFARE_SOURCE_NOT_ALLOWED");
  // Keep the client invocation identical to the verified default GnuTLS
  // handshake. HTTP requires CRLF, supplied directly without --crlf.
  const request = `GET ${parsed.pathname}${parsed.search} HTTP/1.1\r\nHost: ${parsed.host}\r\nUser-Agent: ChancePing-WelfareRadar/0.1 (+https://fuli.chanceping.com)\r\nAccept: text/html,application/xhtml+xml\r\nConnection: close\r\n\r\n`;
  const output = await new Promise<string>((resolve, reject) => {
    const child = spawn("gnutls-cli", ["--sni-hostname", parsed.hostname, parsed.hostname, "-p", "443"], { stdio: ["pipe", "pipe", "pipe"] });
    const chunks: Buffer[] = [];
    const errors: Buffer[] = [];
    let requestSent = false;
    const timeout = setTimeout(() => { child.kill("SIGTERM"); reject(new Error("timeout after 20 seconds")); }, 20_000);
    child.stdout.on("data", (chunk: Buffer) => chunks.push(chunk));
    child.stderr.on("data", (chunk: Buffer) => {
      errors.push(chunk);
      // gnutls-cli starts TLS asynchronously. Sending HTTP before this marker
      // makes the affected Shenzhen endpoints reject the TLS session.
      if (!requestSent && Buffer.concat(errors).toString("utf8").includes("Handshake was completed")) {
        requestSent = true;
        child.stdin.end(request);
      }
    });
    child.once("error", (error) => { clearTimeout(timeout); reject(error); });
    child.once("close", (code) => {
      clearTimeout(timeout);
      const value = Buffer.concat(chunks).toString("utf8");
      if (code !== 0) return reject(new Error(Buffer.concat(errors).toString("utf8").trim() || `exit ${code}`));
      resolve(value);
    });
  });
  const splitAt = output.indexOf("\r\n\r\n");
  if (splitAt < 0) throw new Error("invalid HTTP response");
  const headers = output.slice(0, splitAt);
  const status = Number(headers.match(/^HTTP\/\d(?:\.\d)?\s+(\d{3})/i)?.[1]);
  const location = headers.match(/^location:\s*(.+)$/im)?.[1]?.trim();
  if ([301, 302, 303, 307, 308].includes(status) && location) return gnutlsFetchHtml(new URL(location, url).toString(), redirects + 1);
  if (status < 200 || status >= 300) throw new Error(`HTTP ${status || "unknown"}`);
  return output.slice(splitAt + 4);
}

export function renderWelfareMarkdown(records: WelfareOpportunityRecord[], generatedAt = new Date().toISOString()): string {
  const current = records.filter((item) => item.lifecycleStatus === "current");
  const historical = records.length - current.length;
  const lines = ["# 企业福利商机雷达日报", "", `生成时间：${generatedAt}`, "", `当前有效商机：${current.length} 条`, `历史商机：${historical} 条`, "", "## 来源统计", ""];
  for (const source of WELFARE_SOURCES.filter((item) => item.enabled)) lines.push(`- ${source.code}｜${source.name}：${records.filter((item) => item.sourceCode === source.code).length} 条`);
  lines.push("");
  if (!current.length) lines.push("本轮无新增合格机会。", "");
  for (const item of current) {
    lines.push(`## ${item.title}`, "", `- 采购/发布单位：${item.buyer}`, `- 地区：${item.region}`, `- 联系人：${item.contactName}`, `- 联系电话：${item.contactPhone}`, `- 联系地址：${item.contactAddress}`, `- 预算：${item.budgetDisplay}`, `- 截止：${item.deadlineDisplay}`, `- 官方原文：${item.officialUrl}`, `- 下一步：${item.nextAction}`, "");
  }
  return lines.join("\n");
}
