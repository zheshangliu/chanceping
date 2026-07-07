export type AiEventSourceTrustTier = "official_first" | "platform_index" | "aggregation_lead" | "watch_signal";
export type AiEventSourceType =
  | "hackathon_platform"
  | "competition_platform"
  | "cloud_provider"
  | "developer_community"
  | "academic_conference"
  | "creator_platform";

export type AiEventMode = "online" | "offline" | "hybrid" | "unknown";
export type AiEventParticipantType =
  | "individual"
  | "team"
  | "startup"
  | "student"
  | "researcher"
  | "creator"
  | "company"
  | "unknown";
export type AiEventRewardType =
  | "cash_prize"
  | "cloud_credits"
  | "showcase"
  | "incubation"
  | "certificate"
  | "publication"
  | "community"
  | "other";
export type AiEventOrganizerType =
  | "hackathon_platform"
  | "competition_platform"
  | "cloud_provider"
  | "academic_conference"
  | "creator_platform"
  | "developer_community"
  | "university"
  | "government"
  | "company"
  | "unknown";
export type AiEventImageStatus = "source_image" | "source_logo" | "platform_placeholder" | "default_placeholder";

export type AiEventCategoryId =
  | "ai_agent"
  | "vibe_coding"
  | "ai_app"
  | "aigc_creator"
  | "ai_game"
  | "data_science"
  | "robotics_edge"
  | "cloud_startup"
  | "ai_hackathon";

export interface AiEventCategory {
  id: AiEventCategoryId;
  label: string;
  labelEn: string;
}

export interface AiEventCategoryFacet extends AiEventCategory {
  count: number;
}

export interface PublicAiEventSource {
  id: string;
  name: string;
  domain: string;
  url: string;
  sourceType: AiEventSourceType;
  trustTier: AiEventSourceTrustTier;
  role: string;
  reviewNote: string;
}

export interface PublicAiEventCandidate {
  id: string;
  title: string;
  platform: string;
  sourceName: string;
  sourceDomain: string;
  sourceType: AiEventSourceType;
  statusLabel: string;
  tags: string[];
  deadline: string;
  reward: string;
  coverImageUrl?: string;
  imageSourceUrl?: string;
  imageAlt?: string;
  imageStatus?: AiEventImageStatus;
  imageAttribution?: string;
  prize?: string;
  benefits?: string[];
  organizer?: string;
  registrationUrl?: string;
  region?: string;
  language?: string;
  eventType?: string;
  audience?: string;
  eventMode?: AiEventMode;
  eventModeLabel?: string;
  participantTypes?: AiEventParticipantType[];
  participantTypeLabel?: string;
  rewardTypes?: AiEventRewardType[];
  rewardTypeLabel?: string;
  organizerType?: AiEventOrganizerType;
  organizerTypeLabel?: string;
  knownFields?: string[];
  missingFields?: string[];
  fieldCompleteness?: number;
  reason: string;
  officialUrl: string;
  evidenceStatus:
    | "verified"
    | "partially_verified"
    | "needs_review"
    | "search_discovered"
    | "official_entry_to_review"
    | "watch_signal"
    | "historical_reference"
    | "unverified"
    | "not_found"
    | "failed";
  candidateType:
    | "direct_opportunity"
    | "business_lead"
    | "channel_partner_lead"
    | "customer_lead"
    | "association_directory"
    | "source_entry"
    | "watch_signal"
    | "reference_case"
    | "rejected";
  displayable: boolean;
  lastCheckedAt: string;
  priority: number;
  lifecycleStatus?: "current" | "historical";
  deadlineSortKey?: string;
  deadlineDisplay?: string;
  publicSource?: "database" | "sample_room_seed";
  primaryCategory?: AiEventCategory;
  categoryTags?: AiEventCategory[];
}

export interface PublicAiEventSampleRoomData {
  items: PublicAiEventCandidate[];
  sourceNetwork: PublicAiEventSource[];
  stats: {
    candidateCount: number;
    displayableCount: number;
    sourceCount: number;
    officialEntryCount: number;
    needsReviewCount: number;
    databaseCount?: number;
    seedCount?: number;
    totalCount?: number;
    currentCount?: number;
    historicalCount?: number;
    filteredCount?: number;
    page?: number;
    pageSize?: number;
    totalPages?: number;
    categoryFacets?: AiEventCategoryFacet[];
    imageCoverageCount?: number;
    officialSourceCount?: number;
    aggregatorSourceCount?: number;
    lastCheckedAt: string;
  };
}

const LAST_CHECKED_AT = "2026-07-05";
const DEFAULT_AI_EVENT_COVER_IMAGE_URL = "/assets/ai-event-placeholder.svg";

