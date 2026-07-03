import { createApp } from "../src/api/app";
import { createAppContext } from "../src/api/context";
import type { LLMAdapter, LLMRequest, LLMResponse } from "../src/agents/llm-adapter";

process.env.LLM_MODE = "mock";

let pass = 0;
let fail = 0;

function check(name: string, condition: boolean, detail = "") {
  if (condition) {
    pass += 1;
    console.log(`PASS ${name}`);
  } else {
    fail += 1;
    console.error(`FAIL ${name}${detail ? `: ${detail}` : ""}`);
  }
}

function text(value: unknown): string {
  return JSON.stringify(value);
}

interface AiEntrepreneurScenario {
  id: string;
  initial: string;
  correction: string;
  resultFeedback: string;
  targetUser: string;
  intents: string[];
  criteria: string[];
  exclusions: string[];
  sources: string[];
  queries: string[];
}

const scenarios: AiEntrepreneurScenario[] = [
  {
    id: "ai-maker-cloud",
    initial: "我是个人开发者，做了一个 AI 小工具，想找适合参加的机会。",
    correction: "我不是学生，我是 OPC 创业者，优先奖金、云资源、能上架展示的比赛。",
    resultFeedback: "这些结果不对，不要展会资讯，我要能报名和提交作品的入口。",
    targetUser: "OPC 创业者 / AI 工具开发者",
    intents: ["AI 工具开发者挑战赛", "云厂商创业扶持", "作品提交型 Hackathon"],
    criteria: ["有官方报名入口", "有奖金或云资源", "允许个人或小团队参加", "能展示或上架产品"],
    exclusions: ["学生专属赛事", "展会资讯", "行业趋势文章"],
    sources: ["云厂商开发者挑战赛官网", "Hackathon 平台", "AI 工具比赛官网"],
    queries: ["AI tool developer challenge application cloud credits", "AI hackathon individual founder prize registration", "AI app competition submit project deadline"],
  },
  {
    id: "agent-founder",
    initial: "我在做 AI Agent 产品，想看看近期有什么能参加的活动。",
    correction: "我主要找 AI Agent 大赛、开发者挑战赛和能拿云资源的创业者项目。",
    resultFeedback: "结果里不要论坛和峰会，只保留可报名、可申请、可提交 Demo 的机会。",
    targetUser: "AI Agent 创业者",
    intents: ["AI Agent 大赛", "开发者挑战赛", "云资源扶持项目"],
    criteria: ["可报名", "可提交 Demo", "有云资源或创业扶持", "适合创业者"],
    exclusions: ["论坛峰会", "展会新闻", "无提交入口页面"],
    sources: ["AI Agent 大赛官网", "云厂商创业计划页", "开发者挑战赛页面"],
    queries: ["AI Agent challenge demo submission startup credits", "AI Agent hackathon application prize", "cloud AI startup program application developer"],
  },
  {
    id: "solo-saas",
    initial: "我是 solo founder，做 AI SaaS，帮我找能扩大曝光的机会。",
    correction: "更想要能展示产品、获得媒体曝光、拿启动资源的比赛或加速器。",
    resultFeedback: "不要泛创业新闻，也不要投融资文章，我要申请入口。",
    targetUser: "AI SaaS solo founder",
    intents: ["AI SaaS 创业比赛", "产品展示机会", "加速器申请"],
    criteria: ["有申请入口", "有展示舞台", "有资源包或云资源", "适合早期创业者"],
    exclusions: ["泛创业新闻", "投融资文章", "无申请入口资讯"],
    sources: ["Startup program page", "AI SaaS competition site", "accelerator application page"],
    queries: ["AI SaaS startup competition application showcase", "AI startup accelerator application cloud credits", "solo founder AI product demo day application"],
  },
  {
    id: "opensource-ai",
    initial: "我维护一个开源 AI 项目，想找一些可以参赛或者获得支持的机会。",
    correction: "重点找开源项目、开发者社区、云资源赞助和可提交 repo 的 Hackathon。",
    resultFeedback: "不要只发新闻的页面，我要有 GitHub/repo 提交流程或官方申请表。",
    targetUser: "开源 AI 项目维护者",
    intents: ["开源 AI Hackathon", "开发者社区扶持", "云资源赞助"],
    criteria: ["允许提交 GitHub/repo", "有官方申请表", "有云资源赞助", "适合开源项目"],
    exclusions: ["新闻报道", "无 repo 提交流程页面", "纯活动回顾"],
    sources: ["developer community challenge", "open source program page", "cloud credits program"],
    queries: ["open source AI hackathon GitHub submission", "AI developer community challenge repo application", "cloud credits open source AI project program"],
  },
  {
    id: "multimodal-app",
    initial: "我做了一个多模态 AI 应用，想找比赛和展示机会。",
    correction: "优先找多模态、AIGC、AI 应用创新赛，最好有奖金和 Demo 展示。",
    resultFeedback: "不要学术会议征稿，我要应用产品类比赛。",
    targetUser: "多模态 AI 应用开发者",
    intents: ["多模态 AI 应用比赛", "AIGC 创新赛", "Demo 展示机会"],
    criteria: ["产品 Demo 可提交", "有奖金", "面向应用开发者", "有展示机会"],
    exclusions: ["学术会议征稿", "论文征集", "纯技术研讨"],
    sources: ["AI application competition site", "AIGC challenge page", "developer demo day"],
    queries: ["multimodal AI app competition demo submission", "AIGC innovation challenge application prize", "AI application developer demo competition deadline"],
  },
  {
    id: "qwen-builder",
    initial: "我基于大模型做了一个小产品，想找云厂商和模型平台的机会。",
    correction: "优先模型平台、云厂商、开发者大赛，能送算力或上架展示最好。",
    resultFeedback: "不要产品发布会资讯，必须有报名或开发者计划入口。",
    targetUser: "大模型应用开发者",
    intents: ["模型平台开发者大赛", "云厂商开发者计划", "AI 应用上架展示"],
    criteria: ["送算力或云资源", "有报名入口", "有上架展示", "适合个人开发者"],
    exclusions: ["产品发布会资讯", "无报名入口页面", "纯媒体报道"],
    sources: ["model platform developer contest", "cloud developer program", "AI app marketplace program"],
    queries: ["LLM app developer contest cloud credits application", "model platform developer challenge registration", "AI app marketplace developer program apply"],
  },
  {
    id: "automation-agent",
    initial: "我做了一个自动化 Agent，希望找能参赛的机会。",
    correction: "我想找 AI Agent、自动化、工作流类比赛，不要机器人硬件比赛。",
    resultFeedback: "搜索结果里混了硬件机器人，请排除硬件和实体机器人。",
    targetUser: "自动化 AI Agent 开发者",
    intents: ["AI Agent 比赛", "自动化工作流挑战赛", "开发者 Hackathon"],
    criteria: ["软件 Agent 可参赛", "有提交入口", "适合个人或小团队", "有奖项或资源"],
    exclusions: ["机器人硬件比赛", "实体机器人赛事", "工业机器人展会"],
    sources: ["AI Agent challenge page", "workflow automation contest", "developer hackathon platform"],
    queries: ["AI agent automation workflow challenge application", "software agent hackathon registration prize", "workflow AI developer competition submit"],
  },
  {
    id: "edu-ai-tool",
    initial: "我做了一个教育 AI 工具，想找参赛和推广机会。",
    correction: "重点找教育科技、AI 应用、校园创新但不要学生个人赛。",
    resultFeedback: "不要学生组个人竞赛，我是产品开发者，想要产品赛道或创业赛道。",
    targetUser: "教育 AI 产品开发者",
    intents: ["教育科技 AI 应用赛", "产品创新赛", "创业赛道机会"],
    criteria: ["产品可报名", "创业团队可参与", "有展示或资源", "教育科技相关"],
    exclusions: ["学生个人赛", "纯校园社团活动", "教学论文征集"],
    sources: ["edtech competition site", "AI application innovation contest", "startup track application"],
    queries: ["edtech AI product competition startup track application", "education AI innovation challenge product demo", "AI education startup competition registration"],
  },
  {
    id: "health-ai",
    initial: "我做了一个医疗健康 AI demo，想找可以展示和验证的机会。",
    correction: "优先找医疗 AI、数字健康、创新创业比赛，必须能提交 demo。",
    resultFeedback: "不要医学会议新闻，也不要论文征稿，只要产品/创业机会。",
    targetUser: "医疗健康 AI demo 开发者",
    intents: ["医疗 AI 创新赛", "数字健康创业比赛", "产品 Demo 展示"],
    criteria: ["能提交产品 Demo", "有创业或应用赛道", "来源可信", "有申请入口"],
    exclusions: ["医学会议新闻", "论文征稿", "纯学术资讯"],
    sources: ["digital health innovation challenge", "medical AI startup competition", "health tech accelerator application"],
    queries: ["medical AI startup competition demo application", "digital health innovation challenge product submission", "health tech accelerator AI application"],
  },
  {
    id: "design-ai",
    initial: "我做了 AI 设计工具，想找能投稿、参赛或展示的机会。",
    correction: "优先 AIGC 设计、创意工具、产品展示，不要普通平面设计比赛。",
    resultFeedback: "结果里普通设计比赛太多，请提高 AI 工具和产品 Demo 权重。",
    targetUser: "AI 设计工具开发者",
    intents: ["AIGC 设计工具比赛", "创意 AI 应用赛", "产品展示机会"],
    criteria: ["强调 AI 工具", "能提交产品 Demo", "有展示或商业化机会", "有官方入口"],
    exclusions: ["普通平面设计比赛", "纯作品征集", "无 AI 相关页面"],
    sources: ["AIGC competition page", "creative AI challenge", "product demo showcase"],
    queries: ["AIGC design tool competition application", "creative AI product challenge demo submission", "AI design app showcase contest deadline"],
  },
  {
    id: "enterprise-ai-agent",
    initial: "我们是小团队做企业 AI Agent，想找比赛、扶持和客户线索。",
    correction: "先以参赛和云资源扶持为主，客户线索作为观察，不要泛营销文章。",
    resultFeedback: "如果只有客户案例但没有报名入口，请降级为参考案例。",
    targetUser: "企业 AI Agent 小团队",
    intents: ["企业 AI Agent 大赛", "云资源扶持", "客户线索观察"],
    criteria: ["参赛或申请入口优先", "有云资源", "能证明企业应用价值", "客户线索需待复核"],
    exclusions: ["泛营销文章", "无入口客户案例", "纯品牌软文"],
    sources: ["enterprise AI challenge", "cloud startup program", "AI agent partner program"],
    queries: ["enterprise AI agent competition application", "AI agent startup cloud credits program", "enterprise AI partner program apply"],
  },
  {
    id: "voice-ai",
    initial: "我做了语音 AI 应用，想找国内外比赛。",
    correction: "优先语音、语义理解、AI 应用创新赛，排除硬件音箱发布会。",
    resultFeedback: "不要产品发布新闻，要可以报名、提交或申请的页面。",
    targetUser: "语音 AI 应用开发者",
    intents: ["语音 AI 应用比赛", "语义理解挑战赛", "AI 应用创新赛"],
    criteria: ["应用可提交", "有报名入口", "有截止时间或流程", "适合开发者"],
    exclusions: ["硬件音箱发布会", "产品发布新闻", "纯媒体报道"],
    sources: ["speech AI challenge", "AI application contest", "developer competition page"],
    queries: ["speech AI application competition registration", "voice AI developer challenge submit", "semantic understanding challenge application deadline"],
  },
  {
    id: "agent-marketplace",
    initial: "我想把 AI Agent 上架到平台，找相关机会。",
    correction: "找 agent marketplace、插件市场、开发者扶持、上架激励。",
    resultFeedback: "不要教程文章，我要平台官方上架和开发者计划入口。",
    targetUser: "AI Agent 上架开发者",
    intents: ["Agent marketplace 上架", "插件市场开发者计划", "上架激励"],
    criteria: ["平台官方入口", "有上架流程", "有开发者扶持", "能带来曝光"],
    exclusions: ["教程文章", "第三方搬运", "无官方入口资讯"],
    sources: ["agent marketplace developer page", "plugin store developer program", "platform partner portal"],
    queries: ["AI agent marketplace developer program submit", "plugin store AI app listing application", "AI platform developer incentive program apply"],
  },
  {
    id: "ai-video-tool",
    initial: "我做了 AI 视频工具，想找曝光和参赛机会。",
    correction: "优先 AIGC 视频、短片征集、AI 创作工具赛，最好能带来展示。",
    resultFeedback: "不要电影节普通征片，必须有 AI 或 AIGC 相关。",
    targetUser: "AI 视频工具开发者",
    intents: ["AIGC 视频创作赛", "AI 工具展示", "短片征集机会"],
    criteria: ["AI/AIGC 明确相关", "有投稿或报名入口", "能展示工具能力", "有奖项或曝光"],
    exclusions: ["普通电影节征片", "无 AI 相关活动", "纯影展资讯"],
    sources: ["AIGC video contest", "AI creative challenge", "creator platform submission"],
    queries: ["AIGC video contest submission AI tool", "AI video creation challenge application", "AI creator competition deadline prize"],
  },
  {
    id: "ai-data-tool",
    initial: "我做数据分析 AI 工具，想找开发者比赛。",
    correction: "优先数据智能、BI、企业 AI 应用、云厂商开发者挑战。",
    resultFeedback: "不要纯数据科学论文赛，我要产品或应用赛道。",
    targetUser: "数据分析 AI 工具开发者",
    intents: ["数据智能开发者挑战", "企业 AI 应用赛", "云厂商开发者比赛"],
    criteria: ["产品应用可提交", "有云资源或奖金", "企业场景相关", "有官方报名入口"],
    exclusions: ["纯数据科学论文赛", "Kaggle 式纯算法题", "无产品赛道"],
    sources: ["data intelligence challenge", "cloud developer contest", "enterprise AI application competition"],
    queries: ["data intelligence AI application competition registration", "BI AI tool developer challenge cloud credits", "enterprise AI app contest submit project"],
  },
  {
    id: "global-hackathon",
    initial: "I'm an indie AI builder looking for global hackathons.",
    correction: "Focus on online hackathons, AI agent challenges, prize money, and cloud credits.",
    resultFeedback: "Exclude local meetups and conference talks; I need application pages.",
    targetUser: "indie AI builder",
    intents: ["global AI hackathon", "AI agent challenge", "cloud credits program"],
    criteria: ["online participation allowed", "application page exists", "prize money or cloud credits", "solo builder friendly"],
    exclusions: ["local meetups", "conference talks", "news-only pages"],
    sources: ["hackathon platform", "cloud developer challenge", "AI startup program"],
    queries: ["global AI hackathon online application cloud credits", "AI agent challenge prize registration", "indie AI builder hackathon deadline"],
  },
  {
    id: "ai-browser-extension",
    initial: "我做了 AI 浏览器插件，想找能推广的机会。",
    correction: "优先浏览器插件、生产力工具、AI 应用挑战和上架曝光。",
    resultFeedback: "不要浏览器安全新闻，我要插件开发者计划或比赛。",
    targetUser: "AI 浏览器插件开发者",
    intents: ["AI 插件开发者比赛", "生产力工具挑战", "上架曝光机会"],
    criteria: ["插件可提交", "有官方入口", "能获得曝光", "适合个人开发者"],
    exclusions: ["浏览器安全新闻", "普通扩展教程", "无上架或比赛入口"],
    sources: ["browser extension developer program", "AI productivity challenge", "app marketplace contest"],
    queries: ["AI browser extension competition application", "AI productivity tool challenge submit", "browser extension developer program AI app"],
  },
  {
    id: "ai-legal-tool",
    initial: "我做法律 AI 工具，想找创新比赛和展示机会。",
    correction: "优先法律科技、政务创新、AI 应用赛，排除律师招聘信息。",
    resultFeedback: "不要招聘岗位和律所新闻，要比赛、申报或展示入口。",
    targetUser: "法律 AI 工具开发者",
    intents: ["法律科技创新赛", "政务 AI 应用赛", "产品展示机会"],
    criteria: ["有报名或申报入口", "适合法律科技产品", "能展示应用价值", "来源可核验"],
    exclusions: ["律师招聘信息", "律所新闻", "纯法规解读"],
    sources: ["legal tech innovation challenge", "government AI application contest", "startup demo application"],
    queries: ["legal tech AI competition application", "government AI application challenge legal tech", "legal AI startup demo day apply"],
  },
  {
    id: "ai-research-to-product",
    initial: "我把一个 AI 研究 demo 做成产品了，想找机会。",
    correction: "更看重转化、创业扶持、开发者挑战，不要论文评奖。",
    resultFeedback: "排除论文奖和学术会议，加入创业项目和产业应用赛。",
    targetUser: "AI 研究转产品创业者",
    intents: ["AI 产业应用赛", "创业扶持项目", "开发者挑战赛"],
    criteria: ["鼓励产品转化", "有申请入口", "有产业应用场景", "有资源支持"],
    exclusions: ["论文奖", "学术会议", "纯科研评审"],
    sources: ["AI industry application contest", "startup support program", "developer challenge application"],
    queries: ["AI research product startup competition application", "AI industry application challenge startup support", "developer challenge AI product commercialization"],
  },
  {
    id: "ai-marketing-tool",
    initial: "我们做 AI 营销工具，想找能获客和参赛的机会。",
    correction: "参赛优先，获客线索作为观察，排除加盟广告。",
    resultFeedback: "不要泛营销资讯，重点是 AI 营销工具比赛和品牌合作入口。",
    targetUser: "AI 营销工具团队",
    intents: ["AI 营销工具比赛", "品牌合作入口", "获客线索观察"],
    criteria: ["比赛有报名入口", "品牌合作需联系确认", "有展示产品机会", "可形成下一步动作"],
    exclusions: ["加盟广告", "泛营销资讯", "无联系入口页面"],
    sources: ["martech AI challenge", "brand partner portal", "AI application contest"],
    queries: ["AI marketing tool competition application", "martech AI challenge submit product", "brand partner portal AI marketing startup"],
  },
  {
    id: "ai-devtool",
    initial: "我做开发者 AI 工具，想找比赛和上架资源。",
    correction: "优先开发者生态、IDE 插件、代码助手、云厂商挑战。",
    resultFeedback: "不要代码教程和工具榜单，必须有开发者计划或参赛入口。",
    targetUser: "开发者 AI 工具创业者",
    intents: ["开发者 AI 工具比赛", "IDE 插件上架", "云厂商挑战赛"],
    criteria: ["开发者工具相关", "有官方提交入口", "有生态资源", "适合小团队"],
    exclusions: ["代码教程", "工具榜单", "无提交入口文章"],
    sources: ["developer ecosystem challenge", "IDE marketplace program", "cloud developer contest"],
    queries: ["AI developer tool competition application", "IDE plugin AI marketplace developer program", "code assistant challenge cloud credits"],
  },
  {
    id: "ai-creator-tool",
    initial: "我做创作者 AI 工具，想找曝光机会。",
    correction: "要创作者平台、AIGC、工具上架、品牌合作，不要单纯作品比赛。",
    resultFeedback: "如果只让个人投稿作品，不是工具展示，请降级。",
    targetUser: "创作者 AI 工具开发者",
    intents: ["创作者平台开发者计划", "AIGC 工具展示", "品牌合作入口"],
    criteria: ["工具可展示或上架", "有合作或报名入口", "能触达创作者平台", "线索需待复核"],
    exclusions: ["个人作品投稿", "纯作品比赛", "无工具展示入口"],
    sources: ["creator platform developer program", "AIGC tool challenge", "brand collaboration portal"],
    queries: ["creator AI tool developer program application", "AIGC tool showcase competition", "creator platform partner program AI app"],
  },
  {
    id: "ai-finance-tool",
    initial: "我做金融分析 AI 工具，想找创业比赛。",
    correction: "优先 fintech、AI 应用、监管沙盒、云厂商扶持，排除理财广告。",
    resultFeedback: "不要理财产品广告或课程，必须是创业/开发者/应用机会。",
    targetUser: "金融分析 AI 工具创业者",
    intents: ["FinTech AI 创业赛", "监管沙盒申请", "云厂商扶持"],
    criteria: ["创业团队可申请", "有官方入口", "有资源或试点机会", "金融 AI 相关"],
    exclusions: ["理财广告", "培训课程", "无申请入口资讯"],
    sources: ["fintech innovation challenge", "regulatory sandbox application", "cloud startup support"],
    queries: ["fintech AI startup competition application", "financial AI regulatory sandbox apply", "AI finance startup cloud credits program"],
  },
  {
    id: "ai-customer-service",
    initial: "我们做 AI 客服 Agent，想找机会。",
    correction: "优先客户服务、呼叫中心、企业 AI 应用赛和渠道合作。",
    resultFeedback: "不要客服招聘岗位，找企业应用赛、渠道伙伴或客户线索。",
    targetUser: "AI 客服 Agent 团队",
    intents: ["企业 AI 应用赛", "渠道伙伴线索", "客户服务创新机会"],
    criteria: ["企业场景匹配", "可报名或可联系", "渠道线索需待复核", "排除求职机会"],
    exclusions: ["客服招聘岗位", "求职平台职位", "泛客服资讯"],
    sources: ["enterprise AI application contest", "contact center partner directory", "customer service innovation challenge"],
    queries: ["AI customer service agent competition application", "contact center AI partner program", "enterprise AI customer service challenge apply"],
  },
  {
    id: "ai-localization-tool",
    initial: "我做 AI 本地化翻译工具，想找国际机会。",
    correction: "优先全球 hackathon、出海 SaaS、开发者扶持和平台合作。",
    resultFeedback: "不要翻译招聘和语言课程，要产品或创业机会。",
    targetUser: "AI 本地化工具创业者",
    intents: ["全球 AI Hackathon", "出海 SaaS 扶持", "平台合作入口"],
    criteria: ["国际参与可行", "有申请入口", "适合 SaaS 工具", "可带来渠道或曝光"],
    exclusions: ["翻译招聘", "语言课程广告", "无产品机会页面"],
    sources: ["global hackathon platform", "SaaS startup program", "platform partner portal"],
    queries: ["AI localization SaaS startup competition application", "global AI hackathon translation tool", "SaaS partner program AI localization apply"],
  },
  {
    id: "ai-ecommerce-tool",
    initial: "我们做电商 AI 工具，想找参赛和渠道机会。",
    correction: "优先跨境电商平台、卖家工具、AI 应用赛、平台招商。",
    resultFeedback: "不要普通平台招商广告，要开发者、服务商或工具合作入口。",
    targetUser: "电商 AI 工具团队",
    intents: ["电商 AI 应用赛", "平台服务商合作", "卖家工具渠道机会"],
    criteria: ["工具服务商可申请", "有合作入口", "有参赛入口", "可触达卖家生态"],
    exclusions: ["普通平台招商广告", "无服务商入口页面", "泛电商新闻"],
    sources: ["ecommerce platform partner portal", "seller tool developer program", "AI application contest"],
    queries: ["ecommerce AI tool competition application", "marketplace seller tool partner program AI", "cross-border ecommerce AI developer program apply"],
  },
  {
    id: "ai-lowcode",
    initial: "我做低代码 AI Agent 平台，想找比赛和合作。",
    correction: "优先低代码、Agent、企业应用、开发者生态，不要 ERP 普通招标。",
    resultFeedback: "如果只是企业软件采购栏目但没有 AI/低代码/Agent，请降级。",
    targetUser: "低代码 AI Agent 平台团队",
    intents: ["低代码 AI 应用赛", "Agent 平台生态合作", "企业应用创新赛"],
    criteria: ["AI/Agent/低代码明确相关", "有报名或合作入口", "适合平台型产品", "采购线索需待复核"],
    exclusions: ["普通 ERP 招标", "无 AI 相关采购栏目", "泛企业软件资讯"],
    sources: ["low-code AI challenge", "agent platform partner program", "enterprise application innovation contest"],
    queries: ["low-code AI agent competition application", "agent platform partner program low code", "enterprise AI application innovation contest submit"],
  },
  {
    id: "ai-security-tool",
    initial: "我做 AI 安全工具，想找机会。",
    correction: "优先 AI 安全、开发者挑战、创新创业和试点机会。",
    resultFeedback: "不要安全漏洞新闻和岗位招聘，要可报名或可申请的机会。",
    targetUser: "AI 安全工具开发者",
    intents: ["AI 安全挑战赛", "创新创业比赛", "安全工具试点机会"],
    criteria: ["有报名或申请入口", "工具可提交", "适合开发者或创业团队", "来源可信"],
    exclusions: ["安全漏洞新闻", "岗位招聘", "无申请入口报告"],
    sources: ["AI security challenge", "cybersecurity startup competition", "developer contest page"],
    queries: ["AI security tool competition application", "cybersecurity AI startup challenge submit", "AI safety developer contest registration"],
  },
  {
    id: "ai-productivity",
    initial: "我做个人效率 AI 工具，想找产品展示和比赛。",
    correction: "优先生产力工具、个人开发者、App 上架、AI 应用创新。",
    resultFeedback: "不要办公软件测评文章，找官方参赛或上架入口。",
    targetUser: "个人效率 AI 工具开发者",
    intents: ["生产力 AI 应用赛", "App 上架展示", "个人开发者挑战赛"],
    criteria: ["个人开发者可参加", "有上架或提交入口", "有展示曝光", "有官方流程"],
    exclusions: ["办公软件测评文章", "工具榜单", "无官方入口资讯"],
    sources: ["productivity app challenge", "AI application contest", "app marketplace developer program"],
    queries: ["AI productivity app competition application", "personal developer AI app challenge submit", "app marketplace AI tool developer program"],
  },
  {
    id: "ai-community-plugin",
    initial: "我做社区管理 AI 插件，想找合作和比赛。",
    correction: "优先社区平台、插件生态、AI 应用赛，合作线索也可以但要待复核。",
    resultFeedback: "不要社区运营课程，要插件平台或开发者生态入口。",
    targetUser: "社区管理 AI 插件开发者",
    intents: ["社区平台插件生态", "AI 应用比赛", "合作线索"],
    criteria: ["插件可上架", "有开发者生态入口", "合作线索需联系确认", "有参赛入口"],
    exclusions: ["社区运营课程", "泛社群文章", "无开发者入口页面"],
    sources: ["community platform developer program", "plugin ecosystem page", "AI app contest"],
    queries: ["community AI plugin developer program application", "AI community management app competition", "plugin ecosystem AI app submit"],
  },
  {
    id: "ai-small-business",
    initial: "我是小微企业主，做了一个 AI 服务，想看看能不能参加一些项目。",
    correction: "我是服务型 AI 创业者，优先创业赛、政府创新项目、云厂商扶持。",
    resultFeedback: "不要补贴政策解读文章，要申报入口或比赛报名入口。",
    targetUser: "服务型 AI 创业者",
    intents: ["AI 创业比赛", "政府创新项目申报", "云厂商扶持"],
    criteria: ["有申报或报名入口", "适合小微企业", "有资源支持", "AI 服务明确相关"],
    exclusions: ["政策解读文章", "无申报入口页面", "泛创业资讯"],
    sources: ["government innovation program", "AI startup competition", "cloud startup support"],
    queries: ["AI service startup competition application small business", "government innovation project AI application portal", "cloud startup support AI service apply"],
  },
  {
    id: "ai-api-product",
    initial: "我做了一个 AI API 产品，想找开发者生态机会。",
    correction: "优先 API marketplace、开发者平台、云厂商生态、合作伙伴计划。",
    resultFeedback: "不要 API 教程和技术博客，我要上架、伙伴或参赛入口。",
    targetUser: "AI API 产品开发者",
    intents: ["API marketplace 上架", "开发者平台伙伴计划", "云生态合作"],
    criteria: ["有上架入口", "有 partner program", "有开发者生态资源", "能形成曝光或分发"],
    exclusions: ["API 教程", "技术博客", "无合作入口文章"],
    sources: ["API marketplace developer portal", "cloud partner program", "developer ecosystem challenge"],
    queries: ["AI API marketplace developer program listing", "cloud partner program AI API application", "developer ecosystem AI API challenge"],
  },
  {
    id: "ai-desktop-app",
    initial: "我做桌面端 AI 应用，想找比赛和平台资源。",
    correction: "优先桌面应用、效率工具、AI 应用赛和应用商店资源。",
    resultFeedback: "不要软件下载站和评测文章，要官方报名或商店开发者入口。",
    targetUser: "桌面端 AI 应用开发者",
    intents: ["桌面 AI 应用赛", "效率工具展示", "应用商店开发者资源"],
    criteria: ["应用可提交", "有官方入口", "能获得分发或展示", "适合独立开发者"],
    exclusions: ["软件下载站", "评测文章", "无官方入口页面"],
    sources: ["desktop app developer program", "AI productivity contest", "app store developer page"],
    queries: ["desktop AI app competition application", "AI productivity desktop app challenge submit", "app store developer program AI app apply"],
  },
];

