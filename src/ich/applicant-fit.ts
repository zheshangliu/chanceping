export const ICH_APPLICANT_PROFILES = [
  "heritage_master",
  "craft_studio",
  "creative_company",
  "designer",
  "student",
  "researcher",
  "museum",
] as const;

export type IchApplicantProfile = typeof ICH_APPLICANT_PROFILES[number];

export interface IchApplicantFit {
  eligible_profiles: IchApplicantProfile[];
  score: number;
  matched_profiles: IchApplicantProfile[];
  reasons: string[];
}

const PROFILE_TERMS: Record<IchApplicantProfile, RegExp> = {
  heritage_master: /非遗传承人|传承人|representative inheritor|master artisan|heritage master/i,
  craft_studio: /工作室|工坊|手工艺|传统工艺|craft studio|maker|artisan studio|craftsmanship/i,
  creative_company: /企业|品牌|供应商|采购|文创产品|公司|company|brand|supplier|commission/i,
  designer: /设计师|设计机构|设计奖|designer|design award|creative practitioner/i,
  student: /学生|高校|大学生|student|university|school/i,
  researcher: /研究|学术|研究者|research|fellowship|scholar/i,
  museum: /博物馆|美术馆|文化馆|museum|gallery|cultural institution/i,
};

export function inferIchApplicantFit(text: string): IchApplicantFit {
  const value = text.trim();
  const matched_profiles = ICH_APPLICANT_PROFILES.filter((profile) => PROFILE_TERMS[profile].test(value));
  const eligible_profiles: IchApplicantProfile[] = matched_profiles.length > 0 ? matched_profiles : ["heritage_master", "craft_studio", "designer"];
  const score = Math.min(100, matched_profiles.length * 25 + (matched_profiles.length === 0 ? 20 : 15));
  const reasons = matched_profiles.length > 0
    ? matched_profiles.map((profile) => `文本命中 ${profile} 资格信号`)
    : ["未发现明确申请主体，保守映射到非遗手艺人、工作室和设计师，需人工确认"];
  return { eligible_profiles, score, matched_profiles, reasons };
}

export function applicantFitForIchText(text: string): IchApplicantFit {
  return inferIchApplicantFit(text);
}
