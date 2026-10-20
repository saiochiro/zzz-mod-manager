# ZZZ Mod Manager — Complete System Architecture & Software Requirements Specification (SRS)

**ZZZ Mod Manager** is an automated desktop application engineered to manage, route, merge, and repair 3DMigoto / ZZMI (Zenless Zone Zero Model Importer) modifications sourced from GameBanana (`[https://gamebanana.com/mods/cats/30305](https://gamebanana.com/mods/cats/30305)`). The core engineering goal is zero manual file management: users click download, launch the game, cycle outfits with **`H`**, and repair post-update broken meshes in a single click.

---

## 1. System Architecture & Technology Stack

To achieve native filesystem speed alongside a highly stylized, animated UI, the application splits into two decoupled layers:

| Layer | Recommended Stack | Core Responsibility |
| --- | --- | --- |
| **Frontend (UI/UX)** | React / TypeScript + Tailwind CSS (via Tauri or Electron) *or* Python PyQt6 / QML | Renders the **Fairy OS** interface, grid animations, embedded GameBanana browser, and hotkey visualizers. |
| **Core Backend** | Python 3.11+ *or* Rust | Handles multi-threaded downloads, recursive archive unpacking, `.ini` AST (Abstract Syntax Tree) parsing, hash lookup, and binary buffer patching. |
| **Archive Engine** | `7z.dll` / `libarchive` | Native background extraction for `.zip`, `.rar`, and `.7z` (including solid archives and nested archives). |
| **Local Database** | SQLite + JSON (`manifest.json`) | Tracks installed mods, original `.ini` states, active hotkey overrides, and backup checksums. |

### Target Directory Topology

The manager enforces a strict internal workspace while keeping the target ZZMI `Mods/` directory clean:

```text
ZZZ_Mod_Manager_AppData/
├── config.json                  # App settings, ZZZ.exe path, ZZMI path
├── hash_db.json                 # Cloud-synced Agent Buffer Hash & Fix dictionary
├── staging_temp/                # Temporary download & recursive extraction sandbox
├── backups/                     # Non-destructive snapshots for 1-click Undo
│   └── [mod_uuid]/              # Original unmodified .ini and .buf files
└── cache/
    └── thumbnails/              # WebP converted previews from GameBanana

ZZMI_Root/
├── d3d11.dll                    # 3DMigoto loader
├── d3dx.ini                     # Master 3DMigoto configuration
└── Mods/
    ├── _ZZZMM_Managed/          # Organized by Agent via Buffer Hash detection
    │   ├── Ellen/
    │   │   ├── master_swap.ini  # Auto-generated 'H' key outfit cycler
    │   │   ├── Casual_Shark/
    │   │   └── DISABLED_Maid_Alt/
    │   ├── JaneDoe/
    │   └── Miyabi/
    └── _Uncategorized_UI_Audio/ # Non-character mods (UI, shaders, global FX)

```

---

## 2. UI/UX Specification: The "Fairy OS" Terminal

The interface replicates the **Hollow Deep Dive (HDD) System** and **Fairy AI** terminal from Zenless Zone Zero—combining retro-futuristic CRT monitors, sharp diagonal geometry, and responsive telemetry.

### Visual Identity & Styling Tokens

* **Background Palette:**
* **Void Black (`#0B0C10`):** Primary application background with a 4% opacity diagonal scanline overlay.
* **Hollow Slate (`#161922`):** Mod card background and sidebar panels.
* **Panel Border (`#2A2F3D`):** 2px solid borders with chamfered (cut) 45-degree corners on top-right and bottom-left edges.


* **Accent Palette:**
* **Fairy Cyan (`#00F0FF`):** Active states, primary borders, Fairy eye glow, and download progress bars.
* **Phaethon Gold (`#FFE600`):** Warning badges (e.g., "Update Required / Broken Hash"), favorite stars, and hover highlights.
* **Ether Crimson (`#FF2A54`):** Conflict alerts, disabled tags, and rollback buttons.
* **Signal Lime (`#B8FF01`):** "Active in Game" toggle switches and "Launch ZZZ" primary CTA.


