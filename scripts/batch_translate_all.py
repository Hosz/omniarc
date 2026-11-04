#!/usr/bin/env python3
"""
Batch Subtitle Translator for Jujutsu Kaisen Series
Translates Season 1, Season 2, Season 3, and Movie 0 into PT-BR.
"""

import os
import sys
import glob
import time
import argparse
from concurrent.futures import ThreadPoolExecutor, as_completed
from translate_series import translate_file

BASE_DIR = "/run/media/hokyozu/6EE20508E204D5ED/Downloads/Jujutsu Kaisen (Season 1,2,3 + Movie)"

def get_all_tasks():
    tasks = []

    # Season 1 (1 to 24)
    s1_dir = os.path.join(BASE_DIR, "Season 1")
    s1_files = sorted(glob.glob(os.path.join(s1_dir, "*.mkv")))
    for ep in range(1, 25):
        src = f"/tmp/notdedsec_jjk/{ep:02d}/jujutsu_{ep:02d}_subs_dialogue.ass"
        target = None
        for f in s1_files:
            if f"S01E{ep:02d}" in f:
                target = f.replace(".mkv", ".pt-br.ass")
                break
        if target:
            tasks.append({
                "label": f"S01E{ep:02d}",
                "season": 1,
                "ep": ep,
                "src": src,
                "dst": target,
                "dialogue_only": True
            })

    # Season 2 (1 to 23)
    s2_dir = os.path.join(BASE_DIR, "Season 2")
    s2_files = sorted(glob.glob(os.path.join(s2_dir, "*.mkv")))
    for ep in range(1, 24):
        src = f"/tmp/s02_raw_{ep:02d}.ass"
        target = None
        for f in s2_files:
            if f"S02E{ep:02d}" in f:
                target = f.replace(".mkv", ".pt-br.ass")
                break
        if target:
            tasks.append({
                "label": f"S02E{ep:02d}",
                "season": 2,
                "ep": ep,
                "src": src,
                "dst": target,
                "dialogue_only": False
            })

    # Season 3 (1 to 12)
    s3_dir = os.path.join(BASE_DIR, "Season 3")
    s3_files = sorted(glob.glob(os.path.join(s3_dir, "*.mkv")))
    for ep in range(1, 13):
        src = f"/tmp/s03_raw_{ep:02d}.ass"
        target = None
        for f in s3_files:
            if f"S03E{ep:02d}" in f:
                target = f.replace(".mkv", ".pt-br.ass")
                break
        if target:
            tasks.append({
                "label": f"S03E{ep:02d}",
                "season": 3,
                "ep": ep,
                "src": src,
                "dst": target,
                "dialogue_only": False
            })

    # Movie 0
    tasks.append({
        "label": "Movie 0",
        "season": 0,
        "ep": 0,
        "src": "/tmp/movie0_raw.ass",
        "dst": os.path.join(BASE_DIR, "Jujutsu Kaisen 0.pt-br.ass"),
        "dialogue_only": False
    })

    return tasks


def process_task(task):
    label = task["label"]
    src = task["src"]
    dst = task["dst"]
    d_only = task["dialogue_only"]

    # Check if already completed
    if os.path.exists(dst) and os.path.getsize(dst) > 2000:
        print(f"[{label}] ALREADY DONE ({os.path.basename(dst)}). Skipping.")
        return label, True, "Already done"

    if not os.path.exists(src):
        print(f"[{label}] Source not found: {src}")
        return label, False, f"Source not found: {src}"

    try:
        print(f"\n>>> [{label}] STARTING TRANSLATION -> {os.path.basename(dst)}")
        t0 = time.time()
        ok = translate_file(src, dst, dialogue_only=d_only)
        elapsed = time.time() - t0
        return label, ok, f"Done in {elapsed/60:.2f}m"
    except Exception as e:
        print(f"[{label}] ERROR: {e}")
        return label, False, str(e)


def main():
    parser = argparse.ArgumentParser(description="Batch translate anime subtitles to PT-BR")
    parser.add_argument("--workers", type=int, default=2, help="Number of concurrent workers (default 2)")
    parser.add_argument("--season", type=int, default=None, help="Process only a specific season (1, 2, 3)")
    parser.add_argument("--limit", type=int, default=None, help="Limit number of episodes to process")
    args = parser.parse_args()

    all_tasks = get_all_tasks()
    if args.season is not None:
        all_tasks = [t for t in all_tasks if t["season"] == args.season]

    # Filter out already done
    pending_tasks = [t for t in all_tasks if not (os.path.exists(t["dst"]) and os.path.getsize(t["dst"]) > 2000)]

    if args.limit:
        pending_tasks = pending_tasks[:args.limit]

    print(f"Total tasks: {len(all_tasks)} | Pending: {len(pending_tasks)} | Workers: {args.workers}")

    start_all = time.time()
    completed_count = 0
    failed_count = 0

    if args.workers == 1:
        for t in pending_tasks:
            lbl, ok, msg = process_task(t)
            if ok:
                completed_count += 1
            else:
                failed_count += 1
    else:
        with ThreadPoolExecutor(max_workers=args.workers) as executor:
            future_to_task = {executor.submit(process_task, t): t for t in pending_tasks}
            for future in as_completed(future_to_task):
                t = future_to_task[future]
                try:
                    lbl, ok, msg = future.result()
                    if ok:
                        completed_count += 1
                    else:
                        failed_count += 1
                    print(f"=== COMPLETED: [{lbl}] {msg} ({completed_count}/{len(pending_tasks)}) ===")
                except Exception as exc:
                    print(f"=== FAILED: [{t['label']}] generated an exception: {exc} ===")
                    failed_count += 1

    total_time = time.time() - start_all
    print(f"\n==================================================")
    print(f"BATCH FINISHED in {total_time/60:.2f} minutes.")
    print(f"Completed: {completed_count} | Failed: {failed_count}")
    print(f"==================================================")


if __name__ == "__main__":
    main()
