# -*- coding: utf-8 -*-
"""生成资产库交付说明页（HTML）与清单（CSV）"""
import json
import os
import csv

BASE = r"F:\04 STANDARD CPC SYSTEM\_delivery"
OUT = os.path.join(BASE, "pkg2")
os.makedirs(OUT, exist_ok=True)

MANIFEST = {m["name"]: m for m in json.load(open(os.path.join(BASE, "manifest.json"), encoding="utf-8"))}

ROWS = [
    ("ERP-01_业务数据快照_导出.zip", "01 业务数据快照", "fnsczoNbcmqs",
     "全部業務表的 JSON / CSV 導出（34 張表）＋ 完整性核對報告，共 104 個文件"),
    ("ERP-02_数据库快照.zip", "01 业务数据快照", "fwogfbgMoMGO",
     "四期系統 SQLite 主庫（已合併 WAL）、schema.json、seed.mjs、2026-10-24 備份庫"),
    ("ERP-03_附件_产品与工单.zip", "02 附件归档", "foLqBPpHXnkF",
     "Product 157 / WorkRecord 16 / Contract / WorkUnit / CompanySettings / ServicePlanLog ＋ 附件索引"),
    ("ERP-04_附件_报价单.zip", "02 附件归档", "fKbqhWGwZCFW",
     "Quotation 全部 187 個投標與報價附件（PDF 為主）"),
    ("ERP-05_附件_采购单_A.zip", "02 附件归档", "fDkLZCcMWquP",
     "PurchaseOrder 第 1/3 箱：275 個採購單目錄"),
    ("ERP-05_附件_采购单_B.zip", "02 附件归档", "fxoPMFhWVuoT",
     "PurchaseOrder 第 2/3 箱：274 個採購單目錄"),
    ("ERP-05_附件_采购单_C.zip", "02 附件归档", "fDCDBKPWoixU",
     "PurchaseOrder 第 3/3 箱：274 個採購單目錄"),
    ("ERP-08_系统代码_去重.zip", "03 系统代码", "fbdYlgwHbIVp",
     "一期～四期源碼 ＋ 四次修改記錄 ＋ 工具 ＋ 前端源碼分析，已剔除重複數據庫與備份"),
    ("ERP-09_文档与蓝图.zip", "04 设定与蓝图", "fwAKDdrGQqTR",
     "復刻藍圖 PDF/HTML、設定檔、系統截圖、原系統參考資料、各期交接與驗收報告"),
]

ORDER = [
    "ERP-01_业务数据快照_导出.zip", "ERP-02_数据库快照.zip", "ERP-03_附件_产品与工单.zip",
    "ERP-04_附件_报价单.zip", "ERP-05_附件_采购单_A.zip", "ERP-05_附件_采购单_B.zip",
    "ERP-05_附件_采购单_C.zip", "ERP-08_系统代码_去重.zip", "ERP-09_文档与蓝图.zip",
]

total_bytes = sum(MANIFEST[n]["bytes"] for n in ORDER)
total_files = sum(MANIFEST[n]["files"] for n in ORDER)


def mb(b):
    return f"{b/1024/1024:,.1f}"


rows_html = []
for name, folder, fid, desc in ROWS:
    m = MANIFEST[name]
    rows_html.append(f"""      <tr>
        <td class="pkg"><code>{name}</code></td>
        <td>{folder}</td>
        <td class="num">{mb(m['bytes'])} MB</td>
        <td class="num">{m['files']}</td>
        <td class="desc">{desc}</td>
        <td class="sha"><code>{m['sha256'][:16]}…</code></td>
      </tr>""")