* **Typography:** Heavy condensed geometric sans-serif for headers (mimicking ZZZ's slanted impact titles) paired with a crisp monospace font (`JetBrains Mono` or custom pixel-clean font) for hash readouts, hotkeys, and Fairy logs.

### The Interactive Fairy Assistant HUD

Positioned as a persistent dockable module in the bottom-left sidebar or top telemetry bar:

* **Visual State Machine:** A stylized animated vector eye/core that shifts color and animation cadence based on system activity:
* **Idle (Cyan Pulse):** Gentle breathing animation; displays active mod count and game status.
* **Processing / Extracting (Fast Rotating Ring):** Triggered during downloads, hash scanning, or archive unpacking.
* **Alert / Conflict (Amber Glitch):** Triggered when two mods share a buffer hash without being merged, or when a game update invalidates existing hashes.


* **Contextual Telemetry Log:** Replaces boring toast notifications with in-character Fairy system logs:
* *On Download:* `"Intercepting GameBanana transmission... Unpacking 3 nested folders because mod authors refuse to standardize."`
* *On Hash Match:* `"Vertex Buffer [8a3f1c92] identified. Routing asset to Agent: Ellen Joe."`
* *On Broken Mod Detected:* `"Warning: Post-patch vertex stride mismatch detected on [Miyabi_Coat.ini]. Click 'Repair' before she stretches across New Eridu."`



### Primary Application Views

1. **Agent Roster Sidebar (Left):** Vertical scrollable list of ZZZ Agents with circular portraits and faction badges (Victoria Housekeeping, Section 6, Sons of Calydon, etc.). Clicking an Agent filters the main grid to only their mods and shows a counter badge (e.g., `3 Installed / 2 in H-Cycle`).
2. **Mod Deck Grid (Center):** 16:9 visual cards featuring GameBanana cover art, custom tags, a prominent **Enable/Disable toggle**, an **"Include in `H` Swap Cycle"** checkbox, and a slide-out drawer for sub-toggles (jackets, weapons, hair).
3. **In-App GameBanana Browser & Queue (Tab 2):** Embedded browser locked to `[https://gamebanana.com/mods/cats/30305](https://gamebanana.com/mods/cats/30305)` with an injected floating **"Install with Fairy"** button on every mod thumbnail, bypassing GameBanana's multi-page download scrolling.
4. **Inspector & Hotkey Deck (Right Drawer):** Displays the selected mod's parsed `.ini` keybinds, repair history, and a visual keyboard mapper.

---

## 3. GameBanana Integration & Ingestion Pipeline

### 3.1 One-Click Interception & API Scraping

The manager supports three frictionless ingestion methods:

1. **OS Custom URI Scheme (`zzzmgr://`):** Registers in the Windows Registry (`HKEY_CLASSES_ROOT\zzzmgr`) to capture 1-Click Install links directly from the user's default web browser.
2. **Embedded WebView Interceptor:** In the built-in browser tab, intercepts any navigation matching `[https://gamebanana.com/dl/](https://gamebanana.com/dl/)*` and routes the stream directly into the background download engine.
3. **Drag-and-Drop / Clipboard Watcher:** Dropping a GameBanana URL or local archive onto the Fairy Eye immediately triggers ingestion.

### 3.2 Metadata Fetching via GameBanana API v11

When a mod ID is captured (e.g., from URL `[https://gamebanana.com/mods/528194](https://gamebanana.com/mods/528194)`), the backend queries:

```text
GET https://gamebanana.com/apiv11/Mod/528194/ProfilePage

```

* **Extracted Payload:**
* `_sName`: Mod Title.
* `_aSubmitter._sName`: Mod Author.
* `_aPreviewMedia._aImages`: Downloads the primary `_sBaseUrl` + `_sFile` image and converts it to a local `preview.webp` so the mod card always has artwork offline.
* `_aFiles`: Identifies `_idRow`, `_sFile`, `_nFilesize`, and `_sMd5Checksum` to verify download integrity and check for future mod updates.



### 3.3 Recursive Unpacking & Folder Flattening

Mod authors frequently package archives poorly (e.g., `Mod.rar → Folder A → Folder B → Actual_Mod_Files/mod.ini`).

1. **Sandbox Extraction:** Extract the archive into `staging_temp/[uuid]/`.
2. **Nested Archive Sweep:** Scan extracted contents for secondary `.zip`/`.rar`/`.7z` files (common when authors pack optional textures separately) and extract them into labeled sub-variants.
3. **Root Localization Algorithm:** Traverse the directory tree downward until locating a file ending in `.ini` (excluding `desktop.ini`). Set the parent directory of the highest-level valid `.ini` as the true Mod Root, discarding empty outer wrapper folders.
4. **Sanitization:** Strip illegal filesystem characters and ensure no rogue `.dll` or `.exe` files are present inside a skin package before moving it to the active library.

---

## 4. Intelligent 3DMigoto / ZZMI Routing Engine

Instead of relying on users or inconsistent GameBanana titles to know which character a mod belongs to, the manager inspects the 3DMigoto code directly.

### 4.1 Buffer Hash Fingerprinting

In Zenless Zone Zero, 3DMigoto replaces character models by intercepting DirectX 11 draw calls using specific hexadecimal hashes inside `.ini` files:

```ini
[TextureOverrideEllenPosition]
hash = 6291a8c4
vb0 = ResourceEllenPosition

[TextureOverrideEllenIB]
hash = 9f4e21b0
handling = skip

```

1. **Regex / AST Scan:** Upon extraction, the backend parses all `.ini` files in the package, extracting every `hash = [8-char hex]` value inside `[TextureOverride*]` and `[ShaderOverride*]` blocks.
2. **Hash Dictionary Lookup (`hash_db.json`):** The extracted hashes are cross-referenced against the local/cloud-updated `hash_db.json` database, which maps every ZZZ Agent's Position, Blend, Texcoord, and Index Buffer (IB) hashes (including legacy hashes from older patches like 1.0–1.5+).
3. **Automated Routing:**
* **Match Found:** If `6291a8c4` matches **Ellen Joe**, the mod is automatically tagged as `Agent: Ellen Joe`, assigned her portrait, and moved to `ZZMI_Root/Mods/_ZZZMM_Managed/Ellen/[Mod_Folder_Name]/`.
* **Multi-Character Pack:** If hashes for multiple agents are detected in separate subfolders, Fairy prompts: *"Multi-Agent pack detected (Ellen + Lycaon). Split into respective Agent folders?"*
* **No Agent Hash Found:** Routed to `_Uncategorized_UI_Audio/` (for HUD replacements, UID hiders, or LUT shaders).



### 4.2 Conflict-Free State Management

* **Enable / Disable Mechanism:** 3DMigoto automatically ignores any folder or `.ini` file prefixed with `DISABLED`.
* **Disabling:** Renames `Mods/_ZZZMM_Managed/Ellen/Casual_Shark` to `DISABLED_Casual_Shark` in less than 5ms.
* **Enabling:** Strips the `DISABLED_` prefix and checks if another mod for the same Agent is currently active.



---

## 5. Dynamic Outfit Swapping (`H` Key Merger) & Hotkey Orchestrator

Normally, enabling two skin mods for the same character in 3DMigoto causes both mods to override the same buffer hashes simultaneously, creating a grotesque overlapping mesh glitch. **ZZZ Mod Manager** solves this automatically by generating a non-destructive master swap controller.

### 5.1 How the Automatic `H` Key Outfit Cycler Works

When a user toggles ON two or more mods for the same Agent (e.g., *Ellen Casual*, *Ellen Cyber*, and *Ellen Suit*), the manager activates **Fairy Auto-Merge**:

1. **Namespace Isolation:** The manager disables the raw `.ini` files of the individual skins by renaming `mod.ini` to `DISABLED_source_mod.ini` (leaving a clean copy in the backup state) and generates unified namespace wrappers.
2. **Master Controller Generation (`master_swap.ini`):** Inside `Mods/_ZZZMM_Managed/Ellen/`, the manager writes a dynamic controller script bound to **`H`**:

```ini
namespace = Ellen_Master_Swap

[Constants]
global persist $active_outfit = 0

[KeySwapOutfit]
key = h
type = cycle
$active_outfit = 0,1,2

; --- Route draw calls based on $active_outfit index ---
[TextureOverrideEllenPosition]
hash = 6291a8c4
if $active_outfit == 0
    vb0 = Resource_Casual_Position
elif $active_outfit == 1
    vb0 = Resource_Cyber_Position
elif $active_outfit == 2
    vb0 = Resource_Suit_Position
endif

```

3. **Result:** The user launches ZZZ with 5 Ellen outfits enabled at the same time. Pressing **`H`** in-game cleanly cycles through all 5 outfits in real time without collisions or folder juggling.

### 5.2 Sub-Toggle Hotkey Orchestrator (Jackets, Hair, Weapons)

Individual mods often include internal toggles using chaotic, random hotkeys (e.g., `VK_UP`, `Ctrl+Alt+F9`, `]`, `Numpad 7`).

* **AST Key-Block Parser:** The backend scans every `[Key*]` section in a mod's `.ini` file:
```ini
[KeyToggleJacket]
key = VK_OEM_6
type = cycle
$jacket = 0,1

```


* **Visual Keybind Remapper:** In the UI Inspector Drawer, the manager translates `VK_OEM_6` into a human-readable badge (`]`) labeled **"Toggle Jacket"** (inferred from the section header or variable name `$jacket`).
* **One-Click Standardization:**
* Users can click any toggle badge in the UI and press a new key to rewrite the `.ini` safely.
* **"Standardize All Mods" Preset:** Automatically maps primary accessory toggles (Jacket/Coat) across all installed mods to **`J`**, secondary toggles (Glasses/Mask/Hat) to **`K`**, and weapon toggles to **`L`**, scoped with condition checks so keys only fire when that specific character is on-screen.



---

## 6. One-Click Mod Repair & Rollback Engine

When HoYoverse releases a major ZZZ game update, two primary issues break existing mods:

1. **Buffer Hash Shifts:** Character IB/VB/Texcoord hashes change, causing the mod to either not appear at all or stretch violently across the screen ("spaghetti monster" vertex explosion).
2. **Normal Map / Reflection Slot Shifts:** Characters appear overly glossy, pitch black, or neon pink due to shader slot reordering.

### 6.1 Automated Repair Pipeline

When a user clicks **"Repair Mod"** (or **"Repair All Broken Mods"**):

1. **Snapshot Creation (Safety First):** Before touching a single byte, the manager copies all `.ini` and `.buf` files from the mod folder into `ZZZ_Mod_Manager_AppData/backups/[mod_uuid]/[timestamp]/` and records the SHA-256 hash.
2. **Stage 1 — Hash Migration:**
* Scans the `.ini` for deprecated hashes listed in `hash_db.json` (e.g., Ellen's 1.0 IB hash → 1.4 IB hash).
* Replaces outdated hashes with the current patch hashes and logs the exact line changes.


3. **Stage 2 — ORFix & ZZMI Shader Slot Injection:**
* Detects outdated manual `ps-t0` / `ps-t1` / `ps-t2` texture slot assignments that cause broken shadows or metallic skin after engine updates.
* Rewrites texture overrides to utilize ZZMI's standardized `run = CommandList\ZZMI\SetTextures` and `run = CommandList\ZZMI\ORFix` calls, ensuring automatic lighting compatibility.


4. **Stage 3 — Vertex Stride & Blend Remapping:**
* If a character's bone weight indices or vertex buffer stride shifted between patches (which causes limb stretching), the backend reads the binary `.buf` file in chunks, remaps the bone weight index bytes according to the `hash_db.json` patch matrix, and writes the repaired `.buf` file.



### 6.2 One-Click Undo (Instant Rollback)

* Every repaired mod card displays a glowing Cyan badge: **`[Repaired for Current Patch | Undo]`**.
* Clicking **Undo** immediately restores the exact original `.ini` and `.buf` files from `backups/[mod_uuid]/` and deletes the patch flag—guaranteeing zero risk of permanently ruining a rare or deleted mod.

---

## 7. Zero-Config Path Detection & Runtime Utilities

### 7.1 Automated Path Discovery

On first launch, Fairy scans the system without asking the user to browse through folders:

1. **Game Executable (`ZenlessZoneZero.exe`):**
* Queries Windows Registry keys under `HKLM\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\HoYoPlay` and parses HoYoPlay's `config.ini` / launcher logs in `%AppData%\Cognosphere\HYP\`.
* Checks standard Epic Games and drive root installation paths (`C:\` through `Z:\`).


2. **3DMigoto / ZZMI Loader Path:**
* Scans common modding directories and integrates a **Built-in ZZMI Bootstrapper**: if the user does not have ZZMI installed yet, the manager downloads the latest official ZZMI release from GitHub directly into `ZZZ_Mod_Manager_AppData/ZZMI_Core/` and configures `target = [detected_ZZZ.exe_path]` in `d3dx.ini` automatically.



### 7.2 One-Click Launch & Live Reload (`F10`)

* **Unified Launch Sequence:** Clicking **"ENTER NEW ERIDU (LAUNCH)"** in the manager:
1. Verifies all active `master_swap.ini` files are compiled.
2. Starts the `3DMigoto Loader.exe` (or injects `d3d11.dll`) silently in the background.
3. Launches `ZenlessZoneZero.exe` immediately after hook confirmation.


* **Live In-Game Sync:** If ZZZ is already running when the user downloads or toggles a mod in the manager, the manager updates the files and sends a virtual `VK_F10` keystroke message directly to the `ZenlessZoneZero` window handle (`HWND`), reloading the mod inside the game without alt-tabbing or restarting.

---

## 8. Core Data Schemas

### 8.1 Installed Mod Manifest (`mod_manifest.json`)

Stored per-mod to track metadata, hotkeys, and repair states:

```json
{
  "mod_uuid": "f47ac10b-58cc-4372-a567-0e02b2c3d479",
  "gamebanana_id": 528194,
  "title": "Streetwear Ellen Joe (Jacket Toggle)",
  "author": "ProxyModder",
  "agent_id": "ellen_joe",
  "install_path": "Mods/_ZZZMM_Managed/Ellen/Streetwear_Ellen",
  "enabled": true,
  "in_h_swap_cycle": true,
  "h_cycle_order": 1,
  "detected_hashes": ["6291a8c4", "9f4e21b0"],
  "sub_toggles": [
    {
      "section_name": "KeyToggleJacket",
      "variable": "$jacket",
      "label": "Jacket",
      "original_key": "VK_UP",
      "current_key": "J",
      "states": ["0", "1"]
    }
  ],
  "repair_state": {
    "is_repaired": true,
    "repaired_at": "2026-10-16T03:20:00Z",
    "applied_fixes": ["HASH_MIGRATION_1.4", "ZZMI_ORFIX_INJECT"],
    "backup_path": "backups/f47ac10b-58cc-4372-a567-0e02b2c3d479/orig_snapshot"
  }
}

```

### 8.2 Agent Hash & Repair Database (`hash_db.json`)

Synced from a central GitHub JSON file on app startup so the manager stays updated whenever ZZZ patches:

```json
{
  "schema_version": "2.4",
  "agents": {
    "ellen_joe": {
      "display_name": "Ellen Joe",
      "faction": "Victoria Housekeeping Co.",
      "current_hashes": {
        "position_vb": "6291a8c4",
        "blend_vb": "3d10f9a2",
        "texcoord_vb": "7b82e110",
        "ib": "9f4e21b0"
      },
      "legacy_hash_migrations": {
        "1a2b3c4d": "6291a8c4",
        "5e6f7a8b": "9f4e21b0"
      }
    }
  }
}

```

---

## 9. Phased Implementation Roadmap

1. **Phase 1: Core Backend & `.ini` Parser (MVP)**
* Build the recursive archive extractor and the `.ini` regex/AST scanner that extracts `hash = ...` and `[Key...]` blocks.
* Implement `DISABLED_` prefix toggling and folder routing based on `hash_db.json`.


2. **Phase 2: GameBanana Deep-Link & API Client**
* Register the `zzzmgr://` URI protocol in the OS registry and connect the GameBanana API v11 metadata/thumbnail fetcher.


3. **Phase 3: The `H` Key Merger & Repair Engine**
* Build the `master_swap.ini` generator to wrap multiple enabled skins into a `$active_outfit` cycle on `H`.
* Implement the non-destructive backup snapshot system and hash-replacement repair pipeline.


4. **Phase 4: Fairy UI Polish**
* Assemble the HDD dark-mode interface, Agent sidebar filter, interactive hotkey remapper drawer, and animated Fairy telemetry HUD.