class ScenarioLlmAdapter implements LLMAdapter {
  constructor(private readonly scenario: AiEntrepreneurScenario) {}

  async chat(_request: LLMRequest): Promise<LLMResponse> {
    return {
      content: JSON.stringify({
        radarVersion: {
          oneSentencePositioning: `${this.scenario.targetUser}机会雷达`,
          targetUser: this.scenario.targetUser,
          businessContext: `围绕 ${this.scenario.targetUser} 的 AI 产品、创业和开发者生态机会做持续监控。`,
          opportunityIntents: this.scenario.intents,
          highValueCriteria: this.scenario.criteria,
          exclusionRules: this.scenario.exclusions,
          prioritySourceArchetypes: this.scenario.sources,
          queryFamilies: [
            {
              familyName: `${this.scenario.id} action route`,
              intentType: "direct_opportunity",
              sourceArchetype: this.scenario.sources[0],
              queries: this.scenario.queries,
              whyThisFamily: "根据用户修订后的雷达版本，优先寻找能报名、申请、提交或联系确认的入口。",
              resultBucket: "direct_opportunity",
            },
          ],
          defaultAssumptions: ["默认先按 AI 创业者 / 开发者视角筛选，线索类结果必须标注待复核。"],
        },
        radarDiff: {
          summary: "根据用户反馈升级 AI 创业者机会雷达策略。",
          added: [this.scenario.targetUser, ...this.scenario.intents.slice(0, 2)],
          removed: [],
          upweighted: this.scenario.criteria.slice(0, 4),
          downweighted: this.scenario.exclusions.slice(0, 4),
          assumptionChanges: [`默认用户身份调整为：${this.scenario.targetUser}`],
          queryShifts: [`围绕 ${this.scenario.queries[0]} 等查询方向重写。`],
          sourceShifts: this.scenario.sources.slice(0, 4),
          highValueCriteriaChanges: this.scenario.criteria.slice(0, 4),
          exclusionChanges: this.scenario.exclusions.slice(0, 4),
        },
        suggestedName: `${this.scenario.targetUser.slice(0, 12)}雷达`,
        confirmationPrompt: "我已按你的反馈升级雷达。请确认是否按新版盯一次。",
      }),
    };
  }
}

