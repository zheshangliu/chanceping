import { Hono } from "hono";

const ADMIN_HTML = `<!doctype html>
<html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex,nofollow"><title>非遗机会审核台｜ChancePing</title>
<style>body{font:15px/1.55 system-ui,sans-serif;max-width:1180px;margin:auto;padding:24px;background:#f5f8f5;color:#17231d}button,textarea,input{font:inherit}button{padding:7px 12px;margin:3px;border:1px solid #8a9;border-radius:8px;background:#fff;cursor:pointer}.primary{background:#176b3a;color:#fff}.card,.panel{background:#fff;border:1px solid #d7e3da;border-radius:12px;padding:16px;margin:14px 0}.meta{color:#607066}.error{color:#a21b1b;white-space:pre-wrap}textarea{box-sizing:border-box;width:100%;min-height:300px;padding:12px}code{word-break:break-all}.hidden{display:none}</style>
</head><body><header><a href="/ich">← 非遗机会雷达</a><h1>非遗机会审核台</h1><p>管理凭据仅保存在当前页面内存，刷新即清除。</p></header>
<section class="panel"><button id="connect" class="primary">输入管理凭据</button><button id="reload">刷新机会</button><button id="submissions">刷新来源提交</button><button id="create">新建候选</button><span id="status" class="meta"></span><div id="error" class="error"></div></section>
<section id="editor" class="panel hidden"><h2 id="editor-title">新建候选</h2><textarea id="json" spellcheck="false"></textarea><div><button id="save" class="primary">保存</button><button id="cancel">取消</button></div></section>
<main><section><h2>机会审核</h2><div id="list"></div></section><section><h2>来源提交队列</h2><div id="submission-list" class="card">输入管理凭据后加载。</div></section></main>
<script>
let token = ""; let actor = "ich-admin";
const el = id => document.getElementById(id);
const esc = value => String(value ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
async function api(path, options = {}) {
  if (!token) throw new Error("请先输入管理凭据");
  const response = await fetch("/api/internal/ich" + path, {...options, headers: {"Authorization":"Bearer " + token,"X-ICH-Actor":actor,"Content-Type":"application/json",...(options.headers||{})}});
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error?.message || ("请求失败：" + response.status));
  return body;
}
function actions(item) {
  const map = {draft:["submit-review","archive"],pending_review:["approve","reject","archive"],approved:["publish","archive"],published:["withdraw","archive"],rejected:["restore","archive"],withdrawn:["submit-review","archive"],archived:["restore"]};
  const labels = {"submit-review":"提交审核",approve:"通过",reject:"驳回",publish:"发布",withdraw:"撤回",archive:"归档",restore:"恢复草稿"};
  return (map[item.workflow.state]||[]).map(action => '<button data-id="'+esc(item.id)+'" data-action="'+action+'" data-revision="'+item.workflow.revision+'">'+labels[action]+'</button>').join("");
}
function render(items) {
  el("list").innerHTML = items.map(item => '<article class="card"><b>'+esc(item.title)+'</b> <code>'+esc(item.workflow.state)+'</code><p class="meta">slug: '+esc(item.slug)+' · revision '+item.workflow.revision+' · '+esc(item.organizer?.name)+'</p><button data-edit="'+esc(item.id)+'">编辑 JSON</button>'+actions(item)+'</article>').join("") || '<section class="card">暂无候选机会</section>';
}
async function load() { try { el("error").textContent=""; const data=await api("/opportunities"); render(data.items); el("status").textContent=data.total+" 条机会"; } catch(e){el("error").textContent=e.message;} }
function renderSubmissions(items) {
  el("submission-list").innerHTML = items.map(item => '<article class="card"><b>'+esc(item.title_hint||"未填写标题")+'</b> <code>'+esc(item.status)+'</code><p><a rel="noopener" target="_blank" href="'+esc(item.source_url)+'">'+esc(item.source_url)+'</a></p><p class="meta">'+esc(item.note||"无补充说明")+' · '+esc(item.created_at)+'</p>'+(item.status==="pending"?'<button data-sub-accept="'+esc(item.id)+'">接受并转草稿</button><button data-sub-reject="'+esc(item.id)+'">拒绝</button>':"")+'</article>').join("") || '<section class="card">暂无来源提交</section>';
}
async function loadSubmissions() { try { el("error").textContent=""; const data=await api("/submissions"); renderSubmissions(data.items); el("status").textContent=data.total+" 条来源提交"; } catch(e){el("error").textContent=e.message;} }
el("connect").onclick=()=>{const value=prompt("输入 CHANCEPING_ICH_ADMIN_TOKEN");if(value){token=value;actor=prompt("操作者标识",actor)||actor;load();}};
el("reload").onclick=load;
el("submissions").onclick=loadSubmissions;
el("create").onclick=()=>{el("editor").classList.remove("hidden");el("editor-title").textContent="新建候选";el("json").value=JSON.stringify({opportunity:{}},null,2);el("save").dataset.id="";};
el("cancel").onclick=()=>el("editor").classList.add("hidden");
el("save").onclick=async()=>{try{const body=JSON.parse(el("json").value);const id=el("save").dataset.id;if(id){await api("/opportunities/"+encodeURIComponent(id),{method:"PUT",body:JSON.stringify(body)});}else{await api("/opportunities",{method:"POST",body:JSON.stringify(body)});}el("editor").classList.add("hidden");await load();}catch(e){el("error").textContent=e.message;}};
el("list").onclick=async event=>{const button=event.target.closest("button");if(!button)return;try{if(button.dataset.edit){const item=await api("/opportunities/"+encodeURIComponent(button.dataset.edit));el("editor").classList.remove("hidden");el("editor-title").textContent="编辑候选";el("json").value=JSON.stringify({expected_revision:item.workflow.revision,patch:item},null,2);el("save").dataset.id=item.id;return;}const reason=button.dataset.action==="reject"?prompt("填写驳回原因"):null;if(button.dataset.action==="reject"&&!reason)return;await api("/opportunities/"+encodeURIComponent(button.dataset.id)+"/"+button.dataset.action,{method:"POST",body:JSON.stringify({expected_revision:Number(button.dataset.revision),reason})});await load();}catch(e){el("error").textContent=e.message;}};
el("submission-list").onclick=async event=>{const button=event.target.closest("button");if(!button)return;try{if(button.dataset.subReject){const reason=prompt("填写拒绝原因");if(!reason)return;await api("/submissions/"+encodeURIComponent(button.dataset.subReject)+"/reject",{method:"POST",body:JSON.stringify({reason})});await loadSubmissions();return;}if(button.dataset.subAccept){const raw=prompt("粘贴完整 IchOpportunity JSON；服务端会强制创建为 draft","{}");if(!raw)return;const opportunity=JSON.parse(raw);await api("/submissions/"+encodeURIComponent(button.dataset.subAccept)+"/accept",{method:"POST",body:JSON.stringify({opportunity})});await Promise.all([load(),loadSubmissions()]);}}catch(e){el("error").textContent=e.message;}};
</script></body></html>`;

export function ichAdminPagesRoutes(): Hono {
  const app = new Hono();
  app.get("/", (c) => c.html(ADMIN_HTML, 200, {
    "Cache-Control": "no-store",
    "Content-Security-Policy": "default-src 'self'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'",
    "X-Frame-Options": "DENY",
    "X-Content-Type-Options": "nosniff",
  }));
  return app;
}