export const AI_EVENT_SOURCE_NETWORK: PublicAiEventSource[] = [
  {
    id: "devpost",
    name: "Devpost",
    domain: "devpost.com",
    url: "https://devpost.com/hackathons",
    sourceType: "hackathon_platform",
    trustTier: "platform_index",
    role: "全球 Hackathon 和开发者挑战赛入口，适合查 AI / ML / agent 相关赛事。",
    reviewNote: "平台索引页只能证明有赛事入口，具体报名状态仍需打开单项赛事页复核。",
  },
  {
    id: "qwen-cloud-devpost",
    name: "Qwen Cloud Hackathon",
    domain: "qwencloud-hackathon.devpost.com",
    url: "https://qwencloud-hackathon.devpost.com/",
    sourceType: "hackathon_platform",
    trustTier: "official_first",
    role: "Qwen Cloud 相关 AI Hackathon 官方赛事页线索。",
    reviewNote: "优先读取具体赛事页，截止时间、提交要求和奖项以页面为准。",
  },
  {
    id: "dorahacks",
    name: "DoraHacks",
    domain: "dorahacks.io",
    url: "https://dorahacks.io/hackathon",
    sourceType: "hackathon_platform",
    trustTier: "platform_index",
    role: "开发者 Hackathon、BUIDL、Grant 和生态挑战赛入口。",
    reviewNote: "需区分线上活动、Grant、历史活动和当前可报名赛事。",
  },
  {
    id: "lablab",
    name: "Lablab.ai",
    domain: "lablab.ai",
    url: "https://lablab.ai/event",
    sourceType: "hackathon_platform",
    trustTier: "platform_index",
    role: "AI Agent、AIGC、LLM 应用 Hackathon 和学习型赛事入口。",
    reviewNote: "需打开具体 event 页面确认提交方式和参赛资格。",
  },
  {
    id: "kaggle",
    name: "Kaggle Competitions",
    domain: "kaggle.com",
    url: "https://www.kaggle.com/competitions",
    sourceType: "competition_platform",
    trustTier: "platform_index",
    role: "算法、数据科学、机器学习竞赛入口。",
    reviewNote: "适合算法竞赛雷达，但对 OPC 产品展示类机会需降权。",
  },
  {
    id: "aicrowd",
    name: "AIcrowd",
    domain: "aicrowd.com",
    url: "https://www.aicrowd.com/challenges",
    sourceType: "competition_platform",
    trustTier: "platform_index",
    role: "AI challenge、研究挑战和 benchmark 竞赛入口。",
    reviewNote: "需确认是否面向个人开发者、团队或研究机构。",
  },
  {
    id: "tianchi",
    name: "阿里云天池",
    domain: "tianchi.aliyun.com",
    url: "https://tianchi.aliyun.com/competition/gameList/activeList",
    sourceType: "competition_platform",
    trustTier: "platform_index",
    role: "国内算法、AI 应用和产业数据竞赛入口。",
    reviewNote: "需复核是否仍开放报名，以及是否有奖金、证书或产业资源。",
  },
  {
    id: "datafountain",
    name: "DataFountain",
    domain: "datafountain.cn",
    url: "https://www.datafountain.cn/competitions",
    sourceType: "competition_platform",
    trustTier: "platform_index",
    role: "国内数据智能、算法挑战和产业赛题入口。",
    reviewNote: "需要打开具体赛题页确认时间、奖励和资格。",
  },
  {
    id: "trae",
    name: "TRAE",
    domain: "trae.ai",
    url: "https://www.trae.ai/",
    sourceType: "developer_community",
    trustTier: "official_first",
    role: "AI IDE、Vibe Coding 和开发者活动相关官方入口。",
    reviewNote: "官方主页或社区页需进一步追溯到具体报名页。",
  },
  {
    id: "google-cloud",
    name: "Google Cloud Developers",
    domain: "cloud.google.com",
    url: "https://cloud.google.com/developers",
    sourceType: "cloud_provider",
    trustTier: "watch_signal",
    role: "云厂商 AI 活动、开发者挑战和创业资源观察源。",
    reviewNote: "云厂商资讯需追溯到具体 challenge、credits 或 startup program 页面。",
  },
  {
    id: "microsoft-startups",
    name: "Microsoft for Startups",
    domain: "microsoft.com",
    url: "https://www.microsoft.com/startups",
    sourceType: "cloud_provider",
    trustTier: "watch_signal",
    role: "AI 创业者资源、云资源和开发者计划观察源。",
    reviewNote: "创业扶持不是比赛本身，报告中应与赛事分层展示。",
  },
  {
    id: "aws-builder-center",
    name: "AWS Builder Center",
    domain: "aws.amazon.com",
    url: "https://aws.amazon.com/developer/",
    sourceType: "cloud_provider",
    trustTier: "watch_signal",
    role: "AWS 开发者活动、AI builder 资源和云厂商挑战观察源。",
    reviewNote: "AWS 开发者页是线索源，必须追溯到具体 challenge、builder program 或报名页后才进入重点机会。",
  },
  {
    id: "azure-ai-foundry",
    name: "Azure AI Foundry",
    domain: "azure.microsoft.com",
    url: "https://azure.microsoft.com/products/ai-foundry/",
    sourceType: "cloud_provider",
    trustTier: "watch_signal",
    role: "Azure AI 工具、开发者计划和云资源活动观察源。",
    reviewNote: "产品页本身不是比赛；只作为发现 Azure AI challenge、startup program 或云资源计划的来源。",
  },
  {
    id: "paddlepaddle-community",
    name: "PaddlePaddle 飞桨社区",
    domain: "paddlepaddle.org.cn",
    url: "https://www.paddlepaddle.org.cn/",
    sourceType: "developer_community",
    trustTier: "watch_signal",
    role: "飞桨生态、中文 AI 开发者活动和国产模型/算法赛事观察源。",
    reviewNote: "社区页需追溯到 AI Studio、赛事页或活动公告，不能把首页当作已确认报名机会。",
  },
  {
    id: "github",
    name: "GitHub",
    domain: "github.com",
    url: "https://github.com/events",
    sourceType: "developer_community",
    trustTier: "watch_signal",
    role: "开发者活动、开源挑战和 Hackathon 观察源。",
    reviewNote: "社区活动需识别是否有报名、提交作品或奖励机制。",
  },
  {
    id: "huggingface",
    name: "Hugging Face",
    domain: "huggingface.co",
    url: "https://huggingface.co/",
    sourceType: "developer_community",
    trustTier: "watch_signal",
    role: "AI 模型、Space、社区挑战和开源活动观察源。",
    reviewNote: "需排除纯模型发布、博客和非赛事资讯。",
  },
  {
    id: "neurips",
    name: "NeurIPS Competition Track",
    domain: "neurips.cc",
    url: "https://neurips.cc/",
    sourceType: "academic_conference",
    trustTier: "official_first",
    role: "学术会议 challenge、benchmark 和 competition track 入口。",
    reviewNote: "可能偏研究，需判断是否适合个人开发者或 OPC 产品展示。",
  },
  {
    id: "cvpr",
    name: "CVPR Challenges",
    domain: "thecvf.com",
    url: "https://cvpr.thecvf.com/",
    sourceType: "academic_conference",
    trustTier: "official_first",
    role: "计算机视觉 challenge 和 workshop challenge 入口。",
    reviewNote: "需确认具体年度、报名状态和提交要求。",
  },
  {
    id: "runway",
    name: "Runway AI Film Festival",
    domain: "runwayml.com",
    url: "https://runwayml.com/ai-film-festival",
    sourceType: "creator_platform",
    trustTier: "official_first",
    role: "AIGC 视频创作赛和 AI 创作者展示机会入口。",
    reviewNote: "偏创作赛，需与算法赛、开发者赛分层展示。",
  },
  {
    id: "reply-ai-film-festival",
    name: "Reply AI Film Festival",
    domain: "reply.com",
    url: "https://www.reply.com/en/artificial-intelligence/reply-ai-film-festival",
    sourceType: "creator_platform",
    trustTier: "official_first",
    role: "AI 短片、AI 视频和创作者作品提交类赛事入口。",
    reviewNote: "需要打开官方赛事页确认当届开放时间、奖项和提交规则。",
  },
  {
    id: "project-odyssey",
    name: "Project Odyssey",
    domain: "projectodyssey.ai",
    url: "https://www.projectodyssey.ai/",
    sourceType: "creator_platform",
    trustTier: "official_first",
    role: "AI 电影、生成式视频和创作者挑战赛入口。",
    reviewNote: "创作赛更新频繁，需确认当前开放的 challenge、奖池和作品提交路径。",
  },
  {
    id: "filmfreeway-ai-film",
    name: "FilmFreeway AI Film Festivals",
    domain: "filmfreeway.com",
    url: "https://filmfreeway.com/festivals",
    sourceType: "creator_platform",
    trustTier: "platform_index",
    role: "电影节和创作赛平台，可用于发现 AI film / AI short film 征集。",
    reviewNote: "FilmFreeway 是平台入口，每个赛事仍需回到单项 festival 页面确认主题、费用和截止时间。",
  },
  {
    id: "hackerearth",
    name: "HackerEarth Hackathons",
    domain: "hackerearth.com",
    url: "https://www.hackerearth.com/challenges/hackathon/",
    sourceType: "hackathon_platform",
    trustTier: "platform_index",
    role: "企业、开发者社区和高校黑客松入口，可作为 AI Hackathon 补充发现源。",
    reviewNote: "平台列表页只作为线索，需进入具体 challenge 页确认主题、报名状态和奖项。",
  },
  {
    id: "mlh",
    name: "Major League Hacking",
    domain: "mlh.io",
    url: "https://www.mlh.com/seasons/2026/events",
    sourceType: "hackathon_platform",
    trustTier: "platform_index",
    role: "全球学生和开发者 Hackathon 赛季入口，适合补充 AI for Social Good、Global Hack Week 等赛事线索。",
    reviewNote: "MLH 赛事季页面是平台索引，需进入具体 hackathon 页面确认是否面向当前用户、是否仍可报名。",
  },
  {
    id: "topcoder",
    name: "Topcoder Challenges",
    domain: "topcoder.com",
    url: "https://www.topcoder.com/challenges",
    sourceType: "competition_platform",
    trustTier: "platform_index",
    role: "算法、开发者和企业挑战赛入口，可补充国际 AI / 数据竞赛线索。",
    reviewNote: "需区分历史挑战、普通开发任务和当前开放报名的比赛。",
  },
  {
    id: "challengerocket",
    name: "ChallengeRocket",
    domain: "challengerocket.com",
    url: "https://challengerocket.com/",
    sourceType: "hackathon_platform",
    trustTier: "platform_index",
    role: "企业开放创新、开发者挑战和线上 Hackathon 入口，可补充 AI 产品、数据和创业竞赛线索。",
    reviewNote: "平台页只作为发现入口，需进入具体 challenge 页面确认报名、奖项和截止时间。",
  },
  {
    id: "hackster",
    name: "Hackster.io Contests",
    domain: "hackster.io",
    url: "https://www.hackster.io/contests",
    sourceType: "developer_community",
    trustTier: "platform_index",
    role: "硬件、边缘 AI、IoT 和开发者作品挑战入口，可补充 AI 项目展示型比赛。",
    reviewNote: "需确认具体 contest 是否开放提交、是否 AI 相关，以及硬件/地区限制。",
  },
  {
    id: "replit",
    name: "Replit",
    domain: "replit.com",
    url: "https://replit.com/",
    sourceType: "developer_community",
    trustTier: "watch_signal",
    role: "AI 编程、应用构建和开发者活动观察源，可发现 Replit 生态 Hackathon 或挑战赛线索。",
    reviewNote: "Replit 首页不是赛事事实源，必须追溯到官方 challenge、活动页或报名页。",
  },
  {
    id: "tapnow",
    name: "TapNow Creative Challenges",
    domain: "tapnow.com",
    url: "https://app.tapnow.ai/home/challenge",
    sourceType: "creator_platform",
    trustTier: "platform_index",
    role: "Agentic creative canvas 与 AI 视频/创作挑战入口，可补充 AIGC 作品提交类机会。",
    reviewNote: "需打开具体 event 页确认投稿窗口、工具要求、奖池和是否适合 OPC 创作者。",
  },
  {
    id: "pika",
    name: "Pika AI Creative Source",
    domain: "pika.art",
    url: "https://pika.art/",
    sourceType: "creator_platform",
    trustTier: "watch_signal",
    role: "AI 视频创作者生态观察源，用于发现 Pika 相关挑战、趋势和作品提交线索。",
    reviewNote: "Pika 首页本身不是赛事页，必须追溯官方 challenge 或活动页后才进入重点机会。",
  },
  {
    id: "kling",
    name: "Kling AI Activity Zone",
    domain: "klingai.com",
    url: "https://kling.ai/app/activity-zone",
    sourceType: "creator_platform",
    trustTier: "platform_index",
    role: "Kling AI 视频和图像创作挑战活动区，可补充 AIGC 赛事、现金奖励和 credits 机会。",
    reviewNote: "活动区需逐项打开具体 challenge，确认奖池、作品要求、地区限制和截止时间。",
  },
  {
    id: "vidu",
    name: "Vidu AI Creative Challenge",
    domain: "vidu.com",
    url: "https://www.vidu.com/activity/3290204942410389",
    sourceType: "creator_platform",
    trustTier: "official_first",
    role: "Vidu AI 视频创作挑战官方活动页，可补充 AI storytelling 和 AIGC 作品提交机会。",
    reviewNote: "优先读取活动页正文，确认投稿要求、奖项、地区和时间窗口。",
  },
  {
    id: "pixverse",
    name: "PixVerse AI Creative Source",
    domain: "pixverse.ai",
    url: "https://app.pixverse.ai/",
    sourceType: "creator_platform",
    trustTier: "watch_signal",
    role: "AI 视频创作平台观察源，用于后续发现 PixVerse 官方挑战或品牌创作赛。",
    reviewNote: "平台首页不等于赛事页，需要追溯具体 challenge、campaign 或活动规则。",
  },
  {
    id: "dreamina",
    name: "即梦 / Dreamina AI 创作活动",
    domain: "dreamina.jianying.com",
    url: "https://jimeng.jianying.com/ai-tool/activity-detail/2026-289-dreamina-weekly-challenge",
    sourceType: "creator_platform",
    trustTier: "official_first",
    role: "即梦 / Dreamina AI 创作、短片和自媒体挑战入口，可补充中文 AIGC 赛事机会。",
    reviewNote: "需确认活动页是否仍在征集、投稿入口、奖项和作品发布要求。",
  },
  {
    id: "volcengine",
    name: "火山引擎 AI 创造者大赛",
    domain: "volcengine.com",
    url: "https://www.volcengine.com/event/ai-competition",
    sourceType: "cloud_provider",
    trustTier: "official_first",
    role: "云厂商 AI 智能体和 Coze / 豆包生态赛事入口，适合补充中文 AI 应用赛。",
    reviewNote: "需确认当前活动是否仍开放，不能把已结束活动包装成当前报名机会。",
  },
  {
    id: "tencent-cloud",
    name: "腾讯云开发者竞赛",
    domain: "cloud.tencent.com",
    url: "https://cloud.tencent.com/developer/competition",
    sourceType: "cloud_provider",
    trustTier: "platform_index",
    role: "腾讯云开发者社区竞赛和算法赛入口，可补充中文云厂商 AI / 数据挑战线索。",
    reviewNote: "列表包含大量历史赛事，必须区分当前有效和历史机会。",
  },
  {
    id: "analytics-vidhya-datahack",
    name: "Analytics Vidhya DataHack",
    domain: "analyticsvidhya.com",
    url: "https://datahack.analyticsvidhya.com/contest/all/",
    sourceType: "competition_platform",
    trustTier: "platform_index",
    role: "数据科学、机器学习和 AI 挑战赛入口。",
    reviewNote: "需要打开具体 contest 页确认截止时间、奖项和参赛资格。",
  },
  {
    id: "drivendata",
    name: "DrivenData Competitions",
    domain: "drivendata.org",
    url: "https://www.drivendata.org/competitions/",
    sourceType: "competition_platform",
    trustTier: "platform_index",
    role: "公益、数据科学和 AI 竞赛入口，适合补齐国际数据智能挑战。",
    reviewNote: "需进入具体赛题页确认是否仍开放、是否 AI 相关、奖金和参赛资格。",
  },
  {
    id: "zindi",
    name: "Zindi Competitions",
    domain: "zindi.africa",
    url: "https://zindi.africa/competitions",
    sourceType: "competition_platform",
    trustTier: "platform_index",
    role: "国际数据科学和 AI 竞赛平台，适合补充非欧美地区挑战赛。",
    reviewNote: "需确认地域限制、报名状态、奖金和团队要求。",
  },
  {
    id: "codabench",
    name: "Codabench / CodaLab Competitions",
    domain: "codabench.org",
    url: "https://www.codabench.org/competitions/",
    sourceType: "competition_platform",
    trustTier: "platform_index",
    role: "学术 benchmark、算法挑战和会议竞赛托管入口。",
    reviewNote: "需区分当前开放竞赛、历史 benchmark 和仅评测榜单。",
  },
  {
    id: "evalai",
    name: "EvalAI Challenges",
    domain: "eval.ai",
    url: "https://eval.ai/web/challenges/challenge-page",
    sourceType: "competition_platform",
    trustTier: "platform_index",
    role: "AI benchmark、研究挑战和模型评测赛事入口。",
    reviewNote: "需确认 challenge 是否仍接受提交以及是否适合个人开发者。",
  },
  {
    id: "grand-challenge",
    name: "Grand Challenge",
    domain: "grand-challenge.org",
    url: "https://grand-challenge.org/challenges/",
    sourceType: "competition_platform",
    trustTier: "platform_index",
    role: "医学影像、AI 诊断和科研挑战入口。",
    reviewNote: "通常偏科研/医学场景，需明确资格、数据使用和提交要求。",
  },
  {
    id: "heywhale-competition",
    name: "和鲸社区比赛",
    domain: "heywhale.com",
    url: "https://www.heywhale.com/home/competition",
    sourceType: "competition_platform",
    trustTier: "platform_index",
    role: "中文数据科学、AI 算法和产业竞赛入口。",
    reviewNote: "需打开具体比赛页确认是否仍可报名、是否有奖金和参赛资料要求。",
  },
  {
    id: "baidu-aistudio",
    name: "百度飞桨 AI Studio",
    domain: "aistudio.baidu.com",
    url: "https://aistudio.baidu.com/competition",
    sourceType: "competition_platform",
    trustTier: "platform_index",
    role: "中文 AI、飞桨和产业算法竞赛入口。",
    reviewNote: "需排除课程/练习项目，打开具体竞赛页确认报名和奖励。",
  },
  {
    id: "huaweicloud-competition",
    name: "华为云开发者赛事",
    domain: "developer.huaweicloud.com",
    url: "https://developer.huaweicloud.com/competition",
    sourceType: "cloud_provider",
    trustTier: "platform_index",
    role: "云厂商开发者挑战、AI 应用赛和产业赛事入口。",
    reviewNote: "需追溯具体活动页确认报名入口、云资源和截止时间。",
  },
  {
    id: "iflytek-ai-competition",
    name: "科大讯飞 A.I.开发者大赛",
    domain: "xfyun.cn",
    url: "https://challenge.xfyun.cn/",
    sourceType: "competition_platform",
    trustTier: "platform_index",
    role: "中文 AI 开发者大赛和产业赛题入口。",
    reviewNote: "需进入具体赛题页确认赛程、奖金和提交材料。",
  },
  {
    id: "competehub",
    name: "CompeteHub / AI赛事通",
    domain: "competehub.dev",
    url: "https://www.competehub.dev/zh",
    sourceType: "competition_platform",
    trustTier: "aggregation_lead",
    role: "聚合/线索源，用于扩大召回、发现漏网 AI 竞赛和对标覆盖率。",
    reviewNote: "不能作为事实来源，必须 canonicalize 到官方报名页或主办方页面。",
  },
  {
    id: "ml-contests",
    name: "ML Contests",
    domain: "mlcontests.com",
    url: "https://mlcontests.com/",
    sourceType: "competition_platform",
    trustTier: "aggregation_lead",
    role: "机器学习竞赛聚合源，用于查漏补缺和历史线索对照。",
    reviewNote: "聚合字段只作为线索，每条赛事需回官方页核验。",
  },
  {
    id: "papers-with-code",
    name: "Papers with Code Competitions",
    domain: "paperswithcode.com",
    url: "https://paperswithcode.com/",
    sourceType: "developer_community",
    trustTier: "aggregation_lead",
    role: "研究任务、benchmark 和 competition 线索源。",
    reviewNote: "通常不等于报名页，需要回到会议、主办方或 challenge 平台。",
  },
  {
    id: "github-ai-contest-lists",
    name: "GitHub AI contest lists / awesome-ai-competitions",
    domain: "github.com",
    url: "https://github.com/topics/ai-competition",
    sourceType: "developer_community",
    trustTier: "aggregation_lead",
    role: "GitHub 主题和 awesome 列表线索源，用于发现 AI competition / hackathon 清单。",
    reviewNote: "只能作为召回线索，必须回到赛事官方页或平台页核验。",
  },
  {
    id: "modelscope-events",
    name: "ModelScope 魔搭活动",
    domain: "modelscope.cn",
    url: "https://www.modelscope.cn/events",
    sourceType: "developer_community",
    trustTier: "platform_index",
    role: "中文 AI 模型、应用和开发者活动入口，适合补充模型生态赛事线索。",
    reviewNote: "需确认是否是比赛、活动、课程或社区征集，不能把资讯当机会。",
  },
  {
    id: "opendatalab-competitions",
    name: "OpenDataLab Competitions",
    domain: "opendatalab.com",
    url: "https://opendatalab.com/competitions",
    sourceType: "competition_platform",
    trustTier: "platform_index",
    role: "数据集、模型挑战和算法竞赛入口，适合补充中文/英文数据赛线索。",
    reviewNote: "需进入具体赛事页确认开放状态、奖项和数据使用规则。",
  },
  {
    id: "coggle-competition",
    name: "Coggle 数据科学竞赛",
    domain: "coggle.club",
    url: "https://coggle.club/competition",
    sourceType: "competition_platform",
    trustTier: "aggregation_lead",
    role: "中文数据科学竞赛和学习赛线索源。",
    reviewNote: "聚合和学习赛线索需回官方赛事页或平台页确认。",
  },
  {
    id: "datawhale-baseline",
    name: "Datawhale competition baseline",
    domain: "github.com",
    url: "https://github.com/datawhalechina/competition-baseline",
    sourceType: "developer_community",
    trustTier: "aggregation_lead",
    role: "中文竞赛 baseline 和赛题线索源，用于查漏数据科学/AI 比赛。",
    reviewNote: "GitHub baseline 不能作为报名事实，必须回赛题官方入口。",
  },
  {
    id: "arenix",
    name: "Arenix",
    domain: "arenix.cc",
    url: "https://arenix.cc/#about",
    sourceType: "competition_platform",
    trustTier: "aggregation_lead",
    role: "AI 赛事导航参考源，用于对标公开导航体验和查漏补缺。",
    reviewNote: "作为参考与 benchmark，不直接作为最终事实来源。",
  },
  {
    id: "taikai",
    name: "TAIKAI Hackathons",
    domain: "taikai.network",
    url: "https://taikai.network/hackathons",
    sourceType: "hackathon_platform",
    trustTier: "platform_index",
    role: "欧洲和全球线上 Hackathon 平台，用于补充 AI builder、创业项目和开源挑战。",
    reviewNote: "平台页只作为入口，需进入具体 hackathon 页确认开放状态、奖金和提交要求。",
  },
  {
    id: "devfolio",
    name: "Devfolio Hackathons",
    domain: "devfolio.co",
    url: "https://devfolio.co/hackathons",
    sourceType: "hackathon_platform",
    trustTier: "platform_index",
    role: "亚太和印度开发者 Hackathon 平台，用于补充 AI 应用、小团队作品提交和 sponsor challenge。",
    reviewNote: "平台入口需追溯到单项赛事页，不能把历史或社区页当作当前机会。",
  },
  {
    id: "challenge-gov",
    name: "Challenge.gov",
    domain: "challenge.gov",
    url: "https://www.challenge.gov/",
    sourceType: "competition_platform",
    trustTier: "official_first",
    role: "美国政府挑战赛官方入口，用于发现 AI、数据和公共服务创新赛。",
    reviewNote: "政府挑战需逐项确认 eligibility、deadline、prize 和是否适合非美国主体。",
  },
  {
    id: "google-impact-ai",
    name: "Google.org AI Impact Challenge",
    domain: "withgoogle.com",
    url: "https://impactchallenge.withgoogle.com/ai",
    sourceType: "cloud_provider",
    trustTier: "official_first",
    role: "AI for social good、grant、云资源和产品展示类官方线索。",
    reviewNote: "需确认当前申请窗口，不能把历史项目介绍当作仍可报名机会。",
  },
  {
    id: "ai-for-good-innovation-factory",
    name: "AI for Good Innovation Factory",
    domain: "aiforgood.itu.int",
    url: "https://aiforgood.itu.int/innovation-factory/",
    sourceType: "competition_platform",
    trustTier: "official_first",
    role: "AI startup pitch、展示和联合国体系创新活动入口。",
    reviewNote: "需确认地区赛程、报名窗口和 startup 资格。",
  },
];