HTML = f"""<!DOCTYPE html>
<html lang="zh-Hant">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>標準清潔滅蟲 ERP 復刻 — 資產庫交付說明</title>
<style>
  :root {{
    --ink: #1f2328; --ink2: #57606a; --line: #d8dee4; --bg: #ffffff;
    --soft: #f6f8fa; --accent: #0b5fff; --warn-bg: #fff8e6; --warn-line: #f0c36d;
    --ok-bg: #eefaf3; --ok-line: #7bc49a;
  }}
  * {{ box-sizing: border-box; }}
  body {{
    margin: 0; padding: 0; background: var(--bg); color: var(--ink);
    font-family: -apple-system, "Segoe UI", "PingFang SC", "Microsoft YaHei", "Noto Sans CJK SC", sans-serif;
    font-size: 15px; line-height: 1.75;
  }}
  .wrap {{ max-width: 1040px; margin: 0 auto; padding: 56px 32px 96px; }}
  header {{ border-bottom: 3px solid var(--ink); padding-bottom: 22px; margin-bottom: 36px; }}
  .eyebrow {{ font-size: 12.5px; letter-spacing: .14em; text-transform: uppercase; color: var(--accent); font-weight: 600; margin-bottom: 10px; }}
  h1 {{ font-size: 30px; line-height: 1.3; margin: 0 0 12px; font-weight: 700; letter-spacing: -.01em; }}
  .lede {{ font-size: 16px; color: var(--ink2); margin: 0; }}
  .meta {{ margin-top: 18px; display: flex; flex-wrap: wrap; gap: 10px; }}
  .chip {{ background: var(--soft); border: 1px solid var(--line); border-radius: 999px; padding: 4px 14px; font-size: 13px; color: var(--ink2); }}
  .chip b {{ color: var(--ink); font-weight: 600; }}
  h2 {{ font-size: 19px; margin: 44px 0 14px; padding-left: 12px; border-left: 4px solid var(--accent); font-weight: 700; }}
  h3 {{ font-size: 15.5px; margin: 26px 0 8px; font-weight: 700; }}
  p {{ margin: 10px 0; }}
  code {{ font-family: "SFMono-Regular", Consolas, "Liberation Mono", monospace; font-size: .88em; background: var(--soft); padding: 1.5px 5px; border-radius: 4px; border: 1px solid var(--line); }}
  table {{ width: 100%; border-collapse: collapse; margin: 18px 0; font-size: 13.5px; }}
  th {{ background: var(--soft); text-align: left; padding: 10px 12px; border: 1px solid var(--line); font-weight: 600; white-space: nowrap; }}
  td {{ padding: 10px 12px; border: 1px solid var(--line); vertical-align: top; }}
  tbody tr:nth-child(even) {{ background: #fcfcfd; }}
  td.num {{ text-align: right; white-space: nowrap; font-variant-numeric: tabular-nums; }}
  td.sha {{ white-space: nowrap; }}
  td.sha code, td.pkg code {{ background: none; border: none; padding: 0; font-size: 12.5px; }}
  td.desc {{ color: var(--ink2); font-size: 13px; line-height: 1.6; }}
  .callout {{ border-radius: 8px; padding: 16px 18px; margin: 20px 0; font-size: 14px; }}
  .callout.warn {{ background: var(--warn-bg); border: 1px solid var(--warn-line); }}
  .callout.ok {{ background: var(--ok-bg); border: 1px solid var(--ok-line); }}
  .callout .tag {{ display: inline-block; font-size: 11.5px; font-weight: 700; letter-spacing: .08em; text-transform: uppercase; margin-bottom: 6px; }}
  .callout.warn .tag {{ color: #8a6100; }}
  .callout.ok .tag {{ color: #1a7a4c; }}
  .callout p:last-child {{ margin-bottom: 0; }}
  ol, ul {{ margin: 12px 0; padding-left: 24px; }}
  li {{ margin: 7px 0; }}
  .tree {{ background: var(--soft); border: 1px solid var(--line); border-radius: 8px; padding: 18px 20px; font-family: "SFMono-Regular", Consolas, monospace; font-size: 13px; line-height: 1.9; white-space: pre; overflow-x: auto; }}
  .tree b {{ font-weight: 600; color: var(--accent); }}
  .two {{ display: grid; grid-template-columns: 1fr 1fr; gap: 20px; }}
  @media (max-width: 720px) {{ .two {{ grid-template-columns: 1fr; }} .wrap {{ padding: 32px 18px 64px; }} table {{ font-size: 12.5px; }} }}
  footer {{ margin-top: 56px; padding-top: 20px; border-top: 1px solid var(--line); font-size: 12.5px; color: var(--ink2); }}
  .kpi {{ display: grid; grid-template-columns: repeat(4, 1fr); gap: 14px; margin: 26px 0 8px; }}
  .kpi div {{ background: var(--soft); border: 1px solid var(--line); border-radius: 10px; padding: 16px 18px; }}
  .kpi span {{ display: block; font-size: 12px; color: var(--ink2); margin-bottom: 6px; }}
  .kpi strong {{ font-size: 22px; font-weight: 700; font-variant-numeric: tabular-nums; }}
  @media (max-width: 720px) {{ .kpi {{ grid-template-columns: repeat(2, 1fr); }} }}
</style>
</head>
<body>
<div class="wrap">

<header>
  <div class="eyebrow">Project Asset Delivery</div>
  <h1>標準清潔滅蟲 ERP 復刻<br>資產庫交付說明</h1>
  <p class="lede">原始業務數據、附件歸檔與四期系統源碼的完整快照，按業務對象分箱打包，每個壓縮包獨立可解壓。</p>
  <div class="meta">
    <span class="chip">交付日期 <b>2026-10-25</b></span>
    <span class="chip">壓縮包 <b>9 個</b></span>
    <span class="chip">合計 <b>{mb(total_bytes)} MB</b></span>
    <span class="chip">還原後 <b>{total_files:,} 個文件</b></span>
    <span class="chip">原始體積 <b>1,302 MB</b></span>
  </div>
</header>

<div class="kpi">
  <div><span>業務數據與數據庫</span><strong>10.6 MB</strong></div>
  <div><span>客戶附件歸檔</span><strong>796.8 MB</strong></div>
  <div><span>系統源碼</span><strong>17.9 MB</strong></div>
  <div><span>文檔與藍圖</span><strong>9.6 MB</strong></div>
</div>

<h2>資產庫結構</h2>
<div class="tree">標準清潔滅蟲 ERP 復刻/
├── <b>00 项目说明</b>/        ← 本說明頁 ＋ SHA256 清單
├── <b>01 业务数据快照</b>/    ← ERP-01 報表導出、ERP-02 SQLite 主庫
├── <b>02 附件归档</b>/        ← ERP-03 產品工單、ERP-04 報價、ERP-05 A/B/C 採購單
├── <b>03 系统代码</b>/        ← ERP-08 一～四期源碼（去重）
└── <b>04 设定与蓝图</b>/      ← ERP-09 藍圖、設定、截圖、驗收報告</div>

<h2>壓縮包清單</h2>
<table>
  <thead>
    <tr>
      <th>壓縮包</th>
      <th>所在目錄</th>
      <th style="text-align:right">體積</th>
      <th style="text-align:right">文件數</th>
      <th>內容</th>
      <th>SHA256 前綴</th>
    </tr>
  </thead>
  <tbody>
{chr(10).join(rows_html)}
  </tbody>
</table>
<p style="font-size:13px;color:var(--ink2)">完整 SHA256 見同目錄的 <code>ERP_资产清单_SHA256.csv</code>（表格版）與 <code>ERP_SHA256SUMS.txt</code>（校驗命令用）。</p>

<h2>還原步驟</h2>
<ol>
  <li>把 9 個壓縮包各自解壓到同一層根目錄，目錄結構會自動合併，<b>不需要按順序解壓</b>，也沒有分卷合併步驟。</li>
  <li>先解 <code>ERP-09_文档与蓝图.zip</code>，裡面的 <code>標準清潔滅蟲_系統復刻藍圖_精簡版_20261024.pdf</code> 是整套系統的業務藍圖，建議先讀。</li>
  <li>要跑系統：解 <code>ERP-08_系统代码_去重.zip</code>，取四期 <code>系统代码/</code>，再把 <code>ERP-02</code> 裡的 <code>data.db</code> 放進同一目錄，執行 <code>启动系统.bat</code>（需 Node.js）。</li>
  <li>要對照原始單據：解 <code>ERP-04</code> / <code>ERP-05_*</code> 到 <code>03. 附件/</code> 下同名目錄，路徑與數據庫裡的 <code>file_url</code> 字段一一對應。</li>
</ol>

<h2>校驗方式</h2>
<p>下載後在壓縮包所在目錄執行，逐個比對輸出與清單中的 SHA256：</p>
<div class="tree">sha256sum -c ERP_SHA256SUMS.txt</div>
<p>或在 Windows PowerShell 中：</p>
<div class="tree">Get-FileHash *.zip -Algorithm SHA256 | Format-Table Hash, Path</div>

<h2>已處理的技術細節</h2>
<div class="callout ok">
  <div class="tag">数据库一致性</div>
  <p><code>ERP-02</code> 裡的 <code>data.db</code> 不是直接拷貝的。交付前把 <code>data.db</code> ＋ <code>data.db-wal</code>（1.6 MB）＋ <code>data.db-shm</code> 三件套複製到暫存區，<b>在副本上</b>執行 <code>PRAGMA journal_mode=DELETE</code> 強制 checkpoint，把 WAL 中的未落盤事務合併進主庫，再打包。</p>
  <p>結果：主庫從 54,702,080 字節變成 54,820,864 字節（<b>＋118,784 字節</b>），這是被合併進去的增量。源庫全程未被修改。</p>
</div>

<h2>未上傳的內容</h2>
<table>
  <thead><tr><th>項目</th><th>體積</th><th>不傳的原因</th></tr></thead>
  <tbody>
    <tr><td><code>04. 四期/_歷史版本/</code></td><td>53 MB</td><td>單一時點的整庫快照，其 data.db 與現行庫 MD5 不同但內容高度重疊；需要歷史可回溯版本管理，不適合放共享盤</td></tr>
    <tr><td><code>03. 三期/系统代码/data.db</code></td><td>54.7 MB</td><td>與四期主庫 <b>MD5 完全相同</b>（<code>ebf0737…</code>），屬重複文件</td></tr>
    <tr><td><code>backup-*/</code> 四個目錄</td><td>16 MB</td><td>開發期自動備份，已被 ERP-08 排除</td></tr>
    <tr><td><code>*.db-wal</code> / <code>*.db-shm</code></td><td>1.6 MB</td><td>已 checkpoint 合併進主庫，獨立存在反而會造成誤用</td></tr>
  </tbody>
</table>

<h2>數據敏感度提醒</h2>
<div class="callout warn">
  <div class="tag">注意</div>
  <p><code>ERP-03</code> / <code>ERP-04</code> / <code>ERP-05_A~C</code> 共 <b>835 MB</b> 是真實業務單據，包含客戶名稱、報價金額、採購明細，以及現場作業的照片與 WhatsApp 影片。資產庫是項目共享空間，成員均可查看下載。</p>
  <p>如果要對外演示或交給第三方，請先做脫敏：保留目錄結構與文件命名規則，把 PDF／圖片內容替換為佔位文件，或只交付 <code>ERP-01</code> 的導出數據與 <code>_附件索引.csv</code>。</p>
</div>

<footer>
  由 WorkBuddy 自動生成 · 分箱腳本 <code>_delivery/build_packages.py</code> · 上傳腳本 <code>_delivery/upload_all.py</code><br>
  本地原始路徑：<code>F:\\03 Standard CPC DataBase</code>（業務數據）· <code>F:\\04 STANDARD CPC SYSTEM</code>（源碼）
</footer>

</div>
</body>
</html>
"""

