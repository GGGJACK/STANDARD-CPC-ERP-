# -*- coding: utf-8 -*-
"""
为 ERP 复刻项目生成"分箱压缩包"。
设计原则：
  1. 每个 zip 独立可解压，不需要分卷合并
  2. 单包 <= 250 MB，避免单次 PUT 中断重传
  3. 附件类用 STORED（pdf/mp4/图片已压缩，deflate 纯浪费时间）
  4. 代码/数据/文档类用 DEFLATED
  5. 数据库先拷三件套、在副本上做 WAL checkpoint，绝不动源库
"""
import os
import sys
import json
import shutil
import sqlite3
import zipfile
import hashlib
import tempfile

SRC_DATA = r"F:\03 Standard CPC DataBase"
SRC_CODE = r"F:\04 STANDARD CPC SYSTEM"
OUT = r"F:\04 STANDARD CPC SYSTEM\_delivery\pkg"
STAGE = r"F:\04 STANDARD CPC SYSTEM\_delivery\_stage"

SKIP_DIR_NAMES = {"_歷史版本", "node_modules", ".git", "__pycache__", ".workbuddy"}
SKIP_EXT = {".db-wal", ".db-shm", ".db"}


def is_skip_dir(name):
    return name in SKIP_DIR_NAMES or name.startswith("backup-")


def walk_files(root, skip_db=True, skip_html=False, skip_report=False):
    """返回 [(绝对路径, zip内相对路径)]"""
    out = []
    root = os.path.abspath(root)
    for dirpath, dirnames, filenames in os.walk(root):
        dirnames[:] = [d for d in dirnames if not is_skip_dir(d)]
        for fn in filenames:
            ext = os.path.splitext(fn)[1].lower()
            if skip_db and (ext in SKIP_EXT or fn.endswith(".db-wal") or fn.endswith(".db-shm")):
                continue
            if skip_html and ext == ".html":
                continue
            if skip_report and ext in {".html", ".png", ".pdf", ".csv", ".json", ".jpg", ".jpeg"}:
                continue
            full = os.path.join(dirpath, fn)
            rel = os.path.relpath(full, root).replace("\\", "/")
            out.append((full, rel))
    return out


def add_to_zip(zf, abs_path, arcname):
    if os.path.isdir(abs_path):
        base = os.path.abspath(abs_path)
        parent = os.path.dirname(base)
        for dirpath, dirnames, filenames in os.walk(base):
            dirnames[:] = [d for d in dirnames if not is_skip_dir(d)]
            for fn in filenames:
                full = os.path.join(dirpath, fn)
                if fn.endswith(".db-wal") or fn.endswith(".db-shm"):
                    continue
                rel = os.path.relpath(full, parent).replace("\\", "/")
                zf.write(full, rel)
    elif os.path.isfile(abs_path):
        zf.write(abs_path, arcname.replace("\\", "/"))


def build_zip(name, items, dest_root, mode=zipfile.ZIP_DEFLATED, prefix_map=None):
    """items: [(abs_path, arcname)]"""
    path = os.path.join(OUT, name)
    n = 0
    with zipfile.ZipFile(path, "w", mode, compresslevel=6 if mode == zipfile.ZIP_DEFLATED else None) as zf:
        for abs_path, arcname in items:
            if os.path.isdir(abs_path):
                base = os.path.abspath(abs_path)
                parent = os.path.dirname(base)
                for dirpath, dirnames, filenames in os.walk(base):
                    dirnames[:] = [d for d in dirnames if not is_skip_dir(d)]
                    for fn in filenames:
                        if fn.endswith(".db-wal") or fn.endswith(".db-shm"):
                            continue
                        full = os.path.join(dirpath, fn)
                        rel = os.path.relpath(full, parent).replace("\\", "/")
                        zf.write(full, rel)
                        n += 1
            elif os.path.isfile(abs_path):
                zf.write(abs_path, arcname.replace("\\", "/"))
                n += 1
    size = os.path.getsize(path)
    print(f"  [OK] {name}  {size/1024/1024:.1f} MB  {n} files")
    return {"name": name, "bytes": size, "files": n, "path": path}


