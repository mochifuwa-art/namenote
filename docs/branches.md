# ブランチ構成図

```mermaid
gitGraph
   commit id: "Initial commit"

   branch manga-storyboard-app
   checkout manga-storyboard-app
   commit id: "NameNote アプリ追加"
   commit id: "README・GitHub Actions"
   checkout main
   merge manga-storyboard-app id: "PR #1"

   checkout manga-storyboard-app
   commit id: "undo/redo・各種修正"
   checkout main
   merge manga-storyboard-app id: "PR #2"
   commit id: "UX・ページ概要・PDF"

   checkout manga-storyboard-app
   commit id: "ペースト・キャンセル修正"
   checkout main
   merge manga-storyboard-app id: "PR #3~#6"
   commit id: "ステージング・Capacitor 対応"

   checkout manga-storyboard-app
   commit id: "テキストツール・メモサイドバー"
   checkout main
   merge manga-storyboard-app id: "PR #7~#14"

   checkout manga-storyboard-app
   commit id: "モバイル・ズーム・ラッソ修正"

   branch add-stroke-stabilization
   checkout add-stroke-stabilization
   commit id: "ストローク安定化"
   checkout manga-storyboard-app
   merge add-stroke-stabilization id: "PR #15, #16"

   branch capacitor-sync
   checkout capacitor-sync
   commit id: "Capacitor iOS/Android 同期"
   checkout manga-storyboard-app
   merge capacitor-sync id: "PR #17"

   branch bugfix-context-menu
   checkout bugfix-context-menu
   commit id: "コンテキストメニュー・ツールバー修正"
   checkout manga-storyboard-app
   merge bugfix-context-menu id: "PR #18"

   branch fix-outside-entry
   checkout fix-outside-entry
   commit id: "キャンバス外からのストローク修正"
   checkout manga-storyboard-app
   merge fix-outside-entry id: "PR #19"

   branch cross-page-drawing
   checkout cross-page-drawing
   commit id: "見開きページをまたぐ描画"
   checkout manga-storyboard-app
   merge cross-page-drawing id: "PR #20"

   branch add-branch-diagram
   checkout add-branch-diagram
   commit id: "ブランチ構成図を追加"
```

## ブランチ一覧

| ブランチ名 | 役割 |
|---|---|
| `main` | 本番ブランチ（PR #1〜#14 のマージ先） |
| `claude/manga-storyboard-app-WD9ba` | メイン開発ブランチ（現在の最新） |
| `gh-pages` | GitHub Pages 自動デプロイブランチ |
| `claude/add-stroke-stabilization-BXOOH` | ストローク安定化機能（PR #15, #16） |
| `claude/capacitor-sync-XQPRT` | Capacitor iOS/Android 同期（PR #17） |
| `claude/bugfix-context-menu-history-filepicker-VKWMN` | コンテキストメニュー等バグ修正（PR #18） |
| `claude/fix-outside-entry-edge-point-RQKLM` | キャンバス外入力バグ修正（PR #19） |
| `claude/cross-page-drawing-HKMVW` | 見開き跨ページ描画機能（PR #20） |
| `claude/add-branch-diagram-jzDay` | ブランチ構成図追加（現在のブランチ） |
