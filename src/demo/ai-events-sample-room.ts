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
export type AiEventImageStatus = "source_image" | "platform_placeholder" | "default_placeholder";

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
  candidate("drivendata-competitions", "DrivenData AI / Data Science Competitions 入口", "DrivenData", "DrivenData", "drivendata.org", "competition_platform", "平台入口 - 待复核", ["数据科学", "公益赛", "算法赛"], "持续更新", "奖金和资格以赛题页为准", "适合数据科学竞赛线索，需确认是否 AI 相关及是否仍开放。", "https://www.drivendata.org/competitions/", "search_discovered", "source_entry", 55),
  candidate("codalab-competitions", "CodaLab Competitions 入口", "CodaLab", "CodaLab", "codalab.org", "competition_platform", "平台入口 - 待复核", ["算法赛", "Benchmark", "学术"], "持续更新", "待复核", "CodaLab 承载大量学术挑战，需区分当前赛事和历史 benchmark。", "https://codalab.lisn.upsaclay.fr/competitions/", "search_discovered", "source_entry", 54),
  candidate("zindi-competitions", "Zindi AI / Data Science Competitions 入口", "Zindi", "Zindi", "zindi.africa", "competition_platform", "平台入口 - 待复核", ["数据科学", "AI", "全球"], "持续更新", "奖金和资格以赛题页为准", "Zindi 适合国际数据科学竞赛补充来源，需复核地域和参赛资格。", "https://zindi.africa/competitions", "search_discovered", "source_entry", 53),
  candidate("hackerearth-hackathons", "HackerEarth Hackathons AI 赛事发现入口", "HackerEarth", "HackerEarth", "hackerearth.com", "hackathon_platform", "平台入口 - 待复核", ["Hackathon", "开发者", "AI"], "持续更新", "奖金和提交要求按赛事页复核", "HackerEarth 适合作为国际黑客松补充来源，需进入具体 challenge 页确认是否 AI 相关和是否仍开放。", "https://www.hackerearth.com/challenges/hackathon/", "search_discovered", "source_entry", 52),
  candidate("topcoder-ai-challenges", "Topcoder Challenges AI / Data Challenge 入口", "Topcoder", "Topcoder", "topcoder.com", "competition_platform", "平台入口 - 待复核", ["算法挑战", "开发者挑战", "全球"], "持续更新", "奖励按 challenge 页复核", "Topcoder 可发现开发者和算法挑战赛，但需排除普通任务和历史 challenge。", "https://www.topcoder.com/challenges", "search_discovered", "source_entry", 51),
  candidate("analytics-vidhya-datahack", "Analytics Vidhya DataHack AI 竞赛入口", "Analytics Vidhya", "Analytics Vidhya DataHack", "analyticsvidhya.com", "competition_platform", "平台入口 - 待复核", ["数据科学", "机器学习", "AI"], "持续更新", "奖金和资格以 contest 页为准", "DataHack 适合补充英文数据科学和机器学习竞赛，需打开具体 contest 页复核。", "https://datahack.analyticsvidhya.com/contest/all/", "search_discovered", "source_entry", 50),
  candidate("global-ai-hackathon-search", "Global AI Hackathon Series 搜索线索", "Search Discovery", "Devpost / DoraHacks / Lablab", "multiple", "hackathon_platform", "搜索发现 - 待复核", ["AI Hackathon", "全球", "报名入口"], "待复核", "待复核", "这是跨平台查询种子，用于触发 Devpost、DoraHacks、Lablab 等具体赛事页，不直接当作已确认机会。", "https://devpost.com/hackathons?search=AI%20hackathon", "search_discovered", "source_entry", 48),
  candidate("ai-agent-hackathon-search", "AI Agent Hackathon 查询种子", "Search Discovery", "Devpost / Lablab", "multiple", "hackathon_platform", "搜索发现 - 待复核", ["AI Agent", "Hackathon", "作品提交"], "待复核", "待复核", "用于发现 AI Agent 专项 Hackathon；需要后续读取具体官方赛事页。", "https://lablab.ai/event?query=AI%20Agent", "search_discovered", "source_entry", 47),
  candidate("cloud-credits-challenge-search", "AI 云资源挑战赛查询种子", "Search Discovery", "Cloud Providers", "multiple", "cloud_provider", "搜索发现 - 待复核", ["云资源", "credits", "developer challenge"], "待复核", "云资源待复核", "用于发现云厂商 challenge、credits 和创业资源，不能直接等同于比赛。", "https://devpost.com/hackathons?search=cloud%20AI", "search_discovered", "watch_signal", 45),
  candidate("aigc-creator-contest-search", "AIGC 创作赛查询种子", "Search Discovery", "Runway / creator platforms", "multiple", "creator_platform", "搜索发现 - 待复核", ["AIGC", "创作赛", "作品展示"], "待复核", "待复核", "用于发现 AI 视频、图像和内容创作赛，需与开发者 Hackathon 分层。", "https://runwayml.com/ai-film-festival", "search_discovered", "watch_signal", 44),
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