def split_by_size(src_dir, n_buckets):
    """按一级子项贪心装箱，返回 n 个 [(abs,rel)]"""
    entries = []
    for d in sorted(os.listdir(src_dir)):
        p = os.path.join(src_dir, d)
        if not os.path.isdir(p):
            continue
        total = sum(os.path.getsize(os.path.join(dp, f))
                    for dp, dn, fs in os.walk(p) for f in fs)
        entries.append((p, total))
    entries.sort(key=lambda x: -x[1])
    buckets = [[] for _ in range(n_buckets)]
    loads = [0] * n_buckets
    for p, size in entries:
        i = loads.index(min(loads))
        buckets[i].append(p)
        loads[i] += size
    return buckets, loads


def sha256(path, buf=1024 * 1024):
    h = hashlib.sha256()
    with open(path, "rb") as f:
        while True:
            b = f.read(buf)
            if not b:
                break
            h.update(b)
    return h.hexdigest()


def prep_database():
    """拷贝 db 三件套到 stage，在副本上 checkpoint，返回干净的 db 路径"""
    print("[*] 准备数据库快照（在副本上做 WAL checkpoint，源库不动）")
    src_dir = os.path.join(SRC_CODE, "04. 四期", "系统代码")
    dst = os.path.join(STAGE, "db")
    if os.path.isdir(dst):
        shutil.rmtree(dst)
    os.makedirs(dst, exist_ok=True)
    for fn in ["data.db", "data.db-wal", "data.db-shm"]:
        s = os.path.join(src_dir, fn)
        if os.path.exists(s):
            shutil.copy2(s, os.path.join(dst, fn))
    dbp = os.path.join(dst, "data.db")
    wal_before = os.path.getsize(os.path.join(dst, "data.db-wal")) if os.path.exists(os.path.join(dst, "data.db-wal")) else 0
    try:
        con = sqlite3.connect(dbp)
        con.execute("PRAGMA journal_mode=DELETE")
        con.commit()
        con.close()
        for fn in ["data.db-wal", "data.db-shm"]:
            p = os.path.join(dst, fn)
            if os.path.exists(p):
                os.remove(p)
        print(f"  [OK] checkpoint 完成（原 WAL {wal_before/1024:.0f} KB 已合并进 data.db）")
    except Exception as e:
        print(f"  [WARN] checkpoint 失败：{e}，改为原样打包三件套")
    return dbp


