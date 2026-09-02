import assert from "node:assert/strict";
import { generateBdAction } from "../src/headhunter/actions/bd-action-generator";
import { displayAction, displayOutreach, generateOutreach } from "../src/headhunter/actions/outreach-generator";

const roles = ["ta", "recruiter", "hrbp", "hrd", "business_leader", "finance_leader", "country_manager", "official_entry"] as const;
for (const role_category of roles) {
  const action = generateBdAction({ company_name: "Example Co", role_category, trigger_summary: "宣布越南新工厂 Q4 投产", need_basis: "high_confidence_business_inference" });
  assert.equal(action.role_category, role_category);
  const draft = generateOutreach({ company_name: "Example Co", role_category, trigger_summary: "宣布越南新工厂 Q4 投产", need_basis: "high_confidence_business_inference", capability_hint: "海外财务、HR、供应链岗位" });
  assert.equal(draft.inference_language, true);
  assert.ok(/可能|如贵司近期正在筹备/.test(draft.body));
  assert.ok(!/看到贵司正在招聘海外财务/.test(draft.body));
  assert.equal(displayAction("人工行动", action), "人工行动");
  assert.equal(displayOutreach("人工话术", draft), "人工话术");
}
const explicit = generateOutreach({ company_name: "Hiring Co", role_category: "hrd", trigger_summary: "公开发布新岗位", need_basis: "explicit_hiring" });
assert.equal(explicit.inference_language, false);
assert.ok(/公开发布了/.test(explicit.body));
console.log("headhunter BD action and outreach verification: PASS");
