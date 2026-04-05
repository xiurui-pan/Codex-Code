# Codex CLI Color Mapping (source -> target)

This note extracts the current Codex CLI color system from `codex/` source and maps it to suggested UI targets in ``.

## Source palette signals

| Source item | Source file | Current meaning in Codex CLI | Suggested target in `` |
| --- | --- | --- | --- |
| Adaptive message background (`user_message_bg`, `proposed_plan_bg`) | `/home/pxr/workspace/CodingAgent/codex/codex-rs/tui/src/style.rs` | Bubble background is blended from terminal background (light bg: black @ 4%; dark bg: white @ 12%) and then mapped by terminal capability | User message bubble and plan card background in TUI transcript; avoid hardcoded fixed color |
| Terminal capability adapter (`stdout_color_level`, `best_color`, `XTERM_COLORS`) | `/home/pxr/workspace/CodingAgent/codex/codex-rs/tui/src/terminal_palette.rs` | One semantic color can degrade across TrueColor -> ANSI256 -> ANSI16/default | Central color utility for all status/diff/highlight colors so color behavior is stable across terminals |
| ANSI index to named colors for syntax highlighting (`ansi_palette_color`) | `/home/pxr/workspace/CodingAgent/codex/codex-rs/tui/src/render/highlight.rs` | ANSI 0..7 mapped to named colors: black/red/green/yellow/blue/magenta/cyan/gray; RGB path preserved | Code block color rendering in output pane; keep named ANSI behavior instead of raw index only |
| Diff base constants and add/del styles (`DARK_TC_ADD_LINE_BG_RGB`, `LIGHT_TC_DEL_LINE_BG_RGB`, `style_add`, `style_del`) | `/home/pxr/workspace/CodingAgent/codex/codex-rs/tui/src/diff_render.rs` | Add/delete lines use green/red semantic foreground and theme-aware tinted background | Patch/diff preview blocks in TUI and slash command output (`/diff`, file edits, review panes) |
| Provider state colors (`Running/NotRunning/Unknown`) | `/home/pxr/workspace/CodingAgent/codex/codex-rs/tui/src/oss_selection.rs` | Running=green, not running=red, unknown=yellow; selected option uses cyan bg + black fg | Provider/network status badges and setup modal states in `` |
| Low-emphasis hint style (`key_hint_style`) | `/home/pxr/workspace/CodingAgent/codex/codex-rs/tui/src/key_hint.rs` | Key hints and helper text use dimmed style, not a loud accent color | Footer hint line, shortcut helper text, and secondary instructional copy |

## Suggested mapping rules (minimal)

1. Keep semantic roles first: success/ready=green, warning=yellow, error/not-ready=red, focus/selection=cyan.
2. Route every RGB/index color through one terminal capability adapter (same behavior as `best_color`).
3. For transcript backgrounds, prefer adaptive blending with terminal default background instead of static light/dark tokens.
4. Keep helper text dimmed by default; reserve bright colors for state changes and actionable focus.
5. For code and diff rendering, preserve ANSI-named semantics before adding custom theme tweaks.