export const AI_EVENT_SAMPLE_ROOM_CANDIDATES: PublicAiEventCandidate[] = [
  candidate("qwen-cloud-hackathon-devpost", "Qwen Cloud Hackathon：Devpost 官方赛事页", "Qwen Cloud / Devpost", "Qwen Cloud Hackathon", "qwencloud-hackathon.devpost.com", "hackathon_platform", "官方赛事页 - 待复核", ["AI Hackathon", "Qwen", "Devpost", "可提交作品"], "待复核", "奖金、云资源或产品展示以官方页为准", "已命中具体赛事页，适合 OPC / AI 产品创业者优先复核报名入口、提交要求和截止时间。", "https://qwencloud-hackathon.devpost.com/", "official_entry_to_review", "direct_opportunity", 100),
  candidate("trae-official-ai-contest", "TRAE AI 创造力大赛：官方入口线索", "TRAE", "TRAE", "trae.ai", "developer_community", "官方来源 - 待复核", ["AI IDE", "Vibe Coding", "开发者挑战"], "待复核", "奖金或资源以官方页为准", "TRAE 属于 AI IDE / Vibe Coding 强相关来源，需追溯到具体报名或活动页后再确认级别。", "https://www.trae.ai/", "official_entry_to_review", "direct_opportunity", 96),
  candidate("devpost-ai-hackathons", "Devpost AI / Machine Learning Hackathon 入口", "Devpost", "Devpost", "devpost.com", "hackathon_platform", "平台入口 - 待复核", ["AI", "ML", "Hackathon", "海外"], "持续更新", "奖金和赞助随单项赛事变化", "Devpost 是海外黑客松主入口，适合发现 AI Agent、云厂商和产品展示类赛事。", "https://devpost.com/hackathons?search=AI", "search_discovered", "source_entry", 94),
  candidate("dorahacks-ai-hackathons", "DoraHacks AI Hackathon / Grant 入口", "DoraHacks", "DoraHacks", "dorahacks.io", "hackathon_platform", "平台入口 - 待复核", ["Hackathon", "BUIDL", "Grant", "开发者"], "持续更新", "Grant / 奖励随项目变化", "DoraHacks 适合发现生态黑客松和开发者挑战，但需要区分 Grant、历史活动和当前报名。", "https://dorahacks.io/hackathon", "search_discovered", "source_entry", 92),
  candidate("lablab-ai-events", "Lablab.ai AI Hackathon 活动入口", "Lablab.ai", "Lablab.ai", "lablab.ai", "hackathon_platform", "平台入口 - 待复核", ["AI Agent", "LLM", "Hackathon", "团队"], "持续更新", "奖项和权益按活动页复核", "Lablab.ai 经常承载 AI Agent / LLM 应用赛，适合快速发现可提交作品的线上赛事。", "https://lablab.ai/event", "search_discovered", "source_entry", 91),
  candidate("kaggle-competitions", "Kaggle AI / ML Competitions 入口", "Kaggle", "Kaggle Competitions", "kaggle.com", "competition_platform", "平台入口 - 待复核", ["算法赛", "数据科学", "机器学习"], "持续更新", "奖金和排名以赛题页为准", "Kaggle 适合算法和数据科学比赛，对产品展示型 OPC 机会需要单独降权判断。", "https://www.kaggle.com/competitions", "search_discovered", "source_entry", 86),
  candidate("aicrowd-challenges", "AIcrowd AI Challenges 入口", "AIcrowd", "AIcrowd", "aicrowd.com", "competition_platform", "平台入口 - 待复核", ["AI Challenge", "Benchmark", "研究挑战"], "持续更新", "奖励按 challenge 页复核", "AIcrowd 适合查 benchmark 和研究挑战，需确认是否适合个人开发者参赛。", "https://www.aicrowd.com/challenges", "search_discovered", "source_entry", 84),
  candidate("tianchi-active-list", "阿里云天池 AI 竞赛活动列表", "阿里云天池", "阿里云天池", "tianchi.aliyun.com", "competition_platform", "平台入口 - 待复核", ["国内", "算法赛", "产业赛题"], "持续更新", "奖金、证书、云资源按赛题页复核", "国内 AI / 数据竞赛重点来源，适合补齐中文赛事和产业数据赛题。", "https://tianchi.aliyun.com/competition/gameList/activeList", "search_discovered", "source_entry", 82),
  candidate("datafountain-competitions", "DataFountain AI 数据智能竞赛入口", "DataFountain", "DataFountain", "datafountain.cn", "competition_platform", "平台入口 - 待复核", ["国内", "数据智能", "算法挑战"], "持续更新", "奖金和证书按赛题页复核", "适合查国内数据智能和行业算法赛题，需打开具体赛题确认报名状态。", "https://www.datafountain.cn/competitions", "search_discovered", "source_entry", 80),
  candidate("baidu-aistudio-competition", "飞桨 AI Studio 竞赛入口", "百度飞桨 AI Studio", "飞桨 AI Studio", "aistudio.baidu.com", "competition_platform", "平台入口 - 待复核", ["国内", "AI Studio", "算法赛"], "持续更新", "奖励以赛题页为准", "适合查中文 AI 学习赛和产业算法赛，但需排除课程和练习项目。", "https://aistudio.baidu.com/competition", "search_discovered", "source_entry", 78),
  candidate("huawei-cloud-competition", "华为云开发者赛事入口", "华为云开发者", "华为云", "developer.huaweicloud.com", "cloud_provider", "平台入口 - 待复核", ["云资源", "开发者挑战", "国内"], "持续更新", "云资源、奖金或权益以官方页为准", "云厂商开发者赛事适合 OPC 产品展示和云资源获取，但需追溯到具体活动。", "https://developer.huaweicloud.com/competition", "search_discovered", "source_entry", 76),
  candidate("google-cloud-developer-ai", "Google Cloud AI 开发者活动观察源", "Google Cloud", "Google Cloud Developers", "cloud.google.com", "cloud_provider", "观察源 - 待复核", ["云资源", "开发者", "AI"], "持续更新", "云资源或 credits 以官方页为准", "适合观察云厂商 AI challenge 和 startup 资源，非具体报名页时不进入已确认机会。", "https://cloud.google.com/developers", "watch_signal", "watch_signal", 65),
  candidate("microsoft-startups-ai", "Microsoft for Startups AI 资源观察源", "Microsoft", "Microsoft for Startups", "microsoft.com", "cloud_provider", "观察源 - 待复核", ["创业扶持", "云资源", "AI"], "持续更新", "资源和资格以官方页为准", "创业扶持不是比赛本身，适合报告行动层作为资源补充，不应冒充赛事。", "https://www.microsoft.com/startups", "watch_signal", "watch_signal", 60),
  candidate("github-events-ai", "GitHub 开发者活动和 Hackathon 观察源", "GitHub", "GitHub", "github.com", "developer_community", "观察源 - 待复核", ["开发者", "开源", "Hackathon"], "持续更新", "奖励和提交方式待复核", "GitHub 活动适合发现开发者挑战和开源竞赛，需要排除普通 meetup 和 repo。", "https://github.com/events", "watch_signal", "watch_signal", 58),
  candidate("huggingface-community-challenges", "Hugging Face 社区挑战观察源", "Hugging Face", "Hugging Face", "huggingface.co", "developer_community", "观察源 - 待复核", ["模型", "Space", "开源挑战"], "持续更新", "奖励和资格待复核", "适合 AI 模型和 Space 挑战观察，但需排除纯模型发布和博客。", "https://huggingface.co/", "watch_signal", "watch_signal", 56),
  candidate("runway-ai-film-festival", "Runway AI Film Festival 创作赛入口", "Runway", "Runway", "runwayml.com", "creator_platform", "创作赛入口 - 待复核", ["AIGC", "视频创作", "作品提交"], "待复核", "奖项和展示机会以官方页为准", "适合 AI 创作方向 OPC，但与开发者 Hackathon 需分层展示。", "https://runwayml.com/ai-film-festival", "official_entry_to_review", "direct_opportunity", 74),
  candidate("reply-ai-film-festival", "Reply AI Film Festival 官方赛事入口", "Reply", "Reply AI Film Festival", "reply.com", "creator_platform", "创作赛入口 - 待确认", ["AIGC", "AI Film", "短片", "作品提交"], "见官网", "奖金、展映和曝光以官方页为准", "适合 AI 视频、AI 短片和自媒体创作者关注，需确认当前届提交窗口和作品格式。", "https://www.reply.com/en/artificial-intelligence/reply-ai-film-festival", "official_entry_to_review", "direct_opportunity", 73),
  candidate("project-odyssey-ai-film-challenge", "Project Odyssey AI Film / Chroma Awards 入口", "Project Odyssey", "Project Odyssey", "projectodyssey.ai", "creator_platform", "创作赛入口 - 待确认", ["AIGC", "AI Film", "生成式视频", "创作赛"], "见官网", "奖池、展映和创作者资源以官方页为准", "适合生成式视频、AI 电影和创作者作品提交方向，需要打开官方页确认当期 challenge。", "https://www.projectodyssey.ai/", "official_entry_to_review", "direct_opportunity", 72),
  candidate("filmfreeway-ai-film-discovery", "FilmFreeway AI Film / AI Short Film 征集入口", "FilmFreeway", "FilmFreeway", "filmfreeway.com", "creator_platform", "平台入口 - 待确认", ["AI Film", "电影节", "作品提交", "创作赛"], "持续更新", "奖项、费用和截止时间随单项赛事变化", "适合发现 AI 影像、短片和创作赛，但必须进入单项 festival 页面确认费用、资格和截止时间。", "https://filmfreeway.com/festivals", "search_discovered", "source_entry", 70),
  candidate("neurips-competition-track", "NeurIPS Competition Track 官方入口", "NeurIPS", "NeurIPS", "neurips.cc", "academic_conference", "会议竞赛入口 - 待复核", ["学术挑战", "Benchmark", "研究赛"], "按年度更新", "奖励或论文权益以官方页为准", "偏研究型挑战，适合算法团队，但对产品展示型 AI 创业者要标注适配风险。", "https://neurips.cc/", "historical_reference", "reference_case", 52),
  candidate("cvpr-challenges", "CVPR Challenges 官方入口", "CVPR", "CVF", "thecvf.com", "academic_conference", "会议挑战入口 - 待复核", ["计算机视觉", "Challenge", "Workshop"], "按年度更新", "权益以官方页为准", "适合视觉算法赛线索，需确认年度和是否仍在报名。", "https://cvpr.thecvf.com/", "historical_reference", "reference_case", 50),
  candidate("kdd-cup", "KDD Cup 官方入口", "KDD", "KDD", "kdd.org", "academic_conference", "会议竞赛入口 - 待复核", ["数据挖掘", "算法赛", "学术"], "按年度更新", "奖励或排名以官方页为准", "适合算法竞赛雷达，但不一定适合 AI 产品展示型需求。", "https://www.kdd.org/kdd-cup", "historical_reference", "reference_case", 49),
  candidate("iclr-challenge-watch", "ICLR / 机器学习会议 Challenge 观察源", "ICLR", "ICLR", "iclr.cc", "academic_conference", "观察源 - 待复核", ["ML", "Challenge", "研究"], "按年度更新", "待复核", "用于观察学术 challenge，不应直接当作可报名产品赛事。", "https://iclr.cc/", "historical_reference", "reference_case", 42),
  candidate("aws-build-on-ai-watch", "AWS AI 开发者挑战观察源", "AWS", "AWS", "aws.amazon.com", "cloud_provider", "观察源 - 待复核", ["云资源", "开发者挑战", "AI"], "持续更新", "credits 或奖励待复核", "AWS 可作为云厂商活动观察源，需追溯到具体 challenge 或 builder program。", "https://aws.amazon.com/events/", "watch_signal", "watch_signal", 54),
  candidate("azure-ai-challenge-watch", "Azure AI Challenge / 开发者计划观察源", "Azure", "Microsoft Azure", "azure.microsoft.com", "cloud_provider", "观察源 - 待复核", ["Azure", "AI", "开发者"], "持续更新", "待复核", "适合监控 Azure AI challenge 和云资源计划，不应替代具体报名页。", "https://azure.microsoft.com/", "watch_signal", "watch_signal", 53),
  candidate("product-hunt-ai-launch", "Product Hunt AI 产品发布观察源", "Product Hunt", "Product Hunt", "producthunt.com", "developer_community", "观察源 - 待复核", ["产品展示", "AI Launch", "曝光"], "持续更新", "无固定奖金", "可作为产品曝光和竞品观察，不是赛事机会，应在报告中单独降级。", "https://www.producthunt.com/topics/artificial-intelligence", "watch_signal", "watch_signal", 40),
  candidate("ai-grant-watch", "AI Grant / 创业扶持观察源", "AI Grant", "AI Grant", "aigrant.com", "developer_community", "观察源 - 待复核", ["创业扶持", "Grant", "AI"], "待复核", "资金支持以官方页为准", "AI Grant 更偏创业资助，适合作为资源线索，不应冒充 Hackathon。", "https://aigrant.com/", "watch_signal", "watch_signal", 39),
  candidate("papers-with-code-competition-watch", "Papers with Code 竞赛和 benchmark 观察源", "Papers with Code", "Papers with Code", "paperswithcode.com", "developer_community", "观察源 - 待复核", ["Benchmark", "算法", "研究"], "持续更新", "待复核", "适合作为研究挑战发现源，但通常不是直接报名页。", "https://paperswithcode.com/", "watch_signal", "watch_signal", 38),
  candidate("mlcontests-watch", "ML Contests 聚合观察源", "ML Contests", "ML Contests", "mlcontests.com", "competition_platform", "聚合观察源 - 待复核", ["算法赛", "聚合", "ML"], "持续更新", "待复核", "聚合源只能帮助发现候选，正式卡必须追溯官方页面。", "https://mlcontests.com/", "search_discovered", "watch_signal", 36),
  candidate("codabench-ai-competitions", "Codabench AI / Benchmark Competitions 入口", "Codabench", "Codabench", "codabench.org", "competition_platform", "平台入口 - 待确认", ["Benchmark", "AI Challenge", "学术竞赛", "提交作品"], "持续更新", "奖项、排名和提交要求按具体 competition 页复核", "适合发现学术 benchmark、会议挑战和模型评测赛；需区分当前开放竞赛和历史榜单。", "https://www.codabench.org/competitions/", "search_discovered", "source_entry", 48),
  candidate("evalai-ai-challenges", "EvalAI AI Challenge / Benchmark 入口", "EvalAI", "EvalAI", "eval.ai", "competition_platform", "平台入口 - 待确认", ["AI Challenge", "Benchmark", "模型评测", "研究赛"], "持续更新", "奖励和提交窗口以 challenge 页为准", "适合发现 AI benchmark 和研究挑战，优先读取具体 challenge 页面确认是否仍接受提交。", "https://eval.ai/web/challenges/challenge-page", "search_discovered", "source_entry", 47),
  candidate("grand-challenge-medical-ai", "Grand Challenge 医学 AI 挑战入口", "Grand Challenge", "Grand Challenge", "grand-challenge.org", "competition_platform", "平台入口 - 待确认", ["医学 AI", "影像挑战", "Benchmark", "研究赛"], "持续更新", "奖项、资格和数据规则以具体 challenge 页为准", "适合补充医疗影像和 AI 诊断挑战；需要明确参赛资格和数据使用限制。", "https://grand-challenge.org/challenges/", "search_discovered", "source_entry", 46),
  candidate("iflytek-ai-developer-challenge", "科大讯飞 A.I.开发者大赛入口", "科大讯飞", "科大讯飞", "xfyun.cn", "competition_platform", "官方平台入口 - 待确认", ["中文", "AI 开发者", "产业赛题", "算法赛"], "持续更新", "奖金、证书和赛程以赛题页为准", "国内 AI 开发者赛事重点来源，适合补充中文 AI 应用和产业赛题。", "https://challenge.xfyun.cn/", "search_discovered", "source_entry", 46),
  candidate("modelscope-ai-events", "ModelScope 魔搭 AI 开发者活动入口", "ModelScope", "魔搭社区", "modelscope.cn", "developer_community", "社区入口 - 待确认", ["模型", "开发者", "AI 应用", "中文"], "持续更新", "权益和提交方式以活动页为准", "适合发现中文模型生态挑战、应用征集和开发者活动，但需排除课程与普通资讯。", "https://www.modelscope.cn/events", "search_discovered", "watch_signal", 45),
  candidate("opendatalab-competitions", "OpenDataLab AI / 数据挑战入口", "OpenDataLab", "OpenDataLab", "opendatalab.com", "competition_platform", "平台入口 - 待确认", ["数据集", "模型挑战", "算法赛", "AI"], "持续更新", "奖金、数据规则和资格以具体赛事页为准", "适合补充数据集与模型挑战赛事，需打开具体赛题页确认当前状态。", "https://opendatalab.com/competitions", "search_discovered", "source_entry", 45),
  candidate("coggle-data-science-competition", "Coggle 数据科学竞赛线索", "Coggle", "Coggle", "coggle.club", "competition_platform", "聚合线索 - 待确认", ["数据科学", "中文", "学习赛", "算法赛"], "持续更新", "见具体赛题", "用于补齐中文数据科学比赛线索；正式机会需要回到赛事页确认报名和奖励。", "https://coggle.club/competition", "search_discovered", "watch_signal", 44),
  candidate("datawhale-competition-baseline", "Datawhale competition-baseline 赛题线索", "Datawhale", "Datawhale", "github.com", "developer_community", "聚合线索 - 待确认", ["baseline", "数据科学", "中文", "竞赛线索"], "持续更新", "见官方赛题", "适合作为中文比赛查漏线索，但 GitHub baseline 不能当作报名入口。", "https://github.com/datawhalechina/competition-baseline", "search_discovered", "watch_signal", 44),
  candidate("drivendata-competitions", "DrivenData AI / Data Science Competitions 入口", "DrivenData", "DrivenData", "drivendata.org", "competition_platform", "平台入口 - 待复核", ["数据科学", "公益赛", "算法赛"], "持续更新", "奖金和资格以赛题页为准", "适合数据科学竞赛线索，需确认是否 AI 相关及是否仍开放。", "https://www.drivendata.org/competitions/", "search_discovered", "source_entry", 55),
  candidate("codalab-competitions", "CodaLab Competitions 入口", "CodaLab", "CodaLab", "codalab.org", "competition_platform", "平台入口 - 待复核", ["算法赛", "Benchmark", "学术"], "持续更新", "待复核", "CodaLab 承载大量学术挑战，需区分当前赛事和历史 benchmark。", "https://codalab.lisn.upsaclay.fr/competitions/", "search_discovered", "source_entry", 54),
  candidate("zindi-competitions", "Zindi AI / Data Science Competitions 入口", "Zindi", "Zindi", "zindi.africa", "competition_platform", "平台入口 - 待复核", ["数据科学", "AI", "全球"], "持续更新", "奖金和资格以赛题页为准", "Zindi 适合国际数据科学竞赛补充来源，需复核地域和参赛资格。", "https://zindi.africa/competitions", "search_discovered", "source_entry", 53),
  candidate("hackerearth-hackathons", "HackerEarth Hackathons AI 赛事发现入口", "HackerEarth", "HackerEarth", "hackerearth.com", "hackathon_platform", "平台入口 - 待复核", ["Hackathon", "开发者", "AI"], "持续更新", "奖金和提交要求按赛事页复核", "HackerEarth 适合作为国际黑客松补充来源，需进入具体 challenge 页确认是否 AI 相关和是否仍开放。", "https://www.hackerearth.com/challenges/hackathon/", "search_discovered", "source_entry", 52),
  candidate("topcoder-ai-challenges", "Topcoder Challenges AI / Data Challenge 入口", "Topcoder", "Topcoder", "topcoder.com", "competition_platform", "平台入口 - 待复核", ["算法挑战", "开发者挑战", "全球"], "持续更新", "奖励按 challenge 页复核", "Topcoder 可发现开发者和算法挑战赛，但需排除普通任务和历史 challenge。", "https://www.topcoder.com/challenges", "search_discovered", "source_entry", 51),
  candidate("challengerocket-ai-hackathons", "ChallengeRocket AI / Developer Challenge 入口", "ChallengeRocket", "ChallengeRocket", "challengerocket.com", "hackathon_platform", "平台入口 - 待复核", ["Hackathon", "开发者挑战", "AI", "全球"], "持续更新", "奖金和提交要求按 challenge 页复核", "ChallengeRocket 可作为企业开放创新和 AI 开发者挑战补充来源，需进入具体 challenge 页确认当前开放状态。", "https://challengerocket.com/", "search_discovered", "source_entry", 50),
  candidate("hackster-ai-contests", "Hackster.io AI / Edge AI Contests 入口", "Hackster.io", "Hackster.io Contests", "hackster.io", "developer_community", "平台入口 - 待复核", ["Edge AI", "IoT", "硬件", "作品提交"], "持续更新", "奖品、硬件套件或展示权益以具体 contest 页为准", "Hackster 适合发现 AI 硬件、边缘 AI 和开发者作品挑战；需确认提交窗口和硬件要求。", "https://www.hackster.io/contests", "search_discovered", "source_entry", 49),
  candidate("replit-ai-challenge-watch", "Replit AI Coding Challenge 观察源", "Replit", "Replit", "replit.com", "developer_community", "观察源 - 待确认", ["AI Coding", "应用构建", "开发者"], "持续更新", "见具体活动", "Replit 可作为 AI 编程挑战和应用构建活动观察源；只有追溯到具体活动页后才进入重点机会。", "https://replit.com/", "watch_signal", "watch_signal", 43),
  candidate("mlh-ai-hackathon-season", "Major League Hacking 2026 Hackathon 赛季入口", "MLH", "Major League Hacking", "mlh.io", "hackathon_platform", "平台入口 - 待确认", ["MLH", "Hackathon", "AI for Social Good", "Global Hack Week"], "持续更新", "奖品、赞助资源和权益以具体赛事页为准", "适合发现全球线上/线下黑客松和 AI 主题周，但需要打开单项赛事确认当前用户是否能报名。", "https://www.mlh.com/seasons/2026/events", "search_discovered", "source_entry", 50),
  candidate("tapnow-parallel-universes", "TapNow 10000 Parallel Universes AI 创作挑战", "TapNow", "TapNow Creative Challenges", "tapnow.com", "creator_platform", "创作赛入口 - 待确认", ["AIGC", "AI Video", "作品提交", "全球"], "见官网", "奖金、credits 和展示权益以活动页为准", "适合 AI 自媒体、AI 视频和创作型 OPC，需确认作品格式、工具限制、截止时间和地区规则。", "https://app.tapnow.ai/event/26", "official_entry_to_review", "direct_opportunity", 69),
  candidate("kling-ai-activity-zone", "Kling AI Activity Zone 创作挑战入口", "Kling AI", "Kling AI Activity Zone", "klingai.com", "creator_platform", "活动区入口 - 待确认", ["AI Video", "AIGC", "Cash Prize", "Credits"], "持续更新", "现金奖励、credits 和权益以具体 challenge 页为准", "Kling 活动区适合持续发现 AI 视频挑战和创作赛，需逐项确认投稿入口和截止时间。", "https://kling.ai/app/activity-zone", "search_discovered", "source_entry", 68),
  candidate("vidu-q3-global-creative-challenge", "Vidu Q3 Global Creative Challenge 官方活动页", "Vidu", "Vidu AI Creative Challenge", "vidu.com", "creator_platform", "创作赛入口 - 待确认", ["AI Video", "Storytelling", "AIGC", "全球"], "见官网", "奖金、订阅权益和展示机会以官方页为准", "Vidu 适合 AI 短片、AI storytelling 和创作者作品提交方向，需要确认当前活动投稿窗口和参赛资格。", "https://www.vidu.com/activity/3290204942410389", "official_entry_to_review", "direct_opportunity", 67),
  candidate("dreamina-weekly-challenge", "即梦 / Dreamina Weekly Challenge AI 创作活动", "即梦 Dreamina", "即梦 / Dreamina AI 创作活动", "dreamina.jianying.com", "creator_platform", "创作赛入口 - 待确认", ["中文", "AIGC", "短视频", "作品提交"], "见官网", "奖励、曝光和作品要求以官方活动页为准", "适合中文 AI 创作者和自媒体方向，需确认活动是否仍在征集、投稿规则和奖项。", "https://jimeng.jianying.com/ai-tool/activity-detail/2026-289-dreamina-weekly-challenge", "official_entry_to_review", "direct_opportunity", 66),
  candidate("volcengine-ai-creator-competition", "火山引擎 AI 创造者大赛官方入口", "火山引擎", "火山引擎 AI 创造者大赛", "volcengine.com", "cloud_provider", "云厂商赛事入口 - 待确认", ["中文", "AI Agent", "Coze", "开发者挑战"], "见官网", "奖金、云资源或生态权益以官方页为准", "适合中文 AI 应用、智能体和云厂商生态赛，需确认当前届是否仍开放报名。", "https://www.volcengine.com/event/ai-competition", "official_entry_to_review", "direct_opportunity", 65),
  candidate("tencent-cloud-developer-competition", "腾讯云开发者竞赛入口", "腾讯云", "腾讯云开发者竞赛", "cloud.tencent.com", "cloud_provider", "平台入口 - 待确认", ["中文", "云资源", "开发者竞赛", "算法赛"], "持续更新", "奖金、云资源和证书以具体赛事页为准", "腾讯云竞赛入口可补充中文云厂商和产业数据挑战，需要区分当前开放和历史赛事。", "https://cloud.tencent.com/developer/competition", "search_discovered", "source_entry", 64),
  candidate("pika-ai-creative-source", "Pika AI 视频创作挑战观察源", "Pika", "Pika AI Creative Source", "pika.art", "creator_platform", "观察源 - 待确认", ["AI Video", "AIGC", "创作者"], "持续更新", "见具体活动", "Pika 适合发现 AI 视频创作挑战线索；首页不等于赛事，后续必须追溯官方 challenge。", "https://pika.art/", "watch_signal", "watch_signal", 45),
  candidate("pixverse-ai-creative-source", "PixVerse AI 视频创作活动观察源", "PixVerse", "PixVerse AI Creative Source", "pixverse.ai", "creator_platform", "观察源 - 待确认", ["AI Video", "AIGC", "创作者"], "持续更新", "见具体活动", "PixVerse 可作为 AI 视频创作赛查漏源，不能把平台首页当作已确认报名机会。", "https://app.pixverse.ai/", "watch_signal", "watch_signal", 45),
  candidate("analytics-vidhya-datahack", "Analytics Vidhya DataHack AI 竞赛入口", "Analytics Vidhya", "Analytics Vidhya DataHack", "analyticsvidhya.com", "competition_platform", "平台入口 - 待复核", ["数据科学", "机器学习", "AI"], "持续更新", "奖金和资格以 contest 页为准", "DataHack 适合补充英文数据科学和机器学习竞赛，需打开具体 contest 页复核。", "https://datahack.analyticsvidhya.com/contest/all/", "search_discovered", "source_entry", 50),
  candidate("heywhale-ai-competition", "和鲸社区 AI / 数据科学比赛入口", "和鲸社区", "和鲸社区", "heywhale.com", "competition_platform", "平台入口 - 待确认", ["国内", "数据科学", "AI", "算法赛"], "持续更新", "奖金、证书和报名要求以赛题页为准", "适合补充中文数据科学和产业 AI 赛事，需要排除课程、练习项目和历史赛题。", "https://www.heywhale.com/home/competition", "search_discovered", "source_entry", 49),
  candidate("github-awesome-ai-competitions", "GitHub AI competition / awesome 列表线索", "GitHub", "GitHub AI contest lists", "github.com", "developer_community", "聚合线索 - 待确认", ["awesome-ai", "AI competition", "Hackathon", "聚合"], "持续更新", "见官网", "适合查漏补缺，但 GitHub 列表不能作为最终事实源，需回到每个赛事官方入口。", "https://github.com/topics/ai-competition", "search_discovered", "watch_signal", 43),
  candidate("arenix-ai-events-benchmark", "Arenix AI 赛事导航参考源", "Arenix", "Arenix", "arenix.cc", "competition_platform", "聚合参考 - 待确认", ["AI 赛事导航", "聚合", "Benchmark"], "持续更新", "见官网", "用于对标公开导航和发现可能遗漏的赛事，不直接作为确认机会。", "https://arenix.cc/#about", "search_discovered", "watch_signal", 41),
  candidate("global-ai-hackathon-search", "Global AI Hackathon Series 搜索线索", "Search Discovery", "Devpost / DoraHacks / Lablab", "multiple", "hackathon_platform", "搜索发现 - 待复核", ["AI Hackathon", "全球", "报名入口"], "待复核", "待复核", "这是跨平台查询种子，用于触发 Devpost、DoraHacks、Lablab 等具体赛事页，不直接当作已确认机会。", "https://devpost.com/hackathons?search=AI%20hackathon", "search_discovered", "source_entry", 48),
  candidate("ai-agent-hackathon-search", "AI Agent Hackathon 查询种子", "Search Discovery", "Devpost / Lablab", "multiple", "hackathon_platform", "搜索发现 - 待复核", ["AI Agent", "Hackathon", "作品提交"], "待复核", "待复核", "用于发现 AI Agent 专项 Hackathon；需要后续读取具体官方赛事页。", "https://lablab.ai/event?query=AI%20Agent", "search_discovered", "source_entry", 47),
  candidate("cloud-credits-challenge-search", "AI 云资源挑战赛查询种子", "Search Discovery", "Cloud Providers", "multiple", "cloud_provider", "搜索发现 - 待复核", ["云资源", "credits", "developer challenge"], "待复核", "云资源待复核", "用于发现云厂商 challenge、credits 和创业资源，不能直接等同于比赛。", "https://devpost.com/hackathons?search=cloud%20AI", "search_discovered", "watch_signal", 45),
  candidate("aigc-creator-contest-search", "AIGC 创作赛查询种子", "Search Discovery", "Runway / creator platforms", "multiple", "creator_platform", "搜索发现 - 待复核", ["AIGC", "创作赛", "作品展示"], "待复核", "待复核", "用于发现 AI 视频、图像和内容创作赛，需与开发者 Hackathon 分层。", "https://runwayml.com/ai-film-festival", "search_discovered", "watch_signal", 44),
  candidate("taikai-ai-hackathons", "TAIKAI AI / Startup Hackathon 入口", "TAIKAI", "TAIKAI Hackathons", "taikai.network", "hackathon_platform", "平台入口 - 待确认", ["AI Hackathon", "Startup", "全球线上", "欧洲", "开发者"], "持续更新", "奖金、导师、赞助资源和提交要求以具体 hackathon 页为准", "TAIKAI 可补充欧洲和全球线上开发者 Hackathon 线索，适合查找 AI builder、创业项目和开源挑战。", "https://taikai.network/hackathons", "search_discovered", "source_entry", 52),
  candidate("devfolio-ai-hackathons", "Devfolio AI / APAC Hackathon 入口", "Devfolio", "Devfolio Hackathons", "devfolio.co", "hackathon_platform", "平台入口 - 待确认", ["AI Hackathon", "亚太", "印度", "开发者"], "持续更新", "奖金、赞助资源和证书以具体赛事页为准", "Devfolio 可补充亚太和印度开发者赛事，适合发现 AI 应用、工具和小团队作品提交机会。", "https://devfolio.co/hackathons", "search_discovered", "source_entry", 51),
  candidate("challenge-gov-ai-prizes", "Challenge.gov AI / Data Prize Competitions 官方入口", "Challenge.gov", "Challenge.gov", "challenge.gov", "competition_platform", "政府挑战入口 - 待确认", ["北美", "政府挑战", "AI", "数据赛"], "持续更新", "奖金、合同机会或公共服务资源以具体 challenge 页为准", "Challenge.gov 是美国政府挑战赛官方入口，可发现 AI、数据和公共服务创新赛，但需要逐项确认资格和开放状态。", "https://www.challenge.gov/", "official_entry_to_review", "source_entry", 50),
  candidate("google-org-ai-impact-challenge", "Google.org AI Impact Challenge 官方来源", "Google.org", "Google.org AI Impact Challenge", "withgoogle.com", "cloud_provider", "官方来源 - 待确认", ["北美", "全球", "AI for Good", "创业扶持"], "见官网", "grant、云资源或项目扶持以官方页为准", "Google.org AI Impact Challenge 类来源适合发现 AI for social good、资源扶持和项目展示机会，需确认当前申请窗口。", "https://impactchallenge.withgoogle.com/ai", "official_entry_to_review", "direct_opportunity", 50),
  candidate("ai-for-good-innovation-factory", "AI for Good Innovation Factory Startup Pitch", "AI for Good", "AI for Good Innovation Factory", "aiforgood.itu.int", "competition_platform", "官方来源 - 待确认", ["欧洲", "全球", "AI Startup", "Pitch"], "持续更新", "路演、导师、展示或创业资源以官方页为准", "AI for Good Innovation Factory 适合 AI startup 和 OPC 创业者关注，偏路演与展示，需要确认地区、时间和报名窗口。", "https://aiforgood.itu.int/innovation-factory/", "official_entry_to_review", "direct_opportunity", 50),
];