html_path = os.path.join(OUT, "ERP_资产库交付说明_20261025.html")
with open(html_path, "w", encoding="utf-8") as f:
    f.write(HTML)
print("HTML:", html_path, os.path.getsize(html_path), "bytes")

csv_path = os.path.join(OUT, "ERP_资产清单_SHA256.csv")
with open(csv_path, "w", encoding="utf-8-sig", newline="") as f:
    w = csv.writer(f)
    w.writerow(["文件名", "所在目录", "字节数", "文件数", "SHA256", "资产库file_id", "校验行"])
    for name, folder, fid, _ in ROWS:
        m = MANIFEST[name]
        w.writerow([name, folder, m["bytes"], m["files"], m["sha256"], fid,
                    f"{m['sha256']}  {name}"])
print("CSV:", csv_path, os.path.getsize(csv_path), "bytes")
sums_path = os.path.join(OUT, "ERP_SHA256SUMS.txt")
with open(sums_path, "w", encoding="utf-8", newline="\n") as f:
    for name, _folder, _fid, _d in ROWS:
        f.write(f"{MANIFEST[name]['sha256']}  {name}\n")
print("SUMS:", sums_path, os.path.getsize(sums_path), "bytes")
print(f"合计 {total_bytes:,} 字节 / {total_files:,} 文件")
