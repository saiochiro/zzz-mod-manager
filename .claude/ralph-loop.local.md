---
active: true
iteration: 1
session_id: ccb55a8e-78fb-567e-93ea-f4ec995ee7de
max_iterations: 15
completion_promise: "PHASE 1 COMPLETE"
started_at: "2026-10-27T02:10:32Z"
---

Phase 1 of the ProxyLaunch spec (repo /home/claude/zzz-mod-manager, branch themes-v2). Items: (1) housekeeping: hotkeyTidy.ts leftover; (2) updates keep mod identity: same mod_uuid, custom cover, in_h_swap_cycle, loadout membership, and re-apply hotkey remaps after new files; (3) loadouts use the same rename/sync path as the card switch (DISABLED_ leftover handling); Stream Safe only turns off NSFW-labeled mods plus unlabeled manually-installed skin mods, never turns mods on; Main Team and Default predictable, never touch UI/global mods; (4) choose the GameBanana file when a page has several files, save gamebanana_file_id on the mod, reuse it in Update and Get missing files; (5) backups backend: total size, list, restore, prune for backups/mod-updates, deleted mods, backups/hotkeys. Each iteration: check git log and the code for what is done, implement the next unfinished item with vitest tests in tests/, push to themes-v2, wait for the Check workflow (gh run list --branch themes-v2 --workflow Check), read failures via gh api check-runs annotations and fix. Output <promise>PHASE 1 COMPLETE</promise> only when all five items are implemented and the Check workflow is green on the latest commit.