async function post(app: ReturnType<typeof createApp>, path: string, body: unknown) {
  const response = await app.request(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = await response.json() as { success: boolean; data?: any; error?: any };
  check(`${path} returns 200`, response.status === 200, `${response.status} ${text(json.error)}`);
  check(`${path} succeeds`, json.success === true, text(json.error));
  return json.data;
}

async function run() {
  const ctx = createAppContext();
  const app = createApp(ctx);
  let reasonableRadar = 0;
  let diffReflectsFeedback = 0;
  let versionGrowth = 0;
  let latestVersionSearch = 0;
  const sampledSearchIds = new Set(["ai-maker-cloud", "agent-founder", "global-hackathon", "ai-devtool", "ai-small-business"]);

  for (const scenario of scenarios) {
    ctx.llmAdapter = new ScenarioLlmAdapter(scenario);
    const initial = await post(app, "/api/radars/generate", { description: scenario.initial });
    const v10 = initial.radarVersion || initial.spec.radar_version;
    const initialOk = v10?.version === "V1.0" && Boolean(v10.targetUser) && Array.isArray(v10.opportunityIntents);
    if (initialOk) reasonableRadar += 1;
    check(`${scenario.id}: initial V1.0 exists`, initialOk, text(v10));

    const v11 = await post(app, "/api/radars/revise", {
      previousSpec: initial.spec,
      previousRadarVersion: v10,
      userMessage: scenario.correction,
      trigger: "requirement_correction",
      revisionMode: "llm",
    });
    const v11Text = text(v11.radarVersion);
    check(`${scenario.id}: V1.1 uses LLM reviser`, v11.revisionSource === "llm", v11.revisionSource ?? "");
    check(`${scenario.id}: V1.1 stays unconfirmed`, v11.spec.confirmation_status?.user_confirmed === false, text(v11.spec.confirmation_status));
    check(`${scenario.id}: V1.1 updates target user`, v11.radarVersion.targetUser === scenario.targetUser, v11.radarVersion.targetUser);
    check(`${scenario.id}: V1.1 updates query family`, /action route/.test(v11Text) && scenario.queries.some((query) => v11Text.includes(query)), v11Text);

    const v12 = await post(app, "/api/radars/revise", {
      previousSpec: v11.spec,
      previousRadarVersion: v11.radarVersion,
      userMessage: scenario.resultFeedback,
      trigger: "result_feedback",
      resultFeedback: {
        rejectedReason: scenario.resultFeedback,
        freeText: scenario.resultFeedback,
        expectedOpportunityType: scenario.intents[0],
      },
      revisionMode: "llm",
    });
    const v12Text = text(v12.radarVersion);
    const grew = v11.radarVersion.version !== v10.version && v12.radarVersion.version !== v11.radarVersion.version;
    if (grew) versionGrowth += 1;
    const reflected = scenario.exclusions.some((item) => v12Text.includes(item)) && scenario.criteria.some((item) => v12Text.includes(item));
    if (reflected) diffReflectsFeedback += 1;
    check(`${scenario.id}: V1.2 increments again`, grew, `${v10.version} -> ${v11.radarVersion.version} -> ${v12.radarVersion.version}`);
    check(`${scenario.id}: V1.2 reflects feedback in structure`, reflected, v12Text);
    check(`${scenario.id}: V1.2 diff is visible`, Boolean(v12.radarDiff?.summary && v12.radarDiff.queryShifts?.length > 0), text(v12.radarDiff));
    check(`${scenario.id}: V1.2 remains draft before confirmation`, v12.spec.confirmation_status?.user_confirmed === false, text(v12.spec.confirmation_status));

    if (sampledSearchIds.has(scenario.id)) {
      const search = await post(app, "/api/search", {
        spec: {
          ...v12.spec,
          confirmation_status: {
            ...(v12.spec.confirmation_status || {}),
            status: "confirmed",
            user_confirmed: true,
            confirmed_at: new Date().toISOString(),
          },
        },
        query: scenario.queries[0],
        max_results: 2,
      });
      const usesLatest = search.searchPlan?.opportunityStrategy?.radarVersion === v12.radarVersion.version;
      if (usesLatest) latestVersionSearch += 1;
      check(`${scenario.id}: sampled search uses latest radar version`, usesLatest, search.searchPlan?.opportunityStrategy?.radarVersion ?? "");
      check(`${scenario.id}: sampled search returns card envelope`, Array.isArray(search.opportunityCards), "missing opportunityCards");
    }
  }

  check("Random 30 all initial radars are reasonable", reasonableRadar >= 30, `reasonable=${reasonableRadar}/30`);
  check("Random 30 all paths grow versions", versionGrowth >= 30, `versionGrowth=${versionGrowth}/30`);
  check("Random 30 feedback changes structured fields", diffReflectsFeedback >= 30, `diff=${diffReflectsFeedback}/30`);
  check("sampled searches use latest confirmed version", latestVersionSearch >= 5, `latest=${latestVersionSearch}/5`);
}

run()
  .then(() => {
    if (fail > 0) {
      console.error(`Q.7 AI entrepreneur random 30: ${pass} PASS / ${fail} FAIL`);
      process.exit(1);
    }
    console.log(`Q.7 AI entrepreneur random 30: ${pass} PASS / 0 FAIL`);
  })
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