def main():
    os.makedirs(OUT, exist_ok=True)
    os.makedirs(STAGE, exist_ok=True)
    manifest = []

    print("=" * 60)
    print("PKG-01 业务数据快照（导出）")
    items = [(os.path.join(SRC_DATA, "02. 数据导出"), "02. 数据导出")]
    manifest.append(build_zip("ERP-01_业务数据快照_导出.zip", items, OUT, zipfile.ZIP_DEFLATED))

    print("=" * 60)
    print("PKG-02 数据库快照")
    dbp = prep_database()
    items = [
        (dbp, "数据库/四期系统代码/data.db"),
        (os.path.join(SRC_CODE, "04. 四期", "系统代码", "schema.json"), "数据库/四期系统代码/schema.json"),
        (os.path.join(SRC_CODE, "04. 四期", "系统代码", "seed.mjs"), "数据库/四期系统代码/seed.mjs"),
        (os.path.join(SRC_CODE, "04. 四期", "系统代码", "backup-20261024-193250", "data.db"),
         "数据库/更早备份_20261024/data.db"),
    ]
    manifest.append(build_zip("ERP-02_数据库快照.zip", items, OUT, zipfile.ZIP_DEFLATED))

    print("=" * 60)
    print("PKG-03 附件：产品与工单")
    att = os.path.join(SRC_DATA, "03. 附件")
    items = [(os.path.join(att, d), d) for d in
             ["Product", "WorkRecord", "Contract", "WorkUnit", "CompanySettings", "ServicePlanLog"]]
    for fn in ["_附件索引.csv", "_下載匯總.json", "_附件完整性核對報告.html"]:
        p = os.path.join(att, fn)
        if os.path.exists(p):
            items.append((p, fn))
    manifest.append(build_zip("ERP-03_附件_产品与工单.zip", items, OUT, zipfile.ZIP_STORED))

    print("=" * 60)
    print("PKG-04 附件：报价单")
    items = [(os.path.join(att, "Quotation"), "Quotation")]
    manifest.append(build_zip("ERP-04_附件_报价单.zip", items, OUT, zipfile.ZIP_STORED))

    print("=" * 60)
    print("PKG-05/06/07 附件：采购单（按体积均分 3 箱）")
    buckets, loads = split_by_size(os.path.join(att, "PurchaseOrder"), 3)
    for i, b in enumerate(buckets, 1):
        items = [(p, os.path.join("PurchaseOrder", os.path.basename(p))) for p in b]
        manifest.append(build_zip(f"ERP-05_附件_采购单_{chr(64+i)}.zip", items, OUT, zipfile.ZIP_STORED))
        print(f"    箱{chr(64+i)}: {len(b)} 个单据目录, 源体积 {loads[i-1]/1024/1024:.0f} MB")

    print("=" * 60)
    print("PKG-08 系统代码（去重：剔除 *.db / backup-* / _歷史版本）")
    items = []
    for phase in ["01. 一期", "02. 二期", "03. 三期"]:
        items.append((os.path.join(SRC_CODE, phase), phase))
    p4 = os.path.join(SRC_CODE, "04. 四期")
    for sub in ["系统代码", "一次修改", "二次修改", "三次修改", "四次修改", "工具"]:
        p = os.path.join(p4, sub)
        if os.path.isdir(p):
            items.append((p, os.path.join("04. 四期", sub)))
    items.append((os.path.join(SRC_CODE, "05. 源码分析"), "05. 源码分析"))
    manifest.append(build_zip("ERP-08_系统代码_去重.zip", items, OUT, zipfile.ZIP_DEFLATED))

    print("=" * 60)
    print("PKG-09 文档与蓝图")
    items = [
        (os.path.join(SRC_DATA, "01. 截图"), "01. 截图"),
        (os.path.join(SRC_DATA, "04. 設定"), "04. 設定"),
        (os.path.join(SRC_DATA, "00. 復刻藍圖.html"), "00. 復刻藍圖.html"),
        (os.path.join(SRC_DATA, "標準清潔滅蟲_系統復刻藍圖_精簡版_20261024.pdf"),
         "標準清潔滅蟲_系統復刻藍圖_精簡版_20261024.pdf"),
        (os.path.join(SRC_CODE, "04. 四期", "原系統參考"), "04. 四期/原系統參考"),
        (os.path.join(SRC_CODE, "04. 四期", "驗收歷程"), "04. 四期/驗收歷程"),
    ]
    for phase in ["01. 一期", "02. 二期", "03. 三期", "04. 四期", "05. 源码分析"]:
        d = os.path.join(SRC_CODE, phase)
        for fn in os.listdir(d):
            p = os.path.join(d, fn)
            if os.path.isfile(p) and os.path.splitext(fn)[1].lower() in {".html", ".png", ".pdf", ".csv", ".json"}:
                items.append((p, os.path.join(phase, fn)))
    manifest.append(build_zip("ERP-09_文档与蓝图.zip", items, OUT, zipfile.ZIP_DEFLATED))

    print("=" * 60)
    print("[*] 计算 SHA256")
    for m in manifest:
        m["sha256"] = sha256(m["path"])
        print(f"  {m['name']}  {m['sha256'][:16]}...")

    with open(r"F:\04 STANDARD CPC SYSTEM\_delivery\manifest.json", "w", encoding="utf-8") as f:
        json.dump(manifest, f, ensure_ascii=False, indent=2)

    total = sum(m["bytes"] for m in manifest)
    print(f"\n[完成] {len(manifest)} 个包，合计 {total/1024/1024:.1f} MB")
    for m in manifest:
        print(f"  {m['name']:<36} {m['bytes']/1024/1024:>7.1f} MB  {m['files']:>5} files")


if __name__ == "__main__":
    main()