function candidate(
  id: string,
  title: string,
  platform: string,
  sourceName: string,
  sourceDomain: string,
  sourceType: AiEventSourceType,
  statusLabel: string,
  tags: string[],
  deadline: string,
  reward: string,
  reason: string,
  officialUrl: string,
  evidenceStatus: PublicAiEventCandidate["evidenceStatus"],
  candidateType: PublicAiEventCandidate["candidateType"],
  priority: number,
): PublicAiEventCandidate {
  const hasConcreteSource = /^https?:\/\//i.test(officialUrl);
  return {
    id,
    title,
    platform,
    sourceName,
    sourceDomain,
    sourceType,
    statusLabel,
    tags,
    deadline,
    reward,
    coverImageUrl: DEFAULT_AI_EVENT_COVER_IMAGE_URL,
    imageSourceUrl: hasConcreteSource ? officialUrl : DEFAULT_AI_EVENT_COVER_IMAGE_URL,
    imageAlt: `${title} 赛事封面`,
    imageStatus: hasConcreteSource ? "platform_placeholder" : "default_placeholder",
    imageAttribution: hasConcreteSource ? sourceName : "ChancePing",
    reason,
    officialUrl,
    evidenceStatus,
    candidateType,
    displayable: priority >= 44 || candidateType === "direct_opportunity" || candidateType === "source_entry",
    lastCheckedAt: LAST_CHECKED_AT,
    priority,
  };
}

