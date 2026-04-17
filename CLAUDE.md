# NameNote — Claude Code ガイドライン

## ドキュメント更新ルール

**`docs/spec.md` はアプリの仕様書です。以下の変更を行ったときは、必ず `docs/spec.md` を同じコミットで更新してください。**

| 変更内容 | 更新が必要な節 |
|---|---|
| ツール追加・変更・削除 | 「ツール」節 |
| ツールバーのボタン・メニュー変更 | 「ファイルメニュー項目一覧」「ツール」節 |
| キーボード・タッチジェスチャー変更 | 「キーボード / タッチ ショートカット」節 |
| 保存・書き出し形式の変更 | 「保存・書き出し」節 |
| localStorage キーの追加・変更 | 「データ永続化」節 |
| ノート構造（スプレッド・ページ仕様）の変更 | 「ノート構造」節 |
| メモ欄の仕様変更 | 「メモ欄」節 |
| Undo/Redo 仕様変更 | 「Undo / Redo」節 |
| 入力モードの変更 | 「入力モード」節 |
| ズーム・パン仕様の変更 | 「ズーム・パン」節 |

## 開発ブランチ

- `mochifuwa-art/namenote`: `claude/code-review-TBRGB` ブランチで開発

## ビルド

```bash
npm run build   # TypeScript コンパイル + Vite ビルド
```

変更後は必ず `npm run build` でエラーがないことを確認してからコミットする。

## 主要ファイル

| ファイル | 役割 |
|---|---|
| `src/App.tsx` | メインコンポーネント、状態管理、イベント処理 |
| `src/hooks/useDrawing.ts` | 描画ロジック（ペン・消しゴム、HiDPI、筆圧） |
| `src/hooks/useHistory.ts` | Undo/Redo 履歴管理 |
| `src/hooks/useSelection.ts` | なげなわ選択・コピペ |
| `src/hooks/usePageStore.ts` | ページデータの localStorage 保存・読み込み |
| `src/components/MemoSidebar.tsx` | メモ欄 |
| `src/components/Toolbar.tsx` | ツールバー UI |
| `src/components/NotebookSpread.tsx` | ノート見開き表示 |
| `src/components/TextLayer.tsx` | テキストオブジェクト表示・操作 |
| `src/utils/save.ts` | プロジェクトファイル保存・読み込み |
| `src/utils/export.ts` | JPG・PDF 書き出し |
| `src/utils/filePicker.ts` | ファイル保存ダイアログ（Web/Native 対応） |
| `docs/spec.md` | **アプリ仕様書（機能変更時に更新）** |