export function getPublicAiEventSampleRoomData(): PublicAiEventSampleRoomData {
  const items = AI_EVENT_SAMPLE_ROOM_CANDIDATES
    .slice()
    .sort((a, b) => b.priority - a.priority)
    .map((candidate) => ({ ...candidate }));
  const displayableCount = items.filter((item) => item.displayable !== false).length;
  const imageCoverageCount = items.filter((item) => item.coverImageUrl && item.coverImageUrl !== DEFAULT_AI_EVENT_COVER_IMAGE_URL).length;
  const officialSourceCount = AI_EVENT_SOURCE_NETWORK.filter((source) => source.trustTier === "official_first").length;
  const aggregatorSourceCount = AI_EVENT_SOURCE_NETWORK.filter((source) => source.trustTier === "aggregation_lead").length;
  return {
    items,
    sourceNetwork: AI_EVENT_SOURCE_NETWORK.map((source) => ({ ...source })),
    stats: {
      candidateCount: AI_EVENT_SAMPLE_ROOM_CANDIDATES.length,
      displayableCount,
      sourceCount: AI_EVENT_SOURCE_NETWORK.length,
      officialEntryCount: items.filter((item) => item.evidenceStatus === "official_entry_to_review").length,
      needsReviewCount: items.filter((item) => item.evidenceStatus !== "official_entry_to_review").length,
      imageCoverageCount,
      officialSourceCount,
      aggregatorSourceCount,
      lastCheckedAt: LAST_CHECKED_AT,
    },
  };
}
